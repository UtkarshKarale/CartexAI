import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, utilityProcess, type NativeImage, type UtilityProcess } from 'electron'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DesktopRuntime } from './runtime/desktop-runtime'
import { registerDesktopIpc } from './ipc'
import { initUpdater } from './updater'
import { ipcChannels } from '../src/shared/ipc'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

type WindowMode = 'main' | 'compact'
interface WindowBoundsState {
  main?: Electron.Rectangle
  compact?: Electron.Rectangle
}

let mainWindow: BrowserWindow | null = null
let compactWindow: BrowserWindow | null = null
let tray: Tray | null = null
let runtime: DesktopRuntime | null = null
let mcpProcess: UtilityProcess | null = null
let isQuitting = false

const hasSingleInstanceLock = app.requestSingleInstanceLock()
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json')
const windowState = loadWindowState()

function loadWindowState(): WindowBoundsState {
  if (!existsSync(windowStatePath)) {
    return {}
  }

  try {
    return JSON.parse(readFileSync(windowStatePath, 'utf8')) as WindowBoundsState
  } catch {
    return {}
  }
}

function saveWindowState(state: WindowBoundsState) {
  try {
    mkdirSync(path.dirname(windowStatePath), { recursive: true })
    writeFileSync(windowStatePath, JSON.stringify(state, null, 2))
  } catch {
    // best effort only
  }
}

function resolveMcpServerPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'mcp-server', 'server.js')
  }
  return path.join(process.env.APP_ROOT, '..', 'mcp-server', 'server.js')
}

function startMcpServer(smtpEnv?: Record<string, string>) {
  const mcpServerPath = resolveMcpServerPath()

  if (!existsSync(mcpServerPath)) {
    console.log('[mcp-server] server.js not found at', mcpServerPath)
    return
  }

  console.log('[mcp-server] starting', mcpServerPath)

  mcpProcess = utilityProcess.fork(mcpServerPath, [], {
    stdio: 'pipe',
    env: { ...process.env, ...smtpEnv },
  })

  mcpProcess.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[mcp-server] ${data.toString()}`)
  })

  mcpProcess.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[mcp-server] ${data.toString()}`)
  })

  mcpProcess.on('exit', (code) => {
    console.log(`[mcp-server] exited code=${code}`)
    mcpProcess = null
  })
}

function stopMcpServer() {
  if (mcpProcess) {
    mcpProcess.kill()
    mcpProcess = null
  }
}

function getRendererUrl(mode: WindowMode): string {
  if (VITE_DEV_SERVER_URL) {
    const separator = VITE_DEV_SERVER_URL.includes('?') ? '&' : '?'
    return `${VITE_DEV_SERVER_URL}${separator}mode=${mode}`
  }

  return `file://${path.join(RENDERER_DIST, 'index.html')}?mode=${mode}`
}

function loadRenderer(win: BrowserWindow, mode: WindowMode) {
  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(getRendererUrl(mode))
    return
  }

  void win.loadFile(path.join(RENDERER_DIST, 'index.html'), { query: { mode } })
}

function createTrayIcon(): NativeImage {
  const svg = `
    <svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" rx="56" fill="#020617"/>
      <path d="M64 86C64 72.7452 74.7452 62 88 62H168C181.255 62 192 72.7452 192 86V142C192 155.255 181.255 166 168 166H124L90 194V166H88C74.7452 166 64 155.255 64 142V86Z" fill="#0F172A" stroke="#38BDF8" stroke-width="10" stroke-linejoin="round"/>
      <path d="M96 106H160" stroke="#E2E8F0" stroke-width="14" stroke-linecap="round"/>
      <path d="M96 134H136" stroke="#38BDF8" stroke-width="14" stroke-linecap="round"/>
    </svg>
  `
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
}

function showWindow(win: BrowserWindow | null) {
  if (!win) {
    return
  }

  if (win.isMinimized()) {
    win.restore()
  }

  win.show()
  win.focus()
}

function createWindow(mode: WindowMode) {
  const isCompact = mode === 'compact'
  const existing = isCompact ? compactWindow : mainWindow
  if (existing) {
    showWindow(existing)
    return existing
  }

  const savedBounds = windowState[mode]
  const win = new BrowserWindow({
    ...savedBounds,
    width: savedBounds?.width ?? (isCompact ? 460 : 1560),
    height: savedBounds?.height ?? (isCompact ? 760 : 960),
    minWidth: isCompact ? 400 : 1280,
    minHeight: isCompact ? 620 : 840,
    show: false,
    backgroundColor: '#020617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    resizable: !isCompact,
    minimizable: !isCompact,
    maximizable: !isCompact,
    skipTaskbar: isCompact,
    alwaysOnTop: isCompact,
    webPreferences: {
      preload: path.join(process.env.APP_ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isCompact) {
    win.setMenuBarVisibility(false)
    win.on('blur', () => {
      if (!isQuitting) {
        win.hide()
      }
    })
  }

  const persistBounds = () => {
    windowState[mode] = win.getBounds()
    saveWindowState(windowState)
  }

  win.on('move', persistBounds)
  win.on('resize', persistBounds)

  win.on('close', (event) => {
    persistBounds()
    if (!isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })

  win.on('closed', () => {
    if (isCompact) {
      compactWindow = null
    } else {
      mainWindow = null
    }
  })

  win.once('ready-to-show', () => {
    showWindow(win)
  })

  loadRenderer(win, mode)

  if (isCompact) {
    compactWindow = win
  } else {
    mainWindow = win
    if (VITE_DEV_SERVER_URL) {
      win.webContents.openDevTools({ mode: 'detach' })
    }
  }

  return win
}

function createTray() {
  if (tray) {
    return tray
  }

  tray = new Tray(createTrayIcon())
  tray.setToolTip('JiFile')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open compact window',
        click: () => {
          createWindow('compact')
        },
      },
      {
        label: 'Open full window',
        click: () => {
          createWindow('main')
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true
          app.quit()
        },
      },
    ]),
  )

  tray.on('click', () => {
    const win = compactWindow ?? createWindow('compact')
    showWindow(win)
  })

  return tray
}

function registerWindowIpc() {
  ipcMain.handle(ipcChannels.showMainWindow, () => {
    showWindow(createWindow('main'))
  })

  ipcMain.handle(ipcChannels.showCompactWindow, () => {
    showWindow(createWindow('compact'))
  })

  ipcMain.handle(ipcChannels.quitApp, () => {
    isQuitting = true
    app.quit()
  })

  ipcMain.handle(ipcChannels.getAppVersion, () => app.getVersion())
}

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    showWindow(mainWindow ?? createWindow('main'))
  })

  app.on('window-all-closed', (event: Electron.Event) => {
    event.preventDefault()
  })

  app.on('before-quit', () => {
    isQuitting = true
    stopMcpServer()
    tray?.destroy()
    tray = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow('main')
    } else {
      showWindow(mainWindow ?? createWindow('main'))
    }
  })

  app.whenReady().then(() => {
    runtime = new DesktopRuntime()
    const smtpEnv = runtime.getSmtpEnvVars()
    startMcpServer(smtpEnv)
    registerDesktopIpc(runtime)
    registerWindowIpc()
    createTray()
    createWindow('main')
    initUpdater(() => mainWindow ?? compactWindow)
  })
} else {
  app.quit()
}

import { app, BrowserWindow, utilityProcess, type UtilityProcess } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { DesktopRuntime } from './runtime/desktop-runtime'
import { registerDesktopIpc } from './ipc'
import { initUpdater } from './updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let runtime: DesktopRuntime | null = null
let mcpProcess: UtilityProcess | null = null

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

function createWindow() {
  win = new BrowserWindow({
    width: 1560,
    height: 960,
    minWidth: 1280,
    minHeight: 840,
    show: false,
    backgroundColor: '#020617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(process.env.APP_ROOT, 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.once('ready-to-show', () => {
    win?.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  stopMcpServer()
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', () => {
  stopMcpServer()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  runtime = new DesktopRuntime()
  const smtpEnv = runtime.getSmtpEnvVars()
  startMcpServer(smtpEnv)
  registerDesktopIpc(runtime)
  createWindow()
  initUpdater(() => win)
})

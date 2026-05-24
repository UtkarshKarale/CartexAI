import { app, ipcMain, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { ipcChannels } from '../src/shared/ipc'

export function initUpdater(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    getWindow()?.webContents.send(ipcChannels.updateChecking)
  })

  autoUpdater.on('update-available', (info) => {
    getWindow()?.webContents.send(ipcChannels.updateAvailable, {
      version: info.version,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    })
  })

  autoUpdater.on('update-not-available', () => {
    getWindow()?.webContents.send(ipcChannels.updateNotAvailable)
  })

  autoUpdater.on('download-progress', (progress) => {
    getWindow()?.webContents.send(ipcChannels.updateDownloadProgress, {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    getWindow()?.webContents.send(ipcChannels.updateDownloaded, {
      version: info.version,
      releaseName: info.releaseName ?? null,
      releaseDate: info.releaseDate,
      releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : null,
    })
  })

  autoUpdater.on('error', (err) => {
    getWindow()?.webContents.send(ipcChannels.updateError, err.message)
  })

  ipcMain.on(ipcChannels.installUpdate, () => {
    autoUpdater.quitAndInstall()
  })

  autoUpdater.checkForUpdatesAndNotify()
}
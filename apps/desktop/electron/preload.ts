import { contextBridge, ipcRenderer } from 'electron'
import { ipcChannels } from '../src/shared/ipc'
import type { RuntimeApi, StreamChunk, UpdateInfo, UpdateDownloadProgress, PullModelProgress, InstallProgress } from '../src/shared/contracts'

const api: RuntimeApi = {
  bootstrap: (deviceId) => ipcRenderer.invoke(ipcChannels.bootstrap, deviceId),
  createAccount: (input, deviceId) => ipcRenderer.invoke(ipcChannels.createAccount, input, deviceId),
  login: (input, deviceId) => ipcRenderer.invoke(ipcChannels.login, input, deviceId),
  unlock: (credential, deviceId) => ipcRenderer.invoke(ipcChannels.unlock, credential, deviceId),
  logout: (sessionId) => ipcRenderer.invoke(ipcChannels.logout, sessionId),
  lock: (sessionId) => ipcRenderer.invoke(ipcChannels.lock, sessionId),
  refresh: (deviceId) => ipcRenderer.invoke(ipcChannels.refresh, deviceId),
  updateSettings: (input) => ipcRenderer.invoke(ipcChannels.updateSettings, input),
  createConversation: (input) => ipcRenderer.invoke(ipcChannels.createConversation, input),
  sendMessage: (input) => ipcRenderer.invoke(ipcChannels.sendMessage, input),
  addActivity: (input) => ipcRenderer.invoke(ipcChannels.addActivity, input),
  listMessages: (conversationId) => ipcRenderer.invoke(ipcChannels.listMessages, conversationId),
  onStreamChunk: (callback: (chunk: StreamChunk) => void) =>
    ipcRenderer.on(ipcChannels.aiStreamChunk, (_event, chunk: StreamChunk) => callback(chunk)),
  offStreamChunk: () => ipcRenderer.removeAllListeners(ipcChannels.aiStreamChunk),
  confirmToolExecution: (id: string, approved: boolean) =>
    ipcRenderer.invoke(ipcChannels.confirmToolExecution, id, approved),
  listGemmaModels: () => ipcRenderer.invoke(ipcChannels.listGemmaModels),
  detectProviders: () => ipcRenderer.invoke(ipcChannels.detectProviders),
  getSystemInfo: () => ipcRenderer.invoke(ipcChannels.getSystemInfo),
  pullModel: (model: string) => ipcRenderer.invoke(ipcChannels.pullModel, model),
  onPullModelProgress: (callback: (progress: PullModelProgress) => void) =>
    ipcRenderer.on(ipcChannels.pullModelProgress, (_event, progress) => callback(progress)),
  offPullModelProgress: () => ipcRenderer.removeAllListeners(ipcChannels.pullModelProgress),
  installOllama: () => ipcRenderer.invoke(ipcChannels.installOllama),
  installDocker: () => ipcRenderer.invoke(ipcChannels.installDocker),
  onInstallProgress: (callback: (progress: InstallProgress) => void) =>
    ipcRenderer.on(ipcChannels.installProgress, (_event, progress) => callback(progress)),
  offInstallProgress: () => ipcRenderer.removeAllListeners(ipcChannels.installProgress),
  startOllamaServer: () => ipcRenderer.invoke(ipcChannels.startOllamaServer),
  startDockerDaemon: () => ipcRenderer.invoke(ipcChannels.startDockerDaemon),
  startDockerOllama: () => ipcRenderer.invoke(ipcChannels.startDockerOllama),
  clearConversation: (conversationId) => ipcRenderer.invoke(ipcChannels.clearConversation, conversationId),
  deleteConversation: (conversationId) => ipcRenderer.invoke(ipcChannels.deleteConversation, conversationId),
  showMainWindow: () => ipcRenderer.invoke(ipcChannels.showMainWindow),
  showCompactWindow: () => ipcRenderer.invoke(ipcChannels.showCompactWindow),
  quitApp: () => ipcRenderer.invoke(ipcChannels.quitApp),
  listDirectory: (dirPath: string) => ipcRenderer.invoke(ipcChannels.listDirectory, dirPath),
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) =>
    ipcRenderer.on(ipcChannels.updateAvailable, (_event, info: UpdateInfo) => callback(info)),
  offUpdateAvailable: () => ipcRenderer.removeAllListeners(ipcChannels.updateAvailable),
  onUpdateDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) =>
    ipcRenderer.on(ipcChannels.updateDownloadProgress, (_event, progress: UpdateDownloadProgress) => callback(progress)),
  offUpdateDownloadProgress: () => ipcRenderer.removeAllListeners(ipcChannels.updateDownloadProgress),
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) =>
    ipcRenderer.on(ipcChannels.updateDownloaded, (_event, info: UpdateInfo) => callback(info)),
  offUpdateDownloaded: () => ipcRenderer.removeAllListeners(ipcChannels.updateDownloaded),
  installUpdate: () => ipcRenderer.send(ipcChannels.installUpdate),
}

contextBridge.exposeInMainWorld('desktopApi', api)

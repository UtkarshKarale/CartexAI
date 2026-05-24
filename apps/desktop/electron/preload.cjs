const { contextBridge, ipcRenderer } = require('electron')

const ipcChannels = {
  bootstrap: 'desktop:bootstrap',
  createAccount: 'desktop:create-account',
  login: 'desktop:login',
  unlock: 'desktop:unlock',
  logout: 'desktop:logout',
  lock: 'desktop:lock',
  refresh: 'desktop:refresh',
  updateSettings: 'desktop:update-settings',
  createConversation: 'desktop:create-conversation',
  sendMessage: 'desktop:send-message',
  addActivity: 'desktop:add-activity',
  listMessages: 'desktop:list-messages',
  aiStreamChunk: 'ai:stream-chunk',
  confirmToolExecution: 'ai:confirm-tool-execution',
  listGemmaModels: 'ai:list-gemma-models',
  detectProviders: 'ai:detect-providers',
  getSystemInfo: 'ai:get-system-info',
  pullModel: 'ai:pull-model',
  pullModelProgress: 'ai:pull-model-progress',
  installOllama: 'ai:install-ollama',
  installDocker: 'ai:install-docker',
  installProgress: 'ai:install-progress',
  startOllamaServer: 'ai:start-ollama-server',
  startDockerDaemon: 'ai:start-docker-daemon',
  startDockerOllama: 'ai:start-docker-ollama',
  clearConversation: 'desktop:clear-conversation',
  deleteConversation: 'desktop:delete-conversation',
  listDirectory: 'fs:list-directory',
  updateChecking: 'update:checking',
  updateAvailable: 'update:available',
  updateNotAvailable: 'update:not-available',
  updateDownloadProgress: 'update:download-progress',
  updateDownloaded: 'update:downloaded',
  updateError: 'update:error',
  installUpdate: 'update:install',
}

const api = {
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
  onStreamChunk: (callback) =>
    ipcRenderer.on(ipcChannels.aiStreamChunk, (_event, chunk) => callback(chunk)),
  offStreamChunk: () =>
    ipcRenderer.removeAllListeners(ipcChannels.aiStreamChunk),
  confirmToolExecution: (id, approved) =>
    ipcRenderer.invoke(ipcChannels.confirmToolExecution, id, approved),
  listGemmaModels: () =>
    ipcRenderer.invoke(ipcChannels.listGemmaModels),
  detectProviders: () =>
    ipcRenderer.invoke(ipcChannels.detectProviders),
  getSystemInfo: () =>
    ipcRenderer.invoke(ipcChannels.getSystemInfo),
  pullModel: (model) =>
    ipcRenderer.invoke(ipcChannels.pullModel, model),
  onPullModelProgress: (callback) =>
    ipcRenderer.on(ipcChannels.pullModelProgress, (_event, progress) => callback(progress)),
  offPullModelProgress: () =>
    ipcRenderer.removeAllListeners(ipcChannels.pullModelProgress),
  installOllama: () =>
    ipcRenderer.invoke(ipcChannels.installOllama),
  installDocker: () =>
    ipcRenderer.invoke(ipcChannels.installDocker),
  onInstallProgress: (callback) =>
    ipcRenderer.on(ipcChannels.installProgress, (_event, progress) => callback(progress)),
  offInstallProgress: () =>
    ipcRenderer.removeAllListeners(ipcChannels.installProgress),
  startOllamaServer: () =>
    ipcRenderer.invoke(ipcChannels.startOllamaServer),
  startDockerDaemon: () =>
    ipcRenderer.invoke(ipcChannels.startDockerDaemon),
  startDockerOllama: () =>
    ipcRenderer.invoke(ipcChannels.startDockerOllama),
  clearConversation: (conversationId) =>
    ipcRenderer.invoke(ipcChannels.clearConversation, conversationId),
  deleteConversation: (conversationId) =>
    ipcRenderer.invoke(ipcChannels.deleteConversation, conversationId),
  listDirectory: (dirPath) =>
    ipcRenderer.invoke(ipcChannels.listDirectory, dirPath),
  onUpdateAvailable: (callback) =>
    ipcRenderer.on(ipcChannels.updateAvailable, (_event, info) => callback(info)),
  offUpdateAvailable: () =>
    ipcRenderer.removeAllListeners(ipcChannels.updateAvailable),
  onUpdateDownloadProgress: (callback) =>
    ipcRenderer.on(ipcChannels.updateDownloadProgress, (_event, progress) => callback(progress)),
  offUpdateDownloadProgress: () =>
    ipcRenderer.removeAllListeners(ipcChannels.updateDownloadProgress),
  onUpdateDownloaded: (callback) =>
    ipcRenderer.on(ipcChannels.updateDownloaded, (_event, info) => callback(info)),
  offUpdateDownloaded: () =>
    ipcRenderer.removeAllListeners(ipcChannels.updateDownloaded),
  installUpdate: () =>
    ipcRenderer.send(ipcChannels.installUpdate),
}

contextBridge.exposeInMainWorld('desktopApi', api)

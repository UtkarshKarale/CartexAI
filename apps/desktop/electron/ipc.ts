import { ipcMain } from 'electron'
import { ipcChannels } from '../src/shared/ipc'
import type { DesktopRuntime } from './runtime/desktop-runtime'
import type { StreamChunk } from '../src/shared/contracts'

export function registerDesktopIpc(runtime: DesktopRuntime) {
  ipcMain.handle(ipcChannels.bootstrap, (_event, deviceId: string) => runtime.bootstrap(deviceId))
  ipcMain.handle(ipcChannels.createAccount, (_event, input, deviceId: string) => runtime.createAccount(input, deviceId))
  ipcMain.handle(ipcChannels.login, (_event, input, deviceId: string) => runtime.login(input, deviceId))
  ipcMain.handle(ipcChannels.unlock, (_event, credential: string, deviceId: string) => runtime.unlock(credential, deviceId))
  ipcMain.handle(ipcChannels.logout, (_event, sessionId: string) => runtime.logout(sessionId))
  ipcMain.handle(ipcChannels.lock, (_event, sessionId: string) => runtime.lock(sessionId))
  ipcMain.handle(ipcChannels.refresh, (_event, deviceId: string) => runtime.refresh(deviceId))
  ipcMain.handle(ipcChannels.updateSettings, (_event, input) => runtime.updateSettings(input))
  ipcMain.handle(ipcChannels.createConversation, (_event, input) => runtime.createConversation(input))
  ipcMain.handle(ipcChannels.sendMessage, async (event, input) =>
    runtime.sendMessage(input.conversationId, input.content, (chunk: StreamChunk) => {
      event.sender.send(ipcChannels.aiStreamChunk, chunk)
    }),
  )
  ipcMain.handle(ipcChannels.addActivity, (_event, input) => runtime.addActivity(input))
  ipcMain.handle(ipcChannels.listMessages, (_event, conversationId: string) => runtime.listMessages(conversationId))
  ipcMain.handle(ipcChannels.confirmToolExecution, (_event, id: string, approved: boolean) =>
    runtime.resolveConfirmation(id, approved),
  )
  ipcMain.handle(ipcChannels.listGemmaModels, () => runtime.listGemmaModels())
  ipcMain.handle(ipcChannels.detectProviders, () => runtime.detectProviders())
  ipcMain.handle(ipcChannels.getSystemInfo, () => runtime.getSystemInfo())
  ipcMain.handle(ipcChannels.pullModel, (event, model: string) =>
    runtime.pullModel(model, (progress) => {
      event.sender.send(ipcChannels.pullModelProgress, progress)
    }),
  )
  ipcMain.handle(ipcChannels.installOllama, (event) =>
    runtime.installOllama((progress) => {
      event.sender.send(ipcChannels.installProgress, progress)
    }),
  )
  ipcMain.handle(ipcChannels.installDocker, (event) =>
    runtime.installDocker((progress) => {
      event.sender.send(ipcChannels.installProgress, progress)
    }),
  )
  ipcMain.handle(ipcChannels.startOllamaServer, () => runtime.startOllamaServer())
  ipcMain.handle(ipcChannels.startDockerDaemon, () => runtime.startDockerDaemon())
  ipcMain.handle(ipcChannels.startDockerOllama, () => runtime.startDockerOllama())
  ipcMain.handle(ipcChannels.clearConversation, (_event, conversationId: string) =>
    runtime.clearConversation(conversationId),
  )
  ipcMain.handle(ipcChannels.deleteConversation, (_event, conversationId: string) =>
    runtime.deleteConversation(conversationId),
  )
  ipcMain.handle(ipcChannels.listDirectory, (_event, dirPath: string) => runtime.listDirectory(dirPath))
}


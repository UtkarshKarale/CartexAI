/**
 * API-based Runtime for JiFile Desktop - NO SQLite3 Database
 * All data operations go through Cartex APIs
 */

import path from 'node:path'
import os from 'node:os'
import { existsSync, readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { app, shell } from 'electron'
import { CartexAiOrchestrator } from '../ai/cartex-orchestrator'
import { ollamaListGemmaModelInfos } from '../ai/providers/ollama'
import { detectProviders, createProvider, findOllamaBinary, tryExec } from '../ai/provider-factory'
import { log, timer } from '../ai/logger'
import { detectSystem } from '../ai/system-detect'
import { createJiFileAPIClient } from '../../src/lib/cartex-jifile-api'
import { createCartexClient, getCartexAuth } from '../../src/lib/cartex-api'
import { createConfigSync } from '../../src/lib/cartex-sync'
import type { CartexUser } from '../../src/lib/cartex-auth'
import type {
  ActivityRecord,
  AppSettings,
  BootstrapPayload,
  CreateAccountInput,
  CreateConversationInput,
  DeviceInfo,
  DirectoryListing,
  FindSimilarImagesInput,
  InstallProgress,
  LoginInput,
  MessageRecord,
  OpenTargetResult,
  ProviderStatus,
  PullModelProgress,
  SimilarImagesResponse,
  SessionInfo,
  StreamChunk,
  SystemInfo,
  ThemeMode,
  ToolExecutionRecord,
  UpdateSettingsInput,
  UserProfile,
  WorkflowRecord,
  ConversationSummary,
} from '../../src/shared/contracts'

export class ApiBasedRuntime {
  private readonly currentDevicePlatform = process.platform
  private activeOrchestrator: CartexAiOrchestrator | null = null
  private jifileAPI = createJiFileAPIClient()
  private cartexClient: any = null
  private cartexConfigSync: any = null
  private isCartexInitialized = false
  private currentDeviceId: string | null = null
  private currentSessionToken: string | null = null

  constructor() {
    console.log('🚀 Initializing API-based JiFile runtime (NO SQLite3)')
    this.initializeAPIs().catch(error => {
      console.warn('Failed to initialize APIs:', error)
    })
  }

  private async initializeAPIs(): Promise<void> {
    try {
      const cartexApiUrl = process.env.CARTEX_API_URL || 'http://localhost:3001'
      
      // Initialize JiFile API client
      this.jifileAPI = createJiFileAPIClient(cartexApiUrl)
      
      // Initialize Cartex client
      this.cartexClient = createCartexClient({
        baseUrl: cartexApiUrl,
        deviceName: `JiFile Desktop - ${os.hostname()}`,
        platform: process.platform,
        version: app.getVersion()
      })

      // Initialize Cartex auth
      getCartexAuth({
        baseUrl: cartexApiUrl,
        clientId: 'jifile-desktop'
      })

      // Register device and get session token
      const registration = await this.cartexClient.registerDevice()
      this.currentDeviceId = registration.device.deviceId
      this.currentSessionToken = registration.sessionToken
      
      this.cartexClient.setSessionToken(registration.sessionToken)
      this.jifileAPI.setDeviceId(this.currentDeviceId)
      
      // Initialize config sync
      this.cartexConfigSync = createConfigSync(this.cartexClient, {
        syncInterval: 30000,
        retryDelay: 5000,
        maxRetries: 3
      })

      // Initialize orchestrator with fallback
      const fallbackProvider = createProvider(await this.getDefaultSettings(), () => {})
      if (fallbackProvider) {
        this.activeOrchestrator = new CartexAiOrchestrator(
          fallbackProvider,
          () => {},
          await this.getDefaultSettings()
        )
        
        await this.activeOrchestrator.initialize()
        this.isCartexInitialized = true
        
        log('api-runtime', 'API-based runtime initialized successfully')
      }
    } catch (error) {
      console.warn('API initialization failed:', error)
      this.isCartexInitialized = false
    }
  }

  // Bootstrap - replaces SQLite bootstrap
  async bootstrap(deviceId: string): Promise<BootstrapPayload> {
    try {
      // Authenticate with Cartex first
      const auth = getCartexAuth()
      if (!auth.isAuthenticated()) {
        // Return login required state
        return {
          authMode: 'login',
          hasAccount: true,
          theme: 'dark',
          device: {
            deviceId: this.currentDeviceId || deviceId,
            platform: this.currentDevicePlatform,
            trusted: false,
            rememberedAt: null,
            lastSeenAt: null
          },
          currentUser: null,
          session: null,
          conversations: [],
          activity: [],
          workflows: [],
          settings: await this.getDefaultSettings(),
          toolExecutions: [],
          indexedFiles: [],
          permissions: [],
          memoryPreferences: []
        }
      }

      // Set authentication token for API calls
      if (this.currentSessionToken) {
        this.jifileAPI.setSessionToken(this.currentSessionToken)
      }

      // Bootstrap from Cartex APIs
      const bootstrap = await this.jifileAPI.bootstrap(deviceId)
      return bootstrap

    } catch (error) {
      console.error('Bootstrap failed:', error)
      
      // Return safe fallback state
      return {
        authMode: 'login',
        hasAccount: true,
        theme: 'dark',
        device: {
          deviceId: this.currentDeviceId || deviceId,
          platform: this.currentDevicePlatform,
          trusted: false,
          rememberedAt: null,
          lastSeenAt: null
        },
        currentUser: null,
        session: null,
        conversations: [],
        activity: [],
        workflows: [],
        settings: await this.getDefaultSettings(),
        toolExecutions: [],
        indexedFiles: [],
        permissions: [],
        memoryPreferences: []
      }
    }
  }

  // Authentication methods using Cartex
  async createAccount(input: CreateAccountInput, deviceId: string): Promise<BootstrapPayload> {
    // Account creation happens in Cartex web interface
    throw new Error('Account creation must be done via Cartex web interface')
  }

  async login(input: LoginInput, deviceId: string): Promise<BootstrapPayload> {
    try {
      const auth = getCartexAuth()
      await auth.loginWithEmail(input.credential.split('@')[0] + '@cartex.ai', input.credential)
      
      // Create JiFile session
      if (auth.isAuthenticated()) {
        const sessionToken = auth.getSessionToken()
        if (sessionToken) {
          this.jifileAPI.setSessionToken(sessionToken)
          this.currentSessionToken = sessionToken
        }

        await this.jifileAPI.createSession(deviceId, input.rememberDevice)
      }

      return this.bootstrap(deviceId)
    } catch (error) {
      throw new Error(`Login failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async unlock(credential: string, deviceId: string): Promise<BootstrapPayload> {
    // For API-based runtime, unlock is the same as login
    return this.login({ credential, rememberDevice: false, credentialKind: 'password' }, deviceId)
  }

  async logout(sessionId: string): Promise<void> {
    try {
      await this.jifileAPI.revokeSessions({ sessionId })
      
      const auth = getCartexAuth()
      await auth.logout()
      
      // Stop config sync
      if (this.cartexConfigSync) {
        this.cartexConfigSync.stop()
      }

      this.currentSessionToken = null
    } catch (error) {
      console.warn('Logout failed:', error)
    }
  }

  async lock(sessionId: string): Promise<void> {
    // For now, locking is the same as logout in API mode
    return this.logout(sessionId)
  }

  async refresh(deviceId: string): Promise<BootstrapPayload> {
    return this.bootstrap(deviceId)
  }

  // Settings management via API
  async updateSettings(input: UpdateSettingsInput): Promise<AppSettings> {
    try {
      const updatedSettings = await this.jifileAPI.updateSettings(input)
      return this.mapApiSettingsToAppSettings(updatedSettings)
    } catch (error) {
      throw new Error(`Failed to update settings: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Conversation management via API
  async createConversation(input: CreateConversationInput): Promise<ConversationSummary> {
    try {
      return await this.jifileAPI.createConversation({
        title: input.title,
        tags: input.tags,
        deviceId: this.currentDeviceId || undefined
      })
    } catch (error) {
      throw new Error(`Failed to create conversation: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async clearConversation(conversationId: string): Promise<void> {
    try {
      await this.jifileAPI.clearConversation(conversationId)
    } catch (error) {
      throw new Error(`Failed to clear conversation: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await this.jifileAPI.deleteConversation(conversationId)
    } catch (error) {
      throw new Error(`Failed to delete conversation: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async listMessages(conversationId: string): Promise<MessageRecord[]> {
    try {
      const response = await this.jifileAPI.getMessages(conversationId)
      return response.messages
    } catch (error) {
      throw new Error(`Failed to list messages: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // AI orchestration using Cartex
  async sendMessage(conversationId: string, content: string, onChunk: (chunk: StreamChunk) => void): Promise<MessageRecord[]> {
    try {
      // Create user message
      const userMessage = await this.jifileAPI.createMessage({
        conversationId,
        role: 'user',
        content,
        metadata: { source: 'composer' }
      })

      // Get conversation history
      const messages = await this.listMessages(conversationId)
      const history = messages.slice(-8).filter((m) => m.role === 'user' || m.role === 'assistant')

      if (!this.activeOrchestrator) {
        throw new Error('AI orchestrator not available')
      }

      // Update orchestrator chunk handler
      this.activeOrchestrator['onChunk'] = onChunk

      const historyForAI = history.slice(0, -1).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

      // Run AI orchestrator
      const assistantReply = await this.activeOrchestrator.run(historyForAI, content)

      // Create assistant message
      await this.jifileAPI.createMessage({
        conversationId,
        role: 'assistant',
        content: assistantReply,
        metadata: { model: 'cartex-managed' }
      })

      // Return updated messages
      return this.listMessages(conversationId)

    } catch (error) {
      const errorMsg = `AI request failed: ${error instanceof Error ? error.message : String(error)}`
      onChunk({ type: 'error', error: errorMsg })
      onChunk({ type: 'done' })
      throw new Error(errorMsg)
    }
  }

  resolveConfirmation(id: string, approved: boolean): void {
    this.activeOrchestrator?.resolveConfirmation(id, approved)
  }

  // Activity logging via API (using Cartex activity events)
  addActivity(input: Omit<ActivityRecord, 'id' | 'createdAt'>): ActivityRecord {
    // For now, return a mock record. In full implementation, this would call Cartex API
    const record: ActivityRecord = {
      ...input,
      id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
    }

    // TODO: Send to Cartex activity events API
    console.log('Activity recorded:', record)
    return record
  }

  // System detection methods (unchanged)
  async listGemmaModels() {
    return ollamaListGemmaModelInfos()
  }

  async detectProviders(): Promise<ProviderStatus> {
    const settings = await this.getDefaultSettings()
    return detectProviders(settings.anthropicKey, settings.openrouterKey, settings.geminiKey)
  }

  getSystemInfo(): SystemInfo {
    return detectSystem()
  }

  // Model management (unchanged)
  pullModel(model: string, onProgress: (progress: PullModelProgress) => void): Promise<void> {
    const ollamaBin = findOllamaBinary() ?? 'ollama'
    return new Promise((resolve, reject) => {
      const proc = spawn(ollamaBin, ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] })

      const parseLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        
        try {
          const json = JSON.parse(trimmed) as { status?: string; completed?: number; total?: number }
          const percent = json.total && json.total > 0 ? Math.round(((json.completed ?? 0) / json.total) * 100) : 0
          onProgress({ status: json.status ?? 'Downloading…', percent, done: false })
        } catch {
          // non-JSON line - skip silently
        }
      }

      proc.stdout?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) parseLine(line)
      })

      proc.stderr?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) parseLine(line)
      })

      proc.on('close', (code) => {
        if (code === 0) {
          onProgress({ status: 'Model downloaded successfully', percent: 100, done: true })
          resolve()
        } else {
          reject(new Error(`Model download failed with code ${code}`))
        }
      })

      proc.on('error', reject)
    })
  }

  // Other system methods remain the same as original runtime...
  // (installOllama, startOllamaServer, etc.)

  // File system operations (unchanged)
  listDirectory(dirPath: string): DirectoryListing {
    const resolvedPath = dirPath && dirPath.trim() ? dirPath : os.homedir()
    try {
      const entries = readdirSync(resolvedPath, { withFileTypes: true })
        .map((dirent) => ({
          name: dirent.name,
          path: path.join(resolvedPath, dirent.name),
          isDirectory: dirent.isDirectory(),
        }))
        .filter((entry) => !entry.name.startsWith('.'))

      return { entries, cwd: resolvedPath }
    } catch {
      return { entries: [], cwd: resolvedPath }
    }
  }

  async openTarget(target: string): Promise<OpenTargetResult> {
    try {
      await shell.openPath(target)
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      }
    }
  }

  // Placeholder implementations for other methods...
  async findSimilarImages(input: FindSimilarImagesInput): Promise<SimilarImagesResponse> {
    // This would need implementation based on your specific requirements
    return { images: [] }
  }

  async installOllama(onProgress: (progress: InstallProgress) => void): Promise<void> {
    throw new Error('Ollama installation not implemented in API mode')
  }

  async startOllamaServer(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Ollama management not supported in API mode' }
  }

  // Utility methods
  private async getDefaultSettings(): Promise<AppSettings> {
    try {
      const settings = await this.jifileAPI.getSettingsWithCache(this.currentDeviceId || undefined)
      return this.mapApiSettingsToAppSettings(settings)
    } catch {
      // Return safe defaults if API fails
      return {
        theme: 'dark' as ThemeMode,
        autoLockMinutes: 5,
        privacyMode: true,
        analyticsEnabled: false,
        defaultModel: 'gemma3:1b',
        accent: 'slate',
        providerType: 'ollama',
        anthropicKey: '',
        anthropicModel: 'claude-haiku-4-5-20251001',
        openrouterKey: '',
        openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
        geminiKey: '',
        geminiModel: 'gemini-2.0-flash',
        openaiBaseUrl: 'http://localhost:8081/v1',
        openaiApiKey: '',
        openaiModel: 'qwen-q4.gguf',
        openaiDisableTools: false,
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
        smtpFromName: '',
        cartexApiUrl: process.env.CARTEX_API_URL || 'http://localhost:3001'
      }
    }
  }

  private mapApiSettingsToAppSettings(apiSettings: any): AppSettings {
    return {
      theme: apiSettings.theme || 'dark',
      autoLockMinutes: apiSettings.autoLockMinutes || 5,
      privacyMode: apiSettings.privacyMode ?? true,
      analyticsEnabled: apiSettings.analyticsEnabled ?? false,
      defaultModel: apiSettings.defaultModel || 'gemma3:1b',
      accent: apiSettings.accent || 'slate',
      providerType: apiSettings.providerType || 'ollama',
      anthropicKey: apiSettings.hasAnthropicKey ? '***' : '',
      anthropicModel: apiSettings.anthropicModel || 'claude-haiku-4-5-20251001',
      openrouterKey: apiSettings.hasOpenrouterKey ? '***' : '',
      openrouterModel: apiSettings.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free',
      geminiKey: apiSettings.hasGeminiKey ? '***' : '',
      geminiModel: apiSettings.geminiModel || 'gemini-2.0-flash',
      openaiBaseUrl: apiSettings.openaiBaseUrl || 'http://localhost:8081/v1',
      openaiApiKey: apiSettings.hasOpenaiKey ? '***' : '',
      openaiModel: apiSettings.openaiModel || 'qwen-q4.gguf',
      openaiDisableTools: apiSettings.openaiDisableTools ?? false,
      smtpHost: apiSettings.smtpHost || '',
      smtpPort: apiSettings.smtpPort || 587,
      smtpUser: apiSettings.smtpUser || '',
      smtpPass: apiSettings.hasSmtpPass ? '***' : '',
      smtpFrom: apiSettings.smtpFrom || '',
      smtpFromName: apiSettings.smtpFromName || '',
      cartexApiUrl: process.env.CARTEX_API_URL || 'http://localhost:3001'
    }
  }

  // SMTP environment variables (for MCP server)
  getSmtpEnvVars(): Record<string, string> {
    // Since API keys are masked, we need to get them from Cartex
    // For now, return empty - SMTP should be managed via Cartex
    return {
      SMTP_HOST: '',
      SMTP_PORT: '587',
      SMTP_USER: '',
      SMTP_PASS: '',
      SMTP_FROM: '',
      SMTP_FROM_NAME: '',
    }
  }

  // Additional methods would be implemented as needed...
}
import path from 'node:path'
import os from 'node:os'
import { readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { app, shell } from 'electron'
import { SQLiteCliDatabase, bool, json, nowIso, sql } from './sqlite'
import { createCredentialHash, createId, createSessionToken, verifyCredential } from './crypto'
import { sqliteSchema } from './schema'
import { AiOrchestrator } from '../ai/orchestrator'
import { ollamaListGemmaModelInfos } from '../ai/providers/ollama'
import { detectProviders, createProvider, findOllamaBinary, tryExec } from '../ai/provider-factory'
import { log, timer } from '../ai/logger'
import { detectSystem } from '../ai/system-detect'
import type {
  ActivityRecord,
  AppSettings,
  BootstrapPayload,
  ConversationSummary,
  CreateAccountInput,
  CreateConversationInput,
  DeviceInfo,
  DirectoryListing,
  InstallProgress,
  LoginInput,
  MessageRecord,
  ProviderStatus,
  PullModelProgress,
  SessionInfo,
  StreamChunk,
  SystemInfo,
  ThemeMode,
  ToolExecutionRecord,
  UpdateSettingsInput,
  UserProfile,
  WorkflowRecord,
} from '../../src/shared/contracts'

type UserRow = {
  id: string
  display_name: string
  email: string | null
  auth_kind: 'password' | 'pin'
  credential_hash: string
  credential_salt: string
  created_at: string
  last_login_at: string | null
}

type SessionRow = {
  id: string
  user_id: string
  device_id: string
  token: string
  created_at: string
  expires_at: string
  last_seen_at: string
  locked_at: string | null
  is_active: number
  remember_device: number
}

type ConversationRow = {
  id: string
  title: string
  preview: string
  tags_json: string
  pinned: number
  message_count: number
  created_at: string
  updated_at: string
}

type SettingsRow = {
  id: number
  theme: ThemeMode
  auto_lock_minutes: number
  privacy_mode: number
  analytics_enabled: number
  default_model: string
  accent: AppSettings['accent']
  provider_type: AppSettings['providerType']
  anthropic_key: string
  anthropic_model: AppSettings['anthropicModel']
  openrouter_key: string
  openrouter_model: string
  gemini_key: string
  gemini_model: AppSettings['geminiModel']
  openai_base_url: string
  openai_api_key: string
  openai_model: string
  openai_disable_tools: number
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_pass: string
  smtp_from: string
  smtp_from_name: string
}

const defaultSettingsRow: SettingsRow = {
  id: 1,
  theme: 'dark',
  auto_lock_minutes: 5,
  privacy_mode: 1,
  analytics_enabled: 0,
  default_model: 'gemma3:1b',
  accent: 'slate',
  provider_type: 'ollama',
  anthropic_key: '',
  anthropic_model: 'claude-haiku-4-5-20251001',
  openrouter_key: '',
  openrouter_model: 'meta-llama/llama-3.3-70b-instruct:free',
  gemini_key: '',
  gemini_model: 'gemini-2.0-flash',
  openai_base_url: 'http://localhost:8081/v1',
  openai_api_key: '',
  openai_model: 'qwen-q4.gguf',
  openai_disable_tools: 0,
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
  smtp_from: '',
  smtp_from_name: '',
}

export class DesktopRuntime {
  private readonly database: SQLiteCliDatabase
  private readonly currentDevicePlatform = process.platform
  private activeOrchestrator: AiOrchestrator | null = null

  constructor() {
    const databasePath = path.join(app.getPath('userData'), 'aster-assistant.sqlite3')
    this.database = SQLiteCliDatabase.initialize(databasePath, sqliteSchema)
    for (const col of [
      "provider_type TEXT DEFAULT 'ollama'",
      "anthropic_key TEXT DEFAULT ''",
      "anthropic_model TEXT DEFAULT 'claude-haiku-4-5-20251001'",
      "openrouter_key TEXT DEFAULT ''",
      "openrouter_model TEXT DEFAULT 'meta-llama/llama-3.3-70b-instruct:free'",
      "gemini_key TEXT DEFAULT ''",
      "gemini_model TEXT DEFAULT 'gemini-2.0-flash'",
      "openai_base_url TEXT DEFAULT 'http://localhost:8081/v1'",
      "openai_api_key TEXT DEFAULT ''",
      "openai_model TEXT DEFAULT 'qwen-q4.gguf'",
      "openai_disable_tools INTEGER DEFAULT 0",
      "smtp_host TEXT DEFAULT ''",
      "smtp_port INTEGER DEFAULT 587",
      "smtp_user TEXT DEFAULT ''",
      "smtp_pass TEXT DEFAULT ''",
      "smtp_from TEXT DEFAULT ''",
      "smtp_from_name TEXT DEFAULT ''",
    ]) {
      try { this.database.exec(`ALTER TABLE app_settings ADD COLUMN ${col};`) } catch { /* already exists */ }
    }
    this.database.exec(`
      INSERT OR IGNORE INTO app_settings (id, theme, auto_lock_minutes, privacy_mode, analytics_enabled, default_model, accent, provider_type, anthropic_key, anthropic_model, openrouter_key, openrouter_model, gemini_key, gemini_model, openai_base_url, openai_api_key, openai_model, openai_disable_tools)
      VALUES (1, ${sql(defaultSettingsRow.theme)}, ${defaultSettingsRow.auto_lock_minutes}, ${defaultSettingsRow.privacy_mode}, ${defaultSettingsRow.analytics_enabled}, ${sql(defaultSettingsRow.default_model)}, ${sql(defaultSettingsRow.accent)}, ${sql(defaultSettingsRow.provider_type)}, ${sql(defaultSettingsRow.anthropic_key)}, ${sql(defaultSettingsRow.anthropic_model)}, ${sql(defaultSettingsRow.openrouter_key)}, ${sql(defaultSettingsRow.openrouter_model)}, ${sql(defaultSettingsRow.gemini_key)}, ${sql(defaultSettingsRow.gemini_model)}, ${sql(defaultSettingsRow.openai_base_url)}, ${sql(defaultSettingsRow.openai_api_key)}, ${sql(defaultSettingsRow.openai_model)}, ${defaultSettingsRow.openai_disable_tools});
    `)
  }

  bootstrap(deviceId: string): BootstrapPayload {
    const accountCount = this.database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users')?.count ?? 0
    const device = this.loadDevice(deviceId)
    const settings = this.loadSettings()
    const currentUser = this.loadCurrentUser(deviceId)
    const session = this.loadSession(deviceId, currentUser?.id ?? null)
    const authMode = this.resolveAuthMode(accountCount > 0, session)

    return {
      authMode,
      hasAccount: accountCount > 0,
      theme: settings.theme,
      device,
      currentUser,
      session,
      conversations: this.listConversations(),
      activity: this.listActivity(),
      workflows: this.listWorkflows(),
      settings,
      toolExecutions: this.listToolExecutions(),
      indexedFiles: this.listIndexedFiles(),
      permissions: this.listPermissions(),
      memoryPreferences: this.listMemoryPreferences(),
    }
  }

  createAccount(input: CreateAccountInput, deviceId: string): BootstrapPayload {
    const existingAccount = this.database.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users')?.count ?? 0
    if (existingAccount > 0) {
      throw new Error('An admin account already exists on this device.')
    }

    this.validateCredential(input.credential, input.credentialKind)
    const userId = createId('user')
    const now = nowIso()
    const { hash, salt } = createCredentialHash(input.credential)

    this.database.exec(`
      INSERT INTO users (id, display_name, email, auth_kind, credential_hash, credential_salt, created_at, last_login_at)
      VALUES (${sql(userId)}, ${sql(input.displayName)}, NULL, ${sql(input.credentialKind)}, ${sql(hash)}, ${sql(salt)}, ${sql(now)}, ${sql(now)});
    `)

    this.ensureTrustedDevice(userId, deviceId)
    this.createSession(userId, deviceId, true)
    this.database.exec(`
      UPDATE app_settings SET
        theme = ${sql(defaultSettingsRow.theme)},
        auto_lock_minutes = ${defaultSettingsRow.auto_lock_minutes},
        privacy_mode = ${defaultSettingsRow.privacy_mode},
        analytics_enabled = ${defaultSettingsRow.analytics_enabled},
        default_model = ${sql(defaultSettingsRow.default_model)},
        accent = ${sql(defaultSettingsRow.accent)},
        provider_type = ${sql(defaultSettingsRow.provider_type)},
        anthropic_key = ${sql(defaultSettingsRow.anthropic_key)},
        anthropic_model = ${sql(defaultSettingsRow.anthropic_model)}
      WHERE id = 1;
    `)

    return this.bootstrap(deviceId)
  }

  login(input: LoginInput, deviceId: string): BootstrapPayload {
    const user = this.getPrimaryUser()
    if (!user) {
      throw new Error('No local account exists yet.')
    }

    this.validateCredential(input.credential, input.credentialKind)
    if (!verifyCredential(input.credential, user.credential_hash, user.credential_salt)) {
      throw new Error('Credential did not match.')
    }

    this.database.exec(`UPDATE users SET last_login_at = ${sql(nowIso())} WHERE id = ${sql(user.id)};`)
    if (input.rememberDevice) {
      this.ensureTrustedDevice(user.id, deviceId)
    }

    this.createSession(user.id, deviceId, input.rememberDevice)
    this.addActivity({
      title: 'User login',
      detail: `${user.display_name} unlocked the local workspace.`,
      severity: 'success',
      source: 'auth',
    })

    return this.bootstrap(deviceId)
  }

  unlock(credential: string, deviceId: string): BootstrapPayload {
    const session = this.loadSession(deviceId, null)
    if (!session) {
      throw new Error('No locked session found for this device.')
    }

    const user = this.getUserById(session.userId)
    if (!user) {
      throw new Error('Session user no longer exists.')
    }

    if (!verifyCredential(credential, user.credential_hash, user.credential_salt)) {
      throw new Error('Credential did not match.')
    }

    this.database.exec(`
      UPDATE sessions
      SET locked_at = NULL, last_seen_at = ${sql(nowIso())}, is_active = 1
      WHERE id = ${sql(session.id)};
    `)
    return this.bootstrap(deviceId)
  }

  logout(sessionId: string): BootstrapPayload {
    const session = this.database.queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ${sql(sessionId)};`)
    if (!session) {
      throw new Error('Session not found.')
    }
    this.database.exec(`
      UPDATE sessions
      SET locked_at = NULL, is_active = 0, last_seen_at = ${sql(nowIso())}
      WHERE id = ${sql(sessionId)};
    `)
    return this.bootstrap(session.device_id)
  }

  lock(sessionId: string): BootstrapPayload {
    const session = this.database.queryOne<SessionRow>(`SELECT * FROM sessions WHERE id = ${sql(sessionId)};`)
    if (!session) {
      throw new Error('Session not found.')
    }
    this.database.exec(`
      UPDATE sessions
      SET locked_at = ${sql(nowIso())}, last_seen_at = ${sql(nowIso())}
      WHERE id = ${sql(sessionId)};
    `)
    return this.bootstrap(session.device_id)
  }

  refresh(deviceId: string): BootstrapPayload {
    return this.bootstrap(deviceId)
  }

  updateSettings(input: UpdateSettingsInput): AppSettings {
    const current = this.loadSettings()
    const next: AppSettings = {
      ...current,
      ...input,
    }
    this.database.exec(`
      UPDATE app_settings SET
        theme = ${sql(next.theme)},
        auto_lock_minutes = ${next.autoLockMinutes},
        privacy_mode = ${next.privacyMode ? 1 : 0},
        analytics_enabled = ${next.analyticsEnabled ? 1 : 0},
        default_model = ${sql(next.defaultModel)},
        accent = ${sql(next.accent)},
        provider_type = ${sql(next.providerType)},
        anthropic_key = ${sql(next.anthropicKey)},
        anthropic_model = ${sql(next.anthropicModel)},
        openrouter_key = ${sql(next.openrouterKey)},
        openrouter_model = ${sql(next.openrouterModel)},
        gemini_key = ${sql(next.geminiKey)},
        gemini_model = ${sql(next.geminiModel)},
        openai_base_url = ${sql(next.openaiBaseUrl)},
        openai_api_key = ${sql(next.openaiApiKey)},
        openai_model = ${sql(next.openaiModel)},
        openai_disable_tools = ${next.openaiDisableTools ? 1 : 0},
        smtp_host = ${sql(next.smtpHost)},
        smtp_port = ${next.smtpPort},
        smtp_user = ${sql(next.smtpUser)},
        smtp_pass = ${sql(next.smtpPass)},
        smtp_from = ${sql(next.smtpFrom)},
        smtp_from_name = ${sql(next.smtpFromName)}
      WHERE id = 1;
    `)
    return this.loadSettings()
  }

  createConversation(input: CreateConversationInput): ConversationSummary {
    const id = createId('conv')
    const now = nowIso()
    this.database.exec(`
      INSERT INTO conversations (id, title, preview, tags_json, pinned, message_count, created_at, updated_at)
      VALUES (${sql(id)}, ${sql(input.title)}, ${sql('')}, ${json(input.tags)}, 0, 0, ${sql(now)}, ${sql(now)});
    `)
    return this.getConversationById(id) as ConversationSummary
  }

  clearConversation(conversationId: string): void {
    const conversation = this.getConversationById(conversationId)
    if (!conversation) {
      throw new Error('Conversation not found.')
    }

    this.database.exec(`
      DELETE FROM messages WHERE conversation_id = ${sql(conversationId)};
      UPDATE conversations
      SET preview = '',
          message_count = 0,
          updated_at = ${sql(nowIso())}
      WHERE id = ${sql(conversationId)};
    `)
  }

  deleteConversation(conversationId: string): void {
    this.database.exec(`
      DELETE FROM messages WHERE conversation_id = ${sql(conversationId)};
      DELETE FROM conversations WHERE id = ${sql(conversationId)};
    `)
  }

  async sendMessage(conversationId: string, content: string, onChunk: (chunk: StreamChunk) => void): Promise<MessageRecord[]> {
    const conversation = this.getConversationById(conversationId)
    if (!conversation) {
      throw new Error('Conversation not found.')
    }

    const now = nowIso()
    const userMessageId = createId('msg')

    this.database.exec(`
      INSERT INTO messages (id, conversation_id, role, content, metadata_json, created_at)
      VALUES (${sql(userMessageId)}, ${sql(conversationId)}, 'user', ${sql(content)}, ${json({ source: 'composer' })}, ${sql(now)});
      UPDATE conversations
      SET preview = ${sql(content.slice(0, 96))},
          message_count = message_count + 1,
          updated_at = ${sql(now)}
      WHERE id = ${sql(conversationId)};
    `)

    const rawHistory = this.listMessages(conversationId)
      .slice(-8)
      .filter((m) => m.role === 'user' || m.role === 'assistant')
    const history = rawHistory.map((m, i) => ({
      role: m.role as 'user' | 'assistant',
      content: i < rawHistory.length - 4 && m.content.length > 120
        ? m.content.slice(0, 120) + '…'
        : m.content,
    }))

    const settings = await this.resolveSettings()
    const promptSize = content.length
    log('runtime', `sendMessage model=${settings.defaultModel} provider=${settings.providerType} historyLen=${history.length} promptSize=${promptSize} prompt="${content}"`)
    const provider = createProvider(settings, onChunk)
    if (!provider) {
      onChunk({ type: 'error', error: 'No AI provider configured. Please set up Ollama or add an Anthropic API key.' })
      onChunk({ type: 'done' })
      return this.listMessages(conversationId)
    }

    const orchestrator = new AiOrchestrator(provider, onChunk, settings)
    this.activeOrchestrator = orchestrator
    const sendTimer = timer('runtime', 'sendMessage total')

    let assistantReply = ''
    const execId = createId('exec')
    const execStart = nowIso()

    this.database.exec(`
      INSERT INTO tool_executions (id, tool_name, status, input_summary, output_summary, started_at, finished_at)
      VALUES (${sql(execId)}, 'ai_chat', 'running', ${sql(content)}, '', ${sql(execStart)}, NULL);
    `)

    try {
      assistantReply = await orchestrator.run(
        history.slice(0, -1),
        content,
      )
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      assistantReply = `I encountered an error: ${errMsg}`
      onChunk({ type: 'error', error: errMsg })
      onChunk({ type: 'done' })
    } finally {
      this.activeOrchestrator = null
      sendTimer()
    }

    const assistantMessageId = createId('msg')
    const doneAt = nowIso()

    this.database.exec(`
      INSERT INTO messages (id, conversation_id, role, content, metadata_json, created_at)
      VALUES (${sql(assistantMessageId)}, ${sql(conversationId)}, 'assistant', ${sql(assistantReply)}, ${json({ model: settings.providerType === 'anthropic' ? settings.anthropicModel : settings.defaultModel })}, ${sql(doneAt)});
      UPDATE conversations
      SET message_count = message_count + 1,
          updated_at = ${sql(doneAt)}
      WHERE id = ${sql(conversationId)};
      UPDATE tool_executions
      SET status = 'success', output_summary = ${sql(assistantReply.slice(0, 128))}, finished_at = ${sql(doneAt)}
      WHERE id = ${sql(execId)};
    `)

    this.addActivity({
      title: 'AI response generated',
      detail: `Conversation "${conversation.title}" received a reply. Prompt: "${content.slice(0, 50)}${content.length > 50 ? '...' : ''}" (${content.length} chars)`,
      severity: 'info',
      source: 'chat',
    })

    return this.listMessages(conversationId)
  }

  resolveConfirmation(id: string, approved: boolean): void {
    this.activeOrchestrator?.resolveConfirmation(id, approved)
  }

  async listGemmaModels() {
    return ollamaListGemmaModelInfos()
  }

  /** Like loadSettings but auto-corrects defaultModel to an installed gemma model. */
  private async resolveSettings(): Promise<AppSettings> {
    const settings = this.loadSettings()
    if (settings.providerType === 'anthropic' || settings.providerType === 'openrouter' || settings.providerType === 'gemini') return settings

    const installed = await ollamaListGemmaModelInfos()
    if (installed.length === 0) return settings

    const isInstalled = installed.some((m) => m.name === settings.defaultModel)
    if (isInstalled) return settings

    // Current defaultModel not found — pick smallest installed gemma
    const best = installed[0].name
    this.database.exec(`UPDATE app_settings SET default_model = ${sql(best)} WHERE id = 1;`)
    return { ...settings, defaultModel: best }
  }

  async detectProviders(): Promise<ProviderStatus> {
    const settings = this.loadSettings()
    return detectProviders(settings.anthropicKey, settings.openrouterKey, settings.geminiKey)
  }

  getSystemInfo(): SystemInfo {
    return detectSystem()
  }

  pullModel(model: string, onProgress: (progress: PullModelProgress) => void): Promise<void> {
    const ollamaBin = findOllamaBinary() ?? 'ollama'
    return new Promise((resolve, reject) => {
      const proc = spawn(ollamaBin, ['pull', model], { stdio: ['ignore', 'pipe', 'pipe'] })

      const parseLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return
        }
        try {
          const json = JSON.parse(trimmed) as { status?: string; completed?: number; total?: number }
          const percent = json.total && json.total > 0 ? Math.round(((json.completed ?? 0) / json.total) * 100) : 0
          onProgress({ status: json.status ?? 'Downloading…', percent, done: false })
        } catch {
          // non-JSON line (e.g. ANSI progress) — skip silently
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
          onProgress({ status: 'Model ready', percent: 100, done: true })
          resolve()
        } else {
          const err = `ollama pull exited with code ${code}`
          onProgress({ status: err, percent: 0, done: true, error: err })
          reject(new Error(err))
        }
      })

      proc.on('error', (err) => {
        onProgress({ status: err.message, percent: 0, done: true, error: err.message })
        reject(err)
      })
    })
  }

  installOllama(onProgress: (progress: InstallProgress) => void): Promise<void> {
    const platform = process.platform
    if (platform === 'linux') {
      return this.runInstallScript('sh', ['-c', 'curl -fsSL https://ollama.com/install.sh | sh'], onProgress)
    }
    if (platform === 'darwin') {
      if (tryExec('brew', ['--version'])) {
        return this.runInstallScript('brew', ['install', 'ollama'], onProgress)
      }
    }
    void shell.openExternal('https://ollama.com/download')
    onProgress({ status: 'Browser opened — run the Ollama installer, then click Refresh', percent: 100, done: true, browserOpened: true })
    return Promise.resolve()
  }

  installDocker(onProgress: (progress: InstallProgress) => void): Promise<void> {
    const platform = process.platform
    if (platform === 'linux') {
      return this.runInstallScript('sh', ['-c', 'curl -fsSL https://get.docker.com | sh'], onProgress)
    }
    const url = platform === 'darwin'
      ? 'https://docs.docker.com/desktop/install/mac-install/'
      : 'https://docs.docker.com/desktop/install/windows-install/'
    void shell.openExternal(url)
    onProgress({ status: 'Browser opened — install Docker Desktop, then click Refresh', percent: 100, done: true, browserOpened: true })
    return Promise.resolve()
  }

  async startOllamaServer(): Promise<{ success: boolean; error?: string }> {
    const ollamaBin = findOllamaBinary()
    if (!ollamaBin) {
      return { success: false, error: 'Ollama binary not found. Please install Ollama first.' }
    }
    return new Promise((resolve) => {
      try {
        const proc = spawn(ollamaBin, ['serve'], { detached: true, stdio: 'ignore' })
        proc.unref()
        setTimeout(() => resolve({ success: true }), 2500)
      } catch (err) {
        resolve({ success: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  async startDockerDaemon(): Promise<{ success: boolean; error?: string }> {
    const platform = process.platform
    return new Promise((resolve) => {
      let proc
      try {
        if (platform === 'darwin') {
          proc = spawn('open', ['-a', 'Docker'], { stdio: 'ignore' })
        } else if (platform === 'linux') {
          proc = spawn('sh', ['-c', 'sudo systemctl start docker || sudo service docker start'], { stdio: 'ignore' })
        } else {
          void shell.openExternal('https://docs.docker.com/desktop/install/windows-install/')
          resolve({ success: false, error: 'Please start Docker Desktop manually, then click Refresh.' })
          return
        }
        proc.on('close', (code) => resolve(code === 0 ? { success: true } : { success: false, error: `Exit code ${code}` }))
        proc.on('error', (err) => resolve({ success: false, error: err.message }))
      } catch (err) {
        resolve({ success: false, error: err instanceof Error ? err.message : String(err) })
      }
    })
  }

  async startDockerOllama(): Promise<{ success: boolean; error?: string }> {
    // Check if image exists locally to avoid a Docker Hub pull (which may fail on restricted networks)
    const hasImageLocally = (() => {
      try {
        const r = spawnSync('docker', ['images', 'ollama/ollama', '-q'], { timeout: 5000 })
        return r.status === 0 && (r.stdout?.toString().trim() ?? '').length > 0
      } catch { return false }
    })()

    // If not local, try pulling first with a clear progress message
    if (!hasImageLocally) {
      const pullResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const proc = spawn('docker', ['pull', 'ollama/ollama'], { stdio: 'pipe' })
        let stderr = ''
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })
        proc.on('close', (code) => {
          if (code === 0) resolve({ success: true })
          else resolve({ success: false, error: `Cannot pull ollama/ollama image — check your internet connection. Docker error: ${stderr.trim()}` })
        })
        proc.on('error', (err) => resolve({ success: false, error: err.message }))
      })
      if (!pullResult.success) return pullResult
    }

    return new Promise((resolve) => {
      const proc = spawn('docker', [
        'run', '-d', '-p', '11434:11434', '-v', 'ollama:/root/.ollama', 'ollama/ollama',
      ], { stdio: 'pipe' })

      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString() })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true })
        } else {
          resolve({ success: false, error: stderr.trim() || `docker run exited with code ${code}` })
        }
      })

      proc.on('error', (err) => resolve({ success: false, error: err.message }))
    })
  }

  private runInstallScript(cmd: string, args: string[], onProgress: (p: InstallProgress) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let lineBuffer = ''

      const pushLine = (line: string) => {
        const trimmed = line.trim()
        if (trimmed) onProgress({ status: trimmed, percent: 0, done: false })
      }

      const handleData = (data: Buffer) => {
        lineBuffer += data.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''
        for (const line of lines) pushLine(line)
      }

      proc.stdout?.on('data', handleData)
      proc.stderr?.on('data', handleData)

      proc.on('close', (code) => {
        if (lineBuffer.trim()) pushLine(lineBuffer)
        if (code === 0) {
          onProgress({ status: 'Installation complete', percent: 100, done: true })
          resolve()
        } else {
          const err = `Process exited with code ${code}`
          onProgress({ status: err, percent: 0, done: true, error: err })
          reject(new Error(err))
        }
      })

      proc.on('error', (err) => {
        onProgress({ status: err.message, percent: 0, done: true, error: err.message })
        reject(err)
      })
    })
  }

  addActivity(input: Omit<ActivityRecord, 'id' | 'createdAt'>): ActivityRecord {
    const record: ActivityRecord = {
      ...input,
      id: createId('act'),
      createdAt: nowIso(),
    }

    this.database.exec(`
      INSERT INTO activity_logs (id, title, detail, severity, source, created_at)
      VALUES (${sql(record.id)}, ${sql(record.title)}, ${sql(record.detail)}, ${sql(record.severity)}, ${sql(record.source)}, ${sql(record.createdAt)});
    `)
    return record
  }

  listMessages(conversationId: string): MessageRecord[] {
    const rows = this.database.query<{
      id: string
      conversation_id: string
      role: 'user' | 'assistant' | 'tool' | 'system'
      content: string
      metadata_json: string
      created_at: string
    }>(`SELECT * FROM messages WHERE conversation_id = ${sql(conversationId)} ORDER BY created_at ASC;`)

    return rows.map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
    }))
  }

  private getPrimaryUser() {
    return this.database.queryOne<UserRow>('SELECT * FROM users ORDER BY created_at ASC LIMIT 1;')
  }

  private getUserById(id: string) {
    return this.database.queryOne<UserRow>(`SELECT * FROM users WHERE id = ${sql(id)} LIMIT 1;`)
  }

  private loadCurrentUser(deviceId: string): UserProfile | null {
    const session = this.loadSession(deviceId, null)
    if (!session) {
      return null
    }
    const user = this.getUserById(session.userId)
    if (!user) {
      return null
    }
    return this.mapUser(user)
  }

  private loadSession(deviceId: string, userId: string | null) {
    const criteria = userId ? `AND user_id = ${sql(userId)}` : ''
    const row = this.database.queryOne<SessionRow>(`
      SELECT * FROM sessions
      WHERE device_id = ${sql(deviceId)}
      AND is_active = 1
      ${criteria}
      ORDER BY created_at DESC
      LIMIT 1;
    `)
    if (!row) {
      return null
    }
    return this.mapSession(row)
  }

  private createSession(userId: string, deviceId: string, rememberDevice: boolean) {
    const sessionId = createId('sess')
    const token = createSessionToken()
    const now = nowIso()
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString()
    this.database.exec(`
      UPDATE sessions SET is_active = 0, locked_at = ${sql(now)} WHERE device_id = ${sql(deviceId)} AND user_id = ${sql(userId)};
    `)
    this.database.exec(`
      INSERT INTO sessions (id, user_id, device_id, token, created_at, expires_at, last_seen_at, locked_at, is_active, remember_device)
      VALUES (${sql(sessionId)}, ${sql(userId)}, ${sql(deviceId)}, ${sql(token)}, ${sql(now)}, ${sql(expiresAt)}, ${sql(now)}, NULL, 1, ${rememberDevice ? 1 : 0});
    `)
    return sessionId
  }

  private ensureTrustedDevice(userId: string, deviceId: string) {
    const existing = this.database.queryOne<{ id: string }>(
      `SELECT id FROM trusted_devices WHERE device_id = ${sql(deviceId)} LIMIT 1;`,
    )

    const now = nowIso()
    if (existing) {
      this.database.exec(`
        UPDATE trusted_devices
        SET user_id = ${sql(userId)}, platform = ${sql(this.currentDevicePlatform)}, trusted_at = ${sql(now)}, last_seen_at = ${sql(now)}, is_active = 1
        WHERE id = ${sql(existing.id)};
      `)
      return
    }

    this.database.exec(`
      INSERT INTO trusted_devices (id, user_id, device_id, platform, trusted_at, last_seen_at, is_active)
      VALUES (${sql(createId('dev'))}, ${sql(userId)}, ${sql(deviceId)}, ${sql(this.currentDevicePlatform)}, ${sql(now)}, ${sql(now)}, 1);
    `)
  }

  private loadDevice(deviceId: string): DeviceInfo {
    const trusted = this.database.queryOne<{ device_id: string; trusted_at: string; last_seen_at: string | null }>(
      `SELECT device_id, trusted_at, last_seen_at FROM trusted_devices WHERE device_id = ${sql(deviceId)} AND is_active = 1 LIMIT 1;`,
    )

    return {
      deviceId,
      platform: this.currentDevicePlatform,
      trusted: Boolean(trusted),
      rememberedAt: trusted?.trusted_at ?? null,
      lastSeenAt: trusted?.last_seen_at ?? null,
    }
  }

  private loadSettings(): AppSettings {
    const row = this.database.queryOne<SettingsRow>('SELECT * FROM app_settings WHERE id = 1 LIMIT 1;') ?? defaultSettingsRow
    return {
      theme: row.theme,
      autoLockMinutes: row.auto_lock_minutes,
      privacyMode: bool(row.privacy_mode),
      analyticsEnabled: bool(row.analytics_enabled),
      defaultModel: row.default_model,
      accent: row.accent,
      providerType: (row.provider_type as AppSettings['providerType']) ?? 'ollama',
      anthropicKey: row.anthropic_key ?? '',
      anthropicModel: (row.anthropic_model as AppSettings['anthropicModel']) ?? 'claude-haiku-4-5-20251001',
      openrouterKey: row.openrouter_key ?? '',
      openrouterModel: row.openrouter_model ?? 'meta-llama/llama-3.3-70b-instruct:free',
      geminiKey: row.gemini_key ?? '',
      geminiModel: (row.gemini_model as AppSettings['geminiModel']) ?? 'gemini-2.0-flash',
      openaiBaseUrl: row.openai_base_url ?? 'http://localhost:8081/v1',
      openaiApiKey: row.openai_api_key ?? '',
      openaiModel: row.openai_model ?? 'qwen-q4.gguf',
      openaiDisableTools: bool(row.openai_disable_tools),
      smtpHost: row.smtp_host ?? '',
      smtpPort: row.smtp_port ?? 587,
      smtpUser: row.smtp_user ?? '',
      smtpPass: row.smtp_pass ?? '',
      smtpFrom: row.smtp_from ?? '',
      smtpFromName: row.smtp_from_name ?? '',
    }
  }

  getSmtpEnvVars(): Record<string, string> {
    const s = this.loadSettings()
    return {
      SMTP_HOST: s.smtpHost,
      SMTP_PORT: String(s.smtpPort),
      SMTP_USER: s.smtpUser,
      SMTP_PASS: s.smtpPass,
      SMTP_FROM: s.smtpFrom,
      SMTP_FROM_NAME: s.smtpFromName,
    }
  }

  listDirectory(dirPath: string): DirectoryListing {
    const resolvedPath = dirPath && dirPath.trim() ? dirPath : os.homedir()
    try {
      const entries = readdirSync(resolvedPath, { withFileTypes: true })
        .map((dirent) => ({
          name: dirent.name,
          path: path.join(resolvedPath, dirent.name),
          isDirectory: dirent.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .filter((e) => !e.name.startsWith('.'))
      return { entries, cwd: resolvedPath }
    } catch {
      return { entries: [], cwd: resolvedPath }
    }
  }

  private listConversations(): ConversationSummary[] {
    return this.database.query<ConversationRow>('SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC;').map((row) => ({
      id: row.id,
      title: row.title,
      preview: row.preview,
      tags: JSON.parse(row.tags_json) as string[],
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      pinned: Boolean(row.pinned),
    }))
  }

  private listActivity(): ActivityRecord[] {
    return this.database.query<{
      id: string
      title: string
      detail: string
      severity: ActivityRecord['severity']
      source: string
      created_at: string
    }>('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 50;').map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      severity: row.severity,
      source: row.source,
      createdAt: row.created_at,
    }))
  }

  private listWorkflows(): WorkflowRecord[] {
    return this.database.query<{
      id: string
      name: string
      description: string
      status: WorkflowRecord['status']
      step_count: number
      last_run_at: string | null
    }>('SELECT * FROM workflows ORDER BY (last_run_at IS NULL), last_run_at DESC, name ASC;').map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      stepCount: row.step_count,
      lastRunAt: row.last_run_at,
    }))
  }

  private listToolExecutions(): ToolExecutionRecord[] {
    return this.database.query<{
      id: string
      tool_name: string
      status: ToolExecutionRecord['status']
      input_summary: string
      output_summary: string
      started_at: string
      finished_at: string | null
    }>('SELECT * FROM tool_executions ORDER BY started_at DESC;').map((row) => ({
      id: row.id,
      toolName: row.tool_name,
      status: row.status,
      inputSummary: row.input_summary,
      outputSummary: row.output_summary,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
    }))
  }

  private listIndexedFiles() {
    return this.database.query<{
      id: string
      path: string
      name: string
      file_type: string
      indexed_at: string
      size_bytes: number
    }>('SELECT * FROM indexed_files ORDER BY indexed_at DESC;').map((row) => ({
      id: row.id,
      path: row.path,
      name: row.name,
      fileType: row.file_type,
      indexedAt: row.indexed_at,
      sizeBytes: row.size_bytes,
    }))
  }

  private listPermissions() {
    return this.database.query<{
      id: string
      resource: string
      action: string
      granted: number
      scope: string
      updated_at: string
    }>('SELECT * FROM permissions ORDER BY updated_at DESC;').map((row) => ({
      id: row.id,
      resource: row.resource,
      action: row.action,
      granted: bool(row.granted),
      scope: row.scope,
      updatedAt: row.updated_at,
    }))
  }

  private listMemoryPreferences() {
    return this.database.query<{
      id: string
      key: string
      value: string
      confidence: number
      updated_at: string
    }>('SELECT * FROM memory_preferences ORDER BY updated_at DESC;').map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      confidence: row.confidence,
      updatedAt: row.updated_at,
    }))
  }

  private getConversationById(id: string) {
    const row = this.database.queryOne<ConversationRow>(`SELECT * FROM conversations WHERE id = ${sql(id)} LIMIT 1;`)
    if (!row) {
      return null
    }
    return {
      id: row.id,
      title: row.title,
      preview: row.preview,
      tags: JSON.parse(row.tags_json) as string[],
      updatedAt: row.updated_at,
      messageCount: row.message_count,
      pinned: Boolean(row.pinned),
    }
  }

  private mapUser(row: UserRow): UserProfile {
    return {
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      authKind: row.auth_kind,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    }
  }

  private mapSession(row: SessionRow): SessionInfo {
    return {
      id: row.id,
      userId: row.user_id,
      deviceId: row.device_id,
      token: row.token,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastSeenAt: row.last_seen_at,
      lockedAt: row.locked_at,
      isActive: bool(row.is_active),
      rememberDevice: bool(row.remember_device),
    }
  }

  private resolveAuthMode(hasAccount: boolean, session: SessionInfo | null): BootstrapPayload['authMode'] {
    if (!hasAccount) {
      return 'setup'
    }
    if (!session) {
      return 'login'
    }
    if (session.lockedAt) {
      return 'locked'
    }
    return 'authenticated'
  }

  private validateCredential(credential: string, kind: CreateAccountInput['credentialKind']) {
    const value = credential.trim()
    if (kind === 'pin' && !/^\d{4,12}$/.test(value)) {
      throw new Error('PIN must contain 4 to 12 digits.')
    }
    if (kind === 'password' && value.length < 10) {
      throw new Error('Password must be at least 10 characters long.')
    }
  }
}

export type ThemeMode = 'dark' | 'light' | 'system'

export type AuthMode = 'setup' | 'login' | 'locked' | 'authenticated'

export type CredentialKind = 'password' | 'pin'

export type WorkspaceSection =
  | 'chat'
  | 'history'
  | 'activity'
  | 'workflows'
  | 'files'
  | 'settings'

export interface DeviceInfo {
  deviceId: string
  platform: string
  trusted: boolean
  rememberedAt: string | null
  lastSeenAt: string | null
}

export interface BootstrapPayload {
  authMode: AuthMode
  hasAccount: boolean
  theme: ThemeMode
  device: DeviceInfo
  currentUser: UserProfile | null
  session: SessionInfo | null
  conversations: ConversationSummary[]
  activity: ActivityRecord[]
  workflows: WorkflowRecord[]
  settings: AppSettings
  toolExecutions: ToolExecutionRecord[]
  indexedFiles: IndexedFileRecord[]
  permissions: PermissionRecord[]
  memoryPreferences: MemoryPreferenceRecord[]
}

export interface AuthFormValues {
  credential: string
  rememberDevice: boolean
  credentialKind: CredentialKind
}

export interface CreateAccountInput extends AuthFormValues {
  displayName: string
}

export interface LoginInput extends AuthFormValues {}

export interface SessionInfo {
  id: string
  userId: string
  deviceId: string
  token: string
  createdAt: string
  expiresAt: string
  lastSeenAt: string
  lockedAt: string | null
  isActive: boolean
  rememberDevice: boolean
}

export interface UserProfile {
  id: string
  displayName: string
  email: string | null
  authKind: CredentialKind
  createdAt: string
  lastLoginAt: string | null
}

export interface ConversationSummary {
  id: string
  title: string
  preview: string
  tags: string[]
  updatedAt: string
  messageCount: number
  pinned: boolean
}

export interface MessageRecord {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  createdAt: string
  metadata: Record<string, unknown>
}

export interface ActivityRecord {
  id: string
  title: string
  detail: string
  severity: 'info' | 'success' | 'warning' | 'error'
  source: string
  createdAt: string
}

export interface ToolExecutionRecord {
  id: string
  toolName: string
  status: 'queued' | 'running' | 'success' | 'failed'
  inputSummary: string
  outputSummary: string
  startedAt: string
  finishedAt: string | null
}

export interface WorkflowRecord {
  id: string
  name: string
  description: string
  status: 'draft' | 'active' | 'paused'
  stepCount: number
  lastRunAt: string | null
}

export interface IndexedFileRecord {
  id: string
  path: string
  name: string
  fileType: string
  indexedAt: string
  sizeBytes: number
}

export interface PermissionRecord {
  id: string
  resource: string
  action: string
  granted: boolean
  scope: string
  updatedAt: string
}

export interface MemoryPreferenceRecord {
  id: string
  key: string
  value: string
  confidence: number
  updatedAt: string
}

export interface GemmaModelInfo {
  name: string
  sizeMb: number
}

export interface ModelSetupChunk {
  status: string
  percent: number
  error?: string | null
}

export interface PullModelProgress {
  status: string
  percent: number
  done: boolean
  error?: string
}

export interface InstallProgress {
  status: string
  percent: number
  done: boolean
  browserOpened?: boolean
  error?: string
}

export interface ProviderStatus {
  ollamaBinary: boolean
  ollama: boolean
  dockerInstalled: boolean
  docker: boolean
  dockerOllama: boolean
  anthropicKey: string
  openrouterKey: string
  geminiKey: string
}

export interface SystemInfo {
  ramGb: number
  cpuCores: number
  platform: string
  recommendedModel: string
  recommendedProvider: 'ollama' | 'docker' | 'anthropic'
  pullCommand: string
}

export interface AppSettings {
  theme: ThemeMode
  autoLockMinutes: number
  privacyMode: boolean
  analyticsEnabled: boolean
  defaultModel: string
  accent: 'slate' | 'blue' | 'emerald' | 'amber'
  providerType: 'ollama' | 'docker-ollama' | 'anthropic' | 'openrouter' | 'gemini' | 'openai' | 'gemini-cli'
  anthropicKey: string
  anthropicModel: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6'
  openrouterKey: string
  openrouterModel: string
  geminiKey: string
  geminiModel: 'gemini-2.0-flash' | 'gemini-2.0-flash-lite' | 'gemini-1.5-pro'
  openaiBaseUrl: string
  openaiApiKey: string
  openaiModel: string
  openaiDisableTools: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPass: string
  smtpFrom: string
  smtpFromName: string
}

export interface UpdateInfo {
  version: string
  releaseName: string | null
  releaseDate: string
  releaseNotes: string | null
}

export interface UpdateDownloadProgress {
  bytesPerSecond: number
  percent: number
  transferred: number
  total: number
}

export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface DirectoryListing {
  entries: FileEntry[]
  cwd: string
}

export interface FindSimilarImagesInput {
  imagePath: string
  directory?: string
  maxResults?: number
}

export interface SimilarImageResult {
  path: string
  name: string
  sizeBytes: number
  mtimeMs: number
  distance: number
  score: number
  openable: boolean
  ocrText: string
  objects: string[]
}

export interface SimilarImagesResponse {
  query: string
  queryOcr: string
  queryObjects: string[]
  roots: string[]
  scannedCount: number
  results: SimilarImageResult[]
}

export interface OpenTargetResult {
  success: boolean
  target: string
  resolvedTarget?: string
  message: string
}

export interface AppRuntimeState {
  authMode: AuthMode
  user: UserProfile | null
  session: SessionInfo | null
  device: DeviceInfo
  currentConversationId: string | null
  conversations: ConversationSummary[]
  activity: ActivityRecord[]
  workflows: WorkflowRecord[]
  settings: AppSettings
  messagesByConversation: Record<string, MessageRecord[]>
  toolExecutions: ToolExecutionRecord[]
  indexedFiles: IndexedFileRecord[]
  permissions: PermissionRecord[]
  memoryPreferences: MemoryPreferenceRecord[]
}

export interface ChatDraft {
  conversationId: string
  content: string
}

export interface CreateConversationInput {
  title: string
  tags: string[]
}

export interface UpdateSettingsInput extends Partial<AppSettings> {}

export interface SendMessageInput extends ChatDraft {}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export type StreamChunkType = 'text' | 'tool_call' | 'tool_result' | 'confirm' | 'done' | 'error' | 'usage' | 'tool_search'

export interface StreamChunk {
  type: StreamChunkType
  text?: string
  toolName?: string
  toolArgs?: Record<string, unknown>
  toolResult?: string
  confirmId?: string
  error?: string
  usage?: TokenUsage
  toolRegex?: string
  toolsMatched?: number
}

export interface ReminderRecord {
  id: string
  title: string
  message: string
  fire_at: string
  status: 'pending' | 'fired' | 'cancelled'
  email_to: string | null
  email_subject?: string | null
  time_remaining: string | null
  created_at: string
}

export interface CreateReminderInput {
  title: string
  message: string
  fire_at: string
  email_to?: string
  email_subject?: string
  email_body?: string
}

export interface RuntimeApi {
  bootstrap(deviceId: string): Promise<BootstrapPayload>
  createAccount(input: CreateAccountInput, deviceId: string): Promise<BootstrapPayload>
  login(input: LoginInput, deviceId: string): Promise<BootstrapPayload>
  unlock(credential: string, deviceId: string): Promise<BootstrapPayload>
  logout(sessionId: string): Promise<BootstrapPayload>
  lock(sessionId: string): Promise<BootstrapPayload>
  refresh(deviceId: string): Promise<BootstrapPayload>
  updateSettings(input: UpdateSettingsInput): Promise<AppSettings>
  createConversation(input: CreateConversationInput): Promise<ConversationSummary>
  sendMessage(input: SendMessageInput): Promise<MessageRecord[]>
  addActivity(input: Omit<ActivityRecord, 'id' | 'createdAt'>): Promise<ActivityRecord>
  listMessages(conversationId: string): Promise<MessageRecord[]>
  onStreamChunk(callback: (chunk: StreamChunk) => void): void
  offStreamChunk(): void
  confirmToolExecution(id: string, approved: boolean): Promise<void>
  listGemmaModels(): Promise<GemmaModelInfo[]>
  detectProviders(): Promise<ProviderStatus>
  getSystemInfo(): Promise<SystemInfo>
  pullModel(model: string): Promise<void>
  onPullModelProgress(callback: (progress: PullModelProgress) => void): void
  offPullModelProgress(): void
  installOllama(): Promise<void>
  installDocker(): Promise<void>
  onInstallProgress(callback: (progress: InstallProgress) => void): void
  offInstallProgress(): void
  startOllamaServer(): Promise<{ success: boolean; error?: string }>
  startDockerDaemon(): Promise<{ success: boolean; error?: string }>
  startDockerOllama(): Promise<{ success: boolean; error?: string }>
  clearConversation(conversationId: string): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  showMainWindow(): Promise<void>
  showCompactWindow(): Promise<void>
  quitApp(): Promise<void>
  checkForUpdates(): Promise<void>
  getAppVersion(): Promise<string>
  listDirectory(dirPath: string): Promise<DirectoryListing>
  findSimilarImages(input: FindSimilarImagesInput): Promise<SimilarImagesResponse>
  openTarget(target: string): Promise<OpenTargetResult>
  gmailAuth(action: 'auth' | 'status' | 'disconnect'): Promise<{ connected: boolean; email?: string; success?: boolean; message?: string }>
  listReminders(filter?: 'all' | 'pending' | 'fired' | 'cancelled'): Promise<ReminderRecord[]>
  createReminder(input: CreateReminderInput): Promise<ReminderRecord>
  cancelReminder(id: string): Promise<{ success: boolean; message: string }>
  voiceTranscribe(wavBuffer: Uint8Array): Promise<{ transcription: string }>
  onUpdateAvailable(callback: (info: UpdateInfo) => void): void
  offUpdateAvailable(): void
  onUpdateDownloadProgress(callback: (progress: UpdateDownloadProgress) => void): void
  offUpdateDownloadProgress(): void
  onUpdateDownloaded(callback: (info: UpdateInfo) => void): void
  offUpdateDownloaded(): void
  onUpdateError(callback: (message: string) => void): void
  offUpdateError(): void
  installUpdate(): void
}

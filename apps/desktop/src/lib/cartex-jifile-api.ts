/**
 * JiFile API Client - Replaces SQLite3 database with Cartex API calls
 * Pure client-server communication for all JiFile data operations
 */

interface ApiResponse<T> {
  data?: T
  error?: string
  success?: boolean
}

interface ConversationSummary {
  id: string
  title: string
  preview: string
  tags: string[]
  messageCount: number
  pinned: boolean
  createdAt: string
  updatedAt: string
  deviceId?: string
}

interface MessageRecord {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  metadata: Record<string, unknown>
  createdAt: string
}

interface UserSettings {
  id: string
  userId: string
  deviceId?: string
  theme: string
  autoLockMinutes: number
  privacyMode: boolean
  analyticsEnabled: boolean
  accent: string
  providerType: string
  defaultModel: string
  anthropicModel: string
  openrouterModel: string
  geminiModel: string
  openaiBaseUrl: string
  openaiModel: string
  openaiDisableTools: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpFrom: string
  smtpFromName: string
  hasAnthropicKey: boolean
  hasOpenrouterKey: boolean
  hasGeminiKey: boolean
  hasOpenaiKey: boolean
  hasSmtpPass: boolean
  updatedAt: string
}

interface DeviceSession {
  id: string
  userId: string
  deviceId: string
  token: string
  isActive: boolean
  rememberDevice: boolean
  lockedAt?: string
  lastSeenAt: string
  expiresAt: string
  createdAt: string
}

interface BootstrapPayload {
  authMode: 'setup' | 'login' | 'locked' | 'authenticated'
  hasAccount: boolean
  theme: string
  device: {
    deviceId: string
    platform: string
    trusted: boolean
    rememberedAt?: string
    lastSeenAt?: string
  }
  currentUser?: {
    id: string
    displayName: string
    email: string
    authKind: 'password' | 'pin'
    createdAt: string
    lastLoginAt?: string
  }
  session?: DeviceSession
  conversations: ConversationSummary[]
  activity: any[]
  workflows: any[]
  settings: UserSettings
  toolExecutions: any[]
  indexedFiles: any[]
  permissions: any[]
  memoryPreferences: any[]
}

export class JiFileAPIClient {
  private baseUrl: string
  private sessionToken?: string
  private deviceId?: string

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl
  }

  setSessionToken(token: string) {
    this.sessionToken = token
  }

  setDeviceId(deviceId: string) {
    this.deviceId = deviceId
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}/api/jifile${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {})
    }

    // Add authentication header if we have a session token
    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `API Error: ${response.status} ${response.statusText}`
      
      try {
        const errorData = JSON.parse(errorText)
        errorMessage = errorData.error || errorMessage
      } catch {
        // Use default error message if JSON parsing fails
      }
      
      throw new Error(errorMessage)
    }

    return response.json()
  }

  // Bootstrap / Session Management

  async bootstrap(deviceId: string): Promise<BootstrapPayload> {
    return this.makeRequest('/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ deviceId })
    })
  }

  async createSession(deviceId: string, rememberDevice: boolean = false): Promise<DeviceSession> {
    return this.makeRequest('/sessions', {
      method: 'POST',
      body: JSON.stringify({ deviceId, rememberDevice })
    })
  }

  async revokeSessions(options: { sessionId?: string; deviceId?: string; all?: boolean } = {}): Promise<void> {
    const params = new URLSearchParams()
    if (options.sessionId) params.set('sessionId', options.sessionId)
    if (options.deviceId) params.set('deviceId', options.deviceId)
    if (options.all) params.set('all', 'true')

    await this.makeRequest(`/sessions?${params}`, {
      method: 'DELETE'
    })
  }

  // Settings Management

  async getSettings(deviceId?: string): Promise<UserSettings> {
    const params = new URLSearchParams()
    if (deviceId) params.set('deviceId', deviceId)
    
    return this.makeRequest(`/settings?${params}`)
  }

  async updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
    return this.makeRequest('/settings', {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  }

  // Conversation Management

  async getConversations(options: {
    deviceId?: string
    limit?: number
    offset?: number
  } = {}): Promise<{ conversations: ConversationSummary[]; total: number; hasMore: boolean }> {
    const params = new URLSearchParams()
    if (options.deviceId) params.set('deviceId', options.deviceId)
    if (options.limit) params.set('limit', options.limit.toString())
    if (options.offset) params.set('offset', options.offset.toString())

    return this.makeRequest(`/conversations?${params}`)
  }

  async createConversation(data: {
    title: string
    tags?: string[]
    deviceId?: string
  }): Promise<ConversationSummary> {
    return this.makeRequest('/conversations', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async getConversation(id: string): Promise<ConversationSummary & { messages: MessageRecord[] }> {
    return this.makeRequest(`/conversations/${id}`)
  }

  async updateConversation(id: string, updates: {
    title?: string
    tags?: string[]
    pinned?: boolean
    preview?: string
  }): Promise<ConversationSummary> {
    return this.makeRequest(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates)
    })
  }

  async deleteConversation(id: string): Promise<void> {
    await this.makeRequest(`/conversations/${id}`, {
      method: 'DELETE'
    })
  }

  async clearConversation(id: string): Promise<void> {
    // Delete all messages for conversation
    const conversation = await this.getConversation(id)
    
    // Update conversation with empty state
    await this.updateConversation(id, {
      preview: '',
      title: conversation.title + ' (cleared)'
    })
    
    // Note: Individual message deletion would need separate API endpoint
    // For now, this is a placeholder
  }

  // Message Management

  async getMessages(conversationId: string, options: {
    limit?: number
    offset?: number
  } = {}): Promise<{ messages: MessageRecord[]; total: number; hasMore: boolean }> {
    const params = new URLSearchParams()
    params.set('conversationId', conversationId)
    if (options.limit) params.set('limit', options.limit.toString())
    if (options.offset) params.set('offset', options.offset.toString())

    return this.makeRequest(`/messages?${params}`)
  }

  async createMessage(data: {
    conversationId: string
    role: 'user' | 'assistant' | 'tool' | 'system'
    content: string
    metadata?: Record<string, unknown>
  }): Promise<MessageRecord> {
    return this.makeRequest('/messages', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  // Utility Methods

  async validateConnection(): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/api/health`)
      return true
    } catch {
      return false
    }
  }

  // Offline Cache Management (for critical data)

  private getCacheKey(key: string): string {
    return `jifile-cache-${key}`
  }

  saveToCache(key: string, data: any): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.getCacheKey(key), JSON.stringify({
          data,
          timestamp: Date.now()
        }))
      }
    } catch (error) {
      console.warn('Failed to save to cache:', error)
    }
  }

  loadFromCache<T>(key: string, maxAge: number = 5 * 60 * 1000): T | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = localStorage.getItem(this.getCacheKey(key))
        if (cached) {
          const parsed = JSON.parse(cached)
          const age = Date.now() - parsed.timestamp
          
          if (age < maxAge) {
            return parsed.data
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load from cache:', error)
    }
    
    return null
  }

  clearCache(key?: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        if (key) {
          localStorage.removeItem(this.getCacheKey(key))
        } else {
          // Clear all JiFile cache
          Object.keys(localStorage)
            .filter(k => k.startsWith('jifile-cache-'))
            .forEach(k => localStorage.removeItem(k))
        }
      }
    } catch (error) {
      console.warn('Failed to clear cache:', error)
    }
  }

  // API methods with automatic caching for offline support

  async getConversationsWithCache(options: Parameters<typeof this.getConversations>[0] = {}) {
    const cacheKey = `conversations-${JSON.stringify(options)}`
    
    try {
      const result = await this.getConversations(options)
      this.saveToCache(cacheKey, result)
      return result
    } catch (error) {
      const cached = this.loadFromCache(cacheKey, 30 * 60 * 1000) // 30 minutes
      if (cached) {
        console.warn('Using cached conversations due to API error:', error)
        return cached
      }
      throw error
    }
  }

  async getSettingsWithCache(deviceId?: string) {
    const cacheKey = `settings-${deviceId || 'default'}`
    
    try {
      const result = await this.getSettings(deviceId)
      this.saveToCache(cacheKey, result)
      return result
    } catch (error) {
      const cached = this.loadFromCache(cacheKey, 10 * 60 * 1000) // 10 minutes
      if (cached) {
        console.warn('Using cached settings due to API error:', error)
        return cached
      }
      throw error
    }
  }
}

// Export singleton instance
export const jifileAPI = new JiFileAPIClient()

// Export for use in Electron main process
export function createJiFileAPIClient(baseUrl?: string): JiFileAPIClient {
  return new JiFileAPIClient(baseUrl)
}
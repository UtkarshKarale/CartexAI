import os from 'node:os'
import path from 'node:path'
import type { AppSettings, StreamChunk } from '../../src/shared/contracts'
import { McpClient } from './mcp-client'
import { selectTools } from './tool-router'
import type { AiMessage, AiProvider } from './providers/base'
import { log, timer } from './logger'
import { CartexAPIClient, CartexProvider, createCartexClient } from '../../src/lib/cartex-api'
import type { DesktopConfig } from '../../src/lib/cartex-api'

function buildSystemPrompt(settings: AppSettings, cartexConfig?: DesktopConfig): string {
  const homeDir = os.homedir()
  const desktopDir = path.join(homeDir, 'Desktop')
  const lines: string[] = [
    'You are jifile.ai, a local desktop AI assistant powered by Cartex AI provider management.',
    'You have access to tools — use them whenever the user asks to do something with files, folders, or the system. Be concise and clear.',
    '',
    `User environment:`,
    `- Home directory: ${homeDir}`,
    `- Desktop: ${desktopDir}`,
    `- Platform: ${process.platform}`,
  ]

  // Add Cartex integration info
  if (cartexConfig) {
    lines.push('')
    lines.push('AI Provider Status:')
    if (cartexConfig.providers.hasAnyEnabled) {
      const enabledTypes = Object.keys(cartexConfig.providers.enabled)
      lines.push(`- Active providers: ${enabledTypes.join(', ')}`)
    } else {
      lines.push('- No AI providers currently enabled (using fallback mode)')
    }

    if (cartexConfig.subscription) {
      const tokensRemaining = cartexConfig.subscription.tokensRemaining
      const totalAllowance = cartexConfig.subscription.tokenAllowance
      const usagePercent = Math.round(((totalAllowance - tokensRemaining) / totalAllowance) * 100)
      lines.push(`- Token usage: ${usagePercent}% used (${tokensRemaining.toLocaleString()} remaining)`)
      lines.push(`- Subscription: ${cartexConfig.subscription.name}`)
    }

    if (!cartexConfig.device?.isTrusted) {
      lines.push('')
      lines.push('IMPORTANT: This device is not yet trusted. Some advanced features may be limited.')
    }
  }

  lines.push('')
  lines.push('Excel / spreadsheet rules (CRITICAL):')
  lines.push('- NEVER call read_file on .xlsx, .xls, or .csv files — it returns binary garbage and wastes tokens.')
  lines.push('- For ANY Excel task, ALWAYS start with excel_get_schema to read headers and sheet names.')
  lines.push('- Then use excel_query_rows, excel_detect_anomalies, excel_generate_summary, excel_export_xlsx as needed.')
  lines.push('- You have full Excel tools available — never say you cannot create or write Excel files.')

  // Email configuration from Cartex
  if (cartexConfig?.features.emailIntegration) {
    lines.push('')
    lines.push('Email integration is enabled through Cartex:')
    lines.push('IMPORTANT: When the user asks to send an email, call send_email_smtp WITHOUT asking for credentials.')
    lines.push('The tool uses pre-configured credentials from Cartex automatically.')
    lines.push('ATTACHMENTS: The tool fully supports file attachments. Pass absolute file paths as the "attachments" array.')
  } else if (settings.smtpHost && settings.smtpUser) {
    // Fallback to local SMTP config
    lines.push('')
    lines.push('Email (Local SMTP) is configured:')
    lines.push(`- Account: ${settings.smtpFromName ? `"${settings.smtpFromName}" <${settings.smtpFrom || settings.smtpUser}>` : settings.smtpFrom || settings.smtpUser}`)
    lines.push(`- SMTP host: ${settings.smtpHost}:${settings.smtpPort}`)
    lines.push('IMPORTANT: When the user asks to send an email, call send_email_smtp WITHOUT asking for credentials.')
  } else {
    lines.push('')
    lines.push('Email: Not configured. If the user wants to send email, tell them to configure SMTP in Settings.')
  }

  return lines.join('\n')
}

const DESTRUCTIVE_TOOLS = new Set([
  'delete_file',
  'execute_command',
  'move_file',
  'write_file',
  'organize_downloads',
  'trash_manager',
])

const MAX_TOOL_ITERATIONS = 8

function makeConfirmId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export class CartexAiOrchestrator {
  private readonly mcpClient = new McpClient()
  private readonly pendingConfirmations = new Map<string, (approved: boolean) => void>()
  private readonly cartexClient: CartexAPIClient
  private cartexProvider: CartexProvider
  private cartexConfig: DesktopConfig | null = null

  constructor(
    private readonly fallbackProvider: AiProvider,
    private readonly onChunk: (chunk: StreamChunk) => void,
    private readonly settings: AppSettings,
  ) {
    // Initialize Cartex client
    this.cartexClient = createCartexClient({
      baseUrl: process.env.CARTEX_API_URL || settings.cartexApiUrl || 'http://localhost:3001',
      deviceName: `JiFile Desktop - ${os.hostname()}`,
      platform: process.platform,
      version: process.env.APP_VERSION || '1.0.0'
    })

    // Initialize Cartex provider with fallback
    this.cartexProvider = new CartexProvider({
      client: this.cartexClient,
      fallbackToLocal: true,
      maxRetries: 2
    })
  }

  async initialize(): Promise<void> {
    try {
      // Register device and get session token
      log('cartex', 'Registering device with Cartex...')
      const registration = await this.cartexClient.registerDevice()
      
      this.cartexClient.setSessionToken(registration.sessionToken)
      log('cartex', `Device registered: ${registration.device.deviceId}`)

      if (registration.requiresApproval) {
        log('cartex', 'Device requires admin approval for full access')
      }

      // Initialize provider and get config
      await this.cartexProvider.initialize()
      this.cartexConfig = await this.cartexClient.getDesktopConfig()
      
      log('cartex', 'Cartex integration initialized successfully', {
        hasProviders: this.cartexConfig.providers.hasAnyEnabled,
        isTrusted: this.cartexConfig.device?.isTrusted,
        subscription: this.cartexConfig.subscription?.name
      })

    } catch (error) {
      log('cartex', 'Failed to initialize Cartex integration:', error)
      // Continue with fallback provider
    }
  }

  resolveConfirmation(id: string, approved: boolean): void {
    const resolve = this.pendingConfirmations.get(id)
    if (resolve) {
      this.pendingConfirmations.delete(id)
      resolve(approved)
    }
  }

  async run(history: AiMessage[], userMessage: string): Promise<string> {
    const totalTimer = timer('orchestrator', 'total run')
    log('orchestrator', `start — history:${history.length} msg, user:"${userMessage.slice(0, 60)}"`)

    // Refresh Cartex config periodically
    try {
      if (this.cartexConfig && Date.now() % 10 === 0) { // Refresh occasionally
        await this.cartexProvider.refreshConfig()
        this.cartexConfig = await this.cartexClient.getDesktopConfig()
      }
    } catch (error) {
      log('cartex', 'Config refresh failed:', error)
    }

    // Determine if we should use Cartex or fallback to local
    const useCartex = await this.shouldUseCartex()
    const provider = useCartex ? this.cartexProvider : this.fallbackProvider

    log('orchestrator', `Using ${useCartex ? 'Cartex' : 'fallback'} provider`)

    // If using fallback, use original orchestrator logic
    if (!useCartex) {
      return this.runWithFallbackProvider(history, userMessage, totalTimer)
    }

    // Use Cartex-powered orchestrator
    const allTools = this.cartexConfig?.features.mcpTools ? 
      await this.mcpClient.listTools() : []
    const tools = allTools.length > 0 ? selectTools(userMessage, allTools) : []
    
    log('orchestrator', `tool routing: ${allTools.length} total → ${tools.length} selected — [${tools.map(t => t.function.name).join(', ')}]`)

    const messages: AiMessage[] = [
      { role: 'system', content: buildSystemPrompt(this.settings, this.cartexConfig) },
      ...history,
      { role: 'user', content: userMessage },
    ]

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (tools.length === 0) {
        log('orchestrator', 'no tools — streaming directly through Cartex')
        const streamTimer = timer('orchestrator', 'cartex.stream (no tools)')
        let fullText = ''
        await provider.stream(messages, (text) => {
          this.onChunk({ type: 'text', text })
          fullText += text
        })
        streamTimer()
        this.onChunk({ type: 'done' })
        totalTimer()
        return fullText
      }

      log('orchestrator', `iteration ${i + 1} — calling Cartex provider with ${tools.length} tools`)
      const chatTimer = timer('orchestrator', `cartex.chat iteration ${i + 1}`)
      const response = await provider.chat(messages, tools)
      chatTimer()

      if (response.usage) {
        this.onChunk({ type: 'usage', usage: response.usage })
        log('orchestrator', `tokens — in:${response.usage.inputTokens} out:${response.usage.outputTokens} total:${response.usage.inputTokens + response.usage.outputTokens}`)
      }

      if (response.toolCalls.length === 0) {
        if (response.content) {
          this.onChunk({ type: 'text', text: response.content })
          this.onChunk({ type: 'done' })
          totalTimer()
          return response.content
        }
        // Continue to final stream
        break
      }

      messages.push({ role: 'assistant', content: response.content })

      for (const toolCall of response.toolCalls) {
        if (DESTRUCTIVE_TOOLS.has(toolCall.name)) {
          const confirmId = makeConfirmId()
          const approved = await new Promise<boolean>((resolve) => {
            this.pendingConfirmations.set(confirmId, resolve)
            this.onChunk({
              type: 'confirm',
              toolName: toolCall.name,
              toolArgs: toolCall.arguments,
              confirmId,
            })
          })

          if (!approved) {
            const denied = `Action "${toolCall.name}" was not approved by the user.`
            messages.push({ role: 'tool', content: denied })
            this.onChunk({ type: 'tool_result', toolName: toolCall.name, toolResult: denied })
            continue
          }
        }

        this.onChunk({ type: 'tool_call', toolName: toolCall.name, toolArgs: toolCall.arguments })
        log('orchestrator', `tool call: ${toolCall.name}`)

        const toolTimer = timer('orchestrator', `tool:${toolCall.name}`)
        let toolResult: string
        try {
          toolResult = await this.mcpClient.callTool(toolCall.name, toolCall.arguments)
          
          // Log successful tool execution to Cartex
          await this.cartexClient.logToolExecution({
            toolName: toolCall.name,
            status: 'COMPLETED',
            inputData: toolCall.arguments,
            outputData: { result: toolResult.slice(0, 500) }, // Truncate for storage
            executionTimeMs: Date.now() - toolTimer['start']
          })
        } catch (error) {
          toolResult = `Error: ${error instanceof Error ? error.message : String(error)}`
          
          // Log failed tool execution to Cartex
          await this.cartexClient.logToolExecution({
            toolName: toolCall.name,
            status: 'FAILED',
            inputData: toolCall.arguments,
            errorMessage: toolResult,
            executionTimeMs: Date.now() - toolTimer['start']
          })
        }
        toolTimer()

        this.onChunk({ type: 'tool_result', toolName: toolCall.name, toolResult })
        messages.push({ role: 'tool', content: toolResult })
      }
    }

    // Final stream
    log('orchestrator', 'max iterations reached — final stream')
    let fullText = ''
    await provider.stream(messages, (text) => {
      this.onChunk({ type: 'text', text })
      fullText += text
    })
    this.onChunk({ type: 'done' })
    totalTimer()
    return fullText
  }

  private async shouldUseCartex(): Promise<boolean> {
    // Check if Cartex is available and has providers enabled
    if (!this.cartexConfig) {
      const isAvailable = await this.cartexProvider.isAvailable()
      if (!isAvailable) return false
    }

    // Use Cartex if we have enabled providers or if it's explicitly configured
    return this.cartexConfig?.providers.hasAnyEnabled ?? false
  }

  private async runWithFallbackProvider(
    history: AiMessage[], 
    userMessage: string, 
    totalTimer: () => void
  ): Promise<string> {
    log('orchestrator', 'Using fallback provider (local)')
    
    // Use the original orchestrator logic for local providers
    const recentHistory = history.slice(-4)
    const stripped = userMessage.trim().replace(/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|bye)[,!\s]*/i, '').trim()
    const isConversational = stripped.length < 10

    if (isConversational) {
      const systemMsg = 'You are jifile.ai. Reply briefly to this conversational message.'
      return this.streamViaFallback(systemMsg, userMessage, '')
    }

    // Try intent router if available
    let routed = null
    try {
      const res = await fetch('http://localhost:4000/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: stripped, provider: this.settings.providerType }),
      })
      if (res.ok) routed = await res.json()
    } catch {
      log('orchestrator', 'intent-router unreachable — using direct AI')
    }

    if (!routed) {
      return this.streamViaFallback(
        buildSystemPrompt(this.settings),
        userMessage,
        recentHistory.map(m => `${m.role}: ${m.content}`).join('\n'),
      )
    }

    // Execute routed tool and respond
    this.onChunk({ type: 'text', text: `Using **${routed.tool}**\n\n` })
    
    let toolResult: string
    try {
      toolResult = await this.mcpClient.callTool(routed.tool, routed.args)
    } catch (error) {
      toolResult = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    const systemMsg = 'You are jifile.ai. The tool ran. Reply in 1-2 sentences. Be concise.'
    return this.streamViaFallback(systemMsg, userMessage, toolResult.slice(0, 400))
  }

  private async streamViaFallback(systemMsg: string, userMessage: string, context: string): Promise<string> {
    let fullText = ''
    await this.fallbackProvider.stream([
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMessage },
      { role: 'assistant', content: context },
    ], (text) => {
      this.onChunk({ type: 'text', text })
      fullText += text
    })
    this.onChunk({ type: 'done' })
    return fullText
  }
}
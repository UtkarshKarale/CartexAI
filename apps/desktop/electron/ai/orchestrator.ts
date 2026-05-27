import os from 'node:os'
import path from 'node:path'
import type { AppSettings, StreamChunk } from '../../src/shared/contracts'
import { McpClient } from './mcp-client'
import { selectTools } from './tool-router'
import type { AiMessage, AiProvider } from './providers/base'
import { log, timer } from './logger'

function buildSystemPrompt(settings: AppSettings): string {
  const homeDir = os.homedir()
  const desktopDir = path.join(homeDir, 'Desktop')
  const lines: string[] = [
    'You are jifile.ai, a local desktop AI assistant. You help users manage files, run system commands, and organize their workspace.',
    'You have access to tools — use them whenever the user asks to do something with files, folders, or the system. Be concise and clear.',
    '',
    `User environment:`,
    `- Home directory: ${homeDir}`,
    `- Desktop: ${desktopDir}`,
    `- Platform: ${process.platform}`,
  ]

  lines.push('')
  lines.push('Excel / spreadsheet rules (CRITICAL):')
  lines.push('- NEVER call read_file on .xlsx, .xls, or .csv files — it returns binary garbage and wastes tokens.')
  lines.push('- For ANY Excel task, ALWAYS start with excel_get_schema to read headers and sheet names.')
  lines.push('- Then use excel_query_rows, excel_detect_anomalies, excel_generate_summary, excel_export_xlsx as needed.')
  lines.push('- You have full Excel tools available — never say you cannot create or write Excel files.')

  if (settings.smtpHost && settings.smtpUser) {
    lines.push('')
    lines.push('Email (SMTP) is pre-configured in settings:')
    lines.push(`- Account: ${settings.smtpFromName ? `"${settings.smtpFromName}" <${settings.smtpFrom || settings.smtpUser}>` : settings.smtpFrom || settings.smtpUser}`)
    lines.push(`- SMTP host: ${settings.smtpHost}:${settings.smtpPort}`)
    lines.push('IMPORTANT: When the user asks to send an email, call send_email_smtp WITHOUT asking for credentials.')
    lines.push('The tool uses pre-configured credentials automatically. Only pass "to", "subject", "text", and optionally "html" and "attachments".')
    lines.push('ATTACHMENTS: The tool fully supports file attachments. Pass absolute file paths as the "attachments" array (e.g. ["/home/user/Desktop/report.pdf"]).')
    lines.push('Workflow for "send file X to email": 1) search_files to find absolute path, 2) call send_email_smtp with that path in attachments. Never say you cannot attach files.')
  } else {
    lines.push('')
    lines.push('Email: SMTP is not yet configured. If the user wants to send email, tell them to go to Settings → Email / SMTP to configure credentials.')
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

export class AiOrchestrator {
  private readonly mcpClient = new McpClient()
  private readonly pendingConfirmations = new Map<string, (approved: boolean) => void>()

  constructor(
    private readonly provider: AiProvider,
    private readonly onChunk: (chunk: StreamChunk) => void,
    private readonly settings: AppSettings,
  ) {}

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

    const isLocalModel =
      this.settings.providerType === 'ollama' ||
      this.settings.providerType === 'gemini-cli' ||
      (this.settings.providerType === 'openai' &&
        (this.settings.openaiBaseUrl.includes('localhost') ||
          this.settings.openaiBaseUrl.includes('127.0.0.1')))

    if (isLocalModel) {
      const result = await this.runWithIntentRouter(history, userMessage)
      totalTimer()
      return result
    }

    const allTools = this.settings.providerType === 'openai' && this.settings.openaiDisableTools
      ? []
      : await this.mcpClient.listTools()
    const tools = allTools.length > 0 ? selectTools(userMessage, allTools) : []
    log('orchestrator', `tool routing: ${allTools.length} total → ${tools.length} selected — [${tools.map(t => t.function.name).join(', ')}]`)
    log('orchestrator', `prompt length: ${userMessage.length} chars / ~${Math.ceil(userMessage.length / 4)} tokens`)

    const messages: AiMessage[] = [
      { role: 'system', content: buildSystemPrompt(this.settings) },
      ...history,
      { role: 'user', content: userMessage },
    ]

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      if (tools.length === 0) {
        log('orchestrator', 'no tools — streaming directly')
        const streamTimer = timer('orchestrator', 'provider.stream (no tools)')
        let fullText = ''
        await this.provider.stream(messages, (text) => {
          this.onChunk({ type: 'text', text })
          fullText += text
        })
        streamTimer()
        this.onChunk({ type: 'done' })
        totalTimer()
        return fullText
      }

      log('orchestrator', `iteration ${i + 1} — calling provider.chat with ${tools.length} tools`)
      const chatTimer = timer('orchestrator', `provider.chat iteration ${i + 1}`)
      const response = await this.provider.chat(messages, tools)
      chatTimer()
      log('orchestrator', `response — toolCalls:${response.toolCalls.length}, content:${response.content.length} chars`)

      if (response.usage) {
        this.onChunk({ type: 'usage', usage: response.usage })
        log('orchestrator', `tokens — in:${response.usage.inputTokens} out:${response.usage.outputTokens} cache_create:${response.usage.cacheCreationTokens} cache_read:${response.usage.cacheReadTokens} billed:${response.usage.inputTokens + response.usage.outputTokens}`)
      }

      if (response.toolCalls.length === 0) {
        if (response.content) {
          this.onChunk({ type: 'text', text: response.content })
          this.onChunk({ type: 'done' })
          totalTimer()
          return response.content
        }
        log('orchestrator', 'empty content after tool round — streaming final response')
        const streamTimer = timer('orchestrator', 'provider.stream (final)')
        let fullText = ''
        await this.provider.stream(messages, (text) => {
          this.onChunk({ type: 'text', text })
          fullText += text
        })
        streamTimer()
        this.onChunk({ type: 'done' })
        totalTimer()
        return fullText
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
        log('orchestrator', `tool call: ${toolCall.name} args=${JSON.stringify(toolCall.arguments).slice(0, 120)}`)

        const toolTimer = timer('orchestrator', `tool:${toolCall.name}`)
        let toolResult: string
        try {
          toolResult = await this.mcpClient.callTool(toolCall.name, toolCall.arguments)
        } catch (error) {
          toolResult = `Error: ${error instanceof Error ? error.message : String(error)}`
        }
        toolTimer()
        log('orchestrator', `tool result: ${toolCall.name} → ${toolResult.length} chars output`)

        this.onChunk({ type: 'tool_result', toolName: toolCall.name, toolResult })
        messages.push({ role: 'tool', content: toolResult })
      }
    }

    log('orchestrator', 'max iterations reached — final stream')
    let fullText = ''
    await this.provider.stream(messages, (text) => {
      this.onChunk({ type: 'text', text })
      fullText += text
    })
    this.onChunk({ type: 'done' })
    totalTimer()
    return fullText
  }

  private async runWithIntentRouter(history: AiMessage[], userMessage: string): Promise<string> {
    log('orchestrator', `intent-router fast path: "${userMessage.slice(0, 60)}"`)

    const recentHistory = history.slice(-4)

    const stripped = userMessage.trim().replace(/^(hi|hello|hey|thanks|ok|okay|sure|yes|no|bye)[,!\s]*/i, '').trim()
    const isConversational = stripped.length < 10

    let routed: { tool: string; args: Record<string, unknown> } | null = null
    if (!isConversational) {
      try {
        const res = await fetch('http://localhost:4000/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: stripped, provider: this.settings.providerType }),
        })
        if (res.ok) routed = await res.json()
      } catch {
        log('orchestrator', 'intent-router unreachable — falling back to plain stream')
      }
    }

    if (!routed) {
      return this.streamViaLocalLlm(
        buildSystemPrompt(this.settings),
        userMessage,
        recentHistory.map(m => `${m.role}: ${m.content}`).join('\n'),
      )
    }

    log('orchestrator', `routed to ${routed.tool} args=${JSON.stringify(routed.args)}`)
    this.onChunk({ type: 'text', text: `Using **${routed.tool}** with: \`${JSON.stringify(routed.args)}\`\n\n` })

    if (DESTRUCTIVE_TOOLS.has(routed.tool)) {
      const confirmId = makeConfirmId()
      const approved = await new Promise<boolean>((resolve) => {
        this.pendingConfirmations.set(confirmId, resolve)
        this.onChunk({ type: 'confirm', toolName: routed!.tool, toolArgs: routed!.args, confirmId })
      })
      if (!approved) {
        const denied = `Action "${routed.tool}" was not approved.`
        this.onChunk({ type: 'text', text: denied })
        this.onChunk({ type: 'done' })
        return denied
      }
    }

    this.onChunk({ type: 'tool_call', toolName: routed.tool, toolArgs: routed.args })

    let toolResult: string
    try {
      toolResult = await this.mcpClient.callTool(routed.tool, routed.args)
    } catch (error) {
      toolResult = `Error: ${error instanceof Error ? error.message : String(error)}`
    }

    this.onChunk({ type: 'tool_result', toolName: routed.tool, toolResult })

    const isListQuery = ['list_files', 'search_files', 'recent_files', 'largest_files', 'duplicate_detector', 'activity_logs'].includes(routed.tool)
    const systemMsg = isListQuery
      ? 'You are jifile.ai. Present the tool result to the user directly. Show all file/folder names as a clean list.'
      : 'You are jifile.ai. The tool ran. Reply in 1-2 sentences. Be concise.'
    const resultContent = isListQuery ? toolResult.slice(0, 1200) : toolResult.slice(0, 400)

    return this.streamViaLocalLlm(systemMsg, userMessage, resultContent)
  }

  private async streamViaLocalLlm(systemMsg: string, userMessage: string, context: string): Promise<string> {
    const body = JSON.stringify({
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMessage },
        { role: 'assistant', content: context },
      ],
      max_tokens: 300,
      temperature: 0.3,
      stream: true,
    })

    const response = await fetch('http://localhost:8081/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    if (!response.ok) {
      const err = `LLM error ${response.status}`
      this.onChunk({ type: 'text', text: err })
      this.onChunk({ type: 'done' })
      return err
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
        try {
          const data = JSON.parse(trimmed.slice(6))
          const text = data.choices?.[0]?.delta?.content
          if (text) {
            this.onChunk({ type: 'text', text })
            fullText += text
          }
        } catch { }
      }
    }

    this.onChunk({ type: 'done' })
    return fullText
  }

}

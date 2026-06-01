import Anthropic from '@anthropic-ai/sdk'
import { McpClient } from '../mcp-client'
import { log } from '../logger'
import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from './base'
import type { StreamChunk } from '../../../src/shared/contracts'

const MAX_TOOL_ITERATIONS = 12
const MAX_TOKENS = 4096
const MAX_SAME_TOOL_REPEATS = 2

const STATIC_SYSTEM_PROMPT = `You are cartex.ai, an intelligent desktop file assistant powered by Claude.

## Behavior

**Plan mode** — For complex multi-step tasks (organize, backup all, clean up, sort, send files), ALWAYS start by outputting a numbered plan before taking any action:
PLAN:
1. Step one
2. Step two
3. Step three

Then immediately execute the plan using tools.

**Smart file resolution** — Before any file operation (delete, send, move, rename):
1. Always call list_files or search_files first to confirm the file exists
2. If the exact file is NOT found, tell the user what similar files exist and ask which one to use
3. Never assume a file path — always verify

**Email with attachment** — When user says "send file X to email":
1. Search for file X across the system
2. If found → send via send_email_smtp
3. If not found → list similar files and ask user to confirm

**Confirmation** — Ask user before any destructive action if you are unsure about the target.

Be concise, efficient, and always verify before acting.`

const PLAN_TRIGGERS = /\b(organize|sort|clean(\s*up)?|backup\s*all|arrange|restructure|send\s+\w+\.?\w*\s+to\s+(mail|email))\b/i

type ToolSearchEntry = {
  type: 'tool_search_tool_regex'
  name: string
}

type AnthropicToolWithCache = Anthropic.Tool & { cache_control?: { type: 'ephemeral' } }



export class AnthropicProvider implements AiProvider {
  private readonly client: Anthropic
  private readonly mcpClient = new McpClient()

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly onChunk: (chunk: StreamChunk) => void,
  ) {
    this.client = new Anthropic({
      apiKey,
      defaultHeaders: {
        'anthropic-beta': 'prompt-caching-2024-07-31,advanced-tool-use-2025-11-20',
      },
    })
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void> {
    const { dynamicContext, anthropicMessages } = splitMessages(messages)
    const systemBlocks = buildSystemBlocks(dynamicContext)

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: 1024,
      system: systemBlocks,
      messages: anthropicMessages,
    })
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        onChunk(event.delta.text)
      }
    }
  }

  async chat(messages: AiMessage[], tools: AiToolSchema[]): Promise<AiResponse> {
    const userMessage = [...messages].reverse().find(m => m.role === 'user')?.content ?? ''
    const needsPlan = PLAN_TRIGGERS.test(userMessage)

    const { dynamicContext, anthropicMessages } = splitMessages(messages)
    const systemBlocks = buildSystemBlocks(dynamicContext)

    const anthropicTools: AnthropicToolWithCache[] = tools.map((t, i) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
      ...(i === tools.length - 1 && tools.length > 0 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }))

    const toolSearchEntry: ToolSearchEntry = {
      type: 'tool_search_tool_regex',
      name: 'tool_search_tool_regex',
    }

    const allTools = [toolSearchEntry, ...anthropicTools] as (AnthropicToolWithCache | ToolSearchEntry)[]
    const callFingerprints = new Map<string, number>()

    if (needsPlan) {
      this.onChunk({ type: 'text', text: '**Planning...**\n\n' })
    }

    let accInput = 0
    let accOutput = 0
    let accCacheCreate = 0
    let accCacheRead = 0

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const toolNames = anthropicTools.map(t => t.name)
      log('anthropic', `iter ${i + 1} — model:${this.model} tools:[${toolNames.join(', ')}] msgs:${anthropicMessages.length}`)

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: systemBlocks,
        tools: allTools as Anthropic.Tool[],
        messages: anthropicMessages,
      })

      const u = response.usage as unknown as Record<string, number>
      const iterIn = u.input_tokens ?? 0
      const iterOut = u.output_tokens ?? 0
      const iterCacheCreate = u.cache_creation_input_tokens ?? 0
      const iterCacheRead = u.cache_read_input_tokens ?? 0
      accInput += iterIn
      accOutput += iterOut
      accCacheCreate += iterCacheCreate
      accCacheRead += iterCacheRead
      log('anthropic', `iter ${i + 1} tokens — in:${iterIn} out:${iterOut} cache_create:${iterCacheCreate} cache_read:${iterCacheRead} billed:${iterIn + iterOut}`)
      if (iterOut >= MAX_TOKENS) log('anthropic', `⚠️  iter ${i + 1} hit max_tokens (${MAX_TOKENS}) — response may be truncated`)

      const textContent = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')

      if (textContent) {
        this.onChunk({ type: 'text', text: textContent })
      }

      if (toolUseBlocks.length === 0) {
        this.onChunk({ type: 'usage', usage: { inputTokens: accInput, outputTokens: accOutput, cacheCreationTokens: accCacheCreate, cacheReadTokens: accCacheRead } })
        return { content: textContent, toolCalls: [], usage: { inputTokens: accInput, outputTokens: accOutput, cacheCreationTokens: accCacheCreate, cacheReadTokens: accCacheRead } }
      }

      anthropicMessages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of toolUseBlocks) {
        const args = block.input as Record<string, unknown>
        const fingerprint = `${block.name}::${JSON.stringify(args)}`
        const fpCount = (callFingerprints.get(fingerprint) ?? 0) + 1
        callFingerprints.set(fingerprint, fpCount)
        if (fpCount > MAX_SAME_TOOL_REPEATS) {
          log('anthropic', `⚠️  ${block.name} called ${fpCount}x with identical args — breaking loop to prevent runaway`)
          this.onChunk({ type: 'usage', usage: { inputTokens: accInput, outputTokens: accOutput, cacheCreationTokens: accCacheCreate, cacheReadTokens: accCacheRead } })
          return { content: textContent, toolCalls: [], usage: { inputTokens: accInput, outputTokens: accOutput, cacheCreationTokens: accCacheCreate, cacheReadTokens: accCacheRead } }
        }

        this.onChunk({ type: 'tool_call', toolName: block.name, toolArgs: args })

        let result: string
        try {
          if (block.name === 'tool_search_tool_regex') {
            const searchRegex = typeof args.regex === 'string' ? args.regex : '.*'
            const re = new RegExp(searchRegex, 'i')
            const matched = anthropicTools
              .filter(t => re.test(t.name))
              .map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }))
            result = JSON.stringify(matched)
            log('anthropic', `tool_search regex:"${searchRegex}" → ${matched.length} tools matched: [${matched.map(t => t.name).join(', ')}]`)
            this.onChunk({ type: 'tool_search', toolRegex: searchRegex, toolsMatched: matched.length, text: 'search' })
          } else {
            result = await this.mcpClient.callTool(block.name, args)
          }
        } catch (err) {
          result = `Error: ${err instanceof Error ? err.message : String(err)}`
        }

        this.onChunk({ type: 'tool_result', toolName: block.name, toolResult: result })
        toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result })
      }

      anthropicMessages.push({ role: 'user', content: toolResults })
    }

    this.onChunk({ type: 'usage', usage: { inputTokens: accInput, outputTokens: accOutput, cacheCreationTokens: accCacheCreate, cacheReadTokens: accCacheRead } })
    return { content: 'Reached iteration limit.', toolCalls: [], usage: { inputTokens: accInput, outputTokens: accOutput, cacheCreationTokens: accCacheCreate, cacheReadTokens: accCacheRead } }
  }
}

function buildSystemBlocks(dynamicContext: string): Anthropic.TextBlockParam[] {
  const blocks: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: STATIC_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ]
  if (dynamicContext) {
    blocks.push({ type: 'text', text: dynamicContext })
  }
  return blocks
}

function splitMessages(messages: AiMessage[]): {
  dynamicContext: string
  anthropicMessages: Anthropic.MessageParam[]
} {
  let dynamicContext = ''
  const anthropicMessages: Anthropic.MessageParam[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      dynamicContext = m.content
      continue
    }
    if (m.role === 'user' || m.role === 'assistant') {
      anthropicMessages.push({ role: m.role, content: m.content })
    } else {
      anthropicMessages.push({ role: 'user' as const, content: m.content })
    }
  }

  return { dynamicContext, anthropicMessages }
}

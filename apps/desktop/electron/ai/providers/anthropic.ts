import Anthropic from '@anthropic-ai/sdk'
import { McpClient } from '../mcp-client'
import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from './base'
import type { StreamChunk } from '../../../src/shared/contracts'

const MAX_TOOL_ITERATIONS = 12

const STATIC_SYSTEM_PROMPT = `You are jifile.ai, an intelligent desktop file assistant powered by Claude.

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
      defaultHeaders: { 'anthropic-beta': 'prompt-caching-2024-07-31' },
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

    const anthropicTools: (Anthropic.Tool & { cache_control?: { type: 'ephemeral' } })[] = tools.map((t, i) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters as Anthropic.Tool['input_schema'],
      ...(i === tools.length - 1 && tools.length > 0 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }))

    if (needsPlan) {
      this.onChunk({ type: 'text', text: '**Planning...**\n\n' })
    }

    let accInput = 0
    let accOutput = 0
    let accCacheCreate = 0
    let accCacheRead = 0

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: systemBlocks,
        tools: anthropicTools,
        messages: anthropicMessages,
      })

      const u = response.usage as unknown as Record<string, number>
      accInput += u.input_tokens ?? 0
      accOutput += u.output_tokens ?? 0
      accCacheCreate += u.cache_creation_input_tokens ?? 0
      accCacheRead += u.cache_read_input_tokens ?? 0

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
        this.onChunk({ type: 'tool_call', toolName: block.name, toolArgs: args })

        let result: string
        try {
          result = await this.mcpClient.callTool(block.name, args)
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

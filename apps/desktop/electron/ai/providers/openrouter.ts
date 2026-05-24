import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from './base'
import { log, timer } from '../logger'

const BASE_URL = 'https://openrouter.ai/api/v1'

type OpenRouterMessage = {
  role: string
  content: string
  tool_call_id?: string
}

type OpenRouterToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type OpenRouterChoice = {
  message: {
    role: string
    content: string | null
    tool_calls?: OpenRouterToolCall[]
  }
  delta?: {
    content?: string
  }
  finish_reason: string | null
}

type OpenRouterResponse = {
  choices: OpenRouterChoice[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

type OpenRouterStreamLine = {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
}

export class OpenRouterProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.apiKey.trim().length > 0
  }

  async chat(messages: AiMessage[], tools: AiToolSchema[]): Promise<AiResponse> {
    const done = timer('openrouter', `chat model=${this.model} msgs=${messages.length} tools=${tools.length}`)
    log('openrouter', `POST /chat/completions model=${this.model}`)

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(toOpenRouterFormat),
      stream: false,
    }
    if (tools.length > 0) {
      body.tools = tools
      body.tool_choice = 'auto'
    }

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://jifile.ai',
        'X-Title': 'jifile.ai',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(text)
        throw new Error(`OpenRouter rate limit — free tier is busy. Wait ${retryAfter}s then try again, or switch to a different model in Settings.`)
      }
      if (response.status === 404) {
        throw new Error(`OpenRouter model not found: "${this.model}". Go to Settings → OpenRouter and pick a different model.`)
      }
      throw new Error(`OpenRouter error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as OpenRouterResponse
    const ms = done()
    const msg = data.choices[0]?.message
    if (!msg) throw new Error('OpenRouter returned no choices')

    const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
      id: tc.id,
    }))
    log('openrouter', `chat done — ${ms}ms, toolCalls:${toolCalls.length}, content:${msg.content?.length ?? 0} chars`)

    const usage = data.usage ? {
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    } : undefined

    return { content: msg.content ?? '', toolCalls, usage }
  }

  async stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void> {
    log('openrouter', `POST /chat/completions stream=true model=${this.model}`)
    const done = timer('openrouter', `stream model=${this.model}`)

    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://jifile.ai',
        'X-Title': 'jifile.ai',
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(toOpenRouterFormat),
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(text)
        throw new Error(`OpenRouter rate limit — free tier is busy. Wait ${retryAfter}s then try again, or switch to a different model in Settings.`)
      }
      if (response.status === 404) {
        throw new Error(`OpenRouter model not found: "${this.model}". Go to Settings → OpenRouter and pick a different model.`)
      }
      throw new Error(`OpenRouter stream error ${response.status}: ${text}`)
    }

    let tokenCount = 0
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue
        try {
          const parsed = JSON.parse(trimmed.slice(6)) as OpenRouterStreamLine
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            onChunk(content)
            tokenCount++
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    const ms = done()
    log('openrouter', `stream done — ${ms}ms, ~${tokenCount} chunks`)
  }
}

function toOpenRouterFormat(msg: AiMessage): OpenRouterMessage {
  return { role: msg.role, content: msg.content }
}

function parseRetryAfter(body: string): number {
  try {
    const parsed = JSON.parse(body) as { error?: { metadata?: { retry_after_seconds?: number } } }
    return Math.ceil(parsed.error?.metadata?.retry_after_seconds ?? 30)
  } catch {
    return 30
  }
}

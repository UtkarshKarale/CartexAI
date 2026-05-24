import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from './base'
import { log, timer } from '../logger'

export class OpenAiProvider implements AiProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      const url = new URL(this.baseUrl)
      const response = await fetch(`${url.origin}/v1/models`, {
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      })
      return response.ok
    } catch {
      return false
    }
  }

  async chat(messages: AiMessage[], tools: AiToolSchema[]): Promise<AiResponse> {
    const done = timer('openai', `chat model=${this.model} msgs=${messages.length}`)
    log('openai', `POST ${this.baseUrl}/chat/completions model=${this.model}`)

    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
    }

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: {
          name: t.function.name,
          description: t.function.description,
          parameters: t.function.parameters,
        },
      }))
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`OpenAI error ${response.status}: ${text}`)
    }

    const data = await response.json()
    const choice = data.choices[0]
    const ms = done()

    log('openai', `chat done — ${ms}ms, content:${choice.message.content?.length ?? 0} chars`)

    const usage = data.usage ? {
      inputTokens: data.usage.prompt_tokens ?? 0,
      outputTokens: data.usage.completion_tokens ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: data.usage.prompt_tokens_details?.cached_tokens ?? 0,
    } : undefined

    return {
      content: choice.message.content ?? '',
      toolCalls: (choice.message.tool_calls ?? []).map((tc: any) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage,
    }
  }

  async stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void> {
    log('openai', `POST ${this.baseUrl}/chat/completions stream=true model=${this.model}`)
    const done = timer('openai', `stream model=${this.model}`)

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`OpenAI stream error ${response.status}: ${text}`)
    }

    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let tokenCount = 0

    while (true) {
      const { done: streamDone, value } = await reader.read()
      if (streamDone) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        if (trimmed === 'data: [DONE]') break

        try {
          const data = JSON.parse(trimmed.slice(6))
          const content = data.choices[0]?.delta?.content
          if (content) {
            onChunk(content)
            tokenCount++
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    const ms = done()
    log('openai', `stream done — ${ms}ms, ~${tokenCount} chunks`)
  }
}

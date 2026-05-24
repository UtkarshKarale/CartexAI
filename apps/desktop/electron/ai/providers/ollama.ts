import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from './base'
import { log, timer } from '../logger'

const OLLAMA_BASE_URL = 'http://localhost:11434'

type OllamaModel = { name: string; size: number }
type OllamaTagsResponse = { models: OllamaModel[] }

export interface OllamaModelInfo {
  name: string
  sizeMb: number
}

/** Returns installed Gemma models sorted smallest-first. */
export async function ollamaListGemmaModels(): Promise<string[]> {
  const infos = await ollamaListGemmaModelInfos()
  return infos.map((m) => m.name)
}

export async function ollamaListGemmaModelInfos(): Promise<OllamaModelInfo[]> {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return []
    const data = (await response.json()) as OllamaTagsResponse
    return data.models
      .filter((m) => m.name.toLowerCase().startsWith('gemma'))
      .map((m) => ({ name: m.name, sizeMb: Math.round(m.size / 1024 / 1024) }))
      .sort((a, b) => a.sizeMb - b.sizeMb)
  } catch {
    return []
  }
}

type OllamaGenerateResponse = {
  response: string
}

type OllamaGenerateStreamLine = {
  response?: string
  done?: boolean
}

export class OllamaProvider implements AiProvider {
  constructor(private readonly model: string) {}

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/version`)
      return response.ok
    } catch {
      return false
    }
  }

  async chat(messages: AiMessage[], _tools: AiToolSchema[]): Promise<AiResponse> {
    const done = timer('ollama', `generate model=${this.model} msgs=${messages.length}`)
    log('ollama', `POST /api/generate stream=false model=${this.model}`)

    const prompt = this.formatPrompt(messages)

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: false,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`Ollama error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as OllamaGenerateResponse
    const ms = done()
    log('ollama', `generate done — ${ms}ms, content:${data.response.length} chars`)

    return {
      content: data.response,
      toolCalls: [],
    }
  }

  async stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void> {
    log('ollama', `POST /api/generate stream=true model=${this.model}`)
    const done = timer('ollama', `stream model=${this.model}`)
    const prompt = this.formatPrompt(messages)

    const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: prompt,
        stream: true,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`Ollama stream error ${response.status}: ${text}`)
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
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line) as OllamaGenerateStreamLine
          if (parsed.response) {
            onChunk(parsed.response)
            tokenCount++
          }
        } catch {
          // skip malformed lines
        }
      }
    }
    const ms = done()
    log('ollama', `stream done — ${ms}ms, ~${tokenCount} chunks, ~${Math.round(tokenCount / (ms / 1000))} tok/s`)
  }

  private formatPrompt(messages: AiMessage[]): string {
    return (
      messages
        .map((m) => {
          const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : 'System'
          return `${role}: ${m.content}`
        })
        .join('\n\n') + '\n\nAssistant: '
    )
  }
}

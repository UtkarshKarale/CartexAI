import type { AiMessage, AiProvider, AiResponse, AiToolSchema } from './base'
import { log, timer } from '../logger'

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiCandidate = {
  content: { parts: GeminiPart[] }
  finishReason?: string
}

type GeminiResponse = {
  candidates?: GeminiCandidate[]
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
}

type GeminiStreamLine = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    finishReason?: string
  }>
}

export class GeminiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.apiKey.trim().length > 0
  }

  async chat(messages: AiMessage[], tools: AiToolSchema[]): Promise<AiResponse> {
    const done = timer('gemini', `chat model=${this.model} msgs=${messages.length} tools=${tools.length}`)
    log('gemini', `POST generateContent model=${this.model}`)

    const { systemInstruction, contents } = toGeminiHistory(messages)

    const body: Record<string, unknown> = { contents }
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }
    if (tools.length > 0) {
      body.tools = [{
        functionDeclarations: tools.map((t) => ({
          name: t.function.name,
          description: sanitize(t.function.description),
          parameters: t.function.parameters,
        })),
      }]
    }

    const response = await fetch(
      `${BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`Gemini error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as GeminiResponse
    const ms = done()
    const candidate = data.candidates?.[0]
    if (!candidate) throw new Error('Gemini returned no candidates')

    const toolCalls: AiResponse['toolCalls'] = []
    let textContent = ''

    for (const part of candidate.content?.parts ?? []) {
      if ('text' in part && part.text) {
        textContent += part.text
      } else if ('functionCall' in part && part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        })
      }
    }

    const usage = data.usageMetadata ? {
      inputTokens: data.usageMetadata.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    } : undefined

    log('gemini', `chat done — ${ms}ms, toolCalls:${toolCalls.length}, content:${textContent.length} chars`)
    return { content: textContent, toolCalls, usage }
  }

  async stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void> {
    log('gemini', `POST streamGenerateContent model=${this.model}`)
    const done = timer('gemini', `stream model=${this.model}`)

    const { systemInstruction, contents } = toGeminiHistory(messages)
    const body: Record<string, unknown> = { contents }
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }

    const response = await fetch(
      `${BASE_URL}/${this.model}:streamGenerateContent?alt=sse&key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    )

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`Gemini stream error ${response.status}: ${text}`)
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
          const parsed = JSON.parse(trimmed.slice(6)) as GeminiStreamLine
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            onChunk(text)
            tokenCount++
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    const ms = done()
    log('gemini', `stream done — ${ms}ms, ~${tokenCount} chunks`)
  }
}

function toGeminiHistory(messages: AiMessage[]): { systemInstruction: string; contents: GeminiContent[] } {
  let systemInstruction = ''
  const contents: GeminiContent[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content
      continue
    }
    const role = msg.role === 'assistant' ? 'model' : 'user'
    contents.push({ role, parts: [{ text: msg.content }] })
  }

  return { systemInstruction, contents }
}

function sanitize(text: string): string {
  return text.replace(/[^\x00-\xFF]/g, '')
}

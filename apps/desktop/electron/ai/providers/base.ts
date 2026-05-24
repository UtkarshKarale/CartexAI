export interface AiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
}

export interface AiToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface AiToolCall {
  name: string
  arguments: Record<string, unknown>
  id?: string
}

export interface AiResponse {
  content: string
  toolCalls: AiToolCall[]
  usage?: {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
  }
}

export interface AiProvider {
  chat(messages: AiMessage[], tools: AiToolSchema[]): Promise<AiResponse>
  stream(messages: AiMessage[], onChunk: (text: string) => void): Promise<void>
  isAvailable(): Promise<boolean>
}

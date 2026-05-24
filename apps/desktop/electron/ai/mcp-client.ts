import type { AiToolSchema } from './providers/base'
import { log, timer } from './logger'

const MCP_BASE_URL = 'http://localhost:4000'

type McpToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

type McpCallResult = {
  content: Array<{ type: string; text: string }>
  isError?: boolean
}

const TOOL_CACHE_TTL_MS = 60_000

export class McpClient {
  private toolCache: { tools: AiToolSchema[]; fetchedAt: number } | null = null

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${MCP_BASE_URL}/`)
      return response.ok
    } catch {
      return false
    }
  }

  invalidateToolCache(): void {
    this.toolCache = null
  }

  async listTools(): Promise<AiToolSchema[]> {
    if (this.toolCache && Date.now() - this.toolCache.fetchedAt < TOOL_CACHE_TTL_MS) {
      log('mcp', `listTools — cache hit (${this.toolCache.tools.length} tools)`)
      return this.toolCache.tools
    }

    const done = timer('mcp', 'listTools')
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`${MCP_BASE_URL}/api/tools`, { signal: AbortSignal.timeout(3000) })
        if (!response.ok) { log('mcp', `listTools HTTP ${response.status}`); return [] }
        const data = (await response.json()) as { tools: McpToolDefinition[] }
        const tools = data.tools.map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description ?? '',
            parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          },
        }))
        done()
        log('mcp', `${tools.length} tools loaded (attempt ${attempt})`)
        this.toolCache = { tools, fetchedAt: Date.now() }
        return tools
      } catch (err) {
        log('mcp', `listTools attempt ${attempt} error: ${String(err)}`)
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500))
      }
    }
    return []
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const done = timer('mcp', `callTool:${name}`)
    const response = await fetch(`${MCP_BASE_URL}/api/call/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })

    if (!response.ok) {
      const text = await response.text()
      done()
      throw new Error(`Tool "${name}" failed (${response.status}): ${text}`)
    }

    const result = (await response.json()) as McpCallResult
    done()
    if (result.isError) {
      throw new Error(result.content.map((c) => c.text).join('\n'))
    }
    return result.content.map((c) => c.text).join('\n')
  }
}

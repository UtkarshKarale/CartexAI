import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AiProvider } from './providers/base'
import { OllamaProvider } from './providers/ollama'
import { AnthropicProvider } from './providers/anthropic'
import { OpenRouterProvider } from './providers/openrouter'
import { GeminiProvider } from './providers/gemini'
import { OpenAiProvider } from './providers/openai'
import type { AppSettings, ProviderStatus, StreamChunk } from '../../src/shared/contracts'

const OLLAMA_SEARCH_PATHS: string[] = [
  // common Linux paths (install script puts it here)
  '/usr/local/bin/ollama',
  '/usr/bin/ollama',
  path.join(os.homedir(), '.local/bin/ollama'),
  // macOS app bundle + homebrew
  '/Applications/Ollama.app/Contents/MacOS/Ollama',
  '/opt/homebrew/bin/ollama',
  '/usr/local/opt/ollama/bin/ollama',
  // Windows
  path.join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Ollama', 'ollama.exe'),
  path.join(process.env['ProgramFiles'] ?? '', 'Ollama', 'ollama.exe'),
]

/** Returns the resolved ollama binary path, or null if not found. */
export function findOllamaBinary(): string | null {
  // try bare name first (respects shell PATH on some platforms)
  if (tryExec('ollama', ['version'])) return 'ollama'
  for (const p of OLLAMA_SEARCH_PATHS) {
    if (existsSync(p) && tryExec(p, ['version'])) return p
  }
  return null
}

export async function detectProviders(anthropicKey: string, openrouterKey: string, geminiKey = ''): Promise<ProviderStatus> {
  const ollamaBin = findOllamaBinary()
  const ollamaBinary = ollamaBin !== null
  const dockerInstalled = tryExec('docker', ['--version'])

  const ollama = await isOllamaServing()
  const docker = dockerInstalled ? tryExec('docker', ['ps']) : false
  const dockerOllama = docker ? isDockerOllamaRunning() : false

  return { ollamaBinary, ollama, dockerInstalled, docker, dockerOllama, anthropicKey, openrouterKey, geminiKey }
}

export function createProvider(
  settings: AppSettings,
  onChunk: (chunk: StreamChunk) => void,
): AiProvider | null {
  if (settings.providerType === 'anthropic' && settings.anthropicKey) {
    return new AnthropicProvider(settings.anthropicKey, settings.anthropicModel, onChunk)
  }
  if (settings.providerType === 'openrouter' && settings.openrouterKey) {
    return new OpenRouterProvider(settings.openrouterKey, settings.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free')
  }
  if (settings.providerType === 'gemini' && settings.geminiKey) {
    return new GeminiProvider(settings.geminiKey, settings.geminiModel || 'gemini-2.0-flash')
  }
  if (settings.providerType === 'openai' && settings.openaiBaseUrl) {
    return new OpenAiProvider(settings.openaiBaseUrl, settings.openaiApiKey, settings.openaiModel)
  }
  if (settings.providerType === 'gemini-cli') {
    return new OllamaProvider(settings.defaultModel)
  }
  return new OllamaProvider(settings.defaultModel)
}

/** @deprecated use tryExec directly */
export function checkCommand(cmd: string, args: string[]): boolean {
  return tryExec(cmd, args)
}

export function tryExec(cmd: string, args: string[]): boolean {
  try {
    const result = spawnSync(cmd, args, { timeout: 3000 })
    return result.status === 0
  } catch {
    return false
  }
}

async function isOllamaServing(): Promise<boolean> {
  try {
    const resp = await fetch('http://localhost:11434/api/version', { signal: AbortSignal.timeout(2000) })
    return resp.ok
  } catch {
    return false
  }
}

function isDockerOllamaRunning(): boolean {
  try {
    const result = spawnSync('docker', ['ps', '--filter', 'ancestor=ollama/ollama', '-q'], { timeout: 3000 })
    if (result.status !== 0) return false
    return (result.stdout?.toString().trim() ?? '').length > 0
  } catch {
    return false
  }
}

import os from 'node:os'

export interface SystemInfo {
  ramGb: number
  cpuCores: number
  platform: string
  recommendedModel: string
  recommendedProvider: 'ollama' | 'docker' | 'anthropic'
  pullCommand: string
}

export function detectSystem(): SystemInfo {
  const ramGb = Math.round(os.totalmem() / (1024 ** 3))
  const cpuCores = os.cpus().length
  const platform = process.platform

  let recommendedModel: string
  let recommendedProvider: SystemInfo['recommendedProvider']
  let pullCommand: string

  if (ramGb < 4) {
    recommendedModel = 'none'
    recommendedProvider = 'anthropic'
    pullCommand = ''
  } else if (ramGb < 8) {
    recommendedModel = 'gemma3:1b'
    recommendedProvider = 'ollama'
    pullCommand = 'ollama pull gemma3:1b'
  } else if (ramGb < 16) {
    recommendedModel = 'gemma3:4b'
    recommendedProvider = 'ollama'
    pullCommand = 'ollama pull gemma3:4b'
  } else {
    recommendedModel = 'gemma3:12b'
    recommendedProvider = 'ollama'
    pullCommand = 'ollama pull gemma3:12b'
  }

  return { ramGb, cpuCores, platform, recommendedModel, recommendedProvider, pullCommand }
}

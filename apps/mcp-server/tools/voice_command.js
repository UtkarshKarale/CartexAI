const fs = require('fs')
const path = require('path')

let _transcriber = null
let _loadPromise = null

async function getTranscriber() {
  if (_transcriber) return _transcriber
  if (!_loadPromise) {
    _loadPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      env.allowLocalModels = false
      _transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { quantized: true })
      return _transcriber
    })()
  }
  return _loadPromise
}

module.exports = {
  name: 'voice_command',
  definition: {
    name: 'voice_command',
    description: 'Transcribe speech to text using offline Whisper (runs 100% locally, no internet or API key needed). Accepts WAV audio files. On first use, downloads the Whisper-tiny model (~40 MB) once and caches it. Returns the transcribed text for further AI processing.',
    inputSchema: {
      type: 'object',
      properties: {
        audio_path: { type: 'string', description: 'Absolute path to a WAV audio file.' },
        language: { type: 'string', description: 'Optional ISO-639-1 language code (e.g. "en", "hi", "es"). Leave blank for auto-detect.' },
      },
      required: ['audio_path'],
    },
  },
  handler: async (args) => {
    const { audio_path, language } = args
    if (!audio_path) {
      return { content: [{ type: 'text', text: 'audio_path is required.' }], isError: true }
    }

    const filePath = path.resolve(audio_path)
    if (!fs.existsSync(filePath)) {
      return { content: [{ type: 'text', text: `Audio file not found: ${filePath}` }], isError: true }
    }

    const ext = path.extname(filePath).toLowerCase()
    if (ext !== '.wav') {
      return {
        content: [{ type: 'text', text: `Offline Whisper supports WAV files only. Received: ${ext}. Please convert your audio to WAV format (16kHz mono recommended) before passing it to this tool.` }],
        isError: true,
      }
    }

    const stat = fs.statSync(filePath)
    if (stat.size > 50 * 1024 * 1024) {
      return { content: [{ type: 'text', text: 'Audio file exceeds 50 MB. Please trim or compress the file.' }], isError: true }
    }

    const transcriber = await getTranscriber()

    const options = {}
    if (language) options.language = language

    const result = await transcriber(filePath, options)
    const transcription = Array.isArray(result) ? result.map(r => r.text).join(' ') : (result.text || '')

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          transcription: transcription.trim(),
          file: filePath,
          size_bytes: stat.size,
          language: language || 'auto-detected',
          engine: 'whisper-tiny (offline)',
        }),
      }],
    }
  },
}

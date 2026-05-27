const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const sharp = require('sharp')
const ocrSpace = require('ocr-space-api-wrapper')

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif', '.tif', '.tiff', '.heic'])
const MAX_PREFILTER_CANDIDATES = 250
const MAX_OBJECT_RESULTS = 5

let imageFeaturePipelinePromise = null
let objectDetectionPipelinePromise = null
const embeddingCache = new Map()
const objectCache = new Map()

module.exports = {
  name: 'find_similar_images',
  definition: {
    name: 'find_similar_images',
    description: 'Find visually similar images across local drives using image embeddings, object detection, perceptual hashing, and OCR.',
    inputSchema: {
      type: 'object',
      properties: {
        imagePath: {
          type: 'string',
          description: 'Path to the query image.',
        },
        directory: {
          type: 'string',
          description: 'Optional folder to restrict the search to. Defaults to all mounted drives and common media folders.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return.',
          default: 20,
        },
      },
      required: ['imagePath'],
    },
  },
  handler: async (args) => {
    try {
      const imagePath = String(args.imagePath ?? '').trim()
      if (!imagePath) {
        throw new Error('imagePath is required')
      }

      const maxResults = clampNumber(args.maxResults, 1, 50, 20)
      const roots = buildSearchRoots(args.directory)
      const queryHash = await imageHash(imagePath)
      const queryEmbedding = await getImageEmbedding(imagePath).catch(() => null)
      const queryObjects = await getObjectLabels(imagePath).catch(() => [])
      const queryOcr = await extractOcrText(imagePath)

      const candidates = []
      for (const root of roots) {
        await walkImages(root, candidates, 0, 4000)
      }

      const prefixed = []
      for (const candidate of candidates) {
        try {
          const candidateHash = await imageHash(candidate.path)
          const distance = hammingDistance(queryHash, candidateHash)
          const baseScore = 1 - distance / 64
          const nameScore = nameSimilarity(path.basename(imagePath), candidate.name)
          prefixed.push({
            path: candidate.path,
            name: candidate.name,
            sizeBytes: candidate.sizeBytes,
            mtimeMs: candidate.mtimeMs,
            distance,
            quickScore: roundScore(baseScore * 0.8 + nameScore * 0.2),
            openable: true,
          })
        } catch {
          // ignore unreadable files
        }
      }

      prefixed.sort((a, b) => b.quickScore - a.quickScore || a.distance - b.distance)
      const topPrefilter = prefixed.slice(0, MAX_PREFILTER_CANDIDATES)

      const results = []
      for (const item of topPrefilter) {
        const embedding = await getImageEmbedding(item.path).catch(() => null)
        const embeddingScore = queryEmbedding && embedding ? cosineSimilarity(queryEmbedding, embedding) : 0
        const ocrText = queryOcr ? await maybeOcr(item.path) : ''
        const textScore = queryOcr && ocrText ? overlapScore(queryOcr, ocrText) : 0
        const objectLabels = await getObjectLabels(item.path).catch(() => [])
        const objectScore = objectOverlapScore(queryObjects, objectLabels)
        results.push({
          ...item,
          score: roundScore(item.quickScore * 0.25 + embeddingScore * 0.5 + textScore * 0.15 + objectScore * 0.1),
          ocrText: ocrText ? ocrText.slice(0, 200) : '',
          objects: objectLabels.slice(0, MAX_OBJECT_RESULTS),
        })
      }

      results.sort((a, b) => b.score - a.score || a.distance - b.distance)
      const top = results.slice(0, maxResults)

      const payload = {
        query: imagePath,
        queryOcr: queryOcr ? queryOcr.slice(0, 300) : '',
        queryObjects,
        roots,
        scannedCount: candidates.length,
        results: top,
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(payload),
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding similar images: ${error.message}`,
          },
        ],
        isError: true,
      }
    }
  },
}

function clampNumber(value, min, max, fallback) {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.min(max, Math.max(min, Math.round(num)))
}

function roundScore(score) {
  return Math.max(0, Math.min(1, Number(score.toFixed(4))))
}

function normalizeVector(values) {
  const vector = Array.from(values)
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!magnitude) return vector
  return vector.map((value) => value / magnitude)
}

function buildSearchRoots(directory) {
  if (directory && String(directory).trim()) {
    return [String(directory).trim()]
  }

  const roots = []
  if (process.platform === 'win32') {
    const home = os.homedir()
    for (const candidate of [
      home,
      path.join(home, 'Downloads'),
      path.join(home, 'Desktop'),
      path.join(home, 'Pictures'),
      path.join(home, 'Documents'),
      path.join(home, 'OneDrive', 'Pictures'),
      path.join(home, 'OneDrive', 'Desktop'),
      path.join(home, 'OneDrive', 'Documents'),
    ]) {
      if (candidate && fs.existsSync(candidate) && !roots.includes(candidate)) {
        roots.push(candidate)
      }
    }

    for (let code = 67; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`
      if (fs.existsSync(drive) && !roots.includes(drive)) roots.push(drive)
    }
  } else {
    roots.push(os.homedir())
    for (const mount of ['/Volumes', '/mnt', '/media', '/run/media']) {
      if (fs.existsSync(mount)) roots.push(mount)
    }
  }
  return roots
}

async function walkImages(dir, results, depth, limit) {
  if (results.length >= limit) return
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= limit) return
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name, depth)) continue
      await walkImages(full, results, depth + 1, limit)
      continue
    }
    if (!IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) continue
    try {
      const stat = await fsp.stat(full)
      results.push({
        path: full,
        name: entry.name,
        sizeBytes: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    } catch {
      // ignore
    }
  }
}

function shouldSkipDirectory(name, depth) {
  const lower = name.toLowerCase()
  if (depth > 4 && ['node_modules', '.git', 'system volume information', '$recycle.bin'].includes(lower)) {
    return true
  }
  return ['node_modules', '.git', '$recycle.bin', 'system volume information'].includes(lower)
}

async function imageHash(imagePath) {
  const cacheKey = `hash:${imagePath}`
  const cached = embeddingCache.get(cacheKey)
  if (cached) return cached
  const { data } = await sharp(imagePath).rotate().resize(9, 8, { fit: 'fill' }).grayscale().raw().toBuffer({ resolveWithObject: true })
  const bits = []
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const left = data[y * 9 + x]
      const right = data[y * 9 + x + 1]
      bits.push(left > right ? '1' : '0')
    }
  }
  const hash = bits.join('')
  embeddingCache.set(cacheKey, hash)
  return hash
}

function hammingDistance(a, b) {
  let distance = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) distance += 1
  }
  return distance + Math.abs(a.length - b.length)
}

function nameSimilarity(a, b) {
  const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const left = normalize(a).split(/\s+/).filter(Boolean)
  const right = normalize(b).split(/\s+/).filter(Boolean)
  if (left.length === 0 || right.length === 0) return 0
  const set = new Set(right)
  let matches = 0
  for (const token of left) {
    if (set.has(token)) matches += 1
  }
  return matches / Math.max(left.length, right.length)
}

function overlapScore(a, b) {
  const normalize = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
  const left = normalize(a)
  const right = normalize(b)
  if (left.length === 0 || right.length === 0) return 0
  const set = new Set(right)
  let matches = 0
  for (const token of left) {
    if (set.has(token)) matches += 1
  }
  return matches / Math.max(left.length, right.length)
}

function objectOverlapScore(queryObjects, candidateObjects) {
  if (!queryObjects.length || !candidateObjects.length) return 0
  const left = new Set(queryObjects.map((item) => item.toLowerCase()))
  let matches = 0
  for (const item of candidateObjects) {
    if (left.has(String(item).toLowerCase())) {
      matches += 1
    }
  }
  return matches / Math.max(queryObjects.length, candidateObjects.length)
}

async function maybeOcr(imagePath) {
  const apiKey = process.env.OCR_SPACE_API_KEY || 'K88574161788957'
  try {
    const response = await ocrSpace(imagePath, { apiKey })
    return response.ParsedResults.map((res) => res.ParsedText).join('\n').trim()
  } catch {
    return ''
  }
}

async function extractOcrText(imagePath) {
  return maybeOcr(imagePath)
}

async function getImageEmbedding(imagePath) {
  const cacheKey = `embed:${imagePath}`
  const cached = embeddingCache.get(cacheKey)
  if (cached) return cached

  const { pipeline, RawImage } = await import('@xenova/transformers')
  if (!imageFeaturePipelinePromise) {
    imageFeaturePipelinePromise = pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32')
  }

  const imageFeatureExtractor = await imageFeaturePipelinePromise
  const image = await RawImage.read(imagePath)
  const output = await imageFeatureExtractor(image)
  const embedding = normalizeVector(output.data ?? [])
  embeddingCache.set(cacheKey, embedding)
  return embedding
}

async function getObjectLabels(imagePath) {
  const cacheKey = `objects:${imagePath}`
  const cached = objectCache.get(cacheKey)
  if (cached) return cached

  const { pipeline } = await import('@xenova/transformers')
  if (!objectDetectionPipelinePromise) {
    objectDetectionPipelinePromise = pipeline('object-detection', 'Xenova/detr-resnet-50')
  }

  const detector = await objectDetectionPipelinePromise
  const detections = await detector(imagePath)
  const labels = Array.from(
    new Set(
      detections
        .filter((item) => Number(item.score) >= 0.35)
        .slice(0, 6)
        .map((item) => item.label),
    ),
  )
  objectCache.set(cacheKey, labels)
  return labels
}

function cosineSimilarity(a, b) {
  if (!a.length || !b.length) return 0
  let sum = 0
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i]
  }
  return Math.max(0, Math.min(1, sum))
}

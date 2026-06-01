const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync, spawn } = require('child_process')

const DESKTOP_DIRS = [
  '/usr/share/applications',
  '/usr/local/share/applications',
  path.join(os.homedir(), '.local/share/applications'),
  '/var/lib/snapd/desktop/applications',
  '/var/lib/flatpak/exports/share/applications',
  path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'),
]

let _desktopCache = null

function parseDesktopFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8')
    const lines = text.split('\n')
    const entry = {}
    let inDesktopEntry = false
    for (const line of lines) {
      if (line.trim() === '[Desktop Entry]') { inDesktopEntry = true; continue }
      if (line.startsWith('[') && line !== '[Desktop Entry]') inDesktopEntry = false
      if (!inDesktopEntry) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      const val = line.slice(eq + 1).trim()
      if (key === 'Name') entry.name = val
      if (key === 'Exec') entry.exec = val.replace(/%[uUfFdDnNickvm]/g, '').trim()
      if (key === 'NoDisplay') entry.noDisplay = val === 'true'
      if (key === 'Type') entry.type = val
    }
    if (entry.type === 'Application' && entry.name && entry.exec && !entry.noDisplay) {
      return entry
    }
  } catch { /* skip unreadable files */ }
  return null
}

function buildDesktopCache() {
  if (_desktopCache) return _desktopCache
  _desktopCache = []
  for (const dir of DESKTOP_DIRS) {
    if (!fs.existsSync(dir)) continue
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'))
      for (const file of files) {
        const entry = parseDesktopFile(path.join(dir, file))
        if (entry) _desktopCache.push(entry)
      }
    } catch { /* skip unreadable dirs */ }
  }
  return _desktopCache
}

const ALIASES = {
  'vscode': 'visual studio code', 'vs code': 'visual studio code',
  'chrome': 'google chrome', 'chromium': 'chromium web browser',
  'ff': 'firefox', 'files': 'files', 'file manager': 'files',
  'term': 'terminal', 'calc': 'calculator',
  'photos': 'shotwell', 'music': 'rhythmbox',
  'word': 'libreoffice writer', 'excel': 'libreoffice calc',
  'ppt': 'libreoffice impress', 'powerpoint': 'libreoffice impress',
  'paint': 'gimp', 'notepad': 'gedit', 'text editor': 'gedit',
}

function scoreMatch(appName, queryWords) {
  const nameLower = appName.toLowerCase()
  const nameWords = nameLower.split(/\s+/)
  let score = 0
  for (const qw of queryWords) {
    if (nameWords.some(nw => nw === qw)) score += 2
    else if (nameWords.some(nw => nw.startsWith(qw) || qw.startsWith(nw))) score += 1
    else if (nameLower.includes(qw)) score += 0.5
  }
  return score
}

function findOnLinux(query) {
  const normalized = ALIASES[query.toLowerCase()] ?? query.toLowerCase()
  const queryWords = normalized.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  const apps = buildDesktopCache()

  let best = null, bestScore = 0
  for (const app of apps) {
    const exact = app.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized.replace(/[^a-z0-9]/g, '')
    if (exact) return app.exec
    const score = scoreMatch(app.name, queryWords)
    if (score > bestScore) { bestScore = score; best = app }
  }
  return bestScore >= 1 ? best.exec : null
}

function findOnMac(query) {
  const q = query.toLowerCase()
  const appDirs = ['/Applications', path.join(os.homedir(), 'Applications')]
  for (const dir of appDirs) {
    if (!fs.existsSync(dir)) continue
    try {
      const apps = fs.readdirSync(dir).filter(f => f.endsWith('.app'))
      const exact = apps.find(a => a.replace('.app', '').toLowerCase() === q)
      if (exact) return path.join(dir, exact)
      const partial = apps.find(a => a.replace('.app', '').toLowerCase().includes(q))
      if (partial) return path.join(dir, partial)
    } catch { /* skip */ }
  }
  return null
}

function findOnWindows(query) {
  const normalized = query.toLowerCase().replace(/[^a-z0-9]+/g, '')
  const whereResult = spawnSync('where', [query], { encoding: 'utf8' })
  if (whereResult.status === 0) {
    const hit = whereResult.stdout.split(/\r?\n/).map(l => l.trim()).find(Boolean)
    if (hit) return hit
  }
  const roots = [
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(Boolean)
  for (const root of roots) {
    const hit = walkWindowsStartMenu(root, normalized)
    if (hit) return hit
  }
  return null
}

function walkWindowsStartMenu(dir, normalizedTarget) {
  if (!fs.existsSync(dir)) return null
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      const norm = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, '')
      if (norm.includes(normalizedTarget) && (entry.name.endsWith('.lnk') || entry.name.endsWith('.exe'))) {
        return full
      }
      if (entry.isDirectory()) {
        const nested = walkWindowsStartMenu(full, normalizedTarget)
        if (nested) return nested
      }
    }
  } catch { /* skip */ }
  return null
}

function resolveByName(query) {
  const whichResult = spawnSync(process.platform === 'win32' ? 'where' : 'which', [query], { encoding: 'utf8' })
  if (whichResult.status === 0) {
    const hit = whichResult.stdout.split(/\r?\n/).map(l => l.trim()).find(Boolean)
    if (hit) return hit
  }
  if (process.platform === 'linux') return findOnLinux(query)
  if (process.platform === 'darwin') return findOnMac(query)
  if (process.platform === 'win32') return findOnWindows(query)
  return null
}

function parseExec(exec) {
  const tokens = []
  let current = ''
  let inQuote = false
  let quoteChar = ''
  for (let i = 0; i < exec.length; i++) {
    const ch = exec[i]
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false }
      else { current += ch }
    } else if (ch === '"' || ch === "'") {
      inQuote = true; quoteChar = ch
    } else if (ch === ' ') {
      if (current) { tokens.push(current); current = '' }
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return { cmd: tokens[0] || exec, args: tokens.slice(1) }
}

module.exports = {
  name: 'open_application',
  definition: {
    name: 'open_application',
    description: 'Open any application, file, folder, or URL directly — do NOT ask the user to open it manually, just call this tool. On Linux searches .desktop files by display name (e.g. "chrome", "calculator", "vs code", "spotify"). On macOS searches /Applications. On Windows searches Start Menu. Also opens files with their default app.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'App name (e.g. "calculator", "vs code", "spotify"), file path, or URL.' },
      },
      required: ['target'],
    },
  },
  handler: async (args) => {
    const target = String(args.target ?? '').trim()
    if (!target) {
      return { content: [{ type: 'text', text: 'target is required.' }], isError: true }
    }

    if (/^https?:\/\//i.test(target) || /^file:\/\//i.test(target)) {
      const { default: openBrowser } = await import('open')
      await openBrowser(target)
      return { content: [{ type: 'text', text: `Opened URL: ${target}` }] }
    }

    if (fs.existsSync(target)) {
      const xdg = process.platform === 'linux' ? 'xdg-open' : process.platform === 'darwin' ? 'open' : 'start'
      const proc = spawn(xdg, [target], { detached: true, stdio: 'ignore' })
      proc.unref()
      return { content: [{ type: 'text', text: `Opened: ${target}` }] }
    }

    const resolved = resolveByName(target)
    if (resolved) {
      const { cmd, args } = parseExec(resolved)
      const proc = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      proc.unref()
      return { content: [{ type: 'text', text: `Opened ${target} (${path.basename(cmd)})` }] }
    }

    try {
      const proc = spawn(target, [], { detached: true, stdio: 'ignore', shell: true })
      proc.unref()
      return { content: [{ type: 'text', text: `Opened: ${target}` }] }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Could not open "${target}". Try the exact binary name (e.g. "google-chrome", "code") or full path.` }],
        isError: true,
      }
    }
  },
}

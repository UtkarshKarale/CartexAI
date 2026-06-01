const { exec } = require('child_process')
const util = require('util')
const execPromise = util.promisify(exec)

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshred\b/i,
  /\b:\(\)\{.*\}/,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bsudo\s+rm\b/i,
  />\s*\/dev\/(sda|hda|nvme)/i,
  /\bwipefs\b/i,
  /\bfdisk\b/i,
]

const WARN_PATTERNS = [
  { re: /\bsudo\b/i, reason: 'runs as superuser' },
  { re: /\brm\s+-r\b/i, reason: 'recursive delete' },
  { re: /\bcurl\b.*\|\s*(sh|bash)/i, reason: 'pipe-to-shell (remote code execution risk)' },
  { re: /\bwget\b.*-O\s*-\b/i, reason: 'pipe-to-shell (remote code execution risk)' },
  { re: /\beval\b/i, reason: 'eval execution' },
  /\bchmod\b/i,
]

function checkCommand(command) {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { blocked: true, reason: `Command blocked for safety: matches destructive pattern (${pattern})` }
    }
  }

  const warnings = []
  for (const entry of WARN_PATTERNS) {
    const re = entry.re ?? entry
    const reason = entry.reason ?? 'potentially dangerous'
    if (re.test(command)) warnings.push(reason)
  }

  return { blocked: false, warnings }
}

module.exports = {
  name: 'execute_command',
  definition: {
    name: 'execute_command',
    description: 'Execute a terminal/shell command. Destructive commands (rm -rf, dd, mkfs, format, shred, wipefs) are blocked. Commands matching dangerous patterns return a warning alongside the output.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to run.' },
        cwd: { type: 'string', description: 'Working directory for the command.' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 15000, max 60000).' },
      },
      required: ['command'],
    },
  },
  handler: async (args) => {
    const command = (args.command || '').trim()
    if (!command) {
      return { content: [{ type: 'text', text: 'command is required.' }], isError: true }
    }
    if (command.length > 2000) {
      return { content: [{ type: 'text', text: 'Command too long (max 2000 characters).' }], isError: true }
    }

    const check = checkCommand(command)
    if (check.blocked) {
      return { content: [{ type: 'text', text: check.reason }], isError: true }
    }

    const timeoutMs = Math.min(Number(args.timeout_ms) || 15000, 60000)

    try {
      const { stdout, stderr } = await execPromise(command, {
        cwd: args.cwd || process.cwd(),
        timeout: timeoutMs,
      })

      const warningLine = check.warnings?.length
        ? `⚠️  Warning: ${check.warnings.join(', ')}\n\n`
        : ''

      return {
        content: [{
          type: 'text',
          text: `${warningLine}Output:\n${stdout}${stderr ? `\nStderr:\n${stderr}` : ''}`,
        }],
      }
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Command failed: ${error.message}` }],
        isError: true,
      }
    }
  },
}

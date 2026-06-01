const fs = require('fs')
const path = require('path')
const os = require('os')

const REMINDERS_FILE = path.join(os.homedir(), '.jifile-reminders.json')

module.exports = {
  name: 'list_reminders',
  definition: {
    name: 'list_reminders',
    description: 'List all scheduled reminders — pending, fired, and cancelled. Shows reminder title, message, scheduled time, and current status.',
    inputSchema: {
      type: 'object',
      properties: {
        status_filter: { type: 'string', enum: ['all', 'pending', 'fired', 'cancelled'], description: 'Filter by status. Default: all.' },
      },
    },
  },
  handler: async (args) => {
    if (!fs.existsSync(REMINDERS_FILE)) {
      return { content: [{ type: 'text', text: JSON.stringify({ reminders: [], count: 0 }) }] }
    }

    let reminders = []
    try { reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')) } catch { reminders = [] }

    const filter = args.status_filter || 'all'
    const filtered = filter === 'all' ? reminders : reminders.filter(r => r.status === filter)

    const now = new Date()
    const output = filtered.map(r => ({
      id: r.id,
      title: r.title,
      message: r.message,
      fire_at: r.fireAt,
      status: r.status,
      email_to: r.emailTo || null,
      time_remaining: r.status === 'pending' ? formatTimeRemaining(new Date(r.fireAt), now) : null,
      created_at: r.createdAt,
    }))

    return { content: [{ type: 'text', text: JSON.stringify({ reminders: output, count: output.length }) }] }
  },
}

function formatTimeRemaining(fireAt, now) {
  const diff = fireAt - now
  if (diff <= 0) return 'overdue'
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

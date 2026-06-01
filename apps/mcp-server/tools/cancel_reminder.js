const fs = require('fs')
const path = require('path')
const os = require('os')

const REMINDERS_FILE = path.join(os.homedir(), '.jifile-reminders.json')

let activeJobsRef = null

function setActiveJobs(ref) {
  activeJobsRef = ref
}

module.exports = {
  name: 'cancel_reminder',
  definition: {
    name: 'cancel_reminder',
    description: 'Cancel a pending reminder by its ID. Use list_reminders to find the ID. Cancelled reminders will not fire.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Reminder ID from list_reminders.' },
        cancel_all: { type: 'boolean', description: 'Cancel ALL pending reminders.' },
      },
    },
  },
  handler: async (args) => {
    if (!fs.existsSync(REMINDERS_FILE)) {
      return { content: [{ type: 'text', text: 'No reminders found.' }], isError: true }
    }

    let reminders = []
    try { reminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')) } catch {
      return { content: [{ type: 'text', text: 'Failed to read reminders file.' }], isError: true }
    }

    if (args.cancel_all) {
      const pending = reminders.filter(r => r.status === 'pending')
      if (activeJobsRef) {
        for (const r of pending) {
          const job = activeJobsRef.get(r.id)
          if (job) { job.cancel(); activeJobsRef.delete(r.id) }
        }
      }
      const updated = reminders.map(r => r.status === 'pending' ? { ...r, status: 'cancelled' } : r)
      fs.writeFileSync(REMINDERS_FILE, JSON.stringify(updated, null, 2))
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, cancelled: pending.length, message: `Cancelled ${pending.length} pending reminder(s).` }) }] }
    }

    if (!args.id) {
      return { content: [{ type: 'text', text: 'Provide either id or cancel_all=true.' }], isError: true }
    }

    const reminder = reminders.find(r => r.id === args.id)
    if (!reminder) {
      return { content: [{ type: 'text', text: `Reminder not found: ${args.id}` }], isError: true }
    }
    if (reminder.status !== 'pending') {
      return { content: [{ type: 'text', text: `Reminder is already ${reminder.status}, cannot cancel.` }], isError: true }
    }

    if (activeJobsRef) {
      const job = activeJobsRef.get(args.id)
      if (job) { job.cancel(); activeJobsRef.delete(args.id) }
    }

    const updated = reminders.map(r => r.id === args.id ? { ...r, status: 'cancelled' } : r)
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(updated, null, 2))

    return { content: [{ type: 'text', text: JSON.stringify({ success: true, id: args.id, title: reminder.title, message: `Reminder "${reminder.title}" cancelled.` }) }] }
  },
  setActiveJobs,
}

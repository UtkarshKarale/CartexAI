const schedule = require('node-schedule')
const notifier = require('node-notifier')
const nodemailer = require('nodemailer')
const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')

const REMINDERS_FILE = path.join(os.homedir(), '.jifile-reminders.json')

const activeJobs = new Map()

function loadReminders() {
  if (!fs.existsSync(REMINDERS_FILE)) return []
  try { return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')) } catch { return [] }
}

function saveReminders(reminders) {
  fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2))
}

const AUTH_FILE = path.join(os.homedir(), '.jifile-google-auth.json')

function getGmailClient() {
  if (!fs.existsSync(AUTH_FILE)) return null
  try {
    const stored = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    if (!stored.tokens) return null
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') return null
    const { google } = require('googleapis')
    const client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:4002/callback')
    client.setCredentials(stored.tokens)
    client.on('tokens', (newTokens) => {
      stored.tokens = { ...stored.tokens, ...newTokens }
      fs.writeFileSync(AUTH_FILE, JSON.stringify(stored, null, 2))
    })
    return { client, email: stored.email }
  } catch { return null }
}

async function sendEmailViaGmail(auth, reminder) {
  const { google } = require('googleapis')
  const gmail = google.gmail({ version: 'v1', auth: auth.client })
  const subject = reminder.emailSubject
  const body = reminder.emailBody || reminder.message
  const to = reminder.emailTo
  const from = auth.email
  const boundary = `boundary_${Date.now()}`
  const raw = [
    `From: ${from}`, `To: ${to}`, `Subject: ${subject}`,
    'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '', `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', body, `--${boundary}--`,
  ].join('\r\n')
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: Buffer.from(raw).toString('base64url') } })
}

async function sendEmailViaSMTP(reminder) {
  const host = process.env.SMTP_HOST || ''
  const user = process.env.SMTP_USER || ''
  const pass = process.env.SMTP_PASS || ''
  if (!host || !user || !pass) return
  const transporter = nodemailer.createTransport({
    host, port: parseInt(process.env.SMTP_PORT || '587'), secure: false, auth: { user, pass },
  })
  await transporter.sendMail({
    from: process.env.SMTP_FROM || user,
    to: reminder.emailTo,
    subject: reminder.emailSubject,
    text: reminder.emailBody || reminder.message,
  })
}

async function fireReminder(reminder) {
  notifier.notify({ title: reminder.title, message: reminder.message, sound: true, wait: false })

  if (reminder.emailTo && reminder.emailSubject) {
    const gmailAuth = getGmailClient()
    if (gmailAuth) {
      await sendEmailViaGmail(gmailAuth, reminder).catch(() => sendEmailViaSMTP(reminder).catch(() => {}))
    } else {
      await sendEmailViaSMTP(reminder).catch(() => {})
    }
  }

  const reminders = loadReminders()
  saveReminders(reminders.map(r => r.id === reminder.id ? { ...r, status: 'fired' } : r))
  activeJobs.delete(reminder.id)
}

function scheduleJob(reminder) {
  const fireAt = new Date(reminder.fireAt)
  if (fireAt <= new Date()) return

  const job = schedule.scheduleJob(fireAt, () => fireReminder(reminder))
  if (job) activeJobs.set(reminder.id, job)
}

function restoreReminders() {
  const reminders = loadReminders()
  const now = new Date()
  for (const r of reminders) {
    if (r.status === 'pending' && new Date(r.fireAt) > now) {
      scheduleJob(r)
    }
  }
}

module.exports = {
  _activeJobs: activeJobs,
  name: 'schedule_reminder',
  definition: {
    name: 'schedule_reminder',
    description: 'Schedule a reminder notification OR a timed email send — use this whenever the user says "send at [time]", "email at 5pm", "remind me at", "schedule for later", or any future time reference. Supports natural language: "in 30 minutes", "tomorrow at 9am", "today at 5pm", "at 3pm", or ISO 8601. Uses Gmail API if connected, falls back to SMTP. IMPORTANT: always use this tool instead of saying you cannot schedule — you CAN schedule emails for any future time.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Reminder title shown in the notification.' },
        message: { type: 'string', description: 'Reminder message/body.' },
        fire_at: { type: 'string', description: 'When to fire: ISO 8601 datetime like "2024-01-15T10:00:00" or relative like "in 30 minutes", "in 2 hours", "tomorrow 9am".' },
        email_to: { type: 'string', description: 'Optional: also send a reminder email to this address.' },
        email_subject: { type: 'string', description: 'Email subject (required if email_to is set).' },
        email_body: { type: 'string', description: 'Email body text (defaults to message).' },
      },
      required: ['title', 'message', 'fire_at'],
    },
  },
  handler: async (args) => {
    const { title, message, fire_at, email_to, email_subject, email_body } = args

    let fireAt = parseFireAt(fire_at)
    if (!fireAt || fireAt <= new Date()) {
      return { content: [{ type: 'text', text: `Could not parse time "${fire_at}" or it is in the past. Use ISO format like "2024-01-15T10:00:00" or relative like "in 30 minutes".` }], isError: true }
    }

    const reminder = {
      id: crypto.randomBytes(6).toString('hex'),
      title,
      message,
      fireAt: fireAt.toISOString(),
      emailTo: email_to || null,
      emailSubject: email_subject || null,
      emailBody: email_body || null,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    const reminders = loadReminders()
    reminders.push(reminder)
    saveReminders(reminders)
    scheduleJob(reminder)

    const when = fireAt.toLocaleString()
    const emailNote = email_to ? ` An email will also be sent to ${email_to}.` : ''
    return { content: [{ type: 'text', text: JSON.stringify({ success: true, id: reminder.id, fire_at: reminder.fireAt, message: `Reminder scheduled for ${when}.${emailNote}` }) }] }
  },
  restoreReminders,
}

function parseFireAt(input) {
  if (!input) return null
  const s = input.trim().toLowerCase()

  const iso = new Date(input)
  if (!isNaN(iso.getTime())) return iso

  const now = new Date()

  const inMatch = s.match(/^in\s+(\d+(?:\.\d+)?)\s+(second|minute|hour|day|week)s?$/)
  if (inMatch) {
    const amount = parseFloat(inMatch[1])
    const unit = inMatch[2]
    const ms = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[unit]
    return new Date(now.getTime() + amount * ms)
  }

  if (s === 'tomorrow' || s.startsWith('tomorrow ')) {
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    const timePart = s.replace('tomorrow', '').trim()
    if (timePart) {
      const t = parseTimeOnly(timePart)
      if (t) { d.setHours(t.h, t.m, 0, 0) }
    } else {
      d.setHours(9, 0, 0, 0)
    }
    return d
  }

  if (s === 'today' || s.startsWith('today ')) {
    const d = new Date(now)
    const timePart = s.replace('today', '').trim()
    if (timePart) {
      const t = parseTimeOnly(timePart)
      if (t) { d.setHours(t.h, t.m, 0, 0) }
    }
    return d
  }

  const timeOnly = parseTimeOnly(s)
  if (timeOnly) {
    const d = new Date(now)
    d.setHours(timeOnly.h, timeOnly.m, 0, 0)
    if (d <= now) d.setDate(d.getDate() + 1)
    return d
  }

  return null
}

function parseTimeOnly(s) {
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (m12) {
    let h = parseInt(m12[1])
    const min = parseInt(m12[2] || '0')
    const ampm = m12[3]
    if (ampm === 'pm' && h < 12) h += 12
    if (ampm === 'am' && h === 12) h = 0
    return { h, m: min }
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/)
  if (m24) return { h: parseInt(m24[1]), m: parseInt(m24[2]) }
  return null
}
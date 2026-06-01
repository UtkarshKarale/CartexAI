const { google } = require('googleapis')
const fs = require('fs')
const path = require('path')
const os = require('os')

const AUTH_FILE = path.join(os.homedir(), '.jifile-google-auth.json')

function getOAuthClient() {
  if (!fs.existsSync(AUTH_FILE)) return null
  try {
    const stored = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'))
    if (!stored.tokens) return null
    const clientId = process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
    if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') return null
    const client = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost:4002/callback')
    client.setCredentials(stored.tokens)
    client.on('tokens', (newTokens) => {
      stored.tokens = { ...stored.tokens, ...newTokens }
      fs.writeFileSync(AUTH_FILE, JSON.stringify(stored, null, 2))
    })
    return client
  } catch { return null }
}

function decodeBody(payload) {
  if (!payload) return ''
  if (payload.body && payload.body.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf8')
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        const html = Buffer.from(part.body.data, 'base64').toString('utf8')
        return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }
  return ''
}

function getHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())
  return h ? h.value : ''
}

module.exports = {
  name: 'gmail_list_inbox',
  definition: {
    name: 'gmail_list_inbox',
    description: 'List recent Gmail inbox emails. Returns sender, subject, snippet, date, and read status. Use gmail_read_email to get full content. Call gmail_auth first if not connected.',
    inputSchema: {
      type: 'object',
      properties: {
        max_results: { type: 'number', description: 'Maximum number of emails to return (default 10, max 50).' },
        query: { type: 'string', description: 'Gmail search query (e.g. "is:unread", "from:boss@company.com", "subject:invoice"). Default: inbox.' },
        include_body: { type: 'boolean', description: 'Include email body preview (first 300 chars). Default false for speed.' },
      },
    },
  },
  handler: async (args) => {
    const auth = getOAuthClient()
    if (!auth) {
      return { content: [{ type: 'text', text: 'Gmail not connected. Please call gmail_auth with action=auth first.' }], isError: true }
    }

    const gmail = google.gmail({ version: 'v1', auth })
    const maxResults = Math.min(Number(args.max_results) || 10, 50)
    const q = args.query || 'in:inbox'

    const listRes = await gmail.users.messages.list({ userId: 'me', maxResults, q })
    const messages = listRes.data.messages || []

    if (messages.length === 0) {
      return { content: [{ type: 'text', text: JSON.stringify({ emails: [], query: q, count: 0 }) }] }
    }

    const emails = await Promise.all(messages.map(async (m) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: m.id,
        format: args.include_body ? 'full' : 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date'],
      })
      const d = detail.data
      const headers = d.payload?.headers || []
      const email = {
        id: d.id,
        thread_id: d.threadId,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        snippet: d.snippet || '',
        is_unread: (d.labelIds || []).includes('UNREAD'),
        labels: (d.labelIds || []).filter(l => !['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'].includes(l)),
      }
      if (args.include_body) {
        const body = decodeBody(d.payload)
        email.body_preview = body.slice(0, 300)
      }
      return email
    }))

    const unreadCount = emails.filter(e => e.is_unread).length
    return { content: [{ type: 'text', text: JSON.stringify({ emails, count: emails.length, unread: unreadCount, query: q }) }] }
  },
}

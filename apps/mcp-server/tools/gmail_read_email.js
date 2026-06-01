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
  if (!payload) return { text: '', html: '' }
  let text = ''
  let html = ''

  function extractParts(part) {
    if (!part) return
    if (part.mimeType === 'text/plain' && part.body?.data) {
      text += Buffer.from(part.body.data, 'base64').toString('utf8')
    } else if (part.mimeType === 'text/html' && part.body?.data) {
      html += Buffer.from(part.body.data, 'base64').toString('utf8')
    } else if (part.parts) {
      for (const p of part.parts) extractParts(p)
    }
  }

  extractParts(payload)
  if (!text && html) {
    text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  }
  return { text, html }
}

function getHeader(headers, name) {
  const h = (headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())
  return h ? h.value : ''
}

function extractAttachments(payload) {
  const attachments = []
  function walk(part) {
    if (!part) return
    if (part.filename && part.body?.attachmentId) {
      attachments.push({ filename: part.filename, mime_type: part.mimeType, size: part.body.size || 0, attachment_id: part.body.attachmentId })
    }
    if (part.parts) for (const p of part.parts) walk(p)
  }
  walk(payload)
  return attachments
}

module.exports = {
  name: 'gmail_read_email',
  definition: {
    name: 'gmail_read_email',
    description: 'Read the full content of a Gmail email by its ID. Returns full body, all headers, and attachment list. Use the email ID from gmail_list_inbox.',
    inputSchema: {
      type: 'object',
      properties: {
        email_id: { type: 'string', description: 'Gmail message ID from gmail_list_inbox.' },
        mark_as_read: { type: 'boolean', description: 'Mark email as read after fetching. Default true.' },
      },
      required: ['email_id'],
    },
  },
  handler: async (args) => {
    const auth = getOAuthClient()
    if (!auth) {
      return { content: [{ type: 'text', text: 'Gmail not connected. Please call gmail_auth with action=auth first.' }], isError: true }
    }

    const gmail = google.gmail({ version: 'v1', auth })

    const detail = await gmail.users.messages.get({ userId: 'me', id: args.email_id, format: 'full' })
    const d = detail.data
    const headers = d.payload?.headers || []
    const { text, html } = decodeBody(d.payload)
    const attachments = extractAttachments(d.payload)

    if (args.mark_as_read !== false && (d.labelIds || []).includes('UNREAD')) {
      await gmail.users.messages.modify({ userId: 'me', id: args.email_id, requestBody: { removeLabelIds: ['UNREAD'] } }).catch(() => {})
    }

    const result = {
      id: d.id,
      thread_id: d.threadId,
      from: getHeader(headers, 'From'),
      to: getHeader(headers, 'To'),
      cc: getHeader(headers, 'Cc'),
      subject: getHeader(headers, 'Subject'),
      date: getHeader(headers, 'Date'),
      reply_to: getHeader(headers, 'Reply-To'),
      body: text || '(no plain text body)',
      has_html: html.length > 0,
      attachments,
      labels: d.labelIds || [],
    }

    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  },
}

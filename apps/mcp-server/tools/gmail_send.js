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

function buildRawEmail({ from, to, cc, subject, text, html, replyToMessageId, threadId }) {
  const boundary = `boundary_${Date.now().toString(16)}`
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    replyToMessageId ? `In-Reply-To: ${replyToMessageId}` : null,
    replyToMessageId ? `References: ${replyToMessageId}` : null,
  ].filter(Boolean).join('\r\n')

  const textPart = `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text || ''}`
  const htmlPart = html ? `--${boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}` : ''
  const raw = `${headers}\r\n\r\n${textPart}\r\n${htmlPart ? htmlPart + '\r\n' : ''}--${boundary}--`

  return Buffer.from(raw).toString('base64url')
}

module.exports = {
  name: 'gmail_send',
  definition: {
    name: 'gmail_send',
    description: 'Send an email via Gmail API (OAuth2 — preferred over send_email_smtp when Gmail is connected). Can send new emails or reply to existing threads. Always check gmail_auth status first — if connected, use this tool. If not connected, fall back to send_email_smtp.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address(es), comma-separated.' },
        subject: { type: 'string', description: 'Email subject.' },
        body: { type: 'string', description: 'Plain text email body.' },
        html_body: { type: 'string', description: 'Optional HTML email body.' },
        cc: { type: 'string', description: 'CC recipients, comma-separated.' },
        reply_to_email_id: { type: 'string', description: 'Gmail message ID to reply to (keeps the thread).' },
        thread_id: { type: 'string', description: 'Thread ID to reply in (use with reply_to_email_id).' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  handler: async (args) => {
    const auth = getOAuthClient()
    if (!auth) {
      return { content: [{ type: 'text', text: 'Gmail not connected. Please call gmail_auth with action=auth first.' }], isError: true }
    }

    const gmail = google.gmail({ version: 'v1', auth })
    const profile = await gmail.users.getProfile({ userId: 'me' })
    const from = profile.data.emailAddress

    let replyToMessageId = null
    if (args.reply_to_email_id) {
      const msg = await gmail.users.messages.get({ userId: 'me', id: args.reply_to_email_id, format: 'metadata', metadataHeaders: ['Message-ID'] })
      const msgIdHeader = (msg.data.payload?.headers || []).find(h => h.name === 'Message-ID')
      if (msgIdHeader) replyToMessageId = msgIdHeader.value
    }

    const raw = buildRawEmail({
      from,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      text: args.body,
      html: args.html_body,
      replyToMessageId,
      threadId: args.thread_id,
    })

    const sendRes = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw,
        threadId: args.thread_id || undefined,
      },
    })

    return {
      content: [{ type: 'text', text: JSON.stringify({ success: true, message_id: sendRes.data.id, thread_id: sendRes.data.threadId, to: args.to, subject: args.subject }) }],
    }
  },
}

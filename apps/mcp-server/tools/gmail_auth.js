const { google } = require('googleapis')
const http = require('http')
const fs = require('fs')
const path = require('path')
const os = require('os')

const AUTH_FILE = path.join(os.homedir(), '.jifile-google-auth.json')
const REDIRECT_PORT = 4002
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive.file',
]

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID || ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''
  if (!clientId || clientId === 'YOUR_GOOGLE_CLIENT_ID') return null
  return { clientId, clientSecret }
}

function loadTokens() {
  if (!fs.existsSync(AUTH_FILE)) return null
  try { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) } catch { return null }
}

function saveTokens(data) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2))
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Gmail connected!</h2><p>You can close this tab and return to jifile.ai.</p></body></html>')
        server.close()
        resolve(code)
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>Auth failed</h2><p>' + (error || 'No code received') + '</p></body></html>')
        server.close()
        reject(new Error(error || 'No auth code received'))
      }
    })
    server.listen(REDIRECT_PORT, () => {})
    server.on('error', reject)
    setTimeout(() => { server.close(); reject(new Error('Auth timed out after 5 minutes')) }, 5 * 60 * 1000)
  })
}

module.exports = {
  name: 'gmail_auth',
  definition: {
    name: 'gmail_auth',
    description: 'Connect Gmail via Sign in with Google (OAuth2). Use action=auth to open browser and connect, action=status to check connection, action=disconnect to remove saved tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['auth', 'status', 'disconnect'],
          description: 'auth = open browser to sign in with Google, status = check connection, disconnect = remove saved tokens.',
        },
      },
      required: ['action'],
    },
  },
  handler: async (args) => {
    const action = args.action || 'status'

    if (action === 'status') {
      const stored = loadTokens()
      if (!stored || !stored.tokens) {
        return { content: [{ type: 'text', text: JSON.stringify({ connected: false, message: 'Gmail not connected. Call gmail_auth with action=auth to sign in with Google.' }) }] }
      }
      return { content: [{ type: 'text', text: JSON.stringify({ connected: true, email: stored.email || 'unknown', message: `Gmail connected as ${stored.email}.` }) }] }
    }

    if (action === 'disconnect') {
      if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE)
      return { content: [{ type: 'text', text: JSON.stringify({ success: true, message: 'Gmail disconnected.' }) }] }
    }

    if (action === 'auth') {
      const creds = getCredentials()
      if (!creds) {
        return {
          content: [{ type: 'text', text: 'Google OAuth credentials are not configured in the app. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' }],
          isError: true,
        }
      }

      const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, REDIRECT_URI)
      const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' })

      const { default: openBrowser } = await import('open')
      await openBrowser(authUrl)

      const code = await waitForCode()
      const { tokens } = await oauth2Client.getToken(code)
      oauth2Client.setCredentials(tokens)

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
      const profile = await gmail.users.getProfile({ userId: 'me' })
      const email = profile.data.emailAddress

      saveTokens({ tokens, email })

      return { content: [{ type: 'text', text: JSON.stringify({ success: true, email, message: `Gmail connected as ${email}` }) }] }
    }

    return { content: [{ type: 'text', text: 'Unknown action. Use: auth, status, or disconnect.' }], isError: true }
  },
}

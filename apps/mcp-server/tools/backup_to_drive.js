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

async function uploadFile(drive, filePath, driveParentId) {
  const name = path.basename(filePath)
  const mimeType = guessMime(filePath)
  const res = await drive.files.create({
    requestBody: { name, parents: driveParentId ? [driveParentId] : [] },
    media: { mimeType, body: fs.createReadStream(filePath) },
    fields: 'id,name,webViewLink',
  })
  return res.data
}

async function uploadFolder(drive, folderPath, driveParentId) {
  const name = path.basename(folderPath)
  const folderRes = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: driveParentId ? [driveParentId] : [] },
    fields: 'id,name',
  })
  const folderId = folderRes.data.id
  const entries = fs.readdirSync(folderPath, { withFileTypes: true })
  const results = []
  for (const entry of entries) {
    const full = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      const sub = await uploadFolder(drive, full, folderId)
      results.push(...sub)
    } else {
      const f = await uploadFile(drive, full, folderId)
      results.push(f)
    }
  }
  return results
}

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.mp4': 'video/mp4',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel', '.csv': 'text/csv',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword', '.txt': 'text/plain',
    '.json': 'application/json', '.zip': 'application/zip',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  }
  return map[ext] || 'application/octet-stream'
}

module.exports = {
  name: 'backup_to_drive',
  definition: {
    name: 'backup_to_drive',
    description: 'Upload a file or entire folder to Google Drive. Uses the same Google account connected via gmail_auth — no extra setup needed. Returns Drive links for all uploaded files. Use this to move or back up any local file to the user\'s Google Drive.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Absolute path to the local file or folder to upload.' },
        drive_folder_id: { type: 'string', description: 'Optional Google Drive folder ID to upload into. Leave blank to upload to Drive root.' },
        drive_folder_name: { type: 'string', description: 'Optional: create/find a named folder in Drive root and upload there (e.g. "My Backups").' },
      },
      required: ['source'],
    },
  },
  handler: async (args) => {
    const auth = getOAuthClient()
    if (!auth) {
      return { content: [{ type: 'text', text: 'Google account not connected. Please call gmail_auth with action=auth first — Drive uses the same account.' }], isError: true }
    }

    const sourcePath = path.resolve(args.source)
    if (!fs.existsSync(sourcePath)) {
      return { content: [{ type: 'text', text: `Source not found: ${sourcePath}` }], isError: true }
    }

    const drive = google.drive({ version: 'v3', auth })
    let parentId = args.drive_folder_id || null

    if (!parentId && args.drive_folder_name) {
      const search = await drive.files.list({
        q: `name='${args.drive_folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id,name)',
        pageSize: 1,
      })
      if (search.data.files && search.data.files.length > 0) {
        parentId = search.data.files[0].id
      } else {
        const created = await drive.files.create({
          requestBody: { name: args.drive_folder_name, mimeType: 'application/vnd.google-apps.folder' },
          fields: 'id',
        })
        parentId = created.data.id
      }
    }

    const stat = fs.statSync(sourcePath)
    let uploaded = []

    if (stat.isDirectory()) {
      uploaded = await uploadFolder(drive, sourcePath, parentId)
    } else {
      const f = await uploadFile(drive, sourcePath, parentId)
      uploaded = [f]
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          success: true,
          source: sourcePath,
          files_uploaded: uploaded.length,
          files: uploaded.map(f => ({ name: f.name, id: f.id, link: f.webViewLink })),
          message: `Uploaded ${uploaded.length} file(s) to Google Drive.`,
        }),
      }],
    }
  },
}

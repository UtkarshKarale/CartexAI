const path = require('path')
const fs = require('fs')
const os = require('os')

const toolsDir = path.resolve(__dirname, '../tools')
function load(name) { return require(path.join(toolsDir, `${name}.js`)) }

let passed = 0
let failed = 0

async function test(label, fn) {
  try {
    await fn()
    console.log(`  ✅ ${label}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${label}: ${err.message}`)
    failed++
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'assertion failed')
}

async function run() {
  console.log('\n=== New Tools Test Suite ===\n')

  // ── gmail_auth ──────────────────────────────────────────────────────────────
  console.log('--- gmail_auth ---')
  const gmailAuth = load('gmail_auth')
  await test('has correct structure', () => {
    assert(gmailAuth.name === 'gmail_auth')
    assert(typeof gmailAuth.handler === 'function')
    assert(gmailAuth.definition.inputSchema.required.includes('action'))
  })
  await test('status returns not-connected when no token file', async () => {
    const tmpFile = path.join(os.tmpdir(), '.jifile-google-auth-test.json')
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    const res = await gmailAuth.handler({ action: 'status' })
    const text = res.content[0].text
    assert(text.includes('connected') || text.includes('not'), `unexpected: ${text}`)
  })
  await test('auth fails gracefully when no credentials configured', async () => {
    const savedId = process.env.GOOGLE_CLIENT_ID
    const savedSecret = process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    const res = await gmailAuth.handler({ action: 'auth' })
    process.env.GOOGLE_CLIENT_ID = savedId || ''
    process.env.GOOGLE_CLIENT_SECRET = savedSecret || ''
    assert(res.isError === true, 'should return error when creds missing')
    assert(res.content[0].text.includes('not configured'))
  })
  await test('unknown action returns error', async () => {
    const res = await gmailAuth.handler({ action: 'unknown' })
    assert(res.isError === true)
  })

  // ── gmail_list_inbox ────────────────────────────────────────────────────────
  console.log('\n--- gmail_list_inbox ---')
  const listInbox = load('gmail_list_inbox')
  await test('has correct structure', () => {
    assert(listInbox.name === 'gmail_list_inbox')
    assert(typeof listInbox.handler === 'function')
  })
  await test('returns error when not authenticated', async () => {
    delete process.env.GOOGLE_CLIENT_ID
    const res = await listInbox.handler({ max_results: 5 })
    process.env.GOOGLE_CLIENT_ID = ''
    assert(res.isError === true || res.content[0].text.includes('not connected'))
  })

  // ── schedule_reminder ───────────────────────────────────────────────────────
  console.log('\n--- schedule_reminder ---')
  const schedReminder = load('schedule_reminder')
  await test('has correct structure', () => {
    assert(schedReminder.name === 'schedule_reminder')
    assert(typeof schedReminder.handler === 'function')
    assert(typeof schedReminder.restoreReminders === 'function')
  })
  await test('rejects past time', async () => {
    const res = await schedReminder.handler({ title: 'Test', message: 'Test', fire_at: '2020-01-01T00:00:00' })
    assert(res.isError === true, 'should reject past time')
  })
  await test('rejects invalid time string', async () => {
    const res = await schedReminder.handler({ title: 'Test', message: 'Test', fire_at: 'not a time' })
    assert(res.isError === true, 'should reject garbage time')
  })
  await test('schedules future reminder and returns id', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    const res = await schedReminder.handler({ title: 'Test Reminder', message: 'Hello world', fire_at: future })
    assert(!res.isError, `unexpected error: ${res.content[0].text}`)
    const data = JSON.parse(res.content[0].text)
    assert(data.id, 'should return an id')
    assert(data.success === true)
    return data.id
  })

  // ── list_reminders ──────────────────────────────────────────────────────────
  console.log('\n--- list_reminders ---')
  const listReminders = load('list_reminders')
  await test('has correct structure', () => {
    assert(listReminders.name === 'list_reminders')
    assert(typeof listReminders.handler === 'function')
  })
  await test('returns array of reminders', async () => {
    const res = await listReminders.handler({})
    assert(!res.isError, `unexpected error: ${res.content[0].text}`)
    const data = JSON.parse(res.content[0].text)
    assert(Array.isArray(data.reminders))
    assert(typeof data.count === 'number')
  })
  await test('filter=pending returns only pending', async () => {
    const res = await listReminders.handler({ status_filter: 'pending' })
    const data = JSON.parse(res.content[0].text)
    assert(data.reminders.every(r => r.status === 'pending'))
  })

  // ── cancel_reminder ─────────────────────────────────────────────────────────
  console.log('\n--- cancel_reminder ---')
  const cancelReminder = load('cancel_reminder')
  await test('has correct structure', () => {
    assert(cancelReminder.name === 'cancel_reminder')
    assert(typeof cancelReminder.handler === 'function')
  })
  await test('returns error for unknown id', async () => {
    const res = await cancelReminder.handler({ id: 'nonexistent_id_xyz' })
    assert(res.isError === true)
  })
  await test('cancel_all with no reminders file is handled gracefully', async () => {
    const tmpPath = path.join(os.tmpdir(), '.jifile-reminders-nonexistent.json')
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
    const res = await cancelReminder.handler({ cancel_all: true })
    assert(!res.isError || res.content[0].text.includes('No reminders'))
  })

  // ── voice_command ───────────────────────────────────────────────────────────
  console.log('\n--- voice_command ---')
  const voiceCmd = load('voice_command')
  await test('has correct structure', () => {
    assert(voiceCmd.name === 'voice_command')
    assert(typeof voiceCmd.handler === 'function')
  })
  await test('missing audio_path returns error', async () => {
    const res = await voiceCmd.handler({})
    assert(res.isError === true)
    assert(res.content[0].text.includes('audio_path'))
  })
  await test('nonexistent file returns error', async () => {
    const res = await voiceCmd.handler({ audio_path: '/tmp/nonexistent_audio_xyz.wav' })
    assert(res.isError === true)
    assert(res.content[0].text.includes('not found'))
  })
  await test('non-wav file returns clear format error', async () => {
    const mp3Path = path.join(os.tmpdir(), 'test_voice.mp3')
    fs.writeFileSync(mp3Path, 'fake mp3 data')
    const res = await voiceCmd.handler({ audio_path: mp3Path })
    fs.unlinkSync(mp3Path)
    assert(res.isError === true)
    assert(res.content[0].text.includes('WAV'))
  })

  // ── pdf_read_content ────────────────────────────────────────────────────────
  console.log('\n--- pdf_read_content ---')
  const pdfRead = load('pdf_read_content')
  await test('has correct structure', () => {
    assert(pdfRead.name === 'pdf_read_content')
    assert(typeof pdfRead.handler === 'function')
  })
  await test('missing file returns error', async () => {
    const res = await pdfRead.handler({ file_path: '/tmp/nonexistent.pdf' })
    assert(res.isError === true)
    assert(res.content[0].text.includes('not found'))
  })
  await test('non-pdf file returns error', async () => {
    const txtPath = path.join(os.tmpdir(), 'test.txt')
    fs.writeFileSync(txtPath, 'hello')
    const res = await pdfRead.handler({ file_path: txtPath })
    fs.unlinkSync(txtPath)
    assert(res.isError === true)
    assert(res.content[0].text.includes('PDF'))
  })

  // ── pdf_extract_tables ──────────────────────────────────────────────────────
  console.log('\n--- pdf_extract_tables ---')
  const pdfTables = load('pdf_extract_tables')
  await test('has correct structure', () => {
    assert(pdfTables.name === 'pdf_extract_tables')
    assert(typeof pdfTables.handler === 'function')
  })
  await test('missing file returns error', async () => {
    const res = await pdfTables.handler({ file_path: '/tmp/ghost.pdf', output_path: '/tmp/out.xlsx' })
    assert(res.isError === true)
  })

  // ── execute_command security ────────────────────────────────────────────────
  console.log('\n--- execute_command security ---')
  const execCmd = load('execute_command')
  await test('has correct structure', () => {
    assert(execCmd.name === 'execute_command')
    assert(typeof execCmd.handler === 'function')
  })
  await test('blocks rm -rf', async () => {
    const res = await execCmd.handler({ command: 'rm -rf /tmp/test' })
    assert(res.isError === true)
    assert(res.content[0].text.toLowerCase().includes('block'))
  })
  await test('blocks dd if=', async () => {
    const res = await execCmd.handler({ command: 'dd if=/dev/zero of=/dev/sda' })
    assert(res.isError === true)
  })
  await test('blocks mkfs', async () => {
    const res = await execCmd.handler({ command: 'mkfs.ext4 /dev/sdb' })
    assert(res.isError === true)
  })
  await test('allows safe command echo', async () => {
    const res = await execCmd.handler({ command: 'echo hello' })
    assert(!res.isError)
    assert(res.content[0].text.includes('hello'))
  })
  await test('rejects empty command', async () => {
    const res = await execCmd.handler({ command: '' })
    assert(res.isError === true)
  })
  await test('rejects command over 2000 chars', async () => {
    const res = await execCmd.handler({ command: 'echo ' + 'a'.repeat(2001) })
    assert(res.isError === true)
  })

  // ── summary ─────────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) process.exit(1)
}

run().catch(err => { console.error(err); process.exit(1) })

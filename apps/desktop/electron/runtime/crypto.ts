import { randomBytes, pbkdf2Sync, timingSafeEqual, randomUUID } from 'node:crypto'

const ITERATIONS = 120_000
const KEY_LENGTH = 64

export function createCredentialHash(credential: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = pbkdf2Sync(credential, salt, ITERATIONS, KEY_LENGTH, 'sha512').toString('hex')
  return {
    hash: `pbkdf2$${ITERATIONS}$${salt}$${hash}`,
    salt,
  }
}

export function verifyCredential(credential: string, storedHash: string, salt: string) {
  const [algorithm, iterationsText, storedSalt, digest] = storedHash.split('$')
  if (algorithm !== 'pbkdf2') {
    return false
  }

  const iterations = Number(iterationsText)
  const candidate = pbkdf2Sync(credential, storedSalt || salt, iterations || ITERATIONS, KEY_LENGTH, 'sha512')
  const expected = Buffer.from(digest ?? '', 'hex')
  return expected.length === candidate.length && timingSafeEqual(expected, candidate)
}

export function createSessionToken() {
  return randomUUID()
}

export function createId(prefix: string) {
  return `${prefix}-${randomUUID()}`
}


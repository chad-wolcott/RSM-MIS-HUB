// ─────────────────────────────────────────────────────────────────────────────
// RSM Defense MIH — Local User Authentication
//
// Uses the Web Crypto API (SHA-256 + random salt) to hash passwords client-side.
// ⚠️  PROTOTYPE ONLY — in production, hashing and validation must happen
//     server-side with bcrypt/argon2. Never send plaintext passwords over
//     the wire or store them in localStorage.
//
// Password record stored on user object:
//   passwordHash : hex string  (SHA-256 of salt + password)
//   passwordSalt : hex string  (16 random bytes)
// ─────────────────────────────────────────────────────────────────────────────

import { getUsers, updateUser } from './userStore.js'

// ── Crypto helpers ────────────────────────────────────────────────────────────

function randomHex(bytes = 16) {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sha256hex(str) {
  const data = new TextEncoder().encode(str)
  const buf  = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Public: hash a new password (for storing) ────────────────────────────────
export async function hashPassword(plaintext) {
  const salt = randomHex(16)
  const hash = await sha256hex(salt + plaintext)
  return { hash, salt }
}

// ── Public: verify a plaintext password against a stored hash ────────────────
export async function verifyPassword(plaintext, storedHash, storedSalt) {
  const computed = await sha256hex(storedSalt + plaintext)
  return computed === storedHash
}

// ── Public: set (or change) password for a local user ────────────────────────
export async function setUserPassword(userId, plaintext) {
  const { hash, salt } = await hashPassword(plaintext)
  updateUser(userId, { passwordHash: hash, passwordSalt: salt })
}

// ── Public: validate a local login attempt ───────────────────────────────────
// Checks all users with authSource 'local' or 'both' that are active.
// Falls back to the hardcoded bootstrap credential so existing setups keep
// working before the password was explicitly set via the UI.
//
// Returns a session object on success, null on failure.
export async function validateLocalUser(email, password) {
  if (!email || !password) return null

  const normalEmail = email.trim().toLowerCase()
  const users       = getUsers()

  // Find matching user: local or both authSource, not disabled
  const user = users.find(u =>
    (u.authSource === 'local' || u.authSource === 'both') &&
    u.email.toLowerCase() === normalEmail &&
    u.status === 'active'
  )

  if (!user) return null

  // ── Case 1: user has an explicit password hash set via Admin UI ─────────
  if (user.passwordHash && user.passwordSalt) {
    const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt)
    if (!ok) return null
  }
  // ── Case 2: bootstrap fallback — chad.wolcott using legacy hardcoded cred ─
  else if (normalEmail === 'chad.wolcott@rsmus.com') {
    if (password !== 'P@ssword2026') return null
  }
  // ── Case 3: local user exists but no password set yet ──────────────────
  else {
    // Deny — admin must set a password before the account can log in
    return null
  }

  return {
    id:          user.id,
    name:        user.name,
    email:       user.email,
    role:        user.role,
    initials:    (user.initials || user.name.split(' ').map(p => p[0]).join('').slice(0, 2)).toUpperCase(),
    idp:         user.idpLabel || 'Local',
    authMethod:  'local',
    mfaVerified: false,
    loginTime:   new Date().toISOString(),
  }
}

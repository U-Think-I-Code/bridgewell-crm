/**
 * Data Protection & Privacy Module — Bridgewell CRM
 * Implements:
 * 1. Encryption of sensitive fields at rest (AES-256-GCM)
 * 2. Log redactor for passwords, tokens, and PII
 * 3. User account anonymization & GDPR compliant deletion
 * 4. User data export generator
 */

import crypto from 'crypto'

/**
 * 1. ENCRYPTION AT REST
 * Fields designated as sensitive at rest:
 * - Student passport / government ID numbers
 * - Bank statement & financial balances
 * - Meta Access Tokens & Third-Party API secrets
 */
const ENCRYPTION_KEY = process.env.DATA_ENCRYPTION_KEY || 'bridgewell_crm_default_32byte_aes_key_2026!'
const IV_LENGTH = 12 // For AES-GCM
const ALGORITHM = 'aes-256-gcm'

export function encryptSensitiveField(text: string): string {
  if (!text) return text
  // Ensure 32-byte key
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

export function decryptSensitiveField(encryptedPayload: string): string {
  if (!encryptedPayload || !encryptedPayload.includes(':')) return encryptedPayload
  try {
    const [ivHex, authTagHex, encrypted] = encryptedPayload.split(':')
    const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (err) {
    console.error('[Data Protection] Decryption failure:', err)
    return '[ENCRYPTED]'
  }
}

/**
 * 2. LOG REDACTION
 * Automatically strips passwords, tokens, and masks phone numbers/emails from logs
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'secret',
  'authorization',
  'api_key',
  'apikey',
  'session',
  'verify_token',
  'cookie',
])

export function redactSensitiveData(data: any): any {
  if (data === null || data === undefined) return data

  if (typeof data === 'string') {
    // Mask potential email addresses: a***v@domain.com
    let sanitized = data.replace(
      /\b([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
      '$1***@$2'
    )
    // Mask potential phone numbers (keep last 4 digits): +91 98****3210
    sanitized = sanitized.replace(
      /\+?([0-9]{1,3})?[-. ]?([0-9]{3,4})[-. ]?([0-9]{3,4})[-. ]?([0-9]{4})\b/g,
      '***-***-$4'
    )
    return sanitized
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item))
  }

  if (typeof data === 'object') {
    const cleaned: Record<string, any> = {}
    for (const key of Object.keys(data)) {
      const lower = key.toLowerCase()
      if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('token') || lower.includes('secret')) {
        cleaned[key] = '[REDACTED]'
      } else {
        cleaned[key] = redactSensitiveData(data[key])
      }
    }
    return cleaned
  }

  return data
}

/**
 * Safe logger that redacts sensitive PII and secrets before writing to console
 */
export const safeLogger = {
  info: (msg: string, ...meta: any[]) => {
    console.log(`[INFO] ${msg}`, ...meta.map(m => redactSensitiveData(m)))
  },
  warn: (msg: string, ...meta: any[]) => {
    console.warn(`[WARN] ${msg}`, ...meta.map(m => redactSensitiveData(m)))
  },
  error: (msg: string, ...meta: any[]) => {
    console.error(`[ERROR] ${msg}`, ...meta.map(m => redactSensitiveData(m)))
  },
}

/**
 * 3. USER ANONYMIZATION (Account Deletion / Right to be Forgotten)
 * Permanently anonymizes user credentials while preserving referential integrity for past logs
 */
export function buildAnonymizedUserPayload(userId: string) {
  const shortId = userId.slice(0, 8)
  return {
    name: `Deactivated User (${shortId})`,
    email: `anonymized_${shortId}@deleted.bridgewell.internal`,
    auth_id: null,
    status: 'offline',
    active: false,
    deleted_at: new Date().toISOString(),
  }
}

/**
 * 4. DATA EXPORT GENERATOR (Right to Data Portability)
 * Packages all student/counselor related records into structured JSON export
 */
export function buildExportArchive(data: {
  lead: any
  activities: any[]
  documents: any[]
  assignments: any[]
  auditLogs: any[]
}) {
  return {
    export_metadata: {
      exported_at: new Date().toISOString(),
      system: 'Bridgewell CRM',
      format_version: '1.0',
      compliance: 'GDPR / DPDP Data Portability Export',
    },
    lead_profile: data.lead,
    interaction_timeline: data.activities,
    documents_metadata: data.documents,
    counselor_assignment_history: data.assignments,
    change_audit_history: data.auditLogs,
  }
}

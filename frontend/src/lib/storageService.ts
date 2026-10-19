/**
 * Storage Service — Bridgewell CRM Multi-Tenant File Storage
 * Encapsulates validation, organization path scoping, pre-signed upload URL generation,
 * and authorization checks for short-lived download URLs.
 */

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

export const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.doc',
  '.docx',
])

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024 // 25 MB Limit
export const SHORT_LIVED_URL_EXPIRY_SECONDS = 60 // 60 Seconds Expiry for Downloads
export const STORAGE_BUCKET_NAME = 'lead-documents'

export interface StorageValidationInput {
  mime_type: string
  file_size_bytes: number
  file_name: string
  document_type?: string
}

export interface ValidationResult {
  valid: boolean
  error?: string
  status?: number
}

/**
 * Validates file type and size on the server before issuing upload URL
 */
export function validateFileUpload(input: StorageValidationInput): ValidationResult {
  const { mime_type, file_size_bytes, file_name } = input

  if (!file_name || typeof file_name !== 'string' || !file_name.trim()) {
    return { valid: false, error: 'File name is required', status: 400 }
  }

  // File type check
  if (!mime_type || !ALLOWED_MIME_TYPES.has(mime_type.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file type "${mime_type}". Only PDF, JPG, PNG, WEBP, and Word documents are permitted.`,
      status: 400,
    }
  }

  // Extension check against spoofed mime types
  const lowerName = file_name.toLowerCase()
  const hasValidExt = Array.from(ALLOWED_EXTENSIONS).some(ext => lowerName.endsWith(ext))
  if (!hasValidExt) {
    return {
      valid: false,
      error: `Disallowed file extension for file "${file_name}". Permitted extensions: .pdf, .jpg, .png, .webp, .doc, .docx`,
      status: 400,
    }
  }

  // File size check (Must be > 0 and <= 25MB)
  if (typeof file_size_bytes !== 'number' || file_size_bytes <= 0) {
    return {
      valid: false,
      error: 'File size must be a positive number of bytes',
      status: 400,
    }
  }

  if (file_size_bytes > MAX_FILE_SIZE_BYTES) {
    const sizeInMB = (file_size_bytes / (1024 * 1024)).toFixed(2)
    return {
      valid: false,
      error: `File size exceeds the 25MB limit. Uploaded size: ${sizeInMB} MB`,
      status: 400,
    }
  }

  return { valid: true }
}

/**
 * Scopes storage path strictly by organization_id:
 * Format: {organization_id}/{lead_id}/{uuid}-{sanitizedFileName}
 */
export function generateScopedStorageKey(
  organization_id: string,
  lead_id: string,
  file_name: string
): string {
  if (!organization_id || !lead_id) {
    throw new Error('organization_id and lead_id are required to generate storage path')
  }

  const sanitized = file_name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const uniquePrefix = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2, 15)

  return `${organization_id}/${lead_id}/${uniquePrefix}-${sanitized}`
}

/**
 * Authorization check: validates that caller belongs to the same organization
 */
export function verifyOrganizationAccess(
  caller_org_id: string,
  document_org_id: string
): { authorized: boolean; error?: string } {
  if (!caller_org_id || !document_org_id) {
    return { authorized: false, error: 'Missing organization identifier' }
  }

  if (caller_org_id !== document_org_id) {
    return {
      authorized: false,
      error: 'Access denied: You do not have permission to view documents from another organization.',
    }
  }

  return { authorized: true }
}

/**
 * Phone Number Normalization & Deduplication Helper
 * 
 * Normalizes phone numbers across Indian (+91), US (+1), UK (+44), UAE (+971),
 * and other international country codes by matching the core 10 digits.
 */

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length >= 10) {
    return digits.slice(-10)
  }
  return digits
}

export function cleanPhoneForDialing(phone: string | null | undefined): string {
  if (!phone) return ''
  return String(phone).trim().replace(/[^\d+]/g, '')
}

/**
 * Checks whether two phone numbers represent the same student.
 * Compares core 10 digits (ignoring spaces, dashes, leading 0, +91, +1, etc.)
 */
export function isSamePhoneNumber(phoneA: string | null | undefined, phoneB: string | null | undefined): boolean {
  const normA = normalizePhone(phoneA)
  const normB = normalizePhone(phoneB)
  if (!normA || !normB) return false
  if (normA.length < 7 || normB.length < 7) return false
  return normA === normB
}

/**
 * Finds if a lead already exists in an array of leads by matching:
 * 1. Normalized 10-digit phone number
 * 2. Or lowercase email address
 */
export function findExistingLeadMatch(
  leadsPool: Array<{ id: string; phone?: string | null; email?: string | null; name?: string | null; stage?: string | null; owner_id?: string | null }>,
  targetPhone: string | null | undefined,
  targetEmail?: string | null | undefined
): any | null {
  const normTargetPhone = normalizePhone(targetPhone)
  const normTargetEmail = (targetEmail || '').trim().toLowerCase()

  for (const lead of leadsPool) {
    if (normTargetPhone && normTargetPhone.length >= 7) {
      const normLeadPhone = normalizePhone(lead.phone)
      if (normLeadPhone === normTargetPhone) {
        return lead
      }
    }
    if (normTargetEmail && lead.email) {
      if (lead.email.trim().toLowerCase() === normTargetEmail) {
        return lead
      }
    }
  }

  return null
}

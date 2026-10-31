/**
 * Phone Number Normalization & Deduplication Helper
 * 
 * Standardizes international numbers to E.164, handles UK (+44) and European
 * domestic trunk prefixes (e.g. +44(0) or +440 -> +44), and categorizes into
 * "UK" vs "Europe (Excluding UK)" vs "Other".
 */

export const EUROPEAN_DIAL_CODES: [string, string][] = [
  ['+351', 'Portugal'],
  ['+352', 'Luxembourg'],
  ['+353', 'Ireland'],
  ['+354', 'Iceland'],
  ['+356', 'Malta'],
  ['+357', 'Cyprus'],
  ['+358', 'Finland'],
  ['+359', 'Bulgaria'],
  ['+370', 'Lithuania'],
  ['+371', 'Latvia'],
  ['+372', 'Estonia'],
  ['+385', 'Croatia'],
  ['+386', 'Slovenia'],
  ['+420', 'Czech Republic'],
  ['+421', 'Slovakia'],
  ['+30', 'Greece'],
  ['+31', 'Netherlands'],
  ['+32', 'Belgium'],
  ['+33', 'France'],
  ['+34', 'Spain'],
  ['+36', 'Hungary'],
  ['+39', 'Italy'],
  ['+40', 'Romania'],
  ['+41', 'Switzerland'],
  ['+43', 'Austria'],
  ['+45', 'Denmark'],
  ['+46', 'Sweden'],
  ['+47', 'Norway'],
  ['+48', 'Poland'],
  ['+49', 'Germany'],
]

export interface PhoneNormalizationResult {
  originalPhone: string
  cleanedE164Phone: string
  countryCode: string
  countryName: string
  region: 'UK' | 'Europe' | 'Other'
  statusNotes: string
  wasFixed: boolean
  isValid: boolean
}

function isUKHint(hint?: string | null): boolean {
  if (!hint) return false
  const h = hint.trim().toLowerCase()
  return h === 'uk' || h === 'united kingdom' || h === 'gb' || h === 'great britain' || h === 'england'
}

function isIndiaHint(hint?: string | null): boolean {
  if (!hint) return false
  const h = hint.trim().toLowerCase()
  return h === 'india' || h === 'in' || h === '+91'
}

/**
 * Normalizes any raw phone number into strict E.164 format and determines region (UK vs Europe)
 */
export function cleanPhoneE164(
  phone: string | null | undefined,
  hintCountry?: string | null
): PhoneNormalizationResult {
  if (!phone) {
    return {
      originalPhone: '',
      cleanedE164Phone: '',
      countryCode: '',
      countryName: '',
      region: 'Other',
      statusNotes: 'Empty phone number',
      wasFixed: false,
      isValid: false
    }
  }

  const original = String(phone).trim()
  const notes: string[] = []
  let temp = original

  // 1. Check and remove domestic trunk (0) pattern like +44(0)... or +44 (0)...
  if (/\(\s*0\s*\)/.test(temp)) {
    temp = temp.replace(/\(\s*0\s*\)/g, '')
    notes.push('Removed leading zero in parentheses (0)')
  }

  // 2. International prefix 00 -> +
  if (/^00\d+/.test(temp)) {
    temp = '+' + temp.slice(2)
    notes.push('Converted prefix 00 to +')
  }

  // 3. Strip all non-digit and non-+ characters
  let clean = temp.replace(/[^0-9+]/g, '')

  // 4. Missing + handling
  if (!clean.startsWith('+')) {
    if (clean.startsWith('44') && clean.length >= 11) {
      clean = '+' + clean
      notes.push('Added missing + sign')
    } else if (clean.startsWith('91') && clean.length >= 12) {
      clean = '+' + clean
      notes.push('Added missing + sign')
    } else if (
      (clean.startsWith('33') || clean.startsWith('49') || clean.startsWith('34') || clean.startsWith('31') || clean.startsWith('39')) &&
      clean.length >= 10
    ) {
      clean = '+' + clean
      notes.push('Added missing + sign')
    } else if (clean.startsWith('353') && clean.length >= 10) {
      clean = '+' + clean
      notes.push('Added missing + sign')
    } else if (isUKHint(hintCountry) && clean.startsWith('0') && clean.length === 11) {
      clean = '+44' + clean.slice(1)
      notes.push('Converted UK local 0 prefix to +44')
    } else if (isUKHint(hintCountry) && clean.length === 10) {
      clean = '+44' + clean
      notes.push('Added UK country code +44')
    } else if (clean.startsWith('0') && clean.length === 11 && /^[6-9]/.test(clean.slice(1))) {
      // Indian domestic STD prefix 0 (e.g. 09876543210 or 07987654321 -> +91...)
      clean = '+91' + clean.slice(1)
      notes.push('Converted India local 0 prefix to +91')
    } else if (clean.length === 10 && /^[6-9]/.test(clean)) {
      // 10-digit Indian mobile number
      clean = '+91' + clean
      notes.push('Added India country code +91')
    } else if (clean.startsWith('0') && clean.length >= 10) {
      clean = '+' + clean.slice(1)
      notes.push('Removed leading 0 and added +')
    } else if (clean.length > 0) {
      clean = '+' + clean
      notes.push('Added missing + sign')
    }
  }

  // 5. CRITICAL LOGIC: Remove leading zero after country code (+440 -> +44, +910 -> +91, +330 -> +33, etc.)
  if (clean.startsWith('+440')) {
    clean = '+44' + clean.slice(4)
    notes.push('Removed extra zero after country code (+440)')
  } else if (clean.startsWith('+910')) {
    clean = '+91' + clean.slice(4)
    notes.push('Removed extra zero after country code (+910)')
  } else if (clean.startsWith('+330')) {
    clean = '+33' + clean.slice(4)
    notes.push('Removed extra zero after country code (+330)')
  } else if (clean.startsWith('+490')) {
    clean = '+49' + clean.slice(4)
    notes.push('Removed extra zero after country code (+490)')
  } else if (clean.startsWith('+310')) {
    clean = '+31' + clean.slice(4)
    notes.push('Removed extra zero after country code (+310)')
  } else if (clean.startsWith('+3530')) {
    clean = '+353' + clean.slice(5)
    notes.push('Removed extra zero after country code (+3530)')
  } else if (clean.startsWith('+340')) {
    clean = '+34' + clean.slice(4)
    notes.push('Removed extra zero after country code (+340)')
  } else if (clean.startsWith('+610')) {
    clean = '+61' + clean.slice(4)
    notes.push('Removed extra zero after country code (+610)')
  }

  // 6. Regional classification (UK vs Europe vs Other)
  let region: 'UK' | 'Europe' | 'Other' = 'Other'
  let countryCode = ''
  let countryName = 'Other'

  if (clean.startsWith('+44')) {
    countryCode = '+44'
    countryName = 'UK'
    region = 'UK'
  } else {
    for (const [code, name] of EUROPEAN_DIAL_CODES) {
      if (clean.startsWith(code)) {
        countryCode = code
        region = 'Europe'
        countryName = name
        break
      }
    }
  }

  if (region === 'Other') {
    if (clean.startsWith('+1')) {
      countryCode = '+1'
      countryName = 'USA'
    } else if (clean.startsWith('+91')) {
      countryCode = '+91'
      countryName = 'India'
    } else if (clean.startsWith('+971')) {
      countryCode = '+971'
      countryName = 'UAE'
    } else if (clean.startsWith('+966')) {
      countryCode = '+966'
      countryName = 'Saudi Arabia'
    } else if (clean.startsWith('+61')) {
      countryCode = '+61'
      countryName = 'Australia'
    } else if (clean.length >= 3) {
      countryCode = clean.slice(0, 3)
    }
  }

  const wasFixed = clean !== original
  const statusNotes = notes.length > 0 ? notes.join(', ') : 'Valid'
  const isValid = clean.length >= 8 && clean.length <= 16 && clean.startsWith('+')

  return {
    originalPhone: original,
    cleanedE164Phone: clean,
    countryCode,
    countryName,
    region,
    statusNotes,
    wasFixed,
    isValid
  }
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const cleaned = cleanPhoneE164(phone).cleanedE164Phone || String(phone)
  const digits = cleaned.replace(/\D/g, '')
  if (digits.length >= 10) {
    return digits.slice(-10)
  }
  return digits
}

export function cleanPhoneForDialing(phone: string | null | undefined): string {
  if (!phone) return ''
  return cleanPhoneE164(phone).cleanedE164Phone
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

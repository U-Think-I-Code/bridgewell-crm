/**
 * Universal Country & Flag Formatting Helper
 * Automatically detects flag emoji for 2-letter ISO codes (SA -> 🇸🇦, US -> 🇺🇸, GB -> 🇬🇧, etc.)
 * as well as common abbreviations (USA, UK, CAN, AUS, UAE, etc.)
 */

export const ISO_COUNTRY_NAMES: Record<string, string> = {
  SA: 'Saudi Arabia',
  ZA: 'South Africa',
  EU: 'Europe',
  US: 'USA',
  USA: 'USA',
  UK: 'UK',
  GB: 'UK',
  CAN: 'Canada',
  CA: 'Canada',
  AUS: 'Australia',
  AU: 'Australia',
  UAE: 'UAE',
  AE: 'UAE',
  DE: 'Germany',
  IE: 'Ireland',
  AF: 'Afghanistan',
  YE: 'Yemen',
  ET: 'Ethiopia',
  GH: 'Ghana',
  NG: 'Nigeria',
  KE: 'Kenya',
  PK: 'Pakistan',
  IN: 'India',
  OM: 'Oman',
  QA: 'Qatar',
  KW: 'Kuwait',
  BH: 'Bahrain',
  BD: 'Bangladesh',
  NP: 'Nepal',
  LK: 'Sri Lanka',
  EG: 'Egypt',
  IQ: 'Iraq',
  JO: 'Jordan',
  LB: 'Lebanon',
  UG: 'Uganda',
  TZ: 'Tanzania',
  ZW: 'Zimbabwe',
  PH: 'Philippines',
  MY: 'Malaysia',
  SG: 'Singapore',
  NZ: 'New Zealand',
  FR: 'France',
  IT: 'Italy',
  ES: 'Spain',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  CZ: 'Czech Republic',
  HU: 'Hungary',
  RO: 'Romania',
  TR: 'Turkey',
  UZ: 'Uzbekistan',
  KZ: 'Kazakhstan',
}

export function getCountryFlag(country?: string | null): string {
  if (!country) return '🌍'
  const u = country.trim().toUpperCase()
  if (u === 'USA' || u === 'UNITED STATES') return '🇺🇸'
  if (u === 'UK' || u === 'UNITED KINGDOM' || u === 'BRITAIN' || u === 'ENGLAND') return '🇬🇧'
  if (u === 'CAN' || u === 'CANADA') return '🇨🇦'
  if (u === 'AUS' || u === 'AUSTRALIA') return '🇦🇺'
  if (u === 'UAE' || u === 'DUBAI') return '🇦🇪'
  if (u === 'DE' || u === 'GERMANY') return '🇩🇪'
  if (u === 'IE' || u === 'IRELAND') return '🇮🇪'
  if (u === 'SA' || u === 'SAUDI' || u === 'SAUDI ARABIA' || u === 'KSA') return '🇸🇦'
  if (u === 'ZA' || u === 'SOUTH AFRICA' || u === 'RSA') return '🇿🇦'
  if (u === 'EU' || u === 'EUROPE') return '🇪🇺'
  if (u === 'IN' || u === 'INDIA') return '🇮🇳'
  if (u.length === 2 && /^[A-Z]{2}$/.test(u)) {
    const codePoints = [...u].map(c => 127397 + c.charCodeAt(0))
    return String.fromCodePoint(...codePoints)
  }
  return '🌍'
}

export function resolveCountryName(country?: string | null): string {
  if (!country) return ''
  const trimmed = country.trim()
  const upper = trimmed.toUpperCase()
  if (ISO_COUNTRY_NAMES[upper]) {
    return ISO_COUNTRY_NAMES[upper]
  }
  return trimmed
}

// Comprehensive Canadian Area Codes for precise NANP (+1) routing
const CANADIAN_AREA_CODES = new Set([
  '204', '226', '236', '249', '250', '289', '306', '343', '365', '367', '403', '416',
  '418', '431', '437', '438', '450', '506', '514', '519', '548', '579', '581', '587',
  '604', '613', '639', '647', '672', '705', '709', '778', '780', '782', '807', '819',
  '825', '867', '873', '902', '905'
])

// Ordered with longer prefixes first so +966 matches before +96, +353 before +35, etc.
export const PHONE_DIAL_CODES: [string, string][] = [
  // 4-digit Caribbean NANP codes
  ['+1242', 'Bahamas'],
  ['+1246', 'Barbados'],
  ['+1264', 'Anguilla'],
  ['+1268', 'Antigua and Barbuda'],
  ['+1345', 'Cayman Islands'],
  ['+1441', 'Bermuda'],
  ['+1473', 'Grenada'],
  ['+1649', 'Turks and Caicos'],
  ['+1664', 'Montserrat'],
  ['+1721', 'Sint Maarten'],
  ['+1758', 'Saint Lucia'],
  ['+1767', 'Dominica'],
  ['+1784', 'Saint Vincent'],
  ['+1809', 'Dominican Republic'],
  ['+1829', 'Dominican Republic'],
  ['+1849', 'Dominican Republic'],
  ['+1868', 'Trinidad and Tobago'],
  ['+1869', 'Saint Kitts and Nevis'],
  ['+1876', 'Jamaica'],
  // 3-digit Middle East / Africa / Europe / Asia
  ['+966', 'Saudi Arabia'],
  ['+971', 'UAE'],
  ['+968', 'Oman'],
  ['+974', 'Qatar'],
  ['+965', 'Kuwait'],
  ['+973', 'Bahrain'],
  ['+967', 'Yemen'],
  ['+964', 'Iraq'],
  ['+962', 'Jordan'],
  ['+961', 'Lebanon'],
  ['+880', 'Bangladesh'],
  ['+977', 'Nepal'],
  ['+251', 'Ethiopia'],
  ['+256', 'Uganda'],
  ['+254', 'Kenya'],
  ['+234', 'Nigeria'],
  ['+233', 'Ghana'],
  ['+353', 'Ireland'],
  ['+358', 'Finland'],
  ['+420', 'Czech Republic'],
  ['+351', 'Portugal'],
  ['+994', 'Azerbaijan'],
  ['+995', 'Georgia'],
  ['+996', 'Kyrgyzstan'],
  ['+998', 'Uzbekistan'],
  ['+992', 'Tajikistan'],
  ['+993', 'Turkmenistan'],
  // 2-digit codes
  ['+91', 'India'],
  ['+92', 'Pakistan'],
  ['+93', 'Afghanistan'],
  ['+94', 'Sri Lanka'],
  ['+90', 'Turkey'],
  ['+44', 'UK'],
  ['+49', 'Germany'],
  ['+33', 'France'],
  ['+39', 'Italy'],
  ['+34', 'Spain'],
  ['+31', 'Netherlands'],
  ['+46', 'Sweden'],
  ['+47', 'Norway'],
  ['+45', 'Denmark'],
  ['+48', 'Poland'],
  ['+41', 'Switzerland'],
  ['+43', 'Austria'],
  ['+32', 'Belgium'],
  ['+36', 'Hungary'],
  ['+40', 'Romania'],
  ['+30', 'Greece'],
  ['+61', 'Australia'],
  ['+64', 'New Zealand'],
  ['+27', 'South Africa'],
  ['+20', 'Egypt'],
  ['+60', 'Malaysia'],
  ['+65', 'Singapore'],
  ['+63', 'Philippines'],
  ['+86', 'China'],
  ['+81', 'Japan'],
  ['+82', 'South Korea'],
  ['+84', 'Vietnam'],
  ['+62', 'Indonesia'],
  ['+55', 'Brazil'],
  ['+52', 'Mexico'],
  // 1-digit code: +1
  ['+1', 'USA'],
]

// Pre-index dial codes into a fast Map for instant O(1) lookups
export const DIAL_CODE_MAP = new Map<string, string>(PHONE_DIAL_CODES)

// Fast in-memory caches to guarantee < 1ms render times
const phoneCountryCache = new Map<string, string>()
const badgeCache = new Map<string, string>()

/**
 * Accurately extracts Country Name from Phone Number Dial Code with O(1) Map lookup
 */
export function inferCountryFromPhone(phone?: string | null): string {
  if (!phone) return ''
  const cached = phoneCountryCache.get(phone)
  if (cached !== undefined) return cached

  let clean = phone.replace(/^p:/i, '').replace(/[^\d+]/g, '')
  if (!clean) {
    phoneCountryCache.set(phone, '')
    return ''
  }
  
  if (clean.startsWith('00')) {
    clean = '+' + clean.slice(2)
  } else if (!clean.startsWith('+')) {
    clean = '+' + clean
  }

  let result = ''

  // 1. Check 4-digit code (e.g. +1242)
  if (clean.length >= 5) {
    const p4 = clean.slice(0, 5)
    const c4 = DIAL_CODE_MAP.get(p4)
    if (c4) result = c4
  }

  // 2. Check 3-digit code (e.g. +966, +971, +353)
  if (!result && clean.length >= 4) {
    const p3 = clean.slice(0, 4)
    const c3 = DIAL_CODE_MAP.get(p3)
    if (c3) result = c3
  }

  // 3. Check 2-digit code (e.g. +44, +91, +49, +61)
  if (!result && clean.length >= 3) {
    const p2 = clean.slice(0, 3)
    const c2 = DIAL_CODE_MAP.get(p2)
    if (c2) result = c2
  }

  // 4. Check North American Numbering Plan (+1): USA vs Canada
  if (!result && clean.startsWith('+1')) {
    if (clean.length >= 5) {
      const areaCode = clean.slice(2, 5)
      if (CANADIAN_AREA_CODES.has(areaCode)) {
        result = 'Canada'
      } else {
        result = 'USA'
      }
    } else {
      result = 'USA'
    }
  }

  if (phoneCountryCache.size > 2000) phoneCountryCache.clear()
  phoneCountryCache.set(phone, result)
  return result
}

/**
 * Returns authoritative country name by checking Phone country code first, then lead.country field
 */
export function getLeadEffectiveCountry(lead?: {
  country?: string | null
  phone?: string | null
} | null): string {
  if (!lead) return ''

  // 1. Phone number dial code (most authoritative source of truth)
  const phoneCountry = inferCountryFromPhone(lead.phone)
  if (phoneCountry) {
    // If phone starts with +1 (USA), but country field explicitly specifies Canada
    if (phoneCountry === 'USA' && lead.country) {
      const c = lead.country.toLowerCase().trim()
      if (c === 'canada' || c === 'ca' || c === 'can') {
        return 'Canada'
      }
    }
    return phoneCountry
  }

  // 2. Explicit country on lead profile
  if (lead.country) {
    const resolved = resolveCountryName(lead.country)
    if (resolved) return resolved
  }

  return ''
}

export const EUROPEAN_COUNTRY_NAMES = new Set([
  'Germany', 'France', 'Italy', 'Spain', 'Netherlands', 'Ireland',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Switzerland',
  'Austria', 'Belgium', 'Portugal', 'Czech Republic', 'Hungary',
  'Romania', 'Greece', 'Luxembourg', 'Iceland', 'Malta', 'Cyprus',
  'Lithuania', 'Latvia', 'Estonia', 'Croatia', 'Slovenia', 'Bulgaria',
  'Slovakia', 'Europe'
])

/**
 * Categorize a lead into 'UK' vs 'Europe (Excluding UK)' vs 'Other'
 */
export function getRegionCategory(countryOrPhone?: string | null): 'UK' | 'Europe' | 'Other' {
  if (!countryOrPhone) return 'Other'
  const trimmed = countryOrPhone.trim()

  // 1. Check if input looks like a phone number
  if (/^(\+?\d|\(0\)|00)/.test(trimmed)) {
    let clean = trimmed.replace(/\(\s*0\s*\)/g, '').replace(/^00/, '+').replace(/[^\d+]/g, '')
    if (!clean.startsWith('+')) clean = '+' + clean
    if (clean.startsWith('+44')) return 'UK'
    
    // Check European dial codes
    const euroPrefixes = [
      '+351', '+352', '+353', '+354', '+356', '+357', '+358', '+359',
      '+370', '+371', '+372', '+385', '+386', '+420', '+421',
      '+30', '+31', '+32', '+33', '+34', '+36', '+39', '+40', '+41',
      '+43', '+45', '+46', '+47', '+48', '+49'
    ]
    for (const code of euroPrefixes) {
      if (clean.startsWith(code)) return 'Europe'
    }
  }

  // 2. Check by country name
  const resolved = resolveCountryName(trimmed)
  if (resolved === 'UK' || resolved.toLowerCase() === 'united kingdom') return 'UK'
  if (EUROPEAN_COUNTRY_NAMES.has(resolved) || resolved.toLowerCase() === 'europe') return 'Europe'

  return 'Other'
}

export function formatCountryBadge(country?: string | null, phone?: string | null): string {
  const cacheKey = `${country || ''}_${phone || ''}`
  const cached = badgeCache.get(cacheKey)
  if (cached !== undefined) return cached

  const effective = getLeadEffectiveCountry({ country, phone })
  if (!effective) {
    badgeCache.set(cacheKey, '')
    return ''
  }
  
  const flag = getCountryFlag(effective)
  const resolved = resolveCountryName(effective)
  const result = `${flag} ${resolved}`

  if (badgeCache.size > 2000) badgeCache.clear()
  badgeCache.set(cacheKey, result)
  return result
}

// Pre-compiled regular expressions for fast matching without re-compilation
const UK_REGEX = /\b(uk|united kingdom|britain|england)\b/i
const USA_REGEX = /\b(usa|united states)\b/i
const CAN_REGEX = /\b(canada)\b/i
const AUS_REGEX = /\b(australia|aussie)\b/i
const DE_REGEX = /\b(germany|deutschland)\b/i
const IE_REGEX = /\b(ireland)\b/i
const UAE_REGEX = /\b(uae|dubai|emirates)\b/i
const IN_REGEX = /\b(india)\b/i
const SA_REGEX = /\b(saudi|ksa)\b/i
const ZA_REGEX = /\b(south africa)\b/i
const EU_REGEX = /\b(europe|european)\b/i

const MASTER_REGEX = /\b(mba|msc|ma|mtech|mca|mcom|llm|m\.sc|m\.a|m\.tech|pg)\b/i
const BACHELOR_REGEX = /\b(bsc|bba|ba|btech|bca|bcom|llb|b\.sc|b\.a|b\.tech|b\.e|ug)\b/i
const DOCTORATE_REGEX = /\b(doctor|phd|ph\.d|doctoral)\b/i

/**
 * Filter matcher for Ad Country dropdown based primarily on phone country code
 */
export function matchesCountryFilter(
  lead: {
    country?: string | null
    phone?: string | null
    ad_campaign_name?: string | null
    source?: string | null
    metadata?: any
  },
  filter: string
): boolean {
  if (!filter || filter === 'ALL' || filter === 'all') return true

  const normFilter = filter.toLowerCase().trim()
  
  // 1. Determine lead country primarily using Phone Dial Code
  const detected = getLeadEffectiveCountry(lead)

  if (detected) {
    const d = detected.toLowerCase().trim()

    // UK
    if (normFilter === 'uk' || normFilter === 'gb') {
      return d === 'uk' || d === 'united kingdom'
    }

    // USA
    if (normFilter === 'usa' || normFilter === 'us') {
      return d === 'usa' || d === 'united states'
    }

    // Canada
    if (normFilter === 'canada' || normFilter === 'ca') {
      return d === 'canada'
    }

    // Australia
    if (normFilter === 'australia' || normFilter === 'au') {
      return d === 'australia'
    }

    // Germany
    if (normFilter === 'germany' || normFilter === 'de') {
      return d === 'germany'
    }

    // Ireland
    if (normFilter === 'ireland' || normFilter === 'ie') {
      return d === 'ireland'
    }

    // UAE
    if (normFilter === 'uae' || normFilter === 'ae') {
      return d === 'uae' || d === 'united arab emirates'
    }

    // India
    if (normFilter === 'india' || normFilter === 'in') {
      return d === 'india'
    }

    // Saudi Arabia
    if (normFilter === 'saudi arabia' || normFilter === 'saudi' || normFilter === 'sa') {
      return d === 'saudi arabia'
    }

    // South Africa
    if (normFilter === 'south africa' || normFilter === 'za') {
      return d === 'south africa'
    }

    // Europe (Excluding UK)
    if (normFilter === 'europe' || normFilter === 'eu' || normFilter === 'europe (excluding uk)') {
      const euro = [
        'germany', 'ireland', 'france', 'italy', 'spain',
        'netherlands', 'sweden', 'norway', 'denmark', 'finland', 'poland',
        'switzerland', 'austria', 'belgium', 'portugal', 'czech republic',
        'hungary', 'romania', 'greece', 'luxembourg', 'iceland', 'malta',
        'cyprus', 'lithuania', 'latvia', 'estonia', 'croatia', 'slovenia',
        'bulgaria', 'slovakia', 'europe'
      ]
      return euro.includes(d)
    }

    return d === normFilter
  }

  // 2. Fallback: ONLY when lead has NO detectable phone country and NO country in DB
  // Use strict word boundary regex on source/ad_campaign_name (NEVER loose substring in metadata!)
  const sourceText = `${lead.ad_campaign_name || ''} ${lead.source || ''}`
  if (!sourceText.trim()) return false

  if (normFilter === 'uk' || normFilter === 'gb') {
    return UK_REGEX.test(sourceText)
  }
  if (normFilter === 'usa' || normFilter === 'us') {
    return USA_REGEX.test(sourceText)
  }
  if (normFilter === 'canada' || normFilter === 'ca') {
    return CAN_REGEX.test(sourceText)
  }
  if (normFilter === 'australia' || normFilter === 'au') {
    return AUS_REGEX.test(sourceText)
  }
  if (normFilter === 'germany' || normFilter === 'de') {
    return DE_REGEX.test(sourceText)
  }
  if (normFilter === 'ireland' || normFilter === 'ie') {
    return IE_REGEX.test(sourceText)
  }
  if (normFilter === 'uae' || normFilter === 'ae') {
    return UAE_REGEX.test(sourceText)
  }
  if (normFilter === 'india' || normFilter === 'in') {
    return IN_REGEX.test(sourceText)
  }
  if (normFilter === 'saudi arabia' || normFilter === 'saudi' || normFilter === 'sa') {
    return SA_REGEX.test(sourceText)
  }
  if (normFilter === 'south africa' || normFilter === 'za') {
    return ZA_REGEX.test(sourceText)
  }
  if (normFilter === 'europe' || normFilter === 'eu') {
    return EU_REGEX.test(sourceText)
  }

  return false
}

/**
 * Filter matcher for Programme / Degree level dropdown
 */
export function matchesProgrammeFilter(
  lead: { programme_level?: string | null; course?: string | null; metadata?: any },
  filter: string
): boolean {
  if (!filter || filter === 'ALL' || filter === 'all') return true

  const pLevel = lead.programme_level || ''
  const course = lead.course || ''
  let meta = ''
  if (lead.metadata) {
    if (typeof lead.metadata === 'string') {
      meta = lead.metadata
    } else if (typeof lead.metadata === 'object') {
      meta = `${lead.metadata.degree || ''} ${lead.metadata.course || ''} ${lead.metadata.qualification || ''} ${lead.metadata.program || ''}`
    }
  }
  const combined = `${pLevel} ${course} ${meta}`.toLowerCase()

  if (filter === 'Master') {
    return (
      combined.includes('master') ||
      combined.includes('postgraduate') ||
      combined.includes('post-graduate') ||
      MASTER_REGEX.test(combined)
    )
  }

  if (filter === 'Bachelor') {
    return (
      combined.includes('bachelor') ||
      combined.includes('undergraduate') ||
      combined.includes('under-graduate') ||
      BACHELOR_REGEX.test(combined)
    )
  }

  if (filter === 'Doctorate') {
    return DOCTORATE_REGEX.test(combined)
  }

  return combined.includes(filter.toLowerCase())
}




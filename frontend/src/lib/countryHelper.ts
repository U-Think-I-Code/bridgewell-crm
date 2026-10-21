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

export const PHONE_DIAL_CODES: [string, string][] = [
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
  ['+91', 'India'],
  ['+92', 'Pakistan'],
  ['+93', 'Afghanistan'],
  ['+94', 'Sri Lanka'],
  ['+44', 'UK'],
  ['+61', 'Australia'],
  ['+64', 'New Zealand'],
  ['+49', 'Germany'],
  ['+33', 'France'],
  ['+39', 'Italy'],
  ['+34', 'Spain'],
  ['+20', 'Egypt'],
  ['+27', 'South Africa'],
  ['+60', 'Malaysia'],
  ['+65', 'Singapore'],
  ['+63', 'Philippines'],
  ['+90', 'Turkey'],
  ['+1', 'USA'],
]

export function inferCountryFromPhone(phone?: string | null): string {
  if (!phone) return ''
  const clean = phone.replace(/^p:/i, '').replace(/[^\d+]/g, '')
  if (!clean.startsWith('+')) return ''
  
  for (const [code, country] of PHONE_DIAL_CODES) {
    if (clean.startsWith(code)) {
      return country
    }
  }
  return ''
}

export function formatCountryBadge(country?: string | null, phone?: string | null): string {
  let target = country ? country.trim() : ''
  if (!target && phone) {
    target = inferCountryFromPhone(phone)
  }
  if (!target) return ''
  
  const flag = getCountryFlag(target)
  const resolved = resolveCountryName(target)
  const upper = target.toUpperCase()
  
  if (upper.length === 2 && resolved !== upper) {
    return `${flag} ${resolved} (${upper})`
  }
  return `${flag} ${resolved}`
}

/**
 * Filter matcher for Ad Country dropdown
 */
export function matchesCountryFilter(
  lead: { country?: string | null; phone?: string | null; ad_campaign_name?: string | null; source?: string | null; metadata?: any },
  filter: string
): boolean {
  if (!filter || filter === 'ALL' || filter === 'all') return true

  const normFilter = filter.toLowerCase().trim()
  const rawCountry = (lead.country || '').toLowerCase().trim()
  const phone = (lead.phone || '').replace(/^p:/i, '').replace(/[^\d+]/g, '')
  const metaStr = typeof lead.metadata === 'object' ? JSON.stringify(lead.metadata).toLowerCase() : ''
  const adSource = `${lead.ad_campaign_name || ''} ${lead.source || ''} ${metaStr}`.toLowerCase()

  // Saudi Arabia
  if (normFilter === 'saudi arabia' || normFilter === 'saudi' || normFilter === 'sa') {
    return (
      rawCountry.includes('saudi') ||
      rawCountry === 'sa' ||
      rawCountry === 'ksa' ||
      phone.startsWith('+966') ||
      adSource.includes('saudi') ||
      adSource.includes('ksa')
    )
  }

  // South Africa
  if (normFilter === 'south africa' || normFilter === 'za') {
    return (
      rawCountry.includes('south africa') ||
      rawCountry === 'za' ||
      rawCountry === 'rsa' ||
      phone.startsWith('+27') ||
      adSource.includes('south africa')
    )
  }

  // Europe (pan-European or European destinations)
  if (normFilter === 'europe' || normFilter === 'eu') {
    const euroCountries = [
      'europe', 'eu', 'germany', 'de', 'france', 'fr', 'ireland', 'ie', 'uk', 'united kingdom', 'gb',
      'italy', 'it', 'spain', 'es', 'netherlands', 'nl', 'sweden', 'se', 'norway', 'no',
      'denmark', 'dk', 'finland', 'fi', 'poland', 'pl', 'switzerland', 'ch', 'austria', 'at',
      'belgium', 'be', 'portugal', 'pt', 'czech', 'hungary', 'romania', 'greece', 'gr'
    ]
    return (
      euroCountries.some(c => rawCountry === c || rawCountry.includes(c)) ||
      adSource.includes('europe') ||
      adSource.includes('eur')
    )
  }

  // USA
  if (normFilter === 'usa' || normFilter === 'us') {
    return (
      rawCountry.includes('usa') ||
      rawCountry === 'us' ||
      rawCountry.includes('united states') ||
      (phone.startsWith('+1') && !rawCountry.includes('canada')) ||
      adSource.includes('usa')
    )
  }

  // UK
  if (normFilter === 'uk' || normFilter === 'gb') {
    return (
      rawCountry.includes('uk') ||
      rawCountry === 'gb' ||
      rawCountry.includes('united kingdom') ||
      phone.startsWith('+44') ||
      adSource.includes('uk')
    )
  }

  // Canada
  if (normFilter === 'canada' || normFilter === 'ca') {
    return rawCountry.includes('canada') || rawCountry === 'ca' || rawCountry === 'can' || adSource.includes('canada')
  }

  // Australia
  if (normFilter === 'australia' || normFilter === 'au') {
    return rawCountry.includes('australia') || rawCountry === 'au' || rawCountry === 'aus' || phone.startsWith('+61') || adSource.includes('australia')
  }

  // Germany
  if (normFilter === 'germany' || normFilter === 'de') {
    return rawCountry.includes('germany') || rawCountry === 'de' || phone.startsWith('+49') || adSource.includes('germany')
  }

  // Ireland
  if (normFilter === 'ireland' || normFilter === 'ie') {
    return rawCountry.includes('ireland') || rawCountry === 'ie' || phone.startsWith('+353') || adSource.includes('ireland')
  }

  // UAE
  if (normFilter === 'uae' || normFilter === 'ae') {
    return rawCountry.includes('uae') || rawCountry === 'ae' || rawCountry.includes('dubai') || phone.startsWith('+971') || adSource.includes('uae')
  }

  // India
  if (normFilter === 'india' || normFilter === 'in') {
    return rawCountry.includes('india') || rawCountry === 'in' || phone.startsWith('+91') || adSource.includes('india')
  }

  return rawCountry.includes(normFilter) || adSource.includes(normFilter)
}

/**
 * Filter matcher for Programme / Degree level dropdown
 */
export function matchesProgrammeFilter(
  lead: { programme_level?: string | null; course?: string | null; metadata?: any },
  filter: string
): boolean {
  if (!filter || filter === 'ALL' || filter === 'all') return true

  const pLevel = (lead.programme_level || '').toLowerCase()
  const course = (lead.course || '').toLowerCase()
  const metaDetails = typeof lead.metadata === 'object' ? JSON.stringify(lead.metadata).toLowerCase() : ''
  const combined = `${pLevel} ${course} ${metaDetails}`

  if (filter === 'Master') {
    return (
      combined.includes('master') ||
      combined.includes('postgraduate') ||
      combined.includes('post-graduate') ||
      /\b(mba|msc|ma|mtech|mca|mcom|llm|m\.sc|m\.a|m\.tech|pg)\b/i.test(combined)
    )
  }

  if (filter === 'Bachelor') {
    return (
      combined.includes('bachelor') ||
      combined.includes('undergraduate') ||
      combined.includes('under-graduate') ||
      /\b(bsc|bba|ba|btech|bca|bcom|llb|b\.sc|b\.a|b\.tech|b\.e|ug)\b/i.test(combined)
    )
  }

  if (filter === 'Doctorate') {
    return (
      combined.includes('doctor') ||
      combined.includes('phd') ||
      combined.includes('ph.d') ||
      combined.includes('doctoral')
    )
  }

  return combined.includes(filter.toLowerCase())
}



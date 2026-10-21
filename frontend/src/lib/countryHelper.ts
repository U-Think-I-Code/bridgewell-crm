/**
 * Universal Country & Flag Formatting Helper
 * Automatically detects flag emoji for 2-letter ISO codes (SA -> 🇸🇦, US -> 🇺🇸, GB -> 🇬🇧, etc.)
 * as well as common abbreviations (USA, UK, CAN, AUS, UAE, etc.)
 */

export const ISO_COUNTRY_NAMES: Record<string, string> = {
  SA: 'Saudi Arabia',
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
  ZA: 'South Africa',
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


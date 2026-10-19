/**
 * Universal Country & Flag Formatting Helper
 * Automatically detects flag emoji for 2-letter ISO codes (GH -> 🇬🇭, US -> 🇺🇸, GB -> 🇬🇧, etc.)
 * as well as common abbreviations (USA, UK, CAN, AUS, UAE, etc.)
 */

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

export function formatCountryBadge(country?: string | null): string {
  if (!country) return ''
  const flag = getCountryFlag(country)
  const u = country.trim().toUpperCase()
  const label = u === 'US' ? 'USA' : u === 'GB' ? 'UK' : country
  return `${flag} ${label}`
}

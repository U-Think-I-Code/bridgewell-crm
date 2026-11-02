/**
 * International Timezone & Student Local Time Helper
 * 
 * Accurately detects country and timezone from student's phone number and/or country,
 * converts follow-up dates & times between Student Local Time and Indian Standard Time (IST),
 * and provides dual-display utilities for counselors across the CRM.
 */

export interface StudentTimezoneInfo {
  timeZone: string
  countryCode: string
  countryName: string
  label: string
  flag: string
  isIndia: boolean
}

// Major international country mappings
const COUNTRY_TIMEZONE_MAP: Record<string, { timeZone: string; flag: string; label: string; countryName: string }> = {
  // UK
  '+44': { timeZone: 'Europe/London', flag: '🇬🇧', label: 'UK Time (London)', countryName: 'UK' },
  // USA / Canada
  '+1': { timeZone: 'America/New_York', flag: '🇺🇸', label: 'US Time (Eastern)', countryName: 'USA' },
  // Europe
  '+49': { timeZone: 'Europe/Berlin', flag: '🇩🇪', label: 'Germany Time (CET)', countryName: 'Germany' },
  '+33': { timeZone: 'Europe/Paris', flag: '🇫🇷', label: 'France Time (CET)', countryName: 'France' },
  '+34': { timeZone: 'Europe/Madrid', flag: '🇪🇸', label: 'Spain Time (CET)', countryName: 'Spain' },
  '+39': { timeZone: 'Europe/Rome', flag: '🇮🇹', label: 'Italy Time (CET)', countryName: 'Italy' },
  '+31': { timeZone: 'Europe/Amsterdam', flag: '🇳🇱', label: 'Netherlands Time (CET)', countryName: 'Netherlands' },
  '+353': { timeZone: 'Europe/Dublin', flag: '🇮🇪', label: 'Ireland Time (GMT)', countryName: 'Ireland' },
  '+41': { timeZone: 'Europe/Zurich', flag: '🇨🇭', label: 'Swiss Time (CET)', countryName: 'Switzerland' },
  '+43': { timeZone: 'Europe/Vienna', flag: '🇦🇹', label: 'Austria Time (CET)', countryName: 'Austria' },
  '+48': { timeZone: 'Europe/Warsaw', flag: '🇵🇱', label: 'Poland Time (CET)', countryName: 'Poland' },
  '+46': { timeZone: 'Europe/Stockholm', flag: '🇸🇪', label: 'Sweden Time (CET)', countryName: 'Sweden' },
  '+47': { timeZone: 'Europe/Oslo', flag: '🇳🇴', label: 'Norway Time (CET)', countryName: 'Norway' },
  '+45': { timeZone: 'Europe/Copenhagen', flag: '🇩🇰', label: 'Denmark Time (CET)', countryName: 'Denmark' },
  '+358': { timeZone: 'Europe/Helsinki', flag: '🇫🇮', label: 'Finland Time (EET)', countryName: 'Finland' },
  '+351': { timeZone: 'Europe/Lisbon', flag: '🇵🇹', label: 'Portugal Time (WET)', countryName: 'Portugal' },
  '+352': { timeZone: 'Europe/Luxembourg', flag: '🇱🇺', label: 'Luxembourg (CET)', countryName: 'Luxembourg' },
  '+356': { timeZone: 'Europe/Malta', flag: '🇲🇹', label: 'Malta (CET)', countryName: 'Malta' },
  '+357': { timeZone: 'Asia/Nicosia', flag: '🇨🇾', label: 'Cyprus (EET)', countryName: 'Cyprus' },
  '+30': { timeZone: 'Europe/Athens', flag: '🇬🇷', label: 'Greece Time (EET)', countryName: 'Greece' },
  '+32': { timeZone: 'Europe/Brussels', flag: '🇧🇪', label: 'Belgium Time (CET)', countryName: 'Belgium' },
  '+36': { timeZone: 'Europe/Budapest', flag: '🇭🇺', label: 'Hungary Time (CET)', countryName: 'Hungary' },
  '+40': { timeZone: 'Europe/Bucharest', flag: '🇷🇴', label: 'Romania Time (EET)', countryName: 'Romania' },
  '+420': { timeZone: 'Europe/Prague', flag: '🇨🇿', label: 'Czechia Time (CET)', countryName: 'Czech Republic' },
  // Middle East
  '+971': { timeZone: 'Asia/Dubai', flag: '🇦🇪', label: 'UAE Time (GST)', countryName: 'UAE' },
  '+966': { timeZone: 'Asia/Riyadh', flag: '🇸🇦', label: 'Saudi Time (AST)', countryName: 'Saudi Arabia' },
  '+974': { timeZone: 'Asia/Qatar', flag: '🇶🇦', label: 'Qatar Time (AST)', countryName: 'Qatar' },
  '+965': { timeZone: 'Asia/Kuwait', flag: '🇰🇼', label: 'Kuwait Time (AST)', countryName: 'Kuwait' },
  '+968': { timeZone: 'Asia/Muscat', flag: '🇴🇲', label: 'Oman Time (GST)', countryName: 'Oman' },
  '+973': { timeZone: 'Asia/Bahrain', flag: '🇧🇭', label: 'Bahrain Time (AST)', countryName: 'Bahrain' },
  // Asia / Pacific
  '+61': { timeZone: 'Australia/Sydney', flag: '🇦🇺', label: 'Australia Time (AEST)', countryName: 'Australia' },
  '+64': { timeZone: 'Pacific/Auckland', flag: '🇳🇿', label: 'NZ Time (NZST)', countryName: 'New Zealand' },
  '+65': { timeZone: 'Asia/Singapore', flag: '🇸🇬', label: 'Singapore (SGT)', countryName: 'Singapore' },
  '+60': { timeZone: 'Asia/Kuala_Lumpur', flag: '🇲🇾', label: 'Malaysia (MYT)', countryName: 'Malaysia' },
  // India
  '+91': { timeZone: 'Asia/Kolkata', flag: '🇮🇳', label: 'India Time (IST)', countryName: 'India' },
}

/**
 * Detects student's country & timezone from phone number and/or country string
 */
export function getStudentTimezone(phone?: string | null, countryHint?: string | null): StudentTimezoneInfo {
  const defaultIndia: StudentTimezoneInfo = {
    timeZone: 'Asia/Kolkata',
    countryCode: '+91',
    countryName: 'India',
    label: 'India Time (IST)',
    flag: '🇮🇳',
    isIndia: true,
  }

  // 1. Check country hint if phone is missing or ambiguous
  const cleanHint = (countryHint || '').trim().toLowerCase()
  if (cleanHint) {
    if (cleanHint.includes('uk') || cleanHint.includes('united kingdom') || cleanHint.includes('britain') || cleanHint.includes('england') || cleanHint.includes('london')) {
      return { timeZone: 'Europe/London', countryCode: '+44', countryName: 'UK', label: 'UK Time (London)', flag: '🇬🇧', isIndia: false }
    }
    if (cleanHint === 'us' || cleanHint === 'usa' || cleanHint.includes('united states') || cleanHint.includes('america')) {
      return { timeZone: 'America/New_York', countryCode: '+1', countryName: 'USA', label: 'US Time (Eastern)', flag: '🇺🇸', isIndia: false }
    }
    if (cleanHint.includes('canada')) {
      return { timeZone: 'America/Toronto', countryCode: '+1', countryName: 'Canada', label: 'Canada Time (ET)', flag: '🇨🇦', isIndia: false }
    }
    if (cleanHint.includes('germany') || cleanHint.includes('deutschland')) {
      return { timeZone: 'Europe/Berlin', countryCode: '+49', countryName: 'Germany', label: 'Germany Time (CET)', flag: '🇩🇪', isIndia: false }
    }
    if (cleanHint.includes('france') || cleanHint.includes('paris')) {
      return { timeZone: 'Europe/Paris', countryCode: '+33', countryName: 'France', label: 'France Time (CET)', flag: '🇫🇷', isIndia: false }
    }
    if (cleanHint.includes('ireland') || cleanHint.includes('dublin')) {
      return { timeZone: 'Europe/Dublin', countryCode: '+353', countryName: 'Ireland', label: 'Ireland Time (GMT)', flag: '🇮🇪', isIndia: false }
    }
    if (cleanHint.includes('dubai') || cleanHint.includes('uae') || cleanHint.includes('emirates')) {
      return { timeZone: 'Asia/Dubai', countryCode: '+971', countryName: 'UAE', label: 'UAE Time (GST)', flag: '🇦🇪', isIndia: false }
    }
    if (cleanHint.includes('australia') || cleanHint.includes('sydney')) {
      return { timeZone: 'Australia/Sydney', countryCode: '+61', countryName: 'Australia', label: 'Australia Time (AEST)', flag: '🇦🇺', isIndia: false }
    }
  }

  if (!phone) return defaultIndia

  // Clean phone string to digits & leading plus
  let raw = String(phone).trim().replace(/\s+/g, '')
  if (raw.startsWith('00')) raw = '+' + raw.slice(2)
  if (!raw.startsWith('+')) {
    if (raw.startsWith('44')) raw = '+' + raw
    else if (raw.startsWith('1') && raw.length === 11) raw = '+' + raw
    else if (raw.startsWith('91')) raw = '+' + raw
    else raw = '+' + raw
  }

  // Strip 0 in parenthesis e.g. +44(0)
  raw = raw.replace(/\(0\)/g, '')
  if (raw.startsWith('+440')) raw = '+44' + raw.slice(4)

  // Longest prefix match first (+353, +358, +420, etc.)
  const prefixes = Object.keys(COUNTRY_TIMEZONE_MAP).sort((a, b) => b.length - a.length)
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) {
      const match = COUNTRY_TIMEZONE_MAP[prefix]
      return {
        timeZone: match.timeZone,
        countryCode: prefix,
        countryName: match.countryName,
        label: match.label,
        flag: match.flag,
        isIndia: prefix === '+91',
      }
    }
  }

  // Fallback to hint or default India
  return defaultIndia
}

/**
 * Formats a Date/ISO string in student's local country timezone
 */
export function formatStudentTime(
  dateInput: string | Date | null | undefined,
  phone?: string | null,
  countryHint?: string | null,
  options?: { showDate?: boolean; showSeconds?: boolean; fullTimezone?: boolean }
): string {
  if (!dateInput) return ''
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(date.getTime())) return ''

  const tzInfo = getStudentTimezone(phone, countryHint)
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tzInfo.timeZone,
      ...(options?.showDate !== false ? {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      } : {}),
      hour: 'numeric',
      minute: '2-digit',
      ...(options?.showSeconds ? { second: '2-digit' } : {}),
      hour12: true,
      timeZoneName: options?.fullTimezone ? 'long' : 'short',
    })

    return formatter.format(date)
  } catch {
    return date.toLocaleString('en-IN')
  }
}

/**
 * Returns student's current live time right now along with business hours status
 */
export function getStudentCurrentTime(phone?: string | null, countryHint?: string | null): {
  time: string
  date: string
  tzCode: string
  flag: string
  label: string
  countryName: string
  isBusinessHours: boolean
  statusText: string
} {
  const now = new Date()
  const tzInfo = getStudentTimezone(phone, countryHint)

  try {
    const timeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzInfo.timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    }).formatToParts(now)

    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzInfo.timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(now)

    let hour = 12
    let hour24 = 12
    let minute = '00'
    let dayPeriod = 'AM'
    let tzCode = ''

    for (const p of timeParts) {
      if (p.type === 'hour') hour = parseInt(p.value, 10)
      if (p.type === 'minute') minute = p.value
      if (p.type === 'dayPeriod') dayPeriod = p.value
      if (p.type === 'timeZoneName') tzCode = p.value
    }

    hour24 = dayPeriod === 'PM' && hour !== 12 ? hour + 12 : dayPeriod === 'AM' && hour === 12 ? 0 : hour

    // Normal business hours: 9 AM to 8 PM in student's local country
    const isBusinessHours = hour24 >= 9 && hour24 < 20
    const isLateNight = hour24 >= 22 || hour24 < 7

    const statusText = isBusinessHours
      ? '🟢 Business Hours (Good to call)'
      : isLateNight
      ? '🌙 Late Night (Do not disturb)'
      : '🟡 Early / Evening'

    return {
      time: `${hour}:${minute} ${dayPeriod}`,
      date: dateParts,
      tzCode: tzCode || (tzInfo.isIndia ? 'IST' : 'Local'),
      flag: tzInfo.flag,
      label: tzInfo.label,
      countryName: tzInfo.countryName,
      isBusinessHours,
      statusText,
    }
  } catch {
    return {
      time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
      date: now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      tzCode: 'IST',
      flag: '🇮🇳',
      label: 'India Time (IST)',
      countryName: 'India',
      isBusinessHours: true,
      statusText: '🟢 Good to call',
    }
  }
}

/**
 * Returns rich dual time info comparing Student's Local Time vs India Time (IST)
 */
export function formatDualTime(
  dateInput: string | Date | null | undefined,
  phone?: string | null,
  countryHint?: string | null
): {
  studentTime: string
  studentDate: string
  studentTz: string
  studentLabel: string
  studentFlag: string
  istTime: string
  istDate: string
  isDifferentTimezone: boolean
  timeDiffDescription: string
  badgeText: string
} {
  const fallback = {
    studentTime: '',
    studentDate: '',
    studentTz: 'IST',
    studentLabel: 'India Time (IST)',
    studentFlag: '🇮🇳',
    istTime: '',
    istDate: '',
    isDifferentTimezone: false,
    timeDiffDescription: 'Same as IST',
    badgeText: '',
  }

  if (!dateInput) return fallback
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  if (isNaN(d.getTime())) return fallback

  const tzInfo = getStudentTimezone(phone, countryHint)

  // 1. Student Local Time
  const studentTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tzInfo.timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)

  const studentDateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: tzInfo.timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)

  const studentTzCode = new Intl.DateTimeFormat('en-US', {
    timeZone: tzInfo.timeZone,
    timeZoneName: 'short',
  }).formatToParts(d).find(p => p.type === 'timeZoneName')?.value || 'Local'

  // 2. IST Time
  const istTimeStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)

  const istDateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)

  const isDifferentTimezone = !tzInfo.isIndia && tzInfo.timeZone !== 'Asia/Kolkata'

  // Calculate approximate offset difference in hours
  let diffDesc = 'Same as IST'
  if (isDifferentTimezone) {
    try {
      const utcDate = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }))
      const sDate = new Date(d.toLocaleString('en-US', { timeZone: tzInfo.timeZone }))
      const istDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
      
      const diffMins = Math.round((sDate.getTime() - istDate.getTime()) / 60000)
      const absDiffMins = Math.abs(diffMins)
      const diffH = Math.floor(absDiffMins / 60)
      const diffM = absDiffMins % 60
      const diffStr = diffM > 0 ? `${diffH}h ${diffM}m` : `${diffH} hrs`
      
      if (diffMins < 0) {
        diffDesc = `${diffStr} behind India (IST)`
      } else {
        diffDesc = `${diffStr} ahead of India (IST)`
      }
    } catch {}
  }

  const badgeText = isDifferentTimezone
    ? `${tzInfo.flag} ${studentTimeStr} ${studentTzCode} (${tzInfo.countryName}) ⇄ 🇮🇳 ${istTimeStr} IST`
    : `🇮🇳 ${istTimeStr} IST`

  return {
    studentTime: studentTimeStr,
    studentDate: studentDateStr,
    studentTz: studentTzCode,
    studentLabel: `${tzInfo.flag} ${tzInfo.countryName} Time`,
    studentFlag: tzInfo.flag,
    istTime: istTimeStr,
    istDate: istDateStr,
    isDifferentTimezone,
    timeDiffDescription: diffDesc,
    badgeText,
  }
}

/**
 * Converts a student's local datetime string ('YYYY-MM-DDTHH:mm') in target timezone into a UTC ISO string
 */
export function studentLocalToUTC(
  localDatetimeStr: string,
  timeZone: string
): string {
  if (!localDatetimeStr) return ''
  const [datePart, timePart] = localDatetimeStr.split('T')
  if (!datePart || !timePart) return new Date(localDatetimeStr).toISOString()

  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes] = timePart.split(':').map(Number)

  // Seed guess with UTC
  const guess = new Date(Date.UTC(year, month - 1, day, hours, minutes))

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    })

    const parts = formatter.formatToParts(guess)
    const p: Record<string, string> = {}
    for (const part of parts) p[part.type] = part.value

    const inTz = new Date(Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour) === 24 ? 0 : Number(p.hour),
      Number(p.minute),
      Number(p.second || 0)
    ))

    const diff = guess.getTime() - inTz.getTime()
    const exactUtc = new Date(guess.getTime() + diff)
    return exactUtc.toISOString()
  } catch {
    return new Date(localDatetimeStr).toISOString()
  }
}

/**
 * Converts an ISO string into 'YYYY-MM-DDTHH:mm' for an HTML <input type="datetime-local" /> in target timezone
 */
export function utcToStudentLocalInput(
  isoString: string | null | undefined,
  timeZone: string
): string {
  if (!isoString) return ''
  const d = new Date(isoString)
  if (isNaN(d.getTime())) return ''

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const parts = formatter.format(d).split(', ')
    const date = parts[0]
    const time = (parts[1] || '00:00').replace('24:', '00:')
    return `${date}T${time}`
  } catch {
    return d.toISOString().slice(0, 16)
  }
}

/**
 * Converts an ISO string into 'YYYY-MM-DDTHH:mm' for datetime-local in Indian Standard Time (IST)
 */
export function utcToISTLocalInput(isoString: string | null | undefined): string {
  return utcToStudentLocalInput(isoString, 'Asia/Kolkata')
}


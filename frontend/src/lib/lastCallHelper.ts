/**
 * Last Call Date & Time Helper
 * 
 * Accurately extracts, formats, and displays the exact date and timing
 * when a counselor last called a lead/student, with friendly relative time
 * (e.g., 'Today, 02:30 PM (2h ago)', 'Yesterday, 04:15 PM', '15 Nov, 11:00 AM').
 */

export interface LastCallInfo {
  hasCall: boolean
  isoTime: string | null
  dateStr: string
  timeStr: string
  relative: string
  formatted: string
  fullTooltip: string
  isToday: boolean
  isYesterday: boolean
  outcome?: string | null
}

/**
 * Extracts the latest call ISO timestamp from a lead object
 */
export function getLeadLastCallTime(lead: any): string | null {
  if (!lead) return null
  const meta = lead.metadata || {}

  // 1. Check direct metadata.last_call_at
  if (meta.last_call_at && typeof meta.last_call_at === 'string') {
    return meta.last_call_at
  }

  // 2. Check top-level last_call_at (if present)
  if (lead.last_call_at && typeof lead.last_call_at === 'string') {
    return lead.last_call_at
  }

  // 3. Fallback to metadata.last_call_timestamp
  if (meta.last_call_timestamp) {
    const ts = typeof meta.last_call_timestamp === 'number' 
      ? new Date(meta.last_call_timestamp).toISOString() 
      : String(meta.last_call_timestamp)
    return ts
  }

  return null
}

/**
 * Formats any call timestamp or lead object into a clean human-readable date & time
 */
export function formatLastCall(
  input?: any | string | Date | null,
  outcomeFallback?: string | null
): LastCallInfo {
  let isoString: string | null = null
  let outcome: string | null = outcomeFallback || null

  if (input && typeof input === 'object' && !(input instanceof Date)) {
    isoString = getLeadLastCallTime(input)
    outcome = input.last_call_outcome || input.metadata?.last_call_outcome || outcomeFallback || null
  } else if (typeof input === 'string') {
    isoString = input
  } else if (input instanceof Date) {
    isoString = input.toISOString()
  }

  if (!isoString) {
    return {
      hasCall: false,
      isoTime: null,
      dateStr: '',
      timeStr: '',
      relative: 'Never called',
      formatted: 'Not called yet',
      fullTooltip: 'No outbound calls recorded for this student yet',
      isToday: false,
      isYesterday: false,
      outcome: outcome || 'Not Called'
    }
  }

  const d = new Date(isoString)
  if (isNaN(d.getTime())) {
    return {
      hasCall: false,
      isoTime: null,
      dateStr: '',
      timeStr: '',
      relative: 'Never called',
      formatted: 'Not called yet',
      fullTooltip: 'Invalid call timestamp',
      isToday: false,
      isYesterday: false,
      outcome: outcome || 'Not Called'
    }
  }

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000))
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  // Relative label
  let relative = ''
  if (diffSecs < 60) relative = 'Just now'
  else if (diffMins < 60) relative = `${diffMins}m ago`
  else if (diffHours < 24) relative = `${diffHours}h ago`
  else if (diffDays === 1) relative = '1d ago'
  else if (diffDays < 30) relative = `${diffDays}d ago`
  else relative = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  // Day boundaries
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  // 12-hour format with AM/PM e.g. 02:29 PM
  const timeStr = d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })

  let dateStr = ''
  if (isToday) dateStr = 'Today'
  else if (isYesterday) dateStr = 'Yesterday'
  else {
    const isSameYear = d.getFullYear() === now.getFullYear()
    dateStr = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: isSameYear ? undefined : 'numeric'
    })
  }

  const formatted = `${dateStr}, ${timeStr}`
  
  const weekdayName = d.toLocaleDateString('en-IN', { weekday: 'short' })
  const fullDateFormatted = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })
  const outcomeText = outcome ? ` • Outcome: ${outcome}` : ''
  const fullTooltip = `Last call: ${weekdayName}, ${fullDateFormatted} at ${timeStr} (${relative})${outcomeText}`

  return {
    hasCall: true,
    isoTime: isoString,
    dateStr,
    timeStr,
    relative,
    formatted,
    fullTooltip,
    isToday,
    isYesterday,
    outcome
  }
}

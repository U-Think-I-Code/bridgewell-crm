/**
 * Lead Assignment Date & Time Helper
 * 
 * Accurately formats and displays the exact date and timing when a lead was
 * assigned or reassigned to a counselor, with clean relative time and tooltips.
 */

export interface AssignedDateInfo {
  hasAssigned: boolean
  isoTime: string | null
  dateStr: string
  timeStr: string
  relative: string
  formatted: string
  fullTooltip: string
  isToday: boolean
  isYesterday: boolean
  assignedBy?: string | null
  assignedToName?: string | null
}

/**
 * Extracts the assignment ISO timestamp from a lead object.
 * Checks metadata.assigned_at first, then falls back to lead.created_at if assigned.
 */
export function getLeadAssignedTime(lead: any): string | null {
  if (!lead) return null
  const meta = lead.metadata || {}

  if (meta.assigned_at && typeof meta.assigned_at === 'string') {
    return meta.assigned_at
  }

  if (lead.assigned_at && typeof lead.assigned_at === 'string') {
    return lead.assigned_at
  }

  // Fallback: If lead has an owner, default assignment time is when lead was created
  if (lead.owner_id && lead.created_at) {
    return lead.created_at
  }

  return null
}

/**
 * Formats any assignment timestamp or lead object into a clean human-readable date & time
 */
export function formatAssignedDate(input?: any | string | Date | null): AssignedDateInfo {
  let isoString: string | null = null
  let assignedBy: string | null = null
  let assignedToName: string | null = null

  if (input && typeof input === 'object' && !(input instanceof Date)) {
    isoString = getLeadAssignedTime(input)
    assignedBy = input.metadata?.assigned_by || null
    assignedToName = input.owner?.name || input.metadata?.assigned_to_name || null
  } else if (typeof input === 'string') {
    isoString = input
  } else if (input instanceof Date) {
    isoString = input.toISOString()
  }

  if (!isoString) {
    return {
      hasAssigned: false,
      isoTime: null,
      dateStr: '',
      timeStr: '',
      relative: '',
      formatted: 'Not assigned',
      fullTooltip: 'This lead is currently unassigned',
      isToday: false,
      isYesterday: false,
      assignedBy,
      assignedToName
    }
  }

  const d = new Date(isoString)
  if (isNaN(d.getTime())) {
    return {
      hasAssigned: false,
      isoTime: null,
      dateStr: '',
      timeStr: '',
      relative: '',
      formatted: 'Not assigned',
      fullTooltip: 'Invalid assignment date',
      isToday: false,
      isYesterday: false,
      assignedBy,
      assignedToName
    }
  }

  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.max(0, Math.floor(diffMs / 1000))
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  let relative = ''
  if (diffSecs < 60) relative = 'Just now'
  else if (diffMins < 60) relative = `${diffMins}m ago`
  else if (diffHours < 24) relative = `${diffHours}h ago`
  else if (diffDays === 1) relative = '1d ago'
  else if (diffDays < 30) relative = `${diffDays}d ago`
  else relative = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

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
  const assignedByText = assignedBy ? ` by ${assignedBy}` : ''
  const assignedToText = assignedToName ? ` to ${assignedToName}` : ''
  const fullTooltip = `Assigned${assignedToText}${assignedByText}: ${weekdayName}, ${fullDateFormatted} at ${timeStr} (${relative})`

  return {
    hasAssigned: true,
    isoTime: isoString,
    dateStr,
    timeStr,
    relative,
    formatted,
    fullTooltip,
    isToday,
    isYesterday,
    assignedBy,
    assignedToName
  }
}

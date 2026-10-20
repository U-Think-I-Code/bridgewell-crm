/**
 * Follow-up SOP and Automatic Scheduling Rules
 */

export interface FollowUpRuleConfig {
  noAnswerDelayHours: number // Default: 4
  busyDelayHours: number // Default: 2
  connectedDelayDays: number // Default: 2
  reminderLeadTimeMins: number // Default: 15
}

export const DEFAULT_FOLLOWUP_CONFIG: FollowUpRuleConfig = {
  noAnswerDelayHours: 4,
  busyDelayHours: 2,
  connectedDelayDays: 2,
  reminderLeadTimeMins: 15,
}

/**
 * Calculate the next recommended follow-up date based on call outcome
 * Taking into account business calling hours (9:30 AM - 6:30 PM).
 */
export function calculateAutoFollowUp(outcome: string, config: FollowUpRuleConfig = DEFAULT_FOLLOWUP_CONFIG): Date | null {
  const now = new Date()

  if (outcome === 'Wrong Num' || outcome === 'Wrong Number') {
    return null
  }

  const target = new Date(now)

  if (outcome === 'Connected') {
    // Schedule 2 days ahead at 11:00 AM
    target.setDate(target.getDate() + config.connectedDelayDays)
    target.setHours(11, 0, 0, 0)

    // If Sunday, push to Monday
    if (target.getDay() === 0) {
      target.setDate(target.getDate() + 1)
    }
    return target
  }

  if (outcome === 'No Answer') {
    target.setHours(target.getHours() + config.noAnswerDelayHours)

    // If after 6:30 PM, roll over to next business morning 10:00 AM
    if (target.getHours() >= 18 || (target.getHours() === 18 && target.getMinutes() > 30)) {
      target.setDate(target.getDate() + 1)
      target.setHours(10, 0, 0, 0)
    }
    // If Sunday, push to Monday
    if (target.getDay() === 0) {
      target.setDate(target.getDate() + 1)
    }
    return target
  }

  if (outcome === 'Busy') {
    target.setHours(target.getHours() + config.busyDelayHours)

    // If after 6:30 PM, roll over to next business morning 10:30 AM
    if (target.getHours() >= 18 || (target.getHours() === 18 && target.getMinutes() > 30)) {
      target.setDate(target.getDate() + 1)
      target.setHours(10, 30, 0, 0)
    }
    if (target.getDay() === 0) {
      target.setDate(target.getDate() + 1)
    }
    return target
  }

  // Default fallback: 24 hours later
  target.setDate(target.getDate() + 1)
  target.setHours(11, 0, 0, 0)
  return target
}

/**
 * Format minutes remaining or overdue
 */
export function getFollowUpStatus(dateStr: string) {
  const now = Date.now()
  const followUpTime = new Date(dateStr).getTime()
  const diffMs = followUpTime - now
  const diffMins = Math.round(diffMs / 60000)

  if (diffMins < -60 * 24) {
    const days = Math.abs(Math.round(diffMins / (60 * 24)))
    return { status: 'overdue', label: `${days}d overdue`, isOverdue: true, diffMins }
  }
  if (diffMins < -60) {
    const hours = Math.abs(Math.round(diffMins / 60))
    return { status: 'overdue', label: `${hours}h overdue`, isOverdue: true, diffMins }
  }
  if (diffMins < 0) {
    return { status: 'overdue', label: `${Math.abs(diffMins)}m overdue`, isOverdue: true, diffMins }
  }
  if (diffMins <= 15) {
    return { status: 'due_soon', label: `Due in ${diffMins}m`, isDueSoon: true, diffMins }
  }
  if (diffMins <= 60) {
    return { status: 'due_today', label: `In ${diffMins}m`, isDueSoon: false, diffMins }
  }
  if (diffMins <= 60 * 12) {
    const hours = Math.round(diffMins / 60)
    return { status: 'today', label: `In ${hours}h`, isDueSoon: false, diffMins }
  }
  const days = Math.round(diffMins / (60 * 24))
  return { status: 'upcoming', label: `In ${days}d`, isDueSoon: false, diffMins }
}

/**
 * Convert any date string / Date to YYYY-MM-DDTHH:mm formatted for datetime-local input
 * in local timezone, preserving local user time without UTC shifts.
 */
export function toLocalDatetimeString(dateInput: Date | string | null | undefined): string {
  if (!dateInput) return ''
  const d = new Date(dateInput)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

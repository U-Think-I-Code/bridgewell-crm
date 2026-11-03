/**
 * Call Activity De-duplication Utility
 * 
 * Ensures CRM call metrics 100% match CallHippo's Agent Performance Report.
 * 
 * In real-world VoIP workflows, a single call can generate multiple activity rows:
 *  1. CRM click-to-call timer record (on start)
 *  2. CallHippo webhook event (on completion with duration & recording)
 *  3. Manual disposition / notes saved by counselor
 * 
 * This utility aggregates records for the same lead and counselor within a 10-minute window
 * into 1 single call session, prioritizing official CallHippo webhook logs.
 */

export interface CallActivityItem {
  id: string
  lead?: string | null
  lead_id?: string | null
  user_id?: string | null
  type?: string | null
  outcome?: string | null
  text?: string | null
  time?: string | null
  [key: string]: any
}

export function deduplicateCallActivities<T extends CallActivityItem>(activities: T[]): T[] {
  if (!activities || activities.length === 0) return []

  // Filter only call activities
  const callActs = activities.filter(a => a.type?.toLowerCase() === 'call')
  if (callActs.length === 0) return []

  // Sort chronologically (oldest to newest)
  const sorted = [...callActs].sort((a, b) => {
    const aTime = a.time ? new Date(a.time).getTime() : 0
    const bTime = b.time ? new Date(b.time).getTime() : 0
    return aTime - bTime
  })

  const sessions: (T & { _timeMs: number })[] = []

  sorted.forEach(act => {
    const actTime = act.time ? new Date(act.time).getTime() : 0
    const leadKey = act.lead || act.lead_id || act.id
    const userKey = act.user_id || 'unassigned'

    // Match if same lead and same user within 10 minutes (600,000ms)
    const existingIndex = sessions.findIndex(s => {
      const sLead = s.lead || s.lead_id || s.id
      const sUser = s.user_id || 'unassigned'
      return sLead === leadKey && sUser === userKey && Math.abs(s._timeMs - actTime) < 10 * 60 * 1000
    })

    if (existingIndex === -1) {
      sessions.push({
        ...act,
        _timeMs: actTime
      })
    } else {
      const existing = sessions[existingIndex]
      const isCurrentWebhook = !!(act.text && act.text.includes('🎙️ CallHippo'))
      const isExistingWebhook = !!(existing.text && existing.text.includes('🎙️ CallHippo'))

      // If this row is from CallHippo webhook, promote it as the primary record for this call
      if (isCurrentWebhook && !isExistingWebhook) {
        sessions[existingIndex] = {
          ...act,
          _timeMs: actTime
        }
      } else if (act.outcome && (!existing.outcome || existing.outcome === 'Calling')) {
        sessions[existingIndex].outcome = act.outcome
      }

      // Preserve notes if present in secondary record
      if (act.text && !existing.text?.includes(act.text)) {
        if (!isCurrentWebhook && act.text.includes('Notes:')) {
          sessions[existingIndex].text = `${sessions[existingIndex].text || ''}\n${act.text}`
        }
      }
    }
  })

  // Return without internal metadata
  return sessions.map(({ _timeMs, ...rest }) => rest as unknown as T)
}

/**
 * Returns exact count of unique calls (matching CallHippo Agent Performance Report)
 */
export function countRealCalls(activities: CallActivityItem[]): number {
  return deduplicateCallActivities(activities).length
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Format duration in seconds into human-readable text (e.g. "3m 45s" or "45s")
 */
function formatCallDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s (Not Connected)'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins === 0) return `${secs}s`
  if (secs === 0) return `${mins}m`
  return `${mins}m ${secs}s`
}

/**
 * Clean phone number for database lookup
 */
function cleanPhone(raw: string): string {
  return (raw || '').replace(/[^\d+]/g, '')
}

/**
 * GET Handler: Ping/Status check for JustCall webhook verification
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'Bridgewell CRM - JustCall Automatic Call Logger Webhook',
    timestamp: new Date().toISOString(),
    supported_events: ['call.completed', 'call_ended', 'call.logged'],
    instructions: 'Set this endpoint URL as your Webhook URL in JustCall Dashboard > Integrations > Webhooks.'
  })
}

/**
 * POST Handler: Process JustCall Call Completed Webhooks
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Parse payload (supports JSON and form-urlencoded)
    let body: any = {}
    const contentType = request.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      body = await request.json()
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData()
      const entries: Record<string, any> = {}
      formData.forEach((val, key) => { entries[key] = val })
      body = entries
    } else {
      // Fallback text to JSON
      try {
        const rawText = await request.text()
        body = JSON.parse(rawText)
      } catch {
        body = {}
      }
    }

    // JustCall payload may wrap fields inside `data`
    const payload = body?.data || body || {}

    // Extract core call details from JustCall payload
    const rawPhone = payload.contact_number || 
                     payload.to_number || 
                     payload.customer_number || 
                     payload.from_number || 
                     payload.phone || 
                     payload.contact_phone || 
                     ''

    const durationRaw = payload.call_info?.duration ?? 
                        payload.duration ?? 
                        payload.call_duration ?? 
                        payload.call_duration_seconds ?? 
                        0
    const durationSeconds = typeof durationRaw === 'number' ? durationRaw : parseInt(durationRaw, 10) || 0

    const rawCallType = payload.call_info?.type || 
                        payload.call_type || 
                        payload.call_status || 
                        payload.status || 
                        payload.type || 
                        ''

    const direction = payload.call_info?.direction || payload.direction || 'Outgoing'
    const recordingUrl = payload.recording || 
                         payload.call_recording || 
                         payload.recording_url || 
                         payload.call_info?.recording || 
                         ''

    const agentEmail = payload.agent_email || payload.user_email || ''
    const agentName = payload.agent_name || payload.user_name || (agentEmail ? agentEmail.split('@')[0] : 'Counselor')
    const justcallNotes = payload.notes || payload.call_notes || payload.note || ''
    const disposition = payload.disposition || payload.call_disposition || ''

    // 2. Determine Call Outcome (Connected vs No Answer vs Busy)
    const normalizedType = String(rawCallType).toLowerCase()
    let outcome = 'Connected'
    
    if (normalizedType.includes('busy')) {
      outcome = 'Busy'
    } else if (
      normalizedType.includes('missed') || 
      normalizedType.includes('unanswered') || 
      normalizedType.includes('cancel') || 
      normalizedType.includes('fail') || 
      (durationSeconds === 0 && !normalizedType.includes('answered'))
    ) {
      outcome = 'No Answer'
    } else if (durationSeconds > 0 || normalizedType.includes('answered') || normalizedType.includes('completed')) {
      outcome = 'Connected'
    }

    const formattedDuration = formatCallDuration(durationSeconds)

    if (!rawPhone) {
      return NextResponse.json(
        { success: false, message: 'No contact_number provided in JustCall payload' },
        { status: 400 }
      )
    }

    // 3. Find matching lead in Supabase
    const cleaned = cleanPhone(rawPhone)
    const last10 = cleaned.slice(-10)

    let matchingLead: any = null

    // Exact match
    const { data: exactLeads } = await supabase
      .from('leads')
      .select('*')
      .eq('phone', cleaned)
      .limit(1)

    if (exactLeads && exactLeads.length > 0) {
      matchingLead = exactLeads[0]
    } else {
      // Match without leading '+'
      const phoneNoPlus = cleaned.replace(/^\+/, '')
      const { data: noPlusLeads } = await supabase
        .from('leads')
        .select('*')
        .eq('phone', phoneNoPlus)
        .limit(1)

      if (noPlusLeads && noPlusLeads.length > 0) {
        matchingLead = noPlusLeads[0]
      } else if (last10.length >= 8) {
        // Fallback: match by last 10 digits (handles country code formatting differences)
        const { data: endsWithLeads } = await supabase
          .from('leads')
          .select('*')
          .ilike('phone', `%${last10}`)
          .limit(1)

        if (endsWithLeads && endsWithLeads.length > 0) {
          matchingLead = endsWithLeads[0]
        }
      }
    }

    if (!matchingLead) {
      console.warn(`[JustCall Webhook] No matching lead found for phone: ${rawPhone} (clean: ${cleaned})`)
      return NextResponse.json({
        success: false,
        message: `No lead found for phone ${rawPhone}. Call event logged.`,
        call_details: { phone: rawPhone, duration: formattedDuration, outcome, agent: agentName }
      }, { status: 200 })
    }

    // 4. Resolve counselor User ID in database
    let counselorUserId = matchingLead.owner_id
    if (agentEmail) {
      const { data: userData } = await supabase
        .from('users')
        .select('id, name')
        .eq('email', agentEmail.toLowerCase().trim())
        .limit(1)

      if (userData && userData.length > 0) {
        counselorUserId = userData[0].id
      }
    }

    // 5. Construct formatted activity text
    const activityLines = [
      `📞 JustCall Call (${outcome})`,
      `• Direction: ${direction}`,
      `• Duration: ${formattedDuration} (${durationSeconds}s)`,
      `• Counselor: ${agentName}${agentEmail ? ` (${agentEmail})` : ''}`,
    ]

    if (disposition) {
      activityLines.push(`• Disposition: ${disposition}`)
    }
    if (recordingUrl) {
      activityLines.push(`• Recording: ${recordingUrl}`)
    }
    if (justcallNotes) {
      activityLines.push(`\n📝 Call Notes from JustCall:\n${justcallNotes}`)
    }

    const activityText = activityLines.join('\n')

    // 6. Insert call activity into lead timeline
    const { error: actError } = await supabase.from('activities').insert([
      {
        lead: matchingLead.id,
        user_id: counselorUserId,
        type: 'call',
        outcome: outcome,
        text: activityText,
        time: new Date().toISOString()
      }
    ])

    if (actError) {
      console.error('[JustCall Webhook] Failed to insert activity:', actError)
    }

    // 7. Update Lead stats (attempts, last_call_outcome, metadata)
    const isUnanswered = ['No Answer', 'Busy'].includes(outcome)
    const newAttempts = isUnanswered ? (matchingLead.attempts || 0) + 1 : matchingLead.attempts

    const currentMetadata = matchingLead.metadata || {}
    const updatedMetadata = {
      ...currentMetadata,
      last_call_duration: formattedDuration,
      last_call_duration_seconds: durationSeconds,
      last_call_outcome: outcome,
      last_call_at: new Date().toISOString(),
      last_call_agent: agentName,
      ...(recordingUrl ? { last_call_recording: recordingUrl } : {})
    }

    const { error: leadUpdateError } = await supabase
      .from('leads')
      .update({
        attempts: newAttempts,
        last_call_outcome: outcome,
        metadata: updatedMetadata,
        updated_at: new Date().toISOString()
      })
      .eq('id', matchingLead.id)

    if (leadUpdateError) {
      console.error('[JustCall Webhook] Failed to update lead:', leadUpdateError)
    }

    return NextResponse.json({
      success: true,
      message: 'Call logged successfully via JustCall webhook',
      lead_id: matchingLead.id,
      lead_name: matchingLead.name,
      outcome,
      duration: formattedDuration,
      duration_seconds: durationSeconds,
      recording: recordingUrl || null,
      agent: agentName
    })
  } catch (error: any) {
    console.error('[JustCall Webhook] Internal server error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

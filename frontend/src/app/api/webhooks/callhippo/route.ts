import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Format duration in seconds into human-readable text (e.g. "2m 15s" or "45s")
 */
function formatCallDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s (Not Answered)'
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
 * GET Handler: Verification & Ping for CallHippo webhook setup
 */
export async function GET() {
  return NextResponse.json({
    status: 'active',
    service: 'Bridgewell CRM - CallHippo Automatic Call Logger Webhook',
    timestamp: new Date().toISOString(),
    supported_events: ['call.completed', 'call.ended', 'call.answered', 'call.missed', 'call.recording'],
    instructions: 'Set this endpoint URL as your Webhook URL in CallHippo Dashboard > Integrations > Webhook.'
  }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    }
  })
}

/**
 * HEAD Handler: Verification for webhook checkers
 */
export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
    }
  })
}

/**
 * OPTIONS Handler: CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Allow': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }
  })
}

/**
 * POST Handler: Process CallHippo Call Completed & Recording Webhooks
 */
export async function POST(request: NextRequest) {
  try {
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
      try {
        const rawText = await request.text()
        body = JSON.parse(rawText)
      } catch {
        body = {}
      }
    }

    // CallHippo payload might be wrapped inside `data` or at root
    const payload = body?.data || body || {}

    // Extract student/contact phone number
    const rawPhone = payload.customer_number || 
                     payload.to || 
                     payload.destination || 
                     payload.recipient || 
                     payload.contact_number || 
                     payload.phone || 
                     payload.contact_phone || 
                     payload.from || 
                     ''

    // Extract call duration in seconds (check talk_time first as it represents actual conversation time)
    let durationSeconds = 0
    if (typeof payload.talk_time === 'number') {
      durationSeconds = payload.talk_time
    } else if (typeof payload.duration === 'number') {
      durationSeconds = payload.duration
    } else if (typeof payload.call_duration === 'number') {
      durationSeconds = payload.call_duration
    } else if (typeof payload.bill_seconds === 'number') {
      durationSeconds = payload.bill_seconds
    } else if (payload.talk_time !== undefined) {
      durationSeconds = parseInt(String(payload.talk_time), 10) || 0
    } else if (payload.duration !== undefined) {
      durationSeconds = parseInt(String(payload.duration), 10) || 0
    } else if (payload.call_duration !== undefined) {
      durationSeconds = parseInt(String(payload.call_duration), 10) || 0
    } else if (payload.bill_seconds !== undefined) {
      durationSeconds = parseInt(String(payload.bill_seconds), 10) || 0
    }

    // Extract Call Status / Outcome
    const rawStatus = (
      payload.status || 
      payload.call_status || 
      payload.disposition || 
      payload.call_disposition || 
      payload.event || 
      ''
    ).toLowerCase()

    const direction = payload.direction || payload.call_type || 'Outbound'

    // Extract Call Recording URL
    const recordingUrl = payload.recording_url || 
                         payload.call_recording_url || 
                         payload.recording || 
                         payload.media_url || 
                         payload.audio_url || 
                         ''

    // Extract Counselor / Agent details
    const agentEmail = payload.agent_email || payload.user_email || ''
    const agentName = payload.agent_name || payload.user_name || (agentEmail ? agentEmail.split('@')[0] : 'Counselor')
    const callNotes = payload.notes || payload.call_notes || payload.note || ''

    // Determine normalized outcome for Bridgewell CRM
    // CRITICAL FIX: A call is ONLY 'Connected' if client ACTUALLY answered and spoke (durationSeconds > 0)!
    // If duration is 0 seconds (0s Not Answered), outcome is strictly 'No Answer' or 'Busy'.
    // In SIP/CallHippo, 'completed' merely means call session ended, NEVER that client picked up.
    let outcome = 'No Answer'
    if (
      rawStatus.includes('busy') || 
      rawStatus.includes('rejected') || 
      rawStatus.includes('declined') ||
      rawStatus.includes('failed') || 
      rawStatus.includes('cancelled')
    ) {
      outcome = 'Busy'
    } else if (
      rawStatus.includes('no-answer') || 
      rawStatus.includes('no answer') || 
      rawStatus.includes('missed') || 
      rawStatus.includes('unanswered') ||
      rawStatus.includes('ring')
    ) {
      outcome = 'No Answer'
    } else if (rawStatus.includes('callback') || rawStatus.includes('call back')) {
      outcome = 'Call back'
    } else if (durationSeconds > 0) {
      // Legitimate answered conversation with client
      outcome = 'Connected'
    } else {
      // 0 seconds with status "completed" or "call.completed" is strictly No Answer
      outcome = 'No Answer'
    }

    const digitsOnly = (rawPhone || '').replace(/\D/g, '')
    const noTrunk = digitsOnly
      .replace(/^440/, '44')
      .replace(/^910/, '91')
      .replace(/^10/, '1')

    const last10 = digitsOnly.slice(-10)
    const last10NoTrunk = noTrunk.slice(-10)

    if (!last10 && !last10NoTrunk) {
      return NextResponse.json({
        success: false,
        message: 'No valid phone number found in CallHippo webhook payload',
        received_payload: payload
      }, { status: 400 })
    }

    // Try finding lead using both last10 and last10NoTrunk
    const orQuery = last10 === last10NoTrunk 
      ? `phone.ilike.%${last10}%` 
      : `phone.ilike.%${last10}%,phone.ilike.%${last10NoTrunk}%`

    // Find the student in Bridgewell CRM leads table
    const { data: leads, error: leadSearchError } = await supabase
      .from('leads')
      .select('id, name, phone, attempts, stage, priority, owner_id, metadata')
      .or(orQuery)
      .limit(3)

    if (leadSearchError) {
      console.error('[CallHippo Webhook] Database lookup error:', leadSearchError)
      return NextResponse.json({ success: false, error: leadSearchError.message }, { status: 500 })
    }

    const matchedLead = leads && leads.length > 0 ? leads[0] : null

    // 1. Identify counselor/agent user ID accurately from CallHippo agent email or name
    let counselorUserId = matchedLead?.owner_id || null
    if (agentEmail) {
      try {
        const { data: agentUser } = await supabase
          .from('users')
          .select('id')
          .ilike('email', agentEmail.trim())
          .limit(1)
          .maybeSingle()
        if (agentUser?.id) {
          counselorUserId = agentUser.id
        }
      } catch {}
    }
    if (!counselorUserId && agentName && agentName !== 'Counselor') {
      try {
        const { data: agentUser } = await supabase
          .from('users')
          .select('id')
          .ilike('name', `%${agentName.trim()}%`)
          .limit(1)
          .maybeSingle()
        if (agentUser?.id) {
          counselorUserId = agentUser.id
        }
      } catch {}
    }

    if (!matchedLead) {
      // Still log general audit entry so no call is lost
      try {
        await supabase.from('audit_logs').insert([{
          action: 'CALLHIPPO_UNMATCHED_CALL',
          summary: `CallHippo call from ${agentName} (${outcome}, ${formatCallDuration(durationSeconds)}) for unlisted number: ${rawPhone}`,
          new_value: rawPhone,
          created_at: new Date().toISOString()
        }])
      } catch (err) {
        console.error('[CallHippo Webhook] Failed to insert audit log for unmatched call:', err)
      }

      // If we identified the counselor, insert a call activity so their call count in CRM matches CallHippo!
      if (counselorUserId) {
        const unmatchedActivityText = [
          `🎙️ CallHippo Call Logged (${outcome})`,
          `• Destination: ${rawPhone}`,
          `• Call Duration: ${formatCallDuration(durationSeconds)}`,
          `• Outcome: ${outcome}`,
          `• Direction: ${direction}`,
          `• Agent: ${agentName}${agentEmail ? ` (${agentEmail})` : ''}`,
          callNotes ? `• Notes: ${callNotes}` : null,
          recordingUrl ? `• Recording: ${recordingUrl}` : null,
        ].filter(Boolean).join('\n')

        // De-duplicate if webhook sends multiple events (e.g. answered + completed) for the same unmatched destination
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const { data: recentUnmatchedActs } = await supabase
          .from('activities')
          .select('id')
          .eq('user_id', counselorUserId)
          .eq('type', 'call')
          .ilike('text', `%${rawPhone}%`)
          .gte('time', fiveMinutesAgo)
          .limit(1)

        if (recentUnmatchedActs && recentUnmatchedActs.length > 0) {
          await supabase.from('activities').update({
            outcome,
            text: unmatchedActivityText
          }).eq('id', recentUnmatchedActs[0].id)
        } else {
          await supabase.from('activities').insert([{
            lead: null,
            user_id: counselorUserId,
            type: 'call',
            outcome,
            text: unmatchedActivityText,
            time: new Date().toISOString()
          }])
        }
      }

      return NextResponse.json({
        success: true,
        matched: false,
        counted_for_counselor: !!counselorUserId,
        message: `Call processed for ${rawPhone}. Outcome: ${outcome}, Duration: ${durationSeconds}s`
      })
    }

    // 2. Log Activity to Student Timeline (de-duplicate against frontend call timer)
    const activityText = [
      `🎙️ CallHippo Call Logged (${outcome})`,
      `• Call Duration: ${formatCallDuration(durationSeconds)}`,
      `• Outcome: ${outcome}`,
      `• Direction: ${direction}`,
      `• Agent: ${agentName}${agentEmail ? ` (${agentEmail})` : ''}`,
      callNotes ? `• Notes: ${callNotes}` : null,
      recordingUrl ? `• Recording: ${recordingUrl}` : null,
    ].filter(Boolean).join('\n')

    // Check if an in-progress or recent call activity already exists for this lead within last 15 minutes
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: existingCallActs } = await supabase
      .from('activities')
      .select('id, text')
      .eq('lead', matchedLead.id)
      .eq('type', 'call')
      .gte('time', fifteenMinutesAgo)
      .order('time', { ascending: false })
      .limit(1)

    if (existingCallActs && existingCallActs.length > 0) {
      // Merge official CallHippo details into existing activity so no duplicate record is created!
      await supabase.from('activities').update({
        outcome: outcome,
        text: activityText,
        user_id: counselorUserId,
        time: new Date().toISOString()
      }).eq('id', existingCallActs[0].id)
    } else {
      await supabase.from('activities').insert([{
        lead: matchedLead.id,
        user_id: counselorUserId,
        type: 'call',
        outcome: outcome,
        text: activityText,
        time: new Date().toISOString()
      }])
    }

    // 2. Update Lead record (attempts, outcome, last contact)
    const newAttempts = (matchedLead.attempts || 0) + 1
    const nowIso = new Date().toISOString()
    const updatePayload: Record<string, any> = {
      last_call_outcome: outcome,
      attempts: newAttempts,
      metadata: {
        ...((matchedLead as any)?.metadata || {}),
        last_call_at: nowIso,
        last_call_outcome: outcome
      }
    }

    // Auto-update stage based on verified call outcome
    // IMPORTANT: 'Connected' stage is ONLY allowed if durationSeconds > 0 (client actually answered and spoke)
    if ((outcome === 'Ringing' || outcome === 'No Answer') && (!matchedLead.stage || matchedLead.stage === 'New' || matchedLead.stage === 'Attempted contact')) {
      updatePayload.stage = 'Ringing'
    } else if ((outcome === 'Callback' || outcome === 'Call back') && (!matchedLead.stage || matchedLead.stage === 'New' || matchedLead.stage === 'Attempted contact' || matchedLead.stage === 'Ringing')) {
      updatePayload.stage = 'Call back'
    } else if (outcome === 'Connected' && durationSeconds > 0) {
      if (!matchedLead.stage || matchedLead.stage === 'New' || matchedLead.stage === 'Attempted contact' || matchedLead.stage === 'Ringing' || matchedLead.stage === 'Not connected' || matchedLead.stage === 'Call back' || matchedLead.stage === 'Connected') {
        updatePayload.stage = 'Connect 1'
      } else if (matchedLead.stage === 'Connect 1' || matchedLead.stage === 'Connected 1') {
        updatePayload.stage = 'Connect 2'
      } else if (matchedLead.stage === 'Connect 2' || matchedLead.stage === 'Connected 2') {
        updatePayload.stage = 'Connect 3'
      }
    }

    // CRITICAL: Priority is strictly preserved and NEVER automatically forced to 'Warm'.
    // Only counselors assess and assign lead temperature (Hot, Warm, Cold).

    await supabase.from('leads').update(updatePayload).eq('id', matchedLead.id)

    return NextResponse.json({
      success: true,
      matched: true,
      lead_id: matchedLead.id,
      lead_name: matchedLead.name,
      outcome: outcome,
      duration: formatCallDuration(durationSeconds),
      has_recording: !!recordingUrl,
      message: `CallHippo call successfully logged for ${matchedLead.name} (${outcome})`
    })

  } catch (err: any) {
    console.error('[CallHippo Webhook] Exception:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import crypto from 'crypto'

// Verify token for Meta webhook handshake (configurable via env)
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'bridgewell_meta_webhook_2026'
const APP_SECRET = process.env.META_APP_SECRET || ''

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

/**
 * Verify Meta X-Hub-Signature-256 HMAC
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!appSecret) return true // Bypass if secret not set in dev
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  
  const expectedHash = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const expectedHeader = `sha256=${expectedHash}`
  return safeCompare(signatureHeader, expectedHeader)
}

/**
 * Helper: Detect Target Country from explicit field, campaign name, ad name, form name, or phone code
 */
function detectTargetCountry(data: {
  country?: string
  campaign_name?: string
  ad_name?: string
  form_name?: string
  source?: string
  course?: string
  phone?: string
}): string {
  // 1. Explicit country if provided and valid
  if (data.country && data.country.trim() && data.country !== 'global') {
    const c = data.country.trim().toUpperCase()
    if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return 'USA'
    if (c === 'UK' || c === 'UNITED KINGDOM' || c === 'ENGLAND' || c === 'BRITAIN') return 'UK'
    if (c === 'CAN' || c === 'CANADA') return 'Canada'
    if (c === 'AUS' || c === 'AUSTRALIA') return 'Australia'
    if (c === 'GERMANY' || c === 'DE') return 'Germany'
    if (c === 'IRELAND' || c === 'IE') return 'Ireland'
    if (c === 'UAE' || c === 'DUBAI') return 'UAE'
    if (c === 'INDIA' || c === 'IN') return 'India'
    // Capitalize first letter
    return data.country.charAt(0).toUpperCase() + data.country.slice(1)
  }

  // 2. Scan text strings in campaign_name, ad_name, form_name, course, source
  const haystack = [
    data.campaign_name || '',
    data.ad_name || '',
    data.form_name || '',
    data.source || '',
    data.course || '',
  ].join(' ').toUpperCase()

  if (/\b(USA|US AD|UNITED STATES|AMERICA)\b/.test(haystack)) return 'USA'
  if (/\b(UK|UNITED KINGDOM|BRITAIN|LONDON|ENGLAND)\b/.test(haystack)) return 'UK'
  if (/\b(CANADA|CANADIAN|TORONTO|VANCOUVER)\b/.test(haystack)) return 'Canada'
  if (/\b(AUSTRALIA|AUST|SYDNEY|MELBOURNE)\b/.test(haystack)) return 'Australia'
  if (/\b(GERMANY|DEUTSCHLAND|BERLIN)\b/.test(haystack)) return 'Germany'
  if (/\b(IRELAND|DUBLIN)\b/.test(haystack)) return 'Ireland'
  if (/\b(DUBAI|UAE|EMIRATES)\b/.test(haystack)) return 'UAE'
  if (/\b(INDIA|DELHI|MUMBAI)\b/.test(haystack)) return 'India'

  // 3. Fallback to phone number country prefix
  const phone = (data.phone || '').trim().replace(/[^0-9+]/g, '')
  if (phone.startsWith('+44')) return 'UK'
  if (phone.startsWith('+1')) return 'USA'
  if (phone.startsWith('+61')) return 'Australia'
  if (phone.startsWith('+49')) return 'Germany'
  if (phone.startsWith('+353')) return 'Ireland'
  if (phone.startsWith('+971')) return 'UAE'
  if (phone.startsWith('+91')) return 'India'

  return 'Global'
}

/**
 * GET Handler: Meta Webhook Verification Handshake
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token && safeCompare(token, VERIFY_TOKEN)) {
    console.log('[Meta Webhook] Verification handshake successful!')
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Verification token mismatch' }, { status: 403 })
}

/**
 * POST Handler: Ingest Lead from Meta Ads (Segregated by Country & Campaign)
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // Verify HMAC signature if secret configured
    const signature = request.headers.get('x-hub-signature-256')
    if (APP_SECRET && !verifyMetaSignature(rawBody, signature, APP_SECRET)) {
      console.warn('[Meta Webhook] Rejected unauthorized POST: HMAC signature mismatch')
      return NextResponse.json({ error: 'Invalid HMAC signature' }, { status: 401 })
    }

    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 })
    }

    let leadData: {
      name: string
      phone: string
      email?: string
      country?: string
      course?: string
      programme_level?: string
      city?: string
      source?: string
      campaign_name?: string
      ad_name?: string
      form_name?: string
      raw_meta?: any
    } | null = null

    // Check if this is a direct Meta LeadGen webhook payload
    if (body.object === 'page' && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.field === 'leadgen' && change.value) {
              const leadgenId = change.value.leadgen_id
              const formId = change.value.form_id
              const pageId = change.value.page_id
              const adId = change.value.ad_id
              const campaignId = change.value.campaign_id

              // Security: Validate leadgenId is strictly numeric to prevent SSRF / Graph API traversal
              if (leadgenId && !/^\d+$/.test(String(leadgenId))) {
                console.warn('[Meta Webhook] Blocked malformed leadgen_id:', leadgenId)
                continue
              }

              const accessToken = process.env.META_PAGE_ACCESS_TOKEN
              if (accessToken && leadgenId) {
                try {
                  const graphRes = await fetch(
                    `https://graph.facebook.com/v21.0/${leadgenId}?access_token=${accessToken}`
                  )
                  if (graphRes.ok) {
                    const graphData = await graphRes.json()
                    let fullName = ''
                    let phoneNum = ''
                    let emailAddr = ''
                    let courseName = ''
                    let city = ''
                    let country = ''

                    if (Array.isArray(graphData.field_data)) {
                      for (const field of graphData.field_data) {
                        const val = field.values?.[0] || ''
                        const key = field.name.toLowerCase()
                        if (key.includes('name')) fullName = val
                        else if (key.includes('phone')) phoneNum = val
                        else if (key.includes('email')) emailAddr = val
                        else if (key.includes('course') || key.includes('programme') || key.includes('program')) courseName = val
                        else if (key.includes('city')) city = val
                        else if (key.includes('country') || key.includes('target')) country = val
                      }
                    }

                    leadData = {
                      name: fullName || `Meta Lead #${leadgenId.slice(-4)}`,
                      phone: phoneNum,
                      email: emailAddr,
                      country,
                      course: courseName,
                      city,
                      source: 'Meta Ads',
                      campaign_name: graphData.campaign_name || '',
                      ad_name: graphData.ad_name || '',
                      form_name: graphData.form_name || '',
                      raw_meta: { leadgenId, formId, pageId, adId, campaignId, graphData },
                    }
                  }
                } catch (graphErr) {
                  console.error('[Meta Webhook] Error fetching from Graph API:', graphErr)
                }
              }

              if (!leadData) {
                leadData = {
                  name: change.value.full_name || `Meta Lead #${String(leadgenId).slice(-4)}`,
                  phone: change.value.phone_number || change.value.phone || '',
                  email: change.value.email || '',
                  country: change.value.country || '',
                  source: 'Meta Ads',
                  campaign_name: change.value.campaign_name || '',
                  ad_name: change.value.ad_name || '',
                  form_name: change.value.form_name || '',
                  raw_meta: { leadgenId, formId, pageId },
                }
              }
            }
          }
        }
      }
    } else {
      // Direct JSON payload (Zapier, Make.com, Pabbly, or test simulation)
      leadData = {
        name: body.name || body.full_name || body.fullName || 'Meta Lead',
        phone: body.phone || body.phone_number || body.phoneNumber || '',
        email: body.email || '',
        country: body.country || body.target_country || body.targetCountry || '',
        course: body.course || body.course_interest || body.program || '',
        programme_level: body.programme_level || body.programmeLevel || body.level || '',
        city: body.city || '',
        source: body.source || 'Meta Ads',
        campaign_name: body.campaign_name || body.campaignName || body.ad_campaign || '',
        ad_name: body.ad_name || body.adName || '',
        form_name: body.form_name || body.formName || '',
        raw_meta: body,
      }
    }

    if (!leadData || !leadData.name) {
      return NextResponse.json({ error: 'Invalid lead data received' }, { status: 400 })
    }

    // Clean phone number
    const cleanPhone = leadData.phone ? leadData.phone.trim() : ''

    // Detect Country accurately from explicit country, campaign name, ad name, or phone prefix
    const targetCountry = detectTargetCountry({
      country: leadData.country,
      campaign_name: leadData.campaign_name,
      ad_name: leadData.ad_name,
      form_name: leadData.form_name,
      source: leadData.source,
      course: leadData.course,
      phone: cleanPhone,
    })

    // Differentiate source so it's instantly recognizable (e.g. "Meta Ads - USA")
    const formattedSource = targetCountry && targetCountry !== 'Global'
      ? `Meta Ads - ${targetCountry}`
      : (leadData.source || 'Meta Ads')

    // 1. Check for duplicates in leads table
    if (cleanPhone || leadData.email) {
      let filter = ''
      if (cleanPhone && leadData.email) {
        filter = `phone.eq.${cleanPhone},email.eq.${leadData.email}`
      } else if (cleanPhone) {
        filter = `phone.eq.${cleanPhone}`
      } else {
        filter = `email.eq.${leadData.email}`
      }

      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, name, owner_id, country')
        .or(filter)

      if (existingLeads && existingLeads.length > 0) {
        const existing = existingLeads[0]
        // Add note to existing lead's timeline
        await supabase.from('activities').insert([
          {
            lead: existing.id,
            type: 'system',
            text: `Duplicate enquiry received from [${targetCountry}] Ad campaign: ${leadData.campaign_name || formattedSource}.`,
            time: new Date().toISOString(),
          },
        ])

        return NextResponse.json({
          success: true,
          action: 'duplicate_updated',
          leadId: existing.id,
          country: existing.country || targetCountry,
          message: `Lead already exists. Noted under ${existing.country || targetCountry}.`,
        })
      }
    }

    // Metadata payload to preserve all campaign and ad set details
    const leadMetadata = {
      campaign_name: leadData.campaign_name || null,
      ad_name: leadData.ad_name || null,
      form_name: leadData.form_name || null,
      target_country: targetCountry,
      ingested_at: new Date().toISOString(),
      raw: leadData.raw_meta || null,
    }

    // 2. Insert new lead:
    // STRICTLY UNASSIGNED: owner_id = null so Admin manually assigns to respective counselor!
    const { data: insertedLead, error: insertError } = await supabase
      .from('leads')
      .insert([
        {
          name: leadData.name,
          phone: cleanPhone || 'Not provided',
          email: leadData.email || null,
          country: targetCountry,
          source: formattedSource,
          course: leadData.course || null,
          programme_level: leadData.programme_level || null,
          metadata: leadMetadata,
          stage: 'New',
          owner_id: null,
          priority: 'Warm',
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single()

    if (insertError) {
      console.error('[Meta Webhook] Lead insertion error:', insertError)
      return NextResponse.json({ error: 'Failed to record lead in database' }, { status: 500 })
    }

    const newLeadId = insertedLead.id

    // 3. Log initial activity in activities table
    await supabase.from('activities').insert([
      {
        lead: newLeadId,
        type: 'system',
        text: `New lead received from [${targetCountry} Ad Campaign] (${leadData.campaign_name || formattedSource}). Status: Unassigned (Awaiting Admin Assignment).`,
        time: new Date().toISOString(),
      },
    ])

    // 4. Send high-priority notification to Admin with distinct Country tag
    const countryFlag = 
      targetCountry === 'USA' ? '🇺🇸' :
      targetCountry === 'UK' ? '🇬🇧' :
      targetCountry === 'Canada' ? '🇨🇦' :
      targetCountry === 'Australia' ? '🇦🇺' :
      targetCountry === 'Germany' ? '🇩🇪' :
      targetCountry === 'Ireland' ? '🇮🇪' :
      targetCountry === 'UAE' ? '🇦🇪' : '🌍'

    await supabase.from('notifications').insert([
      {
        recipient_id: null, // Broadcast to Admin
        title: `${countryFlag} New [${targetCountry}] Ad Lead: ${leadData.name}`,
        message: `From ${targetCountry} Campaign (${leadData.campaign_name || formattedSource}). Phone: ${cleanPhone || 'No phone'}. Unassigned — please assign to counselor.`,
        type: 'lead_assigned',
        priority: 'high',
        link: `/reassign?country=${encodeURIComponent(targetCountry)}`,
        is_read: false,
      },
    ])

    return NextResponse.json({
      success: true,
      action: 'lead_created',
      leadId: newLeadId,
      country: targetCountry,
      source: formattedSource,
      assigned: false,
      message: `New [${targetCountry}] Meta lead created with Unassigned owner.`,
    })
  } catch (err: any) {
    console.error('[Meta Webhook] Server error:', err)
    return NextResponse.json({ error: 'Internal server error processing webhook' }, { status: 500 })
  }
}

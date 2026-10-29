import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/phoneHelper'
import { notifyLeadAssigned } from '@/lib/notifications'
import crypto from 'crypto'

// Verify token for Meta webhook handshake (configurable via env)
const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'bridgewell_meta_webhook_2026'
const APP_SECRET = process.env.META_APP_SECRET || ''
const SHARED_SECRET = process.env.META_WEBHOOK_SHARED_SECRET || ''

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
 * Verify Webhook Authentication:
 * 1. Checks `x-webhook-secret` header or `Authorization: Bearer <secret>` against META_WEBHOOK_SHARED_SECRET
 * 2. Or checks `x-hub-signature-256` HMAC against META_APP_SECRET (direct Meta Graph webhook)
 * 3. In dev mode without secrets, allows with warning; in production, strictly rejects unauthorized requests
 */
function verifyWebhookAuth(request: NextRequest, rawBody: string): { authorized: boolean; reason?: string } {
  const sharedSecret = process.env.META_WEBHOOK_SHARED_SECRET || SHARED_SECRET
  const appSecret = process.env.META_APP_SECRET || APP_SECRET

  // 1. Shared secret check (Zapier, Relay, or Custom Webhooks)
  const headerSecret = request.headers.get('x-webhook-secret')
  const authHeader = request.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const urlSecret = new URL(request.url).searchParams.get('secret')
  const providedSecret = headerSecret || bearerSecret || urlSecret

  if (sharedSecret) {
    if (providedSecret && safeCompare(providedSecret, sharedSecret)) {
      return { authorized: true }
    }
  }

  // 2. Direct Meta HMAC signature verification
  const signature = request.headers.get('x-hub-signature-256')
  if (appSecret && signature) {
    if (verifyMetaSignature(rawBody, signature, appSecret)) {
      return { authorized: true }
    }
  }

  // If sharedSecret was configured but provided secret didn't match
  if (sharedSecret) {
    return { authorized: false, reason: 'Invalid or missing x-webhook-secret header' }
  }

  // Dev mode fallback
  if (!sharedSecret && !appSecret && process.env.NODE_ENV !== 'production') {
    console.warn('[Meta Webhook] Warning: Neither META_WEBHOOK_SHARED_SECRET nor META_APP_SECRET configured. Allowed in development mode.')
    return { authorized: true }
  }

  // In production with appSecret configured but no signature
  if (!sharedSecret && appSecret) {
    return { authorized: false, reason: 'Missing or invalid x-hub-signature-256 header' }
  }

  return { authorized: false, reason: 'Webhook authentication required. Please set META_WEBHOOK_SHARED_SECRET.' }
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
  if (data.country && data.country.trim() && data.country.toLowerCase() !== 'global') {
    const c = data.country.trim().toUpperCase()
    if (c === 'US' || c === 'USA' || c === 'UNITED STATES') return 'USA'
    if (c === 'UK' || c === 'UNITED KINGDOM' || c === 'ENGLAND' || c === 'BRITAIN') return 'UK'
    if (c === 'CAN' || c === 'CANADA') return 'Canada'
    if (c === 'AUS' || c === 'AUSTRALIA') return 'Australia'
    if (c === 'GERMANY' || c === 'DE') return 'Germany'
    if (c === 'IRELAND' || c === 'IE') return 'Ireland'
    if (c === 'SA' || c === 'SAUDI' || c === 'SAUDI ARABIA' || c === 'KSA') return 'Saudi Arabia'
    if (c === 'ZA' || c === 'SOUTH AFRICA' || c === 'RSA') return 'South Africa'
    if (c === 'EU' || c === 'EUROPE') return 'Europe'
    if (c === 'UAE' || c === 'DUBAI') return 'UAE'
    if (c === 'INDIA' || c === 'IN') return 'India'
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
  if (/\b(SAUDI|KSA|RIYADH|JEDDAH)\b/.test(haystack)) return 'Saudi Arabia'
  if (/\b(SOUTH AFRICA|JOHANNESBURG|CAPE TOWN|RSA)\b/.test(haystack)) return 'South Africa'
  if (/\b(EUROPE|EUROPEAN|EU AD)\b/.test(haystack)) return 'Europe'
  if (/\b(DUBAI|UAE|EMIRATES)\b/.test(haystack)) return 'UAE'
  if (/\b(INDIA|DELHI|MUMBAI)\b/.test(haystack)) return 'India'

  // 3. Fallback to phone number country prefix
  const phone = (data.phone || '').trim().replace(/[^0-9+]/g, '')
  if (phone.startsWith('+44')) return 'UK'
  if (phone.startsWith('+1')) return 'USA'
  if (phone.startsWith('+61')) return 'Australia'
  if (phone.startsWith('+49')) return 'Germany'
  if (phone.startsWith('+353')) return 'Ireland'
  if (phone.startsWith('+966')) return 'Saudi Arabia'
  if (phone.startsWith('+27')) return 'South Africa'
  if (phone.startsWith('+971')) return 'UAE'
  if (phone.startsWith('+91')) return 'India'

  return 'Global'
}

/**
 * Format raw key into clean title case label
 */
function formatQuestionLabel(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase())
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
 * POST Handler: Ingest Lead from Meta Ads (Segregated by Country & Campaign, Authenticated via Shared Secret)
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()

    // 1. Verify Authentication (Secret Header or HMAC Signature)
    const auth = verifyWebhookAuth(request, rawBody)
    if (!auth.authorized) {
      console.warn('[Meta Webhook] Rejected unauthorized POST:', auth.reason)
      return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status: 401 })
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
      adset_name?: string
      form_name?: string
      ad_id?: string
      form_id?: string
      campaign_answers: Record<string, string>
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
              const campaignAnswers: Record<string, string> = {}
              let fullName = ''
              let phoneNum = ''
              let emailAddr = ''
              let courseName = ''
              let programmeLevel = ''
              let city = ''
              let country = ''
              let campaignName = change.value.campaign_name || ''
              let adName = change.value.ad_name || ''
              let formName = change.value.form_name || ''

              if (accessToken && leadgenId) {
                try {
                  const graphRes = await fetch(
                    `https://graph.facebook.com/v21.0/${leadgenId}?fields=created_time,id,ad_id,form_id,field_data,campaign_id,campaign_name,ad_name,form_name&access_token=${accessToken}`
                  )
                  if (graphRes.ok) {
                    const graphData = await graphRes.json()
                    campaignName = graphData.campaign_name || campaignName
                    adName = graphData.ad_name || adName
                    formName = graphData.form_name || formName

                    if (Array.isArray(graphData.field_data)) {
                      for (const field of graphData.field_data) {
                        const val = field.values?.[0] || ''
                        const rawName = field.name || ''
                        const key = rawName.toLowerCase()

                        if (key === 'full_name' || (key.includes('name') && !key.includes('campaign') && !key.includes('form') && !key.includes('ad') && !fullName)) {
                          fullName = val
                        } else if (key.includes('phone') && !phoneNum) {
                          phoneNum = val
                        } else if (key.includes('email') && !emailAddr) {
                          emailAddr = val
                        } else if ((key.includes('course') || key.includes('programme') || key.includes('program')) && !courseName) {
                          courseName = val
                        } else if (key.includes('city') && !city) {
                          city = val
                        } else if ((key.includes('country') || key.includes('target')) && !country) {
                          country = val
                        } else if (key.includes('level') || key.includes('degree') || key.includes('bachelor') || key.includes('master')) {
                          programmeLevel = val
                          campaignAnswers['Programme Level'] = val
                        } else if (val) {
                          // Qualification questions: intake, application stage, travel dates, etc.
                          const label = formatQuestionLabel(rawName)
                          campaignAnswers[label] = val
                        }
                      }
                    }

                    // Attempt to fetch Ad Name if still missing
                    if (!adName && (graphData.ad_id || adId)) {
                      try {
                        const adRes = await fetch(
                          `https://graph.facebook.com/v21.0/${graphData.ad_id || adId}?fields=name,campaign{name}&access_token=${accessToken}`
                        )
                        if (adRes.ok) {
                          const adJson = await adRes.json()
                          if (adJson.name) adName = adJson.name
                          if (!campaignName && adJson.campaign?.name) campaignName = adJson.campaign.name
                        }
                      } catch {}
                    }

                    // Attempt to fetch Form Name if still missing
                    if (!formName && (graphData.form_id || formId)) {
                      try {
                        const formRes = await fetch(
                          `https://graph.facebook.com/v21.0/${graphData.form_id || formId}?fields=name&access_token=${accessToken}`
                        )
                        if (formRes.ok) {
                          const formJson = await formRes.json()
                          if (formJson.name) formName = formJson.name
                        }
                      } catch {}
                    }

                    leadData = {
                      name: fullName || `Meta Lead #${leadgenId.slice(-4)}`,
                      phone: phoneNum,
                      email: emailAddr,
                      country,
                      course: courseName,
                      programme_level: programmeLevel,
                      city,
                      source: 'Meta Ads',
                      campaign_name: campaignName,
                      ad_name: adName,
                      form_name: formName,
                      ad_id: String(adId || ''),
                      form_id: String(formId || ''),
                      campaign_answers: campaignAnswers,
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
                  campaign_name: campaignName,
                  ad_name: adName,
                  form_name: formName,
                  ad_id: String(adId || ''),
                  form_id: String(formId || ''),
                  campaign_answers: campaignAnswers,
                  raw_meta: { leadgenId, formId, pageId },
                }
              }
            }
          }
        }
      }
    } else {
      // Direct JSON payload (Zapier, Relay, Make, or Test Simulation)
      const campaignAnswers: Record<string, string> = {}

      // 1. Process nested questions/answers if present in standard formats
      const nestedAnswers = body.campaign_answers || body.qualification_answers || body.answers || body.form_data || body.questions
      if (nestedAnswers && typeof nestedAnswers === 'object') {
        if (Array.isArray(nestedAnswers)) {
          for (const item of nestedAnswers) {
            if (item && typeof item === 'object') {
              const q = item.question || item.name || item.key || item.field || ''
              const a = item.answer || item.value || (Array.isArray(item.values) ? item.values[0] : '') || ''
              if (q && a) campaignAnswers[formatQuestionLabel(String(q))] = String(a).trim()
            }
          }
        } else {
          for (const [k, v] of Object.entries(nestedAnswers)) {
            if (v !== null && v !== undefined && v !== '') {
              campaignAnswers[formatQuestionLabel(k)] = String(v).trim()
            }
          }
        }
      }

      // 2. Specific qualification fields specifically identified in lead forms
      if (body.intake && !campaignAnswers['Intake']) {
        campaignAnswers['Intake'] = String(body.intake).trim()
      }
      if (body.which_intake && !campaignAnswers['Intake']) {
        campaignAnswers['Intake'] = String(body.which_intake).trim()
      }
      if (body.application_stage && !campaignAnswers['Application Stage']) {
        campaignAnswers['Application Stage'] = String(body.application_stage).trim()
      }
      if (body.travel_dates && !campaignAnswers['Travel Dates']) {
        campaignAnswers['Travel Dates'] = String(body.travel_dates).trim()
      }
      if (body.travel_date && !campaignAnswers['Travel Date']) {
        campaignAnswers['Travel Date'] = String(body.travel_date).trim()
      }
      if (body.campus_mode && !campaignAnswers['Campus Mode']) {
        campaignAnswers['Campus Mode'] = String(body.campus_mode).trim()
      }
      if (body.qualification && !campaignAnswers['Qualification']) {
        campaignAnswers['Qualification'] = String(body.qualification).trim()
      }
      if (body.highest_qualification && !campaignAnswers['Highest Qualification']) {
        campaignAnswers['Highest Qualification'] = String(body.highest_qualification).trim()
      }
      if (body.work_experience && !campaignAnswers['Work Experience']) {
        campaignAnswers['Work Experience'] = String(body.work_experience).trim()
      }
      if (body.budget && !campaignAnswers['Budget']) {
        campaignAnswers['Budget'] = String(body.budget).trim()
      }

      // 3. Harvest any other arbitrary qualification questions sent by Zapier
      const systemKeys = new Set([
        'name', 'fullname', 'full_name', 'first_name', 'last_name',
        'phone', 'phone_number', 'phonenumber', 'contact',
        'email', 'email_address',
        'country', 'target_country', 'targetcountry',
        'course', 'course_interest', 'program', 'programme',
        'programme_level', 'programmelevel', 'level',
        'city', 'state', 'zip', 'postal_code',
        'source',
        'campaign_name', 'campaignname', 'ad_campaign', 'campaign_id',
        'ad_name', 'adname', 'ad_id', 'adset_name', 'adsetname', 'adset_id',
        'form_name', 'formname', 'form_id',
        'page_id', 'leadgen_id', 'id', 'created_time', 'created_at',
        'raw_meta', 'raw', 'secret', 'x-webhook-secret', 'token',
        'campaign_answers', 'qualification_answers', 'answers', 'form_data', 'questions'
      ])

      for (const [key, val] of Object.entries(body)) {
        if (val === null || val === undefined || val === '') continue
        const normalizedKey = key.toLowerCase().replace(/[\s_-]+/g, '')
        if (!systemKeys.has(normalizedKey) && typeof val !== 'object') {
          const label = formatQuestionLabel(key)
          if (!campaignAnswers[label]) {
            campaignAnswers[label] = String(val).trim()
          }
        }
      }

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
        adset_name: body.adset_name || body.adsetName || '',
        form_name: body.form_name || body.formName || '',
        ad_id: body.ad_id ? String(body.ad_id) : '',
        form_id: body.form_id ? String(body.form_id) : '',
        campaign_answers: campaignAnswers,
        raw_meta: body,
      }
    }

    if (!leadData || !leadData.name) {
      return NextResponse.json({ error: 'Invalid lead data received' }, { status: 400 })
    }

    // Clean phone number
    const cleanPhone = leadData.phone ? leadData.phone.trim() : ''

    // Detect Country accurately from explicit country, campaign name, ad name, form name, or phone prefix
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

    const campaignAnswers = leadData.campaign_answers || {}

    // 1. Robust Phone & Email Duplicate Detection & Auto-Merge
    const corePhone = normalizePhone(cleanPhone)
    const cleanEmail = (leadData.email || '').trim().toLowerCase()

    if (corePhone.length >= 7 || cleanEmail) {
      // Find matches in leads table (checking core digits or exact email)
      const query = supabase
        .from('leads')
        .select('id, name, phone, email, owner_id, country, stage, priority, metadata')

      let existingLead: any = null

      if (corePhone.length >= 7) {
        const { data: phoneMatches } = await query.ilike('phone', `%${corePhone}%`).limit(5)
        if (phoneMatches && phoneMatches.length > 0) {
          existingLead = phoneMatches[0]
        }
      }

      if (!existingLead && cleanEmail) {
        const { data: emailMatches } = await supabase
          .from('leads')
          .select('id, name, phone, email, owner_id, country, stage, priority, metadata')
          .eq('email', cleanEmail)
          .limit(1)

        if (emailMatches && emailMatches.length > 0) {
          existingLead = emailMatches[0]
        }
      }

      // If lead already exists, AUTO-MERGE into existing profile instead of creating redundant duplicate!
      if (existingLead) {
        const isJunk = existingLead.stage === 'Junk/duplicate'
        const existingMeta = (existingLead.metadata && typeof existingLead.metadata === 'object') ? existingLead.metadata : {}
        const prevDuplicates = Array.isArray(existingMeta.duplicate_enquiries) ? existingMeta.duplicate_enquiries : []
        const mergedAnswers = {
          ...(existingMeta.campaign_answers || {}),
          ...campaignAnswers,
        }

        const newEnquiryRecord = {
          received_at: new Date().toISOString(),
          campaign_name: leadData.campaign_name || '',
          ad_name: leadData.ad_name || '',
          form_name: leadData.form_name || '',
          target_country: targetCountry,
          campaign_answers: campaignAnswers,
          raw_meta: leadData.raw_meta || null,
        }

        const updatePayload: any = {
          updated_at: new Date().toISOString(),
          metadata: {
            ...existingMeta,
            campaign_answers: mergedAnswers,
            duplicate_enquiries: [newEnquiryRecord, ...prevDuplicates].slice(0, 10),
            last_re_enquiry_at: new Date().toISOString(),
          }
        }

        // If previously Junk, automatically revive back to 'New' and prioritize as 'Hot'
        if (isJunk) {
          updatePayload.stage = 'New'
          updatePayload.priority = 'Hot'
        } else if (!existingLead.priority || existingLead.priority === 'Cold') {
          updatePayload.priority = 'Hot'
        }

        await supabase.from('leads').update(updatePayload).eq('id', existingLead.id)

        // Build audit timeline note with qualification answers
        let reEnquiryNote = isJunk
          ? `Re-enquired via Meta Ad campaign "${leadData.campaign_name || formattedSource}"! Lead automatically revived from Junk/duplicate back to 'New' (Priority: 🔥 Hot).`
          : `Duplicate re-enquiry received via Meta Ad campaign "${leadData.campaign_name || formattedSource}". Auto-merged with existing profile. Priority updated to Hot.`

        if (leadData.ad_name) reEnquiryNote += `\n• Ad: ${leadData.ad_name}`
        if (leadData.form_name) reEnquiryNote += `\n• Form: ${leadData.form_name}`
        if (Object.keys(campaignAnswers).length > 0) {
          reEnquiryNote += `\n\n📋 Latest Qualification Answers:\n` + Object.entries(campaignAnswers)
            .map(([k, v]) => `• ${k}: ${v}`)
            .join('\n')
        }

        await supabase.from('activities').insert([
          {
            lead: existingLead.id,
            type: isJunk ? 'STAGE_CHANGE' : 'system',
            text: reEnquiryNote,
            time: new Date().toISOString(),
          },
        ])

        if (existingLead.owner_id) {
          notifyLeadAssigned({
            recipientId: existingLead.owner_id,
            leadId: existingLead.id,
            leadName: `${existingLead.name} (Re-enquired on Meta Ad!)`,
            senderName: 'Meta Ads Auto-Merge',
          }).catch(console.error)
        }

        return NextResponse.json({
          success: true,
          action: 'duplicate_merged',
          leadId: existingLead.id,
          country: existingLead.country || targetCountry,
          qualification_answers_count: Object.keys(campaignAnswers).length,
          message: `Lead already exists (${existingLead.phone}). Profile auto-merged with fresh enquiry data.`,
        })
      }
    }

    // Metadata payload to preserve all campaign, ad, form details & qualification answers
    const leadMetadata = {
      campaign_name: leadData.campaign_name || null,
      ad_name: leadData.ad_name || null,
      adset_name: leadData.adset_name || null,
      form_name: leadData.form_name || null,
      ad_id: leadData.ad_id || null,
      form_id: leadData.form_id || null,
      campaign_answers: campaignAnswers,
      target_country: targetCountry,
      ingested_at: new Date().toISOString(),
      raw: leadData.raw_meta || null,
    }

    // 2. Insert new lead: STRICTLY UNASSIGNED: owner_id = null so Admin assigns to counselor
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

    // 3. Log initial activity in activities table WITH QUALIFICATION ANSWERS
    let initialActivityText = `New lead received from [${targetCountry} Ad Campaign] (${leadData.campaign_name || formattedSource}). Status: Unassigned (Awaiting Admin Assignment).`
    if (leadData.ad_name) initialActivityText += `\n• Ad: ${leadData.ad_name}`
    if (leadData.form_name) initialActivityText += `\n• Form: ${leadData.form_name}`

    if (Object.keys(campaignAnswers).length > 0) {
      initialActivityText += `\n\n📋 Qualification Answers:\n` + Object.entries(campaignAnswers)
        .map(([k, v]) => `• ${k}: ${v}`)
        .join('\n')
    }

    await supabase.from('activities').insert([
      {
        lead: newLeadId,
        type: 'system',
        text: initialActivityText,
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
      ad_name: leadData.ad_name || null,
      form_name: leadData.form_name || null,
      qualification_answers_count: Object.keys(campaignAnswers).length,
      assigned: false,
      message: `New [${targetCountry}] Meta lead created with Unassigned owner.`,
    })
  } catch (err: any) {
    console.error('[Meta Webhook] Server error:', err)
    return NextResponse.json({ error: 'Internal server error processing webhook' }, { status: 500 })
  }
}

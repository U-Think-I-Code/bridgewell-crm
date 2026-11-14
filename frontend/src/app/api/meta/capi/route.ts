import { NextRequest, NextResponse } from 'next/server'
import { sendMetaCrmEvent } from '@/lib/metaConversions'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const datasetId = process.env.META_DATASET_ID || '1035625342113755'
    const hasAccessToken = !!(process.env.META_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN)

    return NextResponse.json({
      configured: hasAccessToken,
      datasetId,
      hasAccessToken,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, datasetId, accessToken, testEventCode, lead } = body

    // 1. Action: Test Event dispatch
    if (action === 'test_event') {
      const result = await sendMetaCrmEvent(
        {
          eventName: 'Lead',
          email: lead?.email || 'test.student@bridgewellacademic.com',
          phone: lead?.phone || '+919876543210',
          country: lead?.country || 'USA',
          stage: lead?.stage || 'Qualified',
          testEventCode: testEventCode || undefined,
        },
        {
          datasetId: datasetId || process.env.META_DATASET_ID || '1035625342113755',
          accessToken: accessToken || process.env.META_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN || '',
        }
      )

      return NextResponse.json(result)
    }

    // 2. Action: Track Stage Change
    if (action === 'stage_change') {
      let { leadId, stage, email, phone, country } = body

      // Map CRM stages to Meta Standard Events
      let eventName: string | null = null

      switch (stage) {
        case 'Connected':
          eventName = 'Contact' // Meta standard event for call/contact established
          break
        case 'Call back':
          eventName = 'Schedule' // Meta standard event for follow-up scheduled
          break
        case 'Qualified':
        case 'Counselling done':
          eventName = 'Qualified' // Meta standard event for qualified student
          break
        case 'Documents in progress':
        case 'Application submitted':
          eventName = 'SubmitApplication' // Meta standard event for program application
          break
        case 'Offer received':
        case 'Enrolled':
          eventName = 'CompleteRegistration' // Meta standard event for enrollment
          break
        case 'New':
          eventName = 'Lead'
          break
        default:
          // Negative or non-conversion stages:
          // 'Not connected', 'Not reachable', 'Not interested', 'Lost', 'Junk/duplicate'
          // Intentionally skipped so Meta algorithm does NOT optimize for bad leads!
          eventName = null
          break
      }

      if (!eventName) {
        return NextResponse.json({
          success: true,
          skipped: true,
          stage,
          reason: `Stage '${stage}' is not a positive conversion milestone; skipped from Meta CAPI to prevent optimizing for unqualified leads.`
        })
      }

      // If email or phone missing from payload, fetch from DB
      if (leadId && (!email || !phone)) {
        try {
          const { data: leadData } = await supabase
            .from('leads')
            .select('email, phone, country')
            .eq('id', leadId)
            .maybeSingle()

          if (leadData) {
            email = email || leadData.email
            phone = phone || leadData.phone
            country = country || leadData.country
          }
        } catch (dbErr) {
          console.warn('[Meta CAPI] Could not fetch lead details from DB:', dbErr)
        }
      }

      const result = await sendMetaCrmEvent({
        eventName,
        crmLeadId: leadId,
        email,
        phone,
        country,
        stage,
      })

      return NextResponse.json(result)
    }

    return NextResponse.json({ error: 'Unknown action specified' }, { status: 400 })
  } catch (err: any) {
    console.error('[Meta CAPI Route Error]', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

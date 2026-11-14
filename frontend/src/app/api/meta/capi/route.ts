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
      const { leadId, stage, email, phone, country } = body

      // Map stage to Meta standard event if applicable
      let eventName = 'Lead'
      if (stage === 'Qualified' || stage === 'Counselling done') eventName = 'Qualified'
      else if (stage === 'Enrolled') eventName = 'CompleteRegistration'
      else if (stage === 'Application submitted') eventName = 'SubmitApplication'

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

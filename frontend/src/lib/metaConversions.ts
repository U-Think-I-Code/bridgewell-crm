import crypto from 'crypto'

export interface MetaCrmEventPayload {
  eventName: string // e.g. 'Lead', 'Qualified', 'Enrolled', 'Contact'
  leadId?: string | number | null // Meta leadgen_id if available
  crmLeadId?: string | null
  email?: string | null
  phone?: string | null
  country?: string | null
  stage?: string | null
  eventTime?: number // UNIX timestamp in seconds
  testEventCode?: string | null // Test event code from Events Manager Test Events tab
}

export interface MetaCapiResponse {
  success: boolean
  eventsReceived?: number
  fbtraceId?: string
  error?: string
  raw?: any
}

/**
 * SHA-256 Hashing according to Meta Conversions API specifications:
 * - lowercase, trimmed
 */
export function hashForMeta(value: string | null | undefined): string | null {
  if (!value) return null
  const cleaned = value.trim().toLowerCase()
  if (!cleaned) return null
  return crypto.createHash('sha256').update(cleaned).digest('hex')
}

/**
 * Normalizes and hashes phone number for Meta CAPI:
 * - Removes non-digits
 * - Must include country code without '+'
 */
export function hashPhoneForMeta(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digitsOnly = phone.replace(/[^0-9]/g, '')
  if (digitsOnly.length < 7) return null
  return crypto.createHash('sha256').update(digitsOnly).digest('hex')
}

/**
 * Send CRM Lead Event to Meta Conversions API (CAPI)
 */
export async function sendMetaCrmEvent(
  payload: MetaCrmEventPayload,
  config?: { datasetId?: string; accessToken?: string }
): Promise<MetaCapiResponse> {
  const datasetId =
    config?.datasetId ||
    process.env.META_DATASET_ID ||
    process.env.NEXT_PUBLIC_META_DATASET_ID ||
    '1035625342113755'

  const accessToken =
    config?.accessToken ||
    process.env.META_ACCESS_TOKEN ||
    process.env.META_PAGE_ACCESS_TOKEN ||
    process.env.NEXT_PUBLIC_META_ACCESS_TOKEN ||
    ''

  if (!accessToken) {
    console.warn('[Meta CAPI] Skipped: No META_ACCESS_TOKEN configured.')
    return {
      success: false,
      error: 'Missing META_ACCESS_TOKEN. Please generate and provide an Access Token in CRM Settings.'
    }
  }

  const hashedEmail = hashForMeta(payload.email)
  const hashedPhone = hashPhoneForMeta(payload.phone)

  const userData: Record<string, any> = {}
  if (hashedEmail) userData.em = [hashedEmail]
  if (hashedPhone) userData.ph = [hashedPhone]

  if (payload.country) {
    const countryCode = payload.country.trim().toLowerCase()
    userData.country = [crypto.createHash('sha256').update(countryCode).digest('hex')]
  }

  // If this lead came from a Meta Lead Ad, include the lead_id
  if (payload.leadId) {
    const numLeadId = Number(payload.leadId)
    if (!isNaN(numLeadId) && numLeadId > 0) {
      userData.lead_id = numLeadId
    }
  }

  const eventTime = payload.eventTime || Math.floor(Date.now() / 1000)

  const eventItem: Record<string, any> = {
    event_name: payload.eventName || 'Lead',
    event_time: eventTime,
    action_source: 'system_generated',
    user_data: userData,
    custom_data: {
      event_source: 'crm',
      lead_event_source: 'Bridgewell CRM',
      crm_lead_id: payload.crmLeadId || undefined,
      stage: payload.stage || undefined
    }
  }

  const requestBody: Record<string, any> = {
    data: [eventItem]
  }

  // Include test_event_code if sending to Events Manager Test Events tab
  if (payload.testEventCode) {
    requestBody.test_event_code = payload.testEventCode
  }

  const apiUrl = `https://graph.facebook.com/v21.0/${datasetId}/events?access_token=${accessToken}`

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[Meta CAPI Error]', data)
      return {
        success: false,
        error: data.error?.message || `HTTP ${res.status}: Failed to send event to Meta`,
        raw: data
      }
    }

    return {
      success: true,
      eventsReceived: data.events_received || 1,
      fbtraceId: data.fbtrace_id,
      raw: data
    }
  } catch (err: any) {
    console.error('[Meta CAPI Network Error]', err)
    return {
      success: false,
      error: err.message || 'Network error connecting to Meta Conversions API'
    }
  }
}

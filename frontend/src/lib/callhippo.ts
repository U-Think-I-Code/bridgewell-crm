/**
 * CallHippo Cloud Dialer Integration
 * Official Cloud Calling Solution for Bridgewell CRM
 * Supports Multi-Number Outbound Line Selection (UK Number +44 vs USA Number +1 vs Auto-Match)
 */

import { cleanPhoneE164 } from './phoneHelper'

export type CallHippoLine = 'uk' | 'usa' | 'auto'

export interface CallHippoLineConfig {
  activeLine: CallHippoLine
  ukNumber: string  // e.g. "+447123456789"
  usaNumber: string // e.g. "+12025550123"
}

const LINE_CONFIG_KEY = 'bridgewell_callhippo_line_config'

export function getCallHippoLineConfig(): CallHippoLineConfig {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LINE_CONFIG_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          activeLine: (parsed.activeLine === 'usa' || parsed.activeLine === 'auto') ? parsed.activeLine : 'uk',
          ukNumber: parsed.ukNumber || '',
          usaNumber: parsed.usaNumber || ''
        }
      }
    } catch {}
  }
  return {
    activeLine: 'uk',
    ukNumber: '',
    usaNumber: ''
  }
}

export function setCallHippoLineConfig(config: Partial<CallHippoLineConfig>): void {
  if (typeof window !== 'undefined') {
    try {
      const current = getCallHippoLineConfig()
      const updated: CallHippoLineConfig = {
        ...current,
        ...config
      }
      localStorage.setItem(LINE_CONFIG_KEY, JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('callhippo_line_changed', { detail: updated }))
    } catch {}
  }
}

export function getActiveLine(): CallHippoLine {
  return getCallHippoLineConfig().activeLine
}

export function setActiveLine(line: CallHippoLine): void {
  setCallHippoLineConfig({ activeLine: line })
}

/**
 * Resolves whether a call should be placed using the UK or USA outbound line.
 * If line is 'auto', inspects the lead's country or phone dial code (+1 -> USA, +44/other -> UK).
 */
export function resolveOutboundLine(
  line: CallHippoLine,
  leadCountry?: string | null,
  leadPhone?: string | null
): 'uk' | 'usa' {
  if (line === 'uk') return 'uk'
  if (line === 'usa') return 'usa'

  // Auto-detection logic:
  const c = (leadCountry || '').toLowerCase().trim()
  if (c === 'usa' || c === 'united states' || c === 'us' || c === 'canada' || c === 'can' || c === 'ca') {
    return 'usa'
  }

  const p = (leadPhone || '').replace(/[^\d+]/g, '')
  if (p.startsWith('+1') || (p.startsWith('1') && p.length === 11)) {
    return 'usa'
  }

  return 'uk'
}

export interface CallHippoDialerOptions {
  name?: string
  leadId?: string
  country?: string
  line?: CallHippoLine
  fromNumber?: string
}

/**
 * Format any raw phone number into standard international E.164 format for CallHippo
 */
export function formatPhoneNumberForCallHippo(phone: string, hintCountry?: string): string {
  if (!phone) return ''
  return cleanPhoneE164(phone, hintCountry).cleanedE164Phone
}

/**
 * Generate official CallHippo Web Dialer URL with outbound Line & Caller ID parameters
 */
export function getCallHippoDialerUrl(phone: string, options?: CallHippoDialerOptions): string {
  if (!phone) return 'https://dialer.callhippo.com/dial'

  const linePreference = options?.line || getActiveLine()
  const resolvedLine = resolveOutboundLine(linePreference, options?.country, phone)
  const lineConfig = getCallHippoLineConfig()

  const fromNumber = options?.fromNumber || (resolvedLine === 'usa' ? lineConfig.usaNumber : lineConfig.ukNumber)
  const lineCountryCode = resolvedLine === 'usa' ? '1' : '44'
  const lineCountryName = resolvedLine === 'usa' ? 'US' : 'UK'

  // Destination phone formatted according to target country or line
  const cleanPhone = formatPhoneNumberForCallHippo(phone, options?.country || (resolvedLine === 'usa' ? 'USA' : 'UK'))
  const params = new URLSearchParams()

  // Primary CallHippo click-to-call parameters
  params.set('to', cleanPhone)
  params.set('phoneNumber', cleanPhone)
  params.set('number', cleanPhone)

  // Outbound Number / Caller ID configuration for CallHippo
  if (fromNumber) {
    const cleanFrom = fromNumber.replace(/[^\d+]/g, '')
    params.set('from', cleanFrom)
    params.set('callerId', cleanFrom)
    params.set('outboundNumber', cleanFrom)
  }

  params.set('countryCode', lineCountryCode)
  params.set('country', lineCountryName)
  params.set('outboundCountry', lineCountryName)
  params.set('line', resolvedLine)

  if (options?.name) {
    params.set('contactName', options.name)
    params.set('name', options.name)
  }
  if (options?.leadId) {
    params.set('leadId', options.leadId)
  }

  return `https://dialer.callhippo.com/dial?${params.toString()}`
}

/**
 * Opens CallHippo Web Dialer popup pre-loaded with phone number & selected outbound line,
 * copies the number to clipboard, and triggers tel: protocol.
 */
export function openCallHippoDialer(
  phone: string,
  e?: React.MouseEvent | Event,
  options?: CallHippoDialerOptions
): Window | null {
  if (e) {
    if ('preventDefault' in e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }
    if ('stopPropagation' in e && typeof e.stopPropagation === 'function') {
      e.stopPropagation()
    }
  }

  if (!phone) return null

  const linePreference = options?.line || getActiveLine()
  const resolvedLine = resolveOutboundLine(linePreference, options?.country, phone)
  const cleanPhone = formatPhoneNumberForCallHippo(phone, options?.country || (resolvedLine === 'usa' ? 'USA' : 'UK'))
  const url = getCallHippoDialerUrl(phone, options)

  // Copy cleaned phone number to clipboard for instant convenience
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(cleanPhone).catch(() => {})
  }

  // Standard CallHippo dialer popup dimensions: 385x650
  const width = 385
  const height = 650
  let left = 100
  let top = 100

  if (typeof window !== 'undefined') {
    left = window.screenLeft !== undefined ? Math.max(0, window.screenLeft + (window.outerWidth - width) / 2) : 100
    top = window.screenTop !== undefined ? Math.max(0, window.screenTop + (window.outerHeight - height) / 2) : 100

    // 1. Open official CallHippo web dialer popup window
    const popup = window.open(
      url,
      'CallHippoDialer',
      `width=${width},height=${height},top=${top},left=${left},location=no,menubar=no,toolbar=no,status=no,scrollbars=no,resizable=yes`
    )

    if (popup) {
      try {
        popup.focus()
      } catch {
        // Ignore cross-origin focus restrictions
      }
    }

    // 2. Also trigger tel: protocol so CallHippo Chrome Extension automatically catches it
    try {
      const telLink = document.createElement('a')
      telLink.href = `tel:${cleanPhone}`
      telLink.style.display = 'none'
      document.body.appendChild(telLink)
      telLink.click()
      setTimeout(() => {
        if (telLink.parentNode) {
          document.body.removeChild(telLink)
        }
      }, 300)
    } catch {}

    return popup
  }
  return null
}

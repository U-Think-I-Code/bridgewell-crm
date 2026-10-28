/**
 * CallHippo Dialer Integration
 * Official Cloud Calling Solution for Bridgewell CRM
 * Supports CallHippo Web Dialer popup, CallHippo Chrome Extension, and tel:/callhippo: protocols.
 */

export interface CallHippoDialerOptions {
  name?: string
  leadId?: string
}

/**
 * Format any raw phone number into standard international E.164 format for CallHippo
 */
export function formatPhoneNumberForCallHippo(phone: string): string {
  if (!phone) return ''

  // Trim and strip non-digit, non-plus characters
  let clean = phone.trim().replace(/[^0-9+]/g, '')

  // If starts with 00 (international prefix), convert to +
  if (clean.startsWith('00')) {
    clean = '+' + clean.slice(2)
  }

  // If already starts with +, return as-is
  if (clean.startsWith('+')) {
    return clean
  }

  // If 10 digits (standard Indian mobile e.g. 9876543210), add +91
  if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) {
    return '+91' + clean
  }

  // If 11 digits starting with 07 (UK mobile 07824174092 -> +447824174092)
  if (clean.length === 11 && clean.startsWith('07')) {
    return '+44' + clean.slice(1)
  }

  // If 11 digits starting with 0 and followed by [6-9] (Indian 0-prefixed mobile)
  if (clean.length === 11 && clean.startsWith('0') && /^[6-9]/.test(clean.slice(1))) {
    return '+91' + clean.slice(1)
  }

  // If 12 digits starting with 91 (India with country code but missing +)
  if (clean.length === 12 && clean.startsWith('91')) {
    return '+' + clean
  }

  // If 12 digits starting with 44 (UK with country code but missing +)
  if (clean.length === 12 && clean.startsWith('44')) {
    return '+' + clean
  }

  // Fallback: prepend +
  return '+' + clean
}

/**
 * Generate the official CallHippo Web Dialer URL.
 * CallHippo's web dialer specifically parses:
 * - `to`: Read by CallHippo's query parser to populate the dialer input (`telNo`) and activate `isClickToCallURL`
 * - `phoneNumber`: Handled by CallHippo `isOpenDialerWithNumber`
 * - `number`: Kept for extension & backwards compatibility
 */
export function getCallHippoDialerUrl(phone: string, options?: CallHippoDialerOptions): string {
  if (!phone) return 'https://dialer.callhippo.com/dial'

  const cleanPhone = formatPhoneNumberForCallHippo(phone)
  const params = new URLSearchParams()

  // Primary CallHippo click-to-call parameters
  params.set('to', cleanPhone)
  params.set('phoneNumber', cleanPhone)
  params.set('number', cleanPhone)

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
 * Opens CallHippo Web Dialer popup pre-loaded with the phone number,
 * copies the number to clipboard, and triggers tel: for desktop softphones.
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

  const cleanPhone = formatPhoneNumberForCallHippo(phone)
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

    // 2. Also trigger tel: protocol so CallHippo Chrome Extension / Desktop App automatically catches it
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
    } catch {
      // Ignore protocol trigger error if browser blocked
    }

    return popup
  }
  return null
}

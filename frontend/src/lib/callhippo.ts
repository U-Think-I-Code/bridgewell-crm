/**
 * CallHippo Dialer Integration
 * Official Cloud Calling Solution for Bridgewell CRM
 * Supports CallHippo Web Dialer popup, CallHippo Chrome Extension, and tel:/callhippo: protocols.
 */

export function getCallHippoDialerUrl(phone: string): string {
  if (!phone) return 'https://dialer.callhippo.com/'

  // Clean the phone number: keep only digits and leading +
  let cleanPhone = phone.trim().replace(/[^0-9+]/g, '')

  // Ensure country code prefix (default to + if missing)
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone
  }

  return `https://dialer.callhippo.com/dial?number=${encodeURIComponent(cleanPhone)}`
}

export function openCallHippoDialer(phone: string, e?: React.MouseEvent | Event): Window | null {
  if (e) {
    if ('preventDefault' in e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }
  }

  if (!phone) return null

  let cleanPhone = phone.trim().replace(/[^0-9+]/g, '')
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone
  }

  const url = getCallHippoDialerUrl(phone)

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

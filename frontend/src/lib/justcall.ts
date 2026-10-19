/**
 * JustCall Dialer Integration
 * Opens the JustCall web dialer popup with the given phone number.
 * Official JustCall recommendation: width=385, height=665 popup window.
 * The user must be logged into JustCall in their browser for the dialer to work.
 */

export function getJustCallDialerUrl(phone: string): string {
  if (!phone) return 'https://app.justcall.io/dialer'

  // Clean the phone number: keep only digits and leading +
  let cleanPhone = phone.trim().replace(/[^0-9+]/g, '')

  // Ensure country code prefix (default to + if missing)
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone
  }

  return `https://app.justcall.io/dialer?numbers=${encodeURIComponent(cleanPhone)}`
}

export function openJustCallDialer(phone: string, e?: React.MouseEvent | Event) {
  if (e) {
    if ('preventDefault' in e && typeof e.preventDefault === 'function') {
      e.preventDefault()
    }
  }

  if (!phone) return

  const url = getJustCallDialerUrl(phone)

  // Open as popup window (JustCall official recommended dimensions: 385x665)
  const width = 385
  const height = 665
  let left = 100
  let top = 100

  if (typeof window !== 'undefined') {
    left = window.screenLeft !== undefined ? Math.max(0, window.screenLeft + (window.outerWidth - width) / 2) : 100
    top = window.screenTop !== undefined ? Math.max(0, window.screenTop + (window.outerHeight - height) / 2) : 100

    window.open(
      url,
      'JustCallDialer',
      `width=${width},height=${height},top=${top},left=${left},location=no,menubar=no,toolbar=no,status=no,scrollbars=no,resizable=yes`
    )
  }
}

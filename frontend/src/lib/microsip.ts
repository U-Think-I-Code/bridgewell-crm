/**
 * MicroSIP Softphone Integration
 * Integrates with MicroSIP (https://www.microsip.org/) desktop VoIP softphone via Windows protocol handler.
 * MicroSIP registers 'sip:', 'tel:', and 'callto:' protocols on Windows.
 * When clicking a sip: or tel: link, Windows opens MicroSIP and dials the number automatically.
 */

export type MicroSipProtocol = 'sip' | 'tel' | 'callto'

export function formatCleanPhoneNumber(phone: string): string {
  if (!phone) return ''
  // MicroSIP & PBX SIP lines do NOT accept '+' prefix.
  // Strip '+' and all non-digit characters so PBX/SIP trunks route cleanly.
  return phone.trim().replace(/[^0-9]/g, '')
}

export function getMicroSipDialerUrl(phone: string, protocol: MicroSipProtocol = 'sip'): string {
  if (!phone) return 'sip:'
  const cleanPhone = formatCleanPhoneNumber(phone)
  return `${protocol}:${cleanPhone}`
}

/**
 * Triggers MicroSIP desktop client to dial a phone number.
 * Uses an invisible link click so the web page doesn't navigate away.
 */
export function openMicroSipDialer(
  phone: string,
  e?: React.MouseEvent | Event,
  protocol: MicroSipProtocol = 'sip'
): boolean {
  if (e && 'preventDefault' in e && typeof e.preventDefault === 'function') {
    e.preventDefault()
  }
  if (!phone) return false

  const url = getMicroSipDialerUrl(phone, protocol)

  if (typeof window !== 'undefined') {
    try {
      const link = document.createElement('a')
      link.href = url
      link.style.display = 'none'
      link.setAttribute('rel', 'noopener noreferrer')
      document.body.appendChild(link)
      link.click()
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link)
        }
      }, 500)
      return true
    } catch (err) {
      console.error('Error triggering MicroSIP protocol:', err)
      window.location.href = url
      return true
    }
  }
  return false
}

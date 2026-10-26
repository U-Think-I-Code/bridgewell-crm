/**
 * Unified Multi-Dialer Service for Bridgewell CRM
 * Supports JustCall (Web Popup) & MicroSIP (Desktop Softphone)
 */

import { openJustCallDialer, getJustCallDialerUrl } from './justcall'
import { openMicroSipDialer, getMicroSipDialerUrl, MicroSipProtocol } from './microsip'

export type DialerType = 'justcall' | 'microsip'

const PREFERRED_DIALER_KEY = 'bridgewell_preferred_dialer'

export function getPreferredDialer(): DialerType {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PREFERRED_DIALER_KEY)
    if (saved === 'microsip' || saved === 'justcall') {
      return saved
    }
  }
  return 'justcall'
}

export function setPreferredDialer(dialer: DialerType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREFERRED_DIALER_KEY, dialer)
  }
}

export function getDialerUrl(dialer: DialerType, phone: string, protocol: MicroSipProtocol = 'sip'): string {
  if (dialer === 'microsip') {
    return getMicroSipDialerUrl(phone, protocol)
  }
  return getJustCallDialerUrl(phone)
}

export function triggerDial(
  dialer: DialerType,
  phone: string,
  e?: React.MouseEvent | Event,
  protocol: MicroSipProtocol = 'sip'
): { dialer: DialerType; success: boolean } {
  if (dialer === 'microsip') {
    const success = openMicroSipDialer(phone, e, protocol)
    return { dialer: 'microsip', success }
  } else {
    const win = openJustCallDialer(phone, e)
    return { dialer: 'justcall', success: !!win }
  }
}

export { openJustCallDialer, getJustCallDialerUrl }
export { openMicroSipDialer, getMicroSipDialerUrl }

'use client'

import { useState, useEffect } from 'react'
import { openCallHippoDialer, getCallHippoDialerUrl, formatPhoneNumberForCallHippo, CallHippoDialerOptions } from './callhippo'

export type DialerType = 'callhippo'

const PREFERRED_DIALER_KEY = 'bridgewell_preferred_dialer'

export function getPreferredDialer(): DialerType {
  return 'callhippo'
}

export function setPreferredDialer(dialer: DialerType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREFERRED_DIALER_KEY, 'callhippo')
    window.dispatchEvent(new CustomEvent('dialer_preference_changed', { detail: 'callhippo' }))
  }
}

/**
 * React Hook that returns the permanent CallHippo dialer
 */
export function usePreferredDialer(): [DialerType, (dialer: DialerType) => void] {
  const [dialer, setDialer] = useState<DialerType>('callhippo')

  useEffect(() => {
    setPreferredDialer('callhippo')
    setDialer('callhippo')
  }, [])

  return [dialer, () => setDialer('callhippo')]
}

export function getDialerUrl(dialer: string, phone: string, options?: CallHippoDialerOptions): string {
  return getCallHippoDialerUrl(phone, options)
}

export function triggerDial(
  dialer: string,
  phone: string,
  e?: React.MouseEvent | Event,
  options?: CallHippoDialerOptions
): { dialer: 'callhippo'; success: boolean } {
  const win = openCallHippoDialer(phone, e, options)
  return { dialer: 'callhippo', success: !!win }
}

// CallHippo exports
export { openCallHippoDialer, getCallHippoDialerUrl, formatPhoneNumberForCallHippo }
export type { CallHippoDialerOptions }

// Backward compatibility aliases mapping to CallHippo
export const openJustCallDialer = openCallHippoDialer
export const getJustCallDialerUrl = getCallHippoDialerUrl
export const openMicroSipDialer = openCallHippoDialer
export const getMicroSipDialerUrl = getCallHippoDialerUrl

'use client'

import { useState, useEffect } from 'react'
import { openJustCallDialer, getJustCallDialerUrl } from './justcall'
import { openMicroSipDialer, getMicroSipDialerUrl, MicroSipProtocol } from './microsip'

export type DialerType = 'justcall' | 'microsip' | 'both'

const PREFERRED_DIALER_KEY = 'bridgewell_preferred_dialer'

export function getPreferredDialer(): DialerType {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PREFERRED_DIALER_KEY)
    if (saved === 'microsip' || saved === 'justcall' || saved === 'both') {
      return saved
    }
  }
  return 'justcall'
}

export function setPreferredDialer(dialer: DialerType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREFERRED_DIALER_KEY, dialer)
    window.dispatchEvent(new CustomEvent('dialer_preference_changed', { detail: dialer }))
  }
}

/**
 * React Hook that reactively syncs preferred dialer across all components & tabs
 */
export function usePreferredDialer(): [DialerType, (dialer: DialerType) => void] {
  const [dialer, setDialer] = useState<DialerType>('justcall')

  useEffect(() => {
    setDialer(getPreferredDialer())

    const handleUpdate = (e: any) => {
      if (e?.detail) {
        setDialer(e.detail)
      } else {
        setDialer(getPreferredDialer())
      }
    }

    window.addEventListener('dialer_preference_changed', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('dialer_preference_changed', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const updateDialer = (newDialer: DialerType) => {
    setPreferredDialer(newDialer)
    setDialer(newDialer)
  }

  return [dialer, updateDialer]
}

export function getDialerUrl(dialer: 'justcall' | 'microsip', phone: string, protocol: MicroSipProtocol = 'sip'): string {
  if (dialer === 'microsip') {
    return getMicroSipDialerUrl(phone, protocol)
  }
  return getJustCallDialerUrl(phone)
}

export function triggerDial(
  dialer: 'justcall' | 'microsip',
  phone: string,
  e?: React.MouseEvent | Event,
  protocol: MicroSipProtocol = 'sip'
): { dialer: 'justcall' | 'microsip'; success: boolean } {
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

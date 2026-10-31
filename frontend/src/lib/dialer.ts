'use client'

import { useState, useEffect } from 'react'
import { openCallHippoDialer, getCallHippoDialerUrl, formatPhoneNumberForCallHippo, CallHippoDialerOptions } from './callhippo'
import { openJustCallDialer, getJustCallDialerUrl } from './justcall'
import { openMicroSipDialer, getMicroSipDialerUrl, MicroSipProtocol } from './microsip'

export type DialerType = 'callhippo' | 'microsip' | 'justcall' | 'tel'

export interface DialerInfo {
  id: DialerType
  name: string
  shortName: string
  description: string
  badgeColor: string
}

export const AVAILABLE_DIALERS: DialerInfo[] = [
  {
    id: 'callhippo',
    name: 'CallHippo',
    shortName: 'CallHippo',
    description: 'Cloud VoIP Web Dialer popup & Chrome Extension',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    id: 'microsip',
    name: 'MicroSIP',
    shortName: 'MicroSIP',
    description: 'Windows Desktop Softphone (sip: protocol)',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
  },
  {
    id: 'justcall',
    name: 'JustCall',
    shortName: 'JustCall',
    description: 'JustCall Cloud Calling Web Dialer',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'tel',
    name: 'Default Phone',
    shortName: 'Phone (tel:)',
    description: 'Default OS Phone / Phone Link / Mobile Dialer',
    badgeColor: 'bg-gray-100 text-gray-700 border-gray-200'
  }
]

const PREFERRED_DIALER_KEY = 'bridgewell_preferred_dialer'

export function getPreferredDialer(): DialerType {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(PREFERRED_DIALER_KEY)
    if (saved === 'callhippo' || saved === 'microsip' || saved === 'justcall' || saved === 'tel') {
      return saved as DialerType
    }
  }
  return 'callhippo'
}

export function setPreferredDialer(dialer: DialerType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREFERRED_DIALER_KEY, dialer)
    window.dispatchEvent(new CustomEvent('dialer_preference_changed', { detail: dialer }))
  }
}

/**
 * React Hook that reactively syncs preferred dialer across all components, modals & tabs
 */
export function usePreferredDialer(): [DialerType, (dialer: DialerType) => void] {
  const [dialer, setDialer] = useState<DialerType>('callhippo')

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

export function getDialerUrl(dialer: DialerType | string, phone: string, options?: CallHippoDialerOptions): string {
  if (!phone) return '#'
  
  if (dialer === 'microsip') {
    return getMicroSipDialerUrl(phone, 'sip')
  }
  if (dialer === 'justcall') {
    return getJustCallDialerUrl(phone)
  }
  if (dialer === 'tel') {
    const cleanDigits = phone.replace(/[^\d+]/g, '')
    return `tel:${cleanDigits}`
  }
  
  // Default to CallHippo
  return getCallHippoDialerUrl(phone, options)
}

export function triggerDial(
  dialer: DialerType | string,
  phone: string,
  e?: React.MouseEvent | Event,
  options?: CallHippoDialerOptions
): { dialer: DialerType; success: boolean } {
  if (e && 'preventDefault' in e && typeof e.preventDefault === 'function') {
    e.preventDefault()
  }

  if (dialer === 'microsip') {
    const success = openMicroSipDialer(phone, e, 'sip')
    return { dialer: 'microsip', success }
  }
  
  if (dialer === 'justcall') {
    const win = openJustCallDialer(phone, e)
    return { dialer: 'justcall', success: !!win }
  }

  if (dialer === 'tel') {
    if (typeof window !== 'undefined') {
      const cleanDigits = phone.replace(/[^\d+]/g, '')
      window.location.href = `tel:${cleanDigits}`
      return { dialer: 'tel', success: true }
    }
    return { dialer: 'tel', success: false }
  }

  // Default CallHippo
  const win = openCallHippoDialer(phone, e, options)
  return { dialer: 'callhippo', success: !!win }
}

// Re-exports
export {
  openCallHippoDialer,
  getCallHippoDialerUrl,
  formatPhoneNumberForCallHippo,
  openJustCallDialer,
  getJustCallDialerUrl,
  openMicroSipDialer,
  getMicroSipDialerUrl
}
export type { CallHippoDialerOptions }

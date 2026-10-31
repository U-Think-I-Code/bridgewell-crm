'use client'

import { useState, useEffect } from 'react'
import {
  CallHippoLine,
  CallHippoLineConfig,
  CallHippoDialerOptions,
  getCallHippoLineConfig,
  setCallHippoLineConfig,
  getActiveLine,
  setActiveLine,
  resolveOutboundLine,
  formatPhoneNumberForCallHippo,
  getCallHippoDialerUrl,
  openCallHippoDialer
} from './callhippo'

export type { CallHippoLine, CallHippoLineConfig, CallHippoDialerOptions }
export {
  getCallHippoLineConfig,
  setCallHippoLineConfig,
  getActiveLine,
  setActiveLine,
  resolveOutboundLine,
  formatPhoneNumberForCallHippo,
  getCallHippoDialerUrl,
  openCallHippoDialer
}

export interface LineOption {
  id: CallHippoLine
  label: string
  shortLabel: string
  flag: string
  code: string
  badgeColor: string
}

export const CALLHIPPO_LINES: LineOption[] = [
  {
    id: 'uk',
    label: 'UK Number (+44)',
    shortLabel: 'UK (+44)',
    flag: '🇬🇧',
    code: '+44',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
  },
  {
    id: 'usa',
    label: 'USA Number (+1)',
    shortLabel: 'USA (+1)',
    flag: '🇺🇸',
    code: '+1',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
  },
  {
    id: 'auto',
    label: 'Auto (By Lead Country)',
    shortLabel: 'Auto',
    flag: '⚡',
    code: 'Auto',
    badgeColor: 'bg-purple-50 text-purple-700 border-purple-200'
  }
]

/**
 * React Hook that reactively syncs the counselor's CallHippo outbound line across all components & tabs
 */
export function useCallHippoLine(): [CallHippoLineConfig, (config: Partial<CallHippoLineConfig>) => void] {
  const [config, setConfig] = useState<CallHippoLineConfig>(getCallHippoLineConfig())

  useEffect(() => {
    setConfig(getCallHippoLineConfig())

    const handleUpdate = (e: any) => {
      if (e?.detail) {
        setConfig(e.detail)
      } else {
        setConfig(getCallHippoLineConfig())
      }
    }

    window.addEventListener('callhippo_line_changed', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('callhippo_line_changed', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [])

  const updateConfig = (newConfig: Partial<CallHippoLineConfig>) => {
    setCallHippoLineConfig(newConfig)
    setConfig(prev => ({ ...prev, ...newConfig }))
  }

  return [config, updateConfig]
}

// Backward-compatible hook and functions
export type DialerType = 'callhippo'

export function getPreferredDialer(): CallHippoLine {
  return getActiveLine()
}

export function setPreferredDialer(line?: any): void {
  if (line === 'uk' || line === 'usa' || line === 'auto') {
    setActiveLine(line)
  }
}

export function usePreferredDialer(): [CallHippoLine, (line: CallHippoLine) => void] {
  const [config, updateConfig] = useCallHippoLine()
  return [config.activeLine, (line: CallHippoLine) => updateConfig({ activeLine: line })]
}

export function getDialerUrl(_dialer: any, phone: string, options?: CallHippoDialerOptions): string {
  return getCallHippoDialerUrl(phone, options)
}

export function triggerDial(
  _dialer: any,
  phone: string,
  e?: React.MouseEvent | Event,
  options?: CallHippoDialerOptions
): { dialer: 'callhippo'; success: boolean } {
  const win = openCallHippoDialer(phone, e, options)
  return { dialer: 'callhippo', success: !!win }
}

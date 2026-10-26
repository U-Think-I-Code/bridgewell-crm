'use client'
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlarmClock, Clock, Phone, MessageCircle, X, ChevronRight,
  Flame, AlertTriangle, CheckCircle2, RotateCcw, Headphones
} from 'lucide-react'
import { playNotificationSound, startContinuousAlarm, stopContinuousAlarm } from '@/lib/notifications'
import { getFollowUpStatus } from '@/lib/followupRules'
import { openJustCallDialer, getJustCallDialerUrl, openMicroSipDialer, getMicroSipDialerUrl } from '@/lib/dialer'

interface DueLead {
  id: string
  name: string
  phone: string
  course?: string
  priority?: string
  next_follow_up: string
  stage: string
}

export default function AutoReminderWatcher() {
  const { user } = useAuth()
  const router = useRouter()

  const [activePopupLead, setActivePopupLead] = useState<DueLead | null>(null)
  const [overdueCount, setOverdueCount] = useState(0)
  const [dueSoonCount, setDueSoonCount] = useState(0)
  const [snoozing, setSnoozing] = useState(false)

  // Track which leads we already sounded the alarm for in this session
  const alarmedLeadsRef = useRef<Set<string>>(new Set())

  // Continuous alarm loop: keeps ringing like an alarm clock until activePopupLead is dismissed or action taken
  useEffect(() => {
    if (activePopupLead) {
      const stopAlarm = startContinuousAlarm()
      return () => {
        stopAlarm()
      }
    } else {
      stopContinuousAlarm()
    }
  }, [activePopupLead])

  // Custom event listener for manual testing of follow-up alarm
  useEffect(() => {
    const handleTestTrigger = (e: any) => {
      const sample: DueLead = e.detail || {
        id: 'test-alarm-lead',
        name: 'PaulTekei',
        phone: '+61451264780',
        course: 'Master of Business Administration',
        priority: 'Hot',
        next_follow_up: new Date().toISOString(),
        stage: 'Follow-up Due',
      }
      setActivePopupLead(sample)
    }

    window.addEventListener('trigger-test-followup-alarm', handleTestTrigger)
    return () => {
      window.removeEventListener('trigger-test-followup-alarm', handleTestTrigger)
      stopContinuousAlarm()
    }
  }, [])

  useEffect(() => {
    if (!user) return

    const checkUpcomingFollowups = async () => {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
      const fifteenMinsLater = new Date(now.getTime() + 15 * 60 * 1000).toISOString()

      let query = supabase
        .from('leads')
        .select('id, name, phone, course, priority, next_follow_up, stage')
        .not('next_follow_up', 'is', null)
        .gte('next_follow_up', oneHourAgo)
        .lte('next_follow_up', fifteenMinsLater)
        .neq('stage', 'Enrolled')
        .order('next_follow_up', { ascending: true })
        .limit(25)

      if (user.role === 'counselor') {
        query = query.eq('owner_id', user.id)
      }

      const { data } = await query
      if (!data) return

      const overdueList: DueLead[] = []
      const dueSoonList: DueLead[] = []

      data.forEach(lead => {
        const fTime = new Date(lead.next_follow_up).getTime()
        const nowTime = now.getTime()
        const diffMins = (fTime - nowTime) / 60000

        // Rings alarm 5 minutes before scheduled follow-up
        if (diffMins < 0 && diffMins >= -60) {
          overdueList.push(lead)
        } else if (diffMins >= 0 && diffMins <= 5) {
          dueSoonList.push(lead)
        }
      })

      setOverdueCount(overdueList.length)
      setDueSoonCount(dueSoonList.length)

      // Trigger alarm popup 5 minutes before follow-up (prioritize upcoming in 5 mins)
      const urgentCandidate = dueSoonList[0] || (overdueList.length > 0 ? overdueList[0] : null)

      if (urgentCandidate && !alarmedLeadsRef.current.has(urgentCandidate.id)) {
        alarmedLeadsRef.current.add(urgentCandidate.id)
        setActivePopupLead(urgentCandidate)
      }
    }

    // Run immediately and every 25 seconds
    checkUpcomingFollowups()
    const interval = setInterval(checkUpcomingFollowups, 25000)

    // Realtime listener
    const channel = supabase
      .channel('auto-reminders-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        checkUpcomingFollowups()
      })
      .subscribe()

    return () => {
      clearInterval(interval)
      supabase.removeChannel(channel)
      stopContinuousAlarm()
    }
  }, [user])

  // Snooze follow-up
  const handleSnooze = async (mins: number) => {
    if (!activePopupLead) return
    stopContinuousAlarm()
    setSnoozing(true)

    const newTime = new Date(Date.now() + mins * 60 * 1000).toISOString()
    await supabase.from('leads').update({ next_follow_up: newTime }).eq('id', activePopupLead.id)

    await supabase.from('activities').insert([
      {
        lead: activePopupLead.id,
        user_id: user?.id,
        type: 'reminder snoozed',
        text: `Follow-up reminder snoozed for ${mins} minutes.`,
        time: new Date().toISOString(),
      },
    ])

    setSnoozing(false)
    setActivePopupLead(null)
  }

  // Reschedule for tomorrow morning 10:30 AM
  const handleRescheduleTomorrow = async () => {
    if (!activePopupLead) return
    stopContinuousAlarm()
    setSnoozing(true)

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(10, 30, 0, 0)
    const newTime = tomorrow.toISOString()

    await supabase.from('leads').update({ next_follow_up: newTime }).eq('id', activePopupLead.id)

    await supabase.from('activities').insert([
      {
        lead: activePopupLead.id,
        user_id: user?.id,
        type: 'reminder snoozed',
        text: `Follow-up reminder moved to tomorrow 10:30 AM.`,
        time: new Date().toISOString(),
      },
    ])

    setSnoozing(false)
    setActivePopupLead(null)
  }

  return (
    <>
      {/* ──────── 1. URGENT POPUP REMINDER ALARM MODAL / BANNER ──────── */}
      {activePopupLead && (
        <div className="fixed top-5 right-5 z-50 max-w-md w-full animate-in slide-in-from-right duration-500 ease-out drop-shadow-2xl">
          <div className="bg-white border-2 border-rose-500 rounded-2xl shadow-2xl p-5 overflow-hidden relative">
            {/* Top Glow Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-500 animate-pulse" />

            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                  <AlarmClock size={22} className="animate-bounce" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
                      {new Date(activePopupLead.next_follow_up).getTime() - Date.now() > 0
                        ? `⏰ Follow-up in ${Math.max(1, Math.ceil((new Date(activePopupLead.next_follow_up).getTime() - Date.now()) / 60000))} Mins!`
                        : '⏰ Follow-up Due Right Now!'}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-rose-600 text-white animate-pulse flex items-center gap-1 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                      ALARM RINGING
                    </span>
                    {activePopupLead.priority === 'Hot' && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 text-rose-800 flex items-center gap-0.5">
                        <Flame size={10} /> HOT
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-gray-900 leading-tight mt-0.5">
                    {activePopupLead.name}
                  </h3>
                </div>
              </div>

              <button
                id="alarm-popup-close-btn"
                onClick={() => {
                  stopContinuousAlarm()
                  setActivePopupLead(null)
                }}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                title="Stop Alarm & Dismiss"
              >
                <X size={18} />
              </button>
            </div>

            {/* Lead Context Snippet */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs space-y-1 border border-gray-100">
              <div className="flex items-center justify-between text-gray-700">
                <span className="font-semibold">Phone:</span>
                <span className="font-mono font-bold text-gray-900">{activePopupLead.phone}</span>
              </div>
              {activePopupLead.course && (
                <div className="flex items-center justify-between text-gray-700">
                  <span>Interest:</span>
                  <span className="font-medium text-gray-900 truncate max-w-[200px]">
                    {activePopupLead.course}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between text-gray-500 text-[11px] pt-1 border-t border-gray-200">
                <span>Scheduled for:</span>
                <span className="font-semibold text-rose-700">
                  {new Date(activePopupLead.next_follow_up).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </span>
              </div>
            </div>

            {/* Direct Calling & Action Buttons */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              <a
                id="alarm-popup-call-btn"
                href={getJustCallDialerUrl(activePopupLead.phone)}
                onClick={(e) => {
                  stopContinuousAlarm()
                  setActivePopupLead(null)
                  openJustCallDialer(activePopupLead.phone, e)
                }}
                className="py-2 px-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-98 cursor-pointer text-center"
                title="Call via JustCall"
              >
                <Phone size={13} />
                <span className="truncate">JustCall</span>
              </a>

              <a
                id="alarm-popup-microsip-btn"
                href={getMicroSipDialerUrl(activePopupLead.phone)}
                onClick={(e) => {
                  stopContinuousAlarm()
                  setActivePopupLead(null)
                  openMicroSipDialer(activePopupLead.phone, e)
                }}
                className="py-2 px-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-98 cursor-pointer text-center"
                title="Call via MicroSIP (Softphone app)"
              >
                <Headphones size={13} />
                <span className="truncate">MicroSIP</span>
              </a>

              <a
                id="alarm-popup-wa-btn"
                href={`https://wa.me/${activePopupLead.phone.replace(/[^0-9]/g, '')}`}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  stopContinuousAlarm()
                  setActivePopupLead(null)
                }}
                className="py-2 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 shadow-sm active:scale-98 cursor-pointer text-center"
              >
                <MessageCircle size={13} />
                <span className="truncate">WhatsApp</span>
              </a>
            </div>

            {/* Quick Snooze Bar */}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-1.5 text-xs">
              <span className="text-[11px] font-semibold text-gray-500">Snooze:</span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={snoozing}
                  onClick={() => handleSnooze(15)}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-[11px] font-medium transition-colors"
                >
                  +15 Mins
                </button>
                <button
                  disabled={snoozing}
                  onClick={() => handleSnooze(60)}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-[11px] font-medium transition-colors"
                >
                  +1 Hour
                </button>
                <button
                  disabled={snoozing}
                  onClick={handleRescheduleTomorrow}
                  className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-[11px] font-medium transition-colors"
                >
                  Tomorrow
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────── 2. SUBTLE FLOATING REMINDERS BADGE (Bottom Right) ──────── */}
      {(overdueCount > 0 || dueSoonCount > 0) && (
        <div className="fixed bottom-6 left-6 z-40 animate-in fade-in duration-300">
          <Link
            href="/reminders"
            className="flex items-center gap-2.5 bg-white border border-gray-200 shadow-lg hover:shadow-xl px-4 py-2.5 rounded-2xl text-xs font-semibold text-gray-800 transition-all group hover:scale-[1.02]"
          >
            <div className="relative">
              <AlarmClock size={16} className="text-rose-600 animate-pulse" />
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            </div>

            <div className="flex items-center gap-2">
              {overdueCount > 0 && (
                <span className="text-rose-600 font-bold">
                  {overdueCount} Overdue Call{overdueCount > 1 ? 's' : ''}
                </span>
              )}
              {dueSoonCount > 0 && (
                <span className="text-amber-600 font-bold">
                  • {dueSoonCount} Due Soon
                </span>
              )}
            </div>

            <ChevronRight size={14} className="text-gray-400 group-hover:text-black transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      )}
    </>
  )
}

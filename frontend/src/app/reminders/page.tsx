'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlarmClock, Clock, Phone, MessageCircle, ExternalLink,
  Flame, CheckCircle2, AlertTriangle, RefreshCw, Settings,
  Calendar, User, Search, Filter, RotateCcw, ArrowRight,
  Sparkles, Check, ChevronRight, X
} from 'lucide-react'
import {
  calculateAutoFollowUp,
  getFollowUpStatus,
  DEFAULT_FOLLOWUP_CONFIG,
  FollowUpRuleConfig,
  toLocalDatetimeString,
} from '@/lib/followupRules'
import { openCallHippoDialer, getCallHippoDialerUrl } from '@/lib/callhippo'
import { useCallHippoLine } from '@/lib/dialer'

interface LeadItem {
  id: string
  name: string
  phone: string
  email?: string
  stage: string
  priority?: string
  course?: string
  programme_level?: string
  country?: string
  next_follow_up: string | null
  owner_id?: string | null
  owner_name?: string
  last_call_outcome?: string
  attempts?: number
}

export default function RemindersPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [lineConfig] = useCallHippoLine()

  const [leads, setLeads] = useState<LeadItem[]>([])
  const [counselors, setCounselors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Filters
  const [activeTab, setActiveTab] = useState<'overdue' | 'due_soon' | 'today' | 'unscheduled'>('overdue')
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Active call logging card state
  const [selectedLeadForCall, setSelectedLeadForCall] = useState<LeadItem | null>(null)
  const [callOutcome, setCallOutcome] = useState('Connected')
  const [callNote, setCallNote] = useState('')
  const [customNextDate, setCustomNextDate] = useState('')
  const [savingAction, setSavingAction] = useState(false)

  // SOP Rules settings modal
  const [isSOPModalOpen, setIsSOPModalOpen] = useState(false)
  const [sopConfig, setSopConfig] = useState<FollowUpRuleConfig>(DEFAULT_FOLLOWUP_CONFIG)

  const fetchLeads = async () => {
    if (!user) return

    // Fetch active counselors
    const { data: counselorsData } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('active', true)
      .order('name', { ascending: true })

    setCounselors(counselorsData || [])

    const counselorMap: Record<string, string> = {}
    counselorsData?.forEach(c => {
      counselorMap[c.id] = c.name || c.email
    })

    // Fetch leads (exclude already enrolled students)
    let query = supabase
      .from('leads')
      .select('id, name, phone, email, stage, priority, course, programme_level, country, next_follow_up, owner_id, last_call_outcome, attempts')
      .neq('stage', 'Enrolled')
      .order('created_at', { ascending: false })
      .limit(250)

    if (user.role === 'counselor') {
      query = query.eq('owner_id', user.id)
    }

    const { data } = await query

    const mapped: LeadItem[] = (data || []).map(l => ({
      ...l,
      owner_name: l.owner_id ? counselorMap[l.owner_id] || 'Counselor' : 'Unassigned',
    }))

    setLeads(mapped)
    setLoading(false)
  }

  useEffect(() => {
    fetchLeads()

    // Realtime listeners
    const channel = supabase
      .channel('reminders-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchLeads()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchLeads()
    setTimeout(() => setRefreshing(false), 500)
  }

  // ── Segregated Groups ──
  const categorized = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const overdue: LeadItem[] = []
    const dueSoon: LeadItem[] = []
    const today: LeadItem[] = []
    const unscheduled: LeadItem[] = []

    leads.forEach(l => {
      // Counselor filter
      if (selectedCounselorId !== 'all' && l.owner_id !== selectedCounselorId) return

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = l.name?.toLowerCase().includes(q)
        const matchPhone = l.phone?.toLowerCase().includes(q)
        const matchCourse = l.course?.toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchCourse) return
      }

      if (!l.next_follow_up) {
        unscheduled.push(l)
        return
      }

      const fTime = new Date(l.next_follow_up)
      const diffMins = (fTime.getTime() - now.getTime()) / 60000

      if (diffMins < 0) {
        overdue.push(l)
      } else if (diffMins <= 30) {
        dueSoon.push(l)
      } else if (fTime >= startOfToday && fTime <= endOfToday) {
        today.push(l)
      }
    })

    // Sort overdue by oldest first
    overdue.sort((a, b) => new Date(a.next_follow_up!).getTime() - new Date(b.next_follow_up!).getTime())
    // Sort due soon by nearest first
    dueSoon.sort((a, b) => new Date(a.next_follow_up!).getTime() - new Date(b.next_follow_up!).getTime())
    // Sort today by nearest first
    today.sort((a, b) => new Date(a.next_follow_up!).getTime() - new Date(b.next_follow_up!).getTime())

    return { overdue, dueSoon, today, unscheduled }
  }, [leads, selectedCounselorId, searchQuery])

  // Current tab items
  const currentItems = useMemo(() => {
    switch (activeTab) {
      case 'overdue':
        return categorized.overdue
      case 'due_soon':
        return categorized.dueSoon
      case 'today':
        return categorized.today
      case 'unscheduled':
        return categorized.unscheduled
      default:
        return categorized.overdue
    }
  }, [activeTab, categorized])

  // ── Quick Snooze Presets ──
  const handleQuickSnooze = async (leadId: string, mins: number) => {
    setSavingAction(true)
    const newTime = new Date(Date.now() + mins * 60 * 1000).toISOString()

    await supabase.from('leads').update({ next_follow_up: newTime }).eq('id', leadId)
    await supabase.from('activities').insert([
      {
        lead: leadId,
        user_id: user?.id,
        type: 'reminder snoozed',
        text: `Follow-up reminder snoozed for ${mins} minutes.`,
        time: new Date().toISOString(),
      },
    ])

    await fetchLeads()
    setSavingAction(false)
  }

  // Tomorrow 10:30 AM
  const handleSnoozeTomorrow = async (leadId: string) => {
    setSavingAction(true)
    const target = new Date()
    target.setDate(target.getDate() + 1)
    target.setHours(10, 30, 0, 0)
    const newTime = target.toISOString()

    await supabase.from('leads').update({ next_follow_up: newTime }).eq('id', leadId)
    await supabase.from('activities').insert([
      {
        lead: leadId,
        user_id: user?.id,
        type: 'reminder snoozed',
        text: `Follow-up reminder moved to tomorrow 10:30 AM.`,
        time: new Date().toISOString(),
      },
    ])

    await fetchLeads()
    setSavingAction(false)
  }

  // ── Open Call Log & Auto Schedule Drawer ──
  const openCallModal = (lead: LeadItem) => {
    setSelectedLeadForCall(lead)
    setCallOutcome('Connected')
    setCallNote('')

    // Set custom next date using local timezone helper
    setCustomNextDate(toLocalDatetimeString(lead.next_follow_up))
  }

  // Outcome change
  const handleOutcomeChange = (newOutcome: string) => {
    setCallOutcome(newOutcome)
    // Manual only: do not auto-calculate or override date
  }

  // Save Call & Advance Follow-up
  const handleSaveCallAndAdvance = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLeadForCall) return
    setSavingAction(true)

    const nextFollowUpIso = customNextDate ? new Date(customNextDate).toISOString() : null
    const isUnanswered = ['No Answer', 'Busy'].includes(callOutcome)
    const newAttempts = isUnanswered
      ? (selectedLeadForCall.attempts || 0) + 1
      : selectedLeadForCall.attempts || 0

    // 1. Log Call Activity
    await supabase.from('activities').insert([
      {
        lead: selectedLeadForCall.id,
        user_id: user?.id,
        type: 'call',
        outcome: callOutcome,
        text: `Call logged from Follow-up Reminders. Outcome: ${callOutcome}. ${
          callNote ? `Notes: ${callNote}` : ''
        }`,
        time: new Date().toISOString(),
      },
    ])

    // 2. Update Lead
    await supabase
      .from('leads')
      .update({
        attempts: newAttempts,
        last_call_outcome: callOutcome,
        next_follow_up: nextFollowUpIso,
      })
      .eq('id', selectedLeadForCall.id)

    setSavingAction(false)
    setSelectedLeadForCall(null)
    await fetchLeads()
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFDFD]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#FDFDFD] animate-in fade-in duration-300">
      {/* ──────── Top Header Bar ──────── */}
      <div className="p-6 pb-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                Auto Follow-up Reminders
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
                <AlarmClock size={11} className="animate-pulse" />
                Live Reminder Engine
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Realtime Sync
              </span>
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Automatic call reminders, real-time overdue alerts, and intelligent call outcome SOP scheduling.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* SOP Rules Settings Button */}
            <button
              onClick={() => setIsSOPModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Settings size={13} className="text-gray-600" />
              <span>SOP Auto Rules</span>
            </button>

            {/* Switch to Calendar */}
            <Link
              href="/calendar"
              className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <Calendar size={13} className="text-gray-600" />
              <span>Calendar View</span>
            </Link>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              title="Refresh reminders"
              className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
            </button>
          </div>
        </div>

        {/* ──────── KPI Badges Row ──────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
          <button
            onClick={() => setActiveTab('overdue')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'overdue'
                ? 'bg-rose-50 border-rose-300 ring-2 ring-rose-500/10'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                Overdue Right Now
              </span>
              <AlertTriangle size={15} className="text-rose-500" />
            </div>
            <span className="text-2xl font-bold text-rose-700">
              {categorized.overdue.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('due_soon')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'due_soon'
                ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-500/10'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                Due in Next 30 Mins
              </span>
              <AlarmClock size={15} className="text-amber-500" />
            </div>
            <span className="text-2xl font-bold text-amber-700">
              {categorized.dueSoon.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('today')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'today'
                ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/10'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                Later Today
              </span>
              <Clock size={15} className="text-blue-500" />
            </div>
            <span className="text-2xl font-bold text-blue-700">
              {categorized.today.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('unscheduled')}
            className={`p-3 rounded-xl border text-left transition-all ${
              activeTab === 'unscheduled'
                ? 'bg-gray-100 border-gray-400 ring-2 ring-gray-500/10'
                : 'bg-white border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Needs Scheduling
              </span>
              <RotateCcw size={15} className="text-gray-400" />
            </div>
            <span className="text-2xl font-bold text-gray-800">
              {categorized.unscheduled.length}
            </span>
          </button>
        </div>

        {/* ──────── Filter Row ──────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Counselor filter (for managers) */}
            {user?.role === 'manager' && (
              <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs">
                <User size={13} className="text-gray-400" />
                <select
                  value={selectedCounselorId}
                  onChange={e => setSelectedCounselorId(e.target.value)}
                  className="bg-transparent font-medium text-gray-800 outline-none cursor-pointer"
                >
                  <option value="all">All Counselors ({counselors.length})</option>
                  {counselors.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Category tabs */}
            <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-xs">
              {(
                [
                  ['overdue', `🚨 Overdue (${categorized.overdue.length})`],
                  ['due_soon', `⏱️ Due Soon (${categorized.dueSoon.length})`],
                  ['today', `📅 Today (${categorized.today.length})`],
                  ['unscheduled', `⚠️ Unscheduled (${categorized.unscheduled.length})`],
                ] as const
              ).map(([tKey, tLabel]) => (
                <button
                  key={tKey}
                  onClick={() => setActiveTab(tKey)}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    activeTab === tKey
                      ? 'bg-white text-gray-900 font-bold shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search student name, phone..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* ──────── Main Reminders Cards List ──────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {currentItems.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm max-w-xl mx-auto my-8">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-900">
              {activeTab === 'overdue'
                ? 'No Overdue Follow-ups! 🎉'
                : activeTab === 'due_soon'
                ? 'No Calls Due in the Next 30 Minutes'
                : activeTab === 'today'
                ? 'No Remaining Calls Scheduled Today'
                : 'All Leads Have Follow-ups Scheduled'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Your calling queue is clear. New reminders will sound and pop up automatically when due.
            </p>
          </div>
        ) : (
          currentItems.map(lead => {
            const statusInfo = lead.next_follow_up
              ? getFollowUpStatus(lead.next_follow_up)
              : { status: 'unset', label: 'Not Scheduled', isOverdue: false }

            const isLeadOverdue = statusInfo.isOverdue
            const isDueSoon = (statusInfo as any).isDueSoon

            return (
              <div
                key={lead.id}
                className={`bg-white border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                  isLeadOverdue
                    ? 'border-rose-200 ring-1 ring-rose-500/10 bg-rose-50/15'
                    : isDueSoon
                    ? 'border-amber-200 ring-1 ring-amber-500/10 bg-amber-50/15'
                    : 'border-gray-200'
                }`}
              >
                {/* Lead Summary */}
                <div className="flex items-start gap-4">
                  {/* Status Indicator Icon */}
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                      isLeadOverdue
                        ? 'bg-rose-50 border-rose-200 text-rose-700'
                        : isDueSoon
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : 'bg-gray-50 border-gray-200 text-gray-700'
                    }`}
                  >
                    {isLeadOverdue ? (
                      <AlarmClock size={20} className="animate-pulse" />
                    ) : (
                      <Clock size={20} />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-bold text-gray-900">{lead.name}</h3>

                      {/* Overdue/Status pill */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          isLeadOverdue
                            ? 'bg-rose-100 text-rose-800'
                            : isDueSoon
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {statusInfo.label}
                      </span>

                      {lead.priority && (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                            lead.priority === 'Hot'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : lead.priority === 'Warm'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : lead.priority === 'Cold'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : lead.priority === 'Callback'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : lead.priority === 'Ringing'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {lead.priority === 'Hot' ? '🔥 Hot' : lead.priority === 'Warm' ? '☀️ Warm' : lead.priority === 'Cold' ? '❄️ Cold' : lead.priority === 'Callback' ? '📞 Callback' : lead.priority === 'Ringing' ? '🔔 Ringing' : lead.priority}
                        </span>
                      )}

                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                        Stage: {lead.stage}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                      <span className="font-mono font-bold text-gray-900">📞 {lead.phone}</span>
                      {lead.course && <span>🎓 {lead.course}</span>}
                      {lead.country && <span>🌍 {lead.country}</span>}
                      <span>👤 Counselor: {lead.owner_name}</span>
                    </div>

                    {lead.next_follow_up && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Scheduled Time:{' '}
                        <strong className="text-gray-700">
                          {new Date(lead.next_follow_up).toLocaleString('en-IN', {
                            weekday: 'short',
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </strong>
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center gap-2 flex-wrap self-end lg:self-center shrink-0">
                  {/* CallHippo Calling Buttons (UK vs USA Line) */}
                  <div className="inline-flex items-center rounded-xl overflow-hidden shadow-sm border border-emerald-600 bg-emerald-600 text-white">
                    <a
                      href={getCallHippoDialerUrl(lead.phone, { name: lead.name, leadId: lead.id, country: lead.country, line: lineConfig.activeLine })}
                      onClick={(e) => openCallHippoDialer(lead.phone, e, { name: lead.name, leadId: lead.id, country: lead.country, line: lineConfig.activeLine })}
                      className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 border-r border-emerald-700"
                      title={`Call via CallHippo (${lineConfig.activeLine === 'usa' ? 'USA Line' : lineConfig.activeLine === 'uk' ? 'UK Line' : 'Auto'})`}
                    >
                      <Phone size={13} />
                      <span>Call ({lineConfig.activeLine === 'usa' ? 'USA' : lineConfig.activeLine === 'uk' ? 'UK' : 'Auto'})</span>
                    </a>
                    <button
                      type="button"
                      onClick={(e) => openCallHippoDialer(lead.phone, e, { name: lead.name, leadId: lead.id, country: lead.country, line: 'uk' })}
                      className="px-2 py-2 bg-emerald-700 hover:bg-emerald-800 text-[11px] font-semibold border-r border-emerald-800 transition-colors cursor-pointer"
                      title="Call from UK Line (+44)"
                    >
                      🇬🇧
                    </button>
                    <button
                      type="button"
                      onClick={(e) => openCallHippoDialer(lead.phone, e, { name: lead.name, leadId: lead.id, country: lead.country, line: 'usa' })}
                      className="px-2 py-2 bg-emerald-700 hover:bg-emerald-800 text-[11px] font-semibold transition-colors cursor-pointer"
                      title="Call from USA Line (+1)"
                    >
                      🇺🇸
                    </button>
                  </div>

                  {/* WhatsApp */}
                  <a
                    href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 border border-emerald-200 hover:bg-emerald-50 text-emerald-700 rounded-xl transition-colors"
                    title="Open WhatsApp"
                  >
                    <MessageCircle size={15} />
                  </a>

                  {/* Log Call & Auto-Advance */}
                  <button
                    onClick={() => openCallModal(lead)}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    Log Call & Advance
                  </button>

                  {/* Snooze Presets */}
                  <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-xs">
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickSnooze(lead.id, 15)}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium text-gray-700 hover:bg-white hover:shadow-xs transition-all"
                      title="Snooze 15 minutes"
                    >
                      +15m
                    </button>
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickSnooze(lead.id, 60)}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium text-gray-700 hover:bg-white hover:shadow-xs transition-all"
                      title="Snooze 1 hour"
                    >
                      +1h
                    </button>
                    <button
                      disabled={savingAction}
                      onClick={() => handleSnoozeTomorrow(lead.id)}
                      className="px-2 py-1 rounded-lg text-[11px] font-medium text-gray-700 hover:bg-white hover:shadow-xs transition-all"
                      title="Move to tomorrow morning 10:30 AM"
                    >
                      Tmrw
                    </button>
                  </div>

                  {/* Profile Link */}
                  <Link
                    href={`/leads/${lead.id}`}
                    className="p-2 text-gray-400 hover:text-black rounded-lg hover:bg-gray-100 transition-colors"
                    title="Open Lead Profile"
                  >
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* 2. CALL LOG & AUTO ADVANCE DRAWER / MODAL */}
      {/* ======================================================== */}
      {selectedLeadForCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  Log Call with {selectedLeadForCall.name}
                </h3>
                <p className="text-xs text-gray-500">{selectedLeadForCall.phone}</p>
              </div>
              <button
                onClick={() => setSelectedLeadForCall(null)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCallAndAdvance} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Call Outcome
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['Connected', '✅ Connected (+2d SOP)'],
                      ['No Answer', '❌ No Answer (+4h SOP)'],
                      ['Busy', '⏳ Busy (+2h SOP)'],
                      ['Wrong Num', '⚠️ Wrong Number'],
                    ] as const
                  ).map(([outcomeKey, outcomeLabel]) => (
                    <button
                      type="button"
                      key={outcomeKey}
                      onClick={() => handleOutcomeChange(outcomeKey)}
                      className={`p-2.5 rounded-xl border text-xs font-semibold text-left transition-all ${
                        callOutcome === outcomeKey
                          ? 'border-black bg-black text-white shadow-xs'
                          : 'border-gray-200 bg-white text-gray-800 hover:bg-gray-50'
                      }`}
                    >
                      {outcomeLabel}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Call Notes
                </label>
                <input
                  type="text"
                  value={callNote}
                  onChange={e => setCallNote(e.target.value)}
                  placeholder="e.g. Student confirmed IELTS 6.5, applying for Jan intake"
                  className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              {/* Optional Manual Next Follow-up Date */}
              {callOutcome !== 'Wrong Num' && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <div className="flex items-center justify-between gap-1.5 mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} className="text-gray-600" />
                      <span className="text-xs font-bold text-gray-800">
                        Next Follow-up Date (Optional - Manual Only)
                      </span>
                    </div>
                    {customNextDate && (
                      <button
                        type="button"
                        onClick={() => setCustomNextDate('')}
                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    type="datetime-local"
                    value={customNextDate}
                    onChange={e => setCustomNextDate(e.target.value)}
                    className="w-full bg-white border border-gray-300 text-gray-900 rounded-lg p-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-black"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    Set only if follow-up is needed. An alarm will ring 5 minutes before scheduled time.
                  </p>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedLeadForCall(null)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAction}
                  className="px-5 py-2 bg-black hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check size={14} />
                  <span>{savingAction ? 'Saving...' : 'Save & Advance Follow-up'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 3. SOP AUTO RULES CONFIG MODAL (MANAGER ONLY) */}
      {/* ======================================================== */}
      {isSOPModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center">
                  <Settings size={14} />
                </div>
                <h3 className="text-base font-semibold text-gray-900">
                  Follow-up SOP Automation Rules
                </h3>
              </div>
              <button
                onClick={() => setIsSOPModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-800 mb-1">
                  Delay for &quot;No Answer&quot; (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={sopConfig.noAnswerDelayHours}
                  onChange={e =>
                    setSopConfig({ ...sopConfig, noAnswerDelayHours: parseInt(e.target.value) || 4 })
                  }
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 outline-none font-semibold"
                />
                <span className="text-[10px] text-gray-400">
                  Auto-reschedules call after {sopConfig.noAnswerDelayHours} hours (rolls over to 10:00 AM next day if after 6:30 PM).
                </span>
              </div>

              <div>
                <label className="block font-semibold text-gray-800 mb-1">
                  Delay for &quot;Busy&quot; (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={sopConfig.busyDelayHours}
                  onChange={e =>
                    setSopConfig({ ...sopConfig, busyDelayHours: parseInt(e.target.value) || 2 })
                  }
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 outline-none font-semibold"
                />
                <span className="text-[10px] text-gray-400">
                  Auto-reschedules call after {sopConfig.busyDelayHours} hours.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-gray-800 mb-1">
                  Delay for &quot;Connected&quot; (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={sopConfig.connectedDelayDays}
                  onChange={e =>
                    setSopConfig({ ...sopConfig, connectedDelayDays: parseInt(e.target.value) || 2 })
                  }
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 outline-none font-semibold"
                />
                <span className="text-[10px] text-gray-400">
                  Schedules next counseling checkpoint {sopConfig.connectedDelayDays} days later at 11:00 AM.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-gray-800 mb-1">
                  Alarm Lead Time (Minutes Before Due)
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={sopConfig.reminderLeadTimeMins}
                  onChange={e =>
                    setSopConfig({ ...sopConfig, reminderLeadTimeMins: parseInt(e.target.value) || 15 })
                  }
                  className="w-full bg-white border border-gray-200 rounded-xl p-2.5 outline-none font-semibold"
                />
                <span className="text-[10px] text-gray-400">
                  Sounds in-app chime and shows popup banner {sopConfig.reminderLeadTimeMins} minutes before the scheduled time.
                </span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsSOPModalOpen(false)}
                  className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  Save SOP Rules
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

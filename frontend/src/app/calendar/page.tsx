'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight,
  Phone, MessageCircle, ExternalLink, Filter, Plus, Search,
  Flame, SunMedium, Snowflake, CheckCircle2, AlertCircle,
  X, RefreshCw, User, CalendarDays, CalendarRange, ListFilter
} from 'lucide-react'
import { openCallHippoDialer, getCallHippoDialerUrl } from '@/lib/callhippo'

type ViewMode = 'month' | 'week' | 'day'

interface LeadFollowUp {
  id: string
  name: string
  phone: string
  email?: string
  stage: string
  priority?: string
  next_follow_up: string
  owner_id?: string
  owner_name?: string
  programme_level?: string
  course?: string
  country?: string
  last_call_outcome?: string
}

export default function CalendarPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [leads, setLeads] = useState<LeadFollowUp[]>([])
  const [counselors, setCounselors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())

  // Filters
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Drawer / Modals
  const [activeLead, setActiveLead] = useState<LeadFollowUp | null>(null)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [availableLeads, setAvailableLeads] = useState<any[]>([])
  const [newScheduleLeadId, setNewScheduleLeadId] = useState('')
  const [newScheduleDate, setNewScheduleDate] = useState('')
  const [newScheduleTime, setNewScheduleTime] = useState('11:00')
  const [savingAction, setSavingAction] = useState(false)

  // Call log action inside drawer
  const [callOutcome, setCallOutcome] = useState('Connected')
  const [callNote, setCallNote] = useState('')

  const fetchCalendarData = async () => {
    if (!user) return

    // Fetch counselors
    const { data: usersData } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('active', true)
      .order('name', { ascending: true })

    setCounselors(usersData || [])

    // Query leads with next_follow_up set
    let query = supabase
      .from('leads')
      .select('id, name, phone, email, stage, priority, next_follow_up, owner_id, programme_level, course, country, last_call_outcome')
      .not('next_follow_up', 'is', null)
      .order('next_follow_up', { ascending: true })

    if (user.role === 'counselor') {
      query = query.eq('owner_id', user.id)
    }

    const { data: leadsData } = await query

    // Attach owner names
    const counselorMap: Record<string, string> = {}
    usersData?.forEach(c => {
      counselorMap[c.id] = c.name || c.email
    })

    const formatted: LeadFollowUp[] = (leadsData || []).map(l => ({
      ...l,
      owner_name: l.owner_id ? counselorMap[l.owner_id] || 'Counselor' : 'Unassigned',
    }))

    setLeads(formatted)
    setLoading(false)
  }

  useEffect(() => {
    fetchCalendarData()

    // Realtime listeners
    const channel = supabase
      .channel('calendar-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchCalendarData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchCalendarData()
      })
      .subscribe()

    const interval = setInterval(fetchCalendarData, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [user])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchCalendarData()
    setTimeout(() => setRefreshing(false), 500)
  }

  // ── Date Navigation Helpers ──
  const goToToday = () => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }

  const prevPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    } else if (viewMode === 'week') {
      const d = new Date(currentDate)
      d.setDate(d.getDate() - 7)
      setCurrentDate(d)
    } else {
      const d = new Date(selectedDate)
      d.setDate(d.getDate() - 1)
      setSelectedDate(d)
      setCurrentDate(d)
    }
  }

  const nextPeriod = () => {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    } else if (viewMode === 'week') {
      const d = new Date(currentDate)
      d.setDate(d.getDate() + 7)
      setCurrentDate(d)
    } else {
      const d = new Date(selectedDate)
      d.setDate(d.getDate() + 1)
      setSelectedDate(d)
      setCurrentDate(d)
    }
  }

  // ── Filtered Leads ──
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (selectedCounselorId !== 'all' && l.owner_id !== selectedCounselorId) return false
      if (selectedPriority !== 'all' && l.priority !== selectedPriority) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = l.name?.toLowerCase().includes(q)
        const matchPhone = l.phone?.toLowerCase().includes(q)
        const matchCourse = l.course?.toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchCourse) return false
      }
      return true
    })
  }, [leads, selectedCounselorId, selectedPriority, searchQuery])

  // ── KPI Summary Stats ──
  const stats = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    const endOfWeek = new Date(startOfToday)
    endOfWeek.setDate(endOfWeek.getDate() + 7)

    const overdue = filteredLeads.filter(l => new Date(l.next_follow_up) < now)
    const today = filteredLeads.filter(l => {
      const d = new Date(l.next_follow_up)
      return d >= startOfToday && d <= endOfToday
    })
    const thisWeek = filteredLeads.filter(l => {
      const d = new Date(l.next_follow_up)
      return d >= startOfToday && d <= endOfWeek
    })
    const hot = filteredLeads.filter(l => l.priority === 'Hot')

    return {
      overdue: overdue.length,
      today: today.length,
      thisWeek: thisWeek.length,
      hot: hot.length,
    }
  }, [filteredLeads])

  // ── Month Calendar Grid Calculation ──
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    // Monday start: 0 = Mon, 6 = Sun
    let startDayOfWeek = firstDay.getDay() - 1
    if (startDayOfWeek === -1) startDayOfWeek = 6

    const days = []

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      })
    }

    // Next month padding to fill rows of 7
    const remaining = (7 - (days.length % 7)) % 7
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      })
    }

    return days
  }, [currentDate])

  // ── Week Days Calculation ──
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate)
    const day = curr.getDay()
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1) // adjust when day is sunday
    const monday = new Date(curr.setDate(diff))

    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      days.push(d)
    }
    return days
  }, [currentDate])

  // Map follow-ups by date string "YYYY-MM-DD"
  const leadsByDate = useMemo(() => {
    const map: Record<string, LeadFollowUp[]> = {}
    filteredLeads.forEach(l => {
      const d = new Date(l.next_follow_up)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      if (!map[key]) map[key] = []
      map[key].push(l)
    })
    return map
  }, [filteredLeads])

  const getDateKey = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  const isSameDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    )
  }

  const isPast = (date: string) => {
    return new Date(date) < new Date()
  }

  // ── Reschedule Handlers ──
  const handleQuickReschedule = async (leadId: string, hoursAhead: number, specificHour?: number) => {
    setSavingAction(true)
    const now = new Date()
    let target = new Date()

    if (specificHour !== undefined) {
      target.setDate(now.getDate() + (hoursAhead / 24))
      target.setHours(specificHour, 0, 0, 0)
    } else {
      target.setTime(now.getTime() + hoursAhead * 60 * 60 * 1000)
    }

    const isoString = target.toISOString()

    await supabase.from('leads').update({ next_follow_up: isoString }).eq('id', leadId)
    await supabase.from('activities').insert([
      {
        lead: leadId,
        user_id: user?.id,
        type: 'followup rescheduled',
        text: `Follow-up rescheduled to ${target.toLocaleString('en-IN')}`,
        time: new Date().toISOString(),
      },
    ])

    if (activeLead && activeLead.id === leadId) {
      setActiveLead({ ...activeLead, next_follow_up: isoString })
    }

    await fetchCalendarData()
    setSavingAction(false)
  }

  // ── Log Call Outcome & Complete ──
  const handleLogCallAndOutcome = async () => {
    if (!activeLead) return
    setSavingAction(true)

    // Insert call activity
    await supabase.from('activities').insert([
      {
        lead: activeLead.id,
        user_id: user?.id,
        type: 'call',
        outcome: callOutcome,
        text: `Call logged from Follow-up Calendar. Outcome: ${callOutcome}. ${callNote ? `Notes: ${callNote}` : ''}`,
        time: new Date().toISOString(),
      },
    ])

    // Complete this scheduled follow-up so it doesn't linger as overdue, and record the outcome
    await supabase.from('leads').update({
      last_call_outcome: callOutcome,
      next_follow_up: null,
    }).eq('id', activeLead.id)

    setCallNote('')
    await fetchCalendarData()
    setSavingAction(false)
    setActiveLead(null)
  }

  // Open schedule modal
  const openScheduleModal = async () => {
    setIsScheduleModalOpen(true)
    const todayStr = new Date().toISOString().slice(0, 10)
    setNewScheduleDate(todayStr)

    // Load leads for selector
    const { data } = await supabase
      .from('leads')
      .select('id, name, phone, course')
      .order('name', { ascending: true })
      .limit(100)

    setAvailableLeads(data || [])
    if (data && data.length > 0) {
      setNewScheduleLeadId(data[0].id)
    }
  }

  const handleSaveNewSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newScheduleLeadId || !newScheduleDate) return
    setSavingAction(true)

    const dateTimeStr = `${newScheduleDate}T${newScheduleTime}:00`
    const targetDate = new Date(dateTimeStr).toISOString()

    await supabase.from('leads').update({ next_follow_up: targetDate }).eq('id', newScheduleLeadId)
    await supabase.from('activities').insert([
      {
        lead: newScheduleLeadId,
        user_id: user?.id,
        type: 'followup scheduled',
        text: `Follow-up scheduled for ${new Date(targetDate).toLocaleString('en-IN')}`,
        time: new Date().toISOString(),
      },
    ])

    await fetchCalendarData()
    setSavingAction(false)
    setIsScheduleModalOpen(false)
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
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Follow-up Calendar</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Realtime Sync
              </span>
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Visual schedule of student calling appointments, pending reminders, and overdue follow-ups.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-2xs">
              {(
                [
                  ['month', 'Month', CalendarIcon],
                  ['week', 'Week', CalendarRange],
                  ['day', 'Day / Agenda', ListFilter],
                ] as [ViewMode, string, any][]
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    viewMode === mode
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              title="Refresh calendar"
              className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
            </button>

            {/* Schedule New Follow-up Button */}
            <button
              onClick={openScheduleModal}
              className="px-3.5 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Plus size={14} />
              <span>Schedule Follow-up</span>
            </button>
          </div>
        </div>

        {/* ──────── KPI Badges & Navigation Row ──────── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-5 pt-4 border-t border-gray-100">
          {/* Month/Week Navigation */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl border border-gray-200">
              <button
                onClick={prevPeriod}
                className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition-colors"
                title="Previous"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToToday}
                className="px-3 py-1 text-xs font-bold text-gray-700 hover:bg-white rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={nextPeriod}
                className="p-1.5 hover:bg-white text-gray-700 rounded-lg transition-colors"
                title="Next"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <h2 className="text-base font-bold text-gray-900">
              {viewMode === 'month' &&
                currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              {viewMode === 'week' &&
                `Week of ${weekDays[0].toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`}
              {viewMode === 'day' &&
                selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </h2>
          </div>

          {/* Quick KPI Count Badges */}
          <div className="flex items-center gap-2 flex-wrap text-xs">
            {stats.overdue > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-rose-50 text-rose-700 border border-rose-200">
                <Clock size={12} className="text-rose-600 animate-pulse" />
                {stats.overdue} Overdue
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <CheckCircle2 size={12} className="text-blue-600" />
              {stats.today} Today
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-semibold bg-gray-50 text-gray-700 border border-gray-200">
              <CalendarIcon size={12} className="text-gray-500" />
              {stats.thisWeek} Next 7 Days
            </span>
            {stats.hot > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <Flame size={12} className="text-amber-600" />
                {stats.hot} Hot Leads
              </span>
            )}
          </div>
        </div>

        {/* ──────── Filter Row ──────── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-3 pt-3 border-t border-gray-100 flex-wrap">
          {/* Counselor selector (for managers) */}
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

          {/* Priority chips */}
          <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-xs">
            {(
              [
                ['all', 'All Priority'],
                ['Hot', '🔥 Hot'],
                ['Warm', '☀️ Warm'],
                ['Cold', '❄️ Cold'],
              ] as const
            ).map(([pKey, pLabel]) => (
              <button
                key={pKey}
                onClick={() => setSelectedPriority(pKey)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                  selectedPriority === pKey
                    ? 'bg-white text-gray-900 font-bold shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {pLabel}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search lead name, phone, course..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* ──────── Main Calendar Canvas ──────── */}
      <div className="flex-1 overflow-auto p-6">
        {/* ======================================================== */}
        {/* 1. MONTH VIEW */}
        {/* ======================================================== */}
        {viewMode === 'month' && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full min-h-[640px]">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50/70 text-center text-xs font-bold text-gray-500 uppercase tracking-wider py-2.5">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span className="text-gray-400">Sat</span>
              <span className="text-gray-400">Sun</span>
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 flex-1 auto-rows-fr divide-x divide-y divide-gray-100">
              {monthDays.map((cell, idx) => {
                const dateKey = getDateKey(cell.date)
                const dayLeads = leadsByDate[dateKey] || []
                const isTodayCell = isSameDay(cell.date, new Date())
                const isSelectedCell = isSameDay(cell.date, selectedDate)

                const overdueCount = dayLeads.filter(l => isPast(l.next_follow_up)).length

                return (
                  <div
                    key={idx}
                    onClick={() => {
                      setSelectedDate(cell.date)
                      if (dayLeads.length > 0 && viewMode === 'month') {
                        // Click date to highlight or switch to agenda
                      }
                    }}
                    className={`p-2 min-h-[110px] transition-colors relative flex flex-col group cursor-pointer ${
                      !cell.isCurrentMonth
                        ? 'bg-gray-50/40 text-gray-300'
                        : isSelectedCell
                        ? 'bg-blue-50/20'
                        : 'bg-white hover:bg-gray-50/60'
                    }`}
                  >
                    {/* Date Header */}
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full transition-all ${
                          isTodayCell
                            ? 'bg-black text-white shadow-xs'
                            : isSelectedCell
                            ? 'bg-blue-600 text-white'
                            : cell.isCurrentMonth
                            ? 'text-gray-800'
                            : 'text-gray-300'
                        }`}
                      >
                        {cell.date.getDate()}
                      </span>

                      {/* Day follow-up badge */}
                      {dayLeads.length > 0 && (
                        <div className="flex items-center gap-1">
                          {overdueCount > 0 && (
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          )}
                          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-gray-100 text-gray-700">
                            {dayLeads.length}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Follow-up Cards Snippets */}
                    <div className="space-y-1 flex-1 overflow-y-auto max-h-[85px]">
                      {dayLeads.slice(0, 3).map(lead => {
                        const timeStr = new Date(lead.next_follow_up).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                        const isLeadOverdue = isPast(lead.next_follow_up)

                        return (
                          <div
                            key={lead.id}
                            onClick={e => {
                              e.stopPropagation()
                              setActiveLead(lead)
                            }}
                            className={`p-1.5 rounded-lg border text-[11px] font-medium transition-all hover:scale-[1.02] cursor-pointer shadow-2xs flex items-center justify-between gap-1 ${
                              isLeadOverdue
                                ? 'bg-rose-50 border-rose-200 text-rose-900 hover:bg-rose-100'
                                : lead.priority === 'Hot'
                                ? 'bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100'
                                : 'bg-white border-gray-200 text-gray-800 hover:border-gray-400'
                            }`}
                          >
                            <div className="truncate flex items-center gap-1 min-w-0">
                              {lead.priority === 'Hot' && (
                                <Flame size={10} className="text-rose-500 shrink-0" />
                              )}
                              <span className="truncate font-semibold">{lead.name}</span>
                            </div>
                            <span className="text-[9px] text-gray-400 shrink-0 font-normal">
                              {timeStr}
                            </span>
                          </div>
                        )
                      })}

                      {dayLeads.length > 3 && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setSelectedDate(cell.date)
                            setViewMode('day')
                          }}
                          className="w-full text-center text-[10px] font-bold text-blue-600 hover:underline pt-0.5"
                        >
                          +{dayLeads.length - 3} more calls
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. WEEK VIEW */}
        {/* ======================================================== */}
        {viewMode === 'week' && (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col h-full min-h-[600px]">
            <div className="grid grid-cols-7 border-b border-gray-200 divide-x divide-gray-100 bg-gray-50/50">
              {weekDays.map((day, i) => {
                const isToday = isSameDay(day, new Date())
                const dateKey = getDateKey(day)
                const count = (leadsByDate[dateKey] || []).length

                return (
                  <div key={i} className="p-3 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                    <div className="flex items-center justify-center gap-1.5">
                      <span
                        className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-black text-white shadow-xs' : 'text-gray-900'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                      {count > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                          {count}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-7 flex-1 divide-x divide-gray-100 overflow-y-auto">
              {weekDays.map((day, i) => {
                const dateKey = getDateKey(day)
                const dayLeads = leadsByDate[dateKey] || []

                return (
                  <div key={i} className="p-2.5 space-y-2 bg-white min-h-[450px]">
                    {dayLeads.length === 0 ? (
                      <div className="h-40 flex items-center justify-center text-center text-gray-300 text-xs">
                        No calls
                      </div>
                    ) : (
                      dayLeads.map(lead => {
                        const timeStr = new Date(lead.next_follow_up).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })
                        const isLeadOverdue = isPast(lead.next_follow_up)

                        return (
                          <div
                            key={lead.id}
                            onClick={() => setActiveLead(lead)}
                            className={`p-3 rounded-xl border text-xs transition-all hover:shadow-md cursor-pointer ${
                              isLeadOverdue
                                ? 'bg-rose-50/60 border-rose-200'
                                : lead.priority === 'Hot'
                                ? 'bg-amber-50/60 border-amber-200'
                                : 'bg-white border-gray-200 hover:border-gray-400'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="font-bold text-gray-900 truncate">{lead.name}</span>
                              <span className="text-[10px] font-semibold text-gray-500">{timeStr}</span>
                            </div>

                            <p className="text-[11px] text-gray-500 mb-2 truncate">
                              {lead.course || lead.programme_level || lead.stage}
                            </p>

                            <div className="flex items-center justify-between pt-1 border-t border-gray-100 text-[10px]">
                              <span className="text-gray-400 truncate max-w-[90px]">
                                {lead.owner_name}
                              </span>
                              {lead.priority && (
                                <span
                                  className={`font-bold px-1.5 py-0.2 rounded-md ${
                                    lead.priority === 'Hot'
                                      ? 'text-rose-700 bg-rose-100'
                                      : lead.priority === 'Warm'
                                      ? 'text-amber-700 bg-amber-100'
                                      : 'text-blue-700 bg-blue-100'
                                  }`}
                                >
                                  {lead.priority}
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 3. DAY / AGENDA VIEW */}
        {/* ======================================================== */}
        {viewMode === 'day' && (
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {selectedDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(leadsByDate[getDateKey(selectedDate)] || []).length} follow-up calls scheduled for this day
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const prev = new Date(selectedDate)
                    prev.setDate(prev.getDate() - 1)
                    setSelectedDate(prev)
                  }}
                  className="p-1.5 border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => {
                    const next = new Date(selectedDate)
                    next.setDate(next.getDate() + 1)
                    setSelectedDate(next)
                  }}
                  className="p-1.5 border border-gray-200 hover:bg-gray-50 rounded-lg text-gray-600 transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* List of Day Follow-ups */}
            <div className="space-y-3">
              {(leadsByDate[getDateKey(selectedDate)] || []).length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300 mx-auto mb-3">
                    <CalendarIcon size={22} />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-800">No follow-ups for this day</h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Click "+ Schedule Follow-up" to add a student call reminder.
                  </p>
                </div>
              ) : (
                (leadsByDate[getDateKey(selectedDate)] || []).map(lead => {
                  const timeStr = new Date(lead.next_follow_up).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                  const isLeadOverdue = isPast(lead.next_follow_up)

                  return (
                    <div
                      key={lead.id}
                      className={`bg-white border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        isLeadOverdue
                          ? 'border-rose-200 ring-1 ring-rose-500/10 bg-rose-50/10'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 border ${
                            isLeadOverdue
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-gray-50 border-gray-200 text-gray-900'
                          }`}
                        >
                          <Clock size={16} />
                          <span className="text-[10px] font-bold mt-0.5">{timeStr}</span>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h4 className="text-sm font-bold text-gray-900">{lead.name}</h4>
                            {isLeadOverdue && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700 uppercase">
                                Overdue
                              </span>
                            )}
                            {lead.priority && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  lead.priority === 'Hot'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {lead.priority}
                              </span>
                            )}
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md">
                              Stage: {lead.stage}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span>📞 {lead.phone}</span>
                            {lead.course && <span>🎓 {lead.course}</span>}
                            <span>👤 Counselor: {lead.owner_name}</span>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                        <a
                          href={getCallHippoDialerUrl(lead.phone, { name: lead.name, leadId: lead.id })}
                          onClick={(e) => openCallHippoDialer(lead.phone, e, { name: lead.name, leadId: lead.id })}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                          title="Call via CallHippo"
                        >
                          <Phone size={12} />
                          <span>CallHippo</span>
                        </a>

                        <a
                          href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 border border-emerald-200 hover:bg-emerald-50 text-emerald-700 rounded-xl transition-colors"
                          title="WhatsApp Chat"
                        >
                          <MessageCircle size={15} />
                        </a>

                        <button
                          onClick={() => setActiveLead(lead)}
                          className="px-3 py-1.5 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
                        >
                          Manage & Reschedule
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. QUICK FOLLOW-UP DRAWER / MODAL */}
      {/* ======================================================== */}
      {activeLead && (
        <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
          <div
            onClick={() => setActiveLead(null)}
            className="absolute inset-0 bg-black/40 backdrop-blur-2xs"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              {/* Drawer Header */}
              <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-base font-bold text-gray-900">{activeLead.name}</h3>
                    {activeLead.priority && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                        {activeLead.priority}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {activeLead.course || activeLead.programme_level || 'Admissions Enquiry'}
                  </p>
                </div>

                <button
                  onClick={() => setActiveLead(null)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* Scheduled Follow-up Badge */}
                <div className={`p-4 rounded-xl border ${
                  isPast(activeLead.next_follow_up)
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                      <Clock size={14} className={isPast(activeLead.next_follow_up) ? 'text-rose-600' : 'text-blue-600'} />
                      Scheduled Follow-up
                    </span>
                    {isPast(activeLead.next_follow_up) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-200 text-rose-800">
                        OVERDUE
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {new Date(activeLead.next_follow_up).toLocaleString('en-IN', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </p>
                </div>

                {/* Direct Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={getCallHippoDialerUrl(activeLead.phone, { name: activeLead.name, leadId: activeLead.id })}
                    onClick={(e) => openCallHippoDialer(activeLead.phone, e, { name: activeLead.name, leadId: activeLead.id })}
                    className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95"
                    title="Call via CallHippo"
                  >
                    <Phone size={13} />
                    <span>CallHippo</span>
                  </a>

                  <a
                    href={`https://wa.me/${activeLead.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 shadow-xs"
                  >
                    <MessageCircle size={14} />
                    <span>WhatsApp</span>
                  </a>
                </div>

                {/* Quick Reschedule Presets */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2.5">
                    ⚡ Quick Reschedule
                  </label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickReschedule(activeLead.id, 1)}
                      className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-colors text-left"
                    >
                      +1 Hour Later
                    </button>
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickReschedule(activeLead.id, 4)}
                      className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-colors text-left"
                    >
                      +4 Hours Later
                    </button>
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickReschedule(activeLead.id, 24, 11)}
                      className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-colors text-left"
                    >
                      Tomorrow 11:00 AM
                    </button>
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickReschedule(activeLead.id, 24, 15)}
                      className="p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-colors text-left"
                    >
                      Tomorrow 3:00 PM
                    </button>
                    <button
                      disabled={savingAction}
                      onClick={() => handleQuickReschedule(activeLead.id, 48, 11)}
                      className="col-span-2 p-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-800 font-medium transition-colors text-center"
                    >
                      In 2 Days (11:00 AM)
                    </button>
                  </div>
                </div>

                {/* Log Call & Complete Section */}
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">📝 Log Call & Complete Follow-up</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Call Outcome</label>
                    <select
                      value={callOutcome}
                      onChange={e => setCallOutcome(e.target.value)}
                      className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg p-2 text-xs outline-none"
                    >
                      <option value="Connected">✅ Connected</option>
                      <option value="No Answer">❌ No Answer</option>
                      <option value="Busy">⏳ Busy</option>
                      <option value="Wrong Num">⚠️ Wrong Number</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1">Call Note</label>
                    <input
                      type="text"
                      value={callNote}
                      onChange={e => setCallNote(e.target.value)}
                      placeholder="e.g. Student interested in UK MSc, discussed IELTS"
                      className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg p-2 text-xs outline-none"
                    />
                  </div>

                  <button
                    disabled={savingAction}
                    onClick={handleLogCallAndOutcome}
                    className="w-full py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {savingAction ? 'Saving...' : 'Log Call & Update Calendar'}
                  </button>
                </div>

                {/* Lead Profile Link */}
                <div className="pt-2">
                  <Link
                    href={`/leads/${activeLead.id}`}
                    className="w-full py-2.5 px-4 border border-gray-200 hover:bg-gray-50 text-gray-900 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                  >
                    <span>Open Complete Lead Profile</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. SCHEDULE NEW FOLLOW-UP MODAL */}
      {/* ======================================================== */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-black text-white flex items-center justify-center">
                  <CalendarIcon size={14} />
                </div>
                <h3 className="text-base font-semibold text-gray-900">Schedule Lead Follow-up</h3>
              </div>
              <button
                onClick={() => setIsScheduleModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveNewSchedule} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Select Lead</label>
                <select
                  value={newScheduleLeadId}
                  onChange={e => setNewScheduleLeadId(e.target.value)}
                  className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-black outline-none"
                  required
                >
                  {availableLeads.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.phone}) {l.course ? `— ${l.course}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Date</label>
                  <input
                    type="date"
                    value={newScheduleDate}
                    onChange={e => setNewScheduleDate(e.target.value)}
                    className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Time</label>
                  <input
                    type="time"
                    value={newScheduleTime}
                    onChange={e => setNewScheduleTime(e.target.value)}
                    className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAction}
                  className="px-5 py-2 bg-black hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
                >
                  {savingAction ? 'Saving...' : 'Add to Calendar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

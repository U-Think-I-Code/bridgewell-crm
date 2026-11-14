'use client'
import { useState, useEffect, useMemo, useTransition, useCallback, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Phone,
  PhoneCall,
  PhoneOff,
  Calendar,
  Search,
  Users,
  ArrowRight,
  Clock,
  Filter,
  Sparkles,
  GraduationCap,
  Globe,
  XCircle,
  RotateCcw,
  TrendingUp,
  LayoutList,
  Layers
} from 'lucide-react'
import { openCallHippoDialer, CallHippoLine } from '@/lib/callhippo'
import { cleanPhoneE164 } from '@/lib/phoneHelper'
import { useCallHippoLine } from '@/lib/dialer'
import { formatCountryBadge } from '@/lib/countryHelper'
import { getLeadServiceType, ServiceTrack } from '@/lib/leadTypeHelper'
import { isCounselor, isTeamLeader, isManager, parseUserTeamMeta, canManageLeads } from '@/lib/teamHelper'

interface CallRow {
  activityId: string
  leadId: string
  leadName: string
  leadPhone: string
  leadCountry?: string
  leadCourse?: string
  leadProgramme?: string
  leadStage?: string
  leadPriority?: string
  leadOwnerId?: string
  leadOwnerName?: string
  callOutcome: string
  callTime: string
  callText?: string
  counselorId?: string
  counselorName?: string
  serviceTrack: 'visa_process' | 'study_abroad'
}

function TodayCallsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [lineConfig] = useCallHippoLine()
  const [, startTransition] = useTransition()

  // Primary Date Range Filter: 'today' (default) | 'yesterday' | 'last7' | 'last30' | 'custom'
  const initialDateRange = searchParams?.get('range') || 'today'
  const [dateRange, setDateRange] = useState<string>(initialDateRange)
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')

  // Counselor Filter: 'ALL' | counselor_id
  const initialCounselor = searchParams?.get('counselor') || 'ALL'
  const [selectedCounselor, setSelectedCounselor] = useState<string>(initialCounselor)

  // Outcome Filter: 'ALL' | 'Connected' | 'Ringing' | 'Call back' | 'Not Connected' | 'No Answer' | 'Busy'
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL')

  // Pipeline Stage Filter: 'ALL' | 'New' | 'Connected' | etc.
  const [selectedStage, setSelectedStage] = useState<string>('ALL')

  // Search query
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Service Stream: 'all' | 'study_abroad' | 'visa_process'
  const [serviceFilter, setServiceFilter] = useState<'all' | 'study_abroad' | 'visa_process'>('all')

  // Raw DB data
  const [activities, setActivities] = useState<any[]>([])
  const [leadsMap, setLeadsMap] = useState<Map<string, any>>(new Map())
  const [counselors, setCounselors] = useState<any[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [updatingStageId, setUpdatingStageId] = useState<string | null>(null)

  // Fetch stages
  const fetchStages = async () => {
    const { data } = await supabase.from('stages').select('name').order('stage_order', { ascending: true })
    if (data) setStages(data.map(s => s.name))
  }

  // Fetch counselors
  const fetchCounselors = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role')
      .order('name', { ascending: true })
    if (data) setCounselors(data)
  }

  // Fetch all call activities and associated leads
  const fetchData = async () => {
    if (!user) return
    setLoading(true)

    try {
      // 1. Fetch Call Activities (up to 3000 calls)
      let actQuery = supabase
        .from('activities')
        .select('id, lead, user_id, outcome, time, text')
        .eq('type', 'call')
        .order('time', { ascending: false })
        .limit(3000)

      // Counselor Scoping: if user is counselor, they see their calls
      if (isCounselor(user)) {
        actQuery = actQuery.eq('user_id', user.id)
      }

      const { data: actData, error: actError } = await actQuery
      if (actError) console.error('Error fetching activities:', actError)
      const callActs = actData || []
      setActivities(callActs)

      // 2. Fetch leads for all leads referenced in calls (or entire leads table since DB is compact)
      const { data: leadsData, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, email, phone, country, source, stage, owner_id, priority, created_at, course, programme_level, last_call_outcome, metadata, owner:owner_id(name)')
        .limit(2000)

      if (leadsError) console.error('Error fetching leads:', leadsError)
      const lMap = new Map<string, any>()
        ; (leadsData || []).forEach(l => lMap.set(l.id, l))
      setLeadsMap(lMap)
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchData()
      fetchStages()
      fetchCounselors()

      // Realtime subscription for live calls
      const channel = supabase
        .channel('today-calls-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
          fetchData()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          fetchData()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [user])

  // Date boundary calculation in local browser time
  const { startOfToday, endOfToday, startOfYesterday, endOfYesterday } = useMemo(() => {
    const now = new Date()
    const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const eToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    const sYesterday = new Date(sToday.getTime() - 24 * 60 * 60 * 1000)
    const eYesterday = new Date(sToday.getTime() - 1)
    return {
      startOfToday: sToday,
      endOfToday: eToday,
      startOfYesterday: sYesterday,
      endOfYesterday: eYesterday
    }
  }, [])

  // Counselor lookup map
  const counselorMap = useMemo(() => {
    const m = new Map<string, string>()
    counselors.forEach(c => m.set(c.id, c.name))
    return m
  }, [counselors])

  // Test if a date matches the chosen range
  const matchesDateRange = useCallback((dateStr: string): boolean => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return false

    if (dateRange === 'today') {
      return d >= startOfToday && d <= endOfToday
    }
    if (dateRange === 'yesterday') {
      return d >= startOfYesterday && d <= endOfYesterday
    }
    if (dateRange === 'last7') {
      const s7 = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000)
      return d >= s7 && d <= endOfToday
    }
    if (dateRange === 'last30') {
      const s30 = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000)
      return d >= s30 && d <= endOfToday
    }
    if (dateRange === 'custom') {
      if (customStart) {
        const s = new Date(customStart)
        s.setHours(0, 0, 0, 0)
        if (d < s) return false
      }
      if (customEnd) {
        const e = new Date(customEnd)
        e.setHours(23, 59, 59, 999)
        if (d > e) return false
      }
      return true
    }
    return true
  }, [dateRange, customStart, customEnd, startOfToday, endOfToday, startOfYesterday, endOfYesterday])

  // Build unique lead call list (de-duplicated per lead in the selected date range, keeping the latest call)
  const calledRows = useMemo(() => {
    // LeadId -> CallRow
    const leadRowMap = new Map<string, CallRow>()

    for (let i = 0; i < activities.length; i++) {
      const act = activities[i]
      if (!act.lead || !act.time) continue

      // Date Range Filter
      if (!matchesDateRange(act.time)) continue

      // Counselor Scoping for Manager/TL
      if (!isCounselor(user) && selectedCounselor !== 'ALL') {
        if (act.user_id !== selectedCounselor) continue
      }

      // If we already have a newer call for this lead in the chosen range, skip
      if (leadRowMap.has(act.lead)) continue

      const lead = leadsMap.get(act.lead)
      const service = lead ? getLeadServiceType(lead) : 'study_abroad'

      leadRowMap.set(act.lead, {
        activityId: act.id,
        leadId: act.lead,
        leadName: lead?.name || 'Unknown Student',
        leadPhone: lead?.phone || '',
        leadCountry: lead?.country,
        leadCourse: lead?.course,
        leadProgramme: lead?.programme_level,
        leadStage: lead?.stage || 'New',
        leadPriority: lead?.priority,
        leadOwnerId: lead?.owner_id,
        leadOwnerName: lead?.owner?.name || (act.user_id ? counselorMap.get(act.user_id) : 'Unassigned'),
        callOutcome: act.outcome || lead?.last_call_outcome || 'Unknown',
        callTime: act.time,
        callText: act.text,
        counselorId: act.user_id,
        counselorName: act.user_id ? counselorMap.get(act.user_id) : undefined,
        serviceTrack: service as any
      })
    }

    // Convert to array sorted by callTime descending (newest first)
    const list = Array.from(leadRowMap.values())
    return list.sort((a, b) => new Date(b.callTime).getTime() - new Date(a.callTime).getTime())
  }, [activities, leadsMap, matchesDateRange, selectedCounselor, user, counselorMap])

  // Summary counts for Quick Stat Cards
  const stats = useMemo(() => {
    let connected = 0
    let ringing = 0
    let callback = 0
    let notConnected = 0
    let noAnswer = 0
    let busy = 0

    calledRows.forEach(r => {
      const o = (r.callOutcome || '').toLowerCase()
      if (o === 'connected') connected++
      else if (o === 'ringing') ringing++
      else if (o === 'call back' || o === 'callback') callback++
      else if (o === 'not connected') notConnected++
      else if (o === 'no answer') noAnswer++
      else if (o === 'busy') busy++
    })

    return {
      total: calledRows.length,
      connected,
      ringing,
      callback,
      unattended: notConnected + noAnswer + busy
    }
  }, [calledRows])

  // Filtered rows based on outcome, stage, search, and service track
  const filteredRows = useMemo(() => {
    return calledRows.filter(r => {
      if (selectedOutcome !== 'ALL') {
        if (r.callOutcome !== selectedOutcome) return false
      }

      if (selectedStage !== 'ALL') {
        const rowStage = r.leadStage || 'New'
        if (rowStage !== selectedStage) return false
      }

      if (serviceFilter !== 'all') {
        if (r.serviceTrack !== serviceFilter) return false
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim()
        const matchName = r.leadName.toLowerCase().includes(q)
        const matchPhone = r.leadPhone.toLowerCase().includes(q)
        const matchCourse = (r.leadCourse || '').toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchCourse) return false
      }

      return true
    })
  }, [calledRows, selectedOutcome, selectedStage, serviceFilter, searchTerm])

  // Inline call trigger
  const handleCall = (e: React.MouseEvent, row: CallRow, targetLine?: CallHippoLine) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
    const clean = cleanPhoneE164(row.leadPhone, row.leadCountry).cleanedE164Phone || row.leadPhone
    openCallHippoDialer(clean, e, {
      name: row.leadName,
      leadId: row.leadId,
      country: row.leadCountry,
      line: targetLine || lineConfig.activeLine
    })
    router.push(`/leads/${row.leadId}`)
  }

  // Inline stage update
  const handleStageChange = async (leadId: string, newStage: string) => {
    if (!newStage) return
    setUpdatingStageId(leadId)
    try {
      const { error } = await supabase.from('leads').update({ stage: newStage }).eq('id', leadId)
      if (error) throw error

      await supabase.from('activities').insert([{
        lead: leadId,
        user_id: user?.id,
        type: 'stage change',
        text: `Changed stage to ${newStage} from Today's Calls Dashboard`,
        time: new Date().toISOString()
      }])
      await fetchData()
    } catch (err: any) {
      alert(`Failed to update stage: ${err.message}`)
    } finally {
      setUpdatingStageId(null)
    }
  }

  const getStageBadgeClass = (stage?: string | null): string => {
    const s = (stage || '').toLowerCase().trim()
    if (s === 'new') return 'bg-blue-50 text-blue-700 border-blue-200'
    if (s === 'ringing' || s === 'attempted contact') return 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
    if (s === 'call back' || s === 'callback') return 'bg-purple-50 text-purple-800 border-purple-200 font-semibold'
    if (s === 'not connected') return 'bg-orange-50 text-orange-800 border-orange-200 font-semibold'
    if (s === 'connected') return 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
    if (s === 'qualified') return 'bg-teal-50 text-teal-800 border-teal-200'
    if (s === 'enrolled') return 'bg-green-100 text-green-900 border-green-300 font-bold'
    return 'bg-gray-100 text-gray-700 border-gray-200'
  }

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD]">
      {/* Top Header */}
      <header className="px-8 py-5 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white z-10 shrink-0">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <PhoneCall className="text-emerald-600" size={24} />
              <span>
                {dateRange === 'today' ? "Today's Calls Dashboard" :
                  dateRange === 'yesterday' ? "Yesterday's Calls Dashboard" :
                    dateRange === 'last7' ? "Last 7 Days Calls Dashboard" :
                      dateRange === 'last30' ? "Last 30 Days Calls Dashboard" :
                        "Custom Date Calls Dashboard"}
              </span>
            </h1>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Call Sync
            </span>

            <span className="text-xs bg-gray-100 text-gray-700 font-bold px-2.5 py-0.5 rounded-full border border-gray-200">
              {filteredRows.length} Leads Dialed
            </span>
          </div>

          <p className="text-xs text-gray-500 font-medium">
            Dedicated calling hub for counselors and leaders. Review every dialed student, verify outcomes, change stages, or redial in 1-click.
          </p>
        </div>

        {/* Date Presets Switcher */}
        <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl shrink-0 flex-wrap">
          <button
            onClick={() => setDateRange('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${dateRange === 'today'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-black hover:bg-white/60'
              }`}
          >
            ⚡ Today
          </button>
          <button
            onClick={() => setDateRange('yesterday')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${dateRange === 'yesterday'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-black hover:bg-white/60'
              }`}
          >
            ⏪ Yesterday
          </button>
          <button
            onClick={() => setDateRange('last7')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${dateRange === 'last7'
                ? 'bg-black text-white shadow-xs'
                : 'text-gray-600 hover:text-black hover:bg-white/60'
              }`}
          >
            🗓️ Last 7 Days
          </button>
          <button
            onClick={() => setDateRange('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${dateRange === 'custom'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-gray-600 hover:text-black hover:bg-white/60'
              }`}
          >
            ✏️ Custom Range
          </button>
        </div>
      </header>

      {/* Date Range & Custom Range Picker if active */}
      {dateRange === 'custom' && (
        <div className="px-8 py-2.5 bg-purple-50/50 border-b border-purple-200 flex items-center gap-3 text-xs">
          <span className="font-bold text-purple-900 flex items-center gap-1">
            <Calendar size={13} className="text-purple-600" /> Select Call Date Range:
          </span>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={e => setCustomStart(e.target.value)}
              className="border border-purple-300 rounded-lg px-2.5 py-1 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-400"
            />
            <span className="text-gray-400 font-bold">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={e => setCustomEnd(e.target.value)}
              className="border border-purple-300 rounded-lg px-2.5 py-1 text-xs bg-white outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
        </div>
      )}

      {/* Overview Metric Stat Cards */}
      <div className="px-8 py-4 bg-gray-50/70 border-b border-gray-200 grid grid-cols-2 sm:grid-cols-5 gap-3 shrink-0">
        <div className="bg-white border border-gray-200 p-3 rounded-xl shadow-2xs">
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Leads Dialed</span>
          <p className="text-2xl font-bold text-gray-900 mt-0.5">{stats.total}</p>
        </div>

        <div className="bg-emerald-50/50 border border-emerald-200 p-3 rounded-xl shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider flex items-center gap-1">
            <PhoneCall size={12} className="text-emerald-600" /> Connected
          </span>
          <p className="text-2xl font-bold text-emerald-700 mt-0.5">{stats.connected}</p>
        </div>

        <div className="bg-amber-50/50 border border-amber-200 p-3 rounded-xl shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
            🔔 Ringing
          </span>
          <p className="text-2xl font-bold text-amber-700 mt-0.5">{stats.ringing}</p>
        </div>

        <div className="bg-purple-50/50 border border-purple-200 p-3 rounded-xl shadow-2xs">
          <span className="text-[11px] font-semibold text-purple-800 uppercase tracking-wider">
            ⏰ Call Back
          </span>
          <p className="text-2xl font-bold text-purple-700 mt-0.5">{stats.callback}</p>
        </div>

        <div className="bg-rose-50/50 border border-rose-200 p-3 rounded-xl shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-rose-800 uppercase tracking-wider flex items-center gap-1">
            <PhoneOff size={12} className="text-rose-600" /> No Answer / Busy
          </span>
          <p className="text-2xl font-bold text-rose-700 mt-0.5">{stats.unattended}</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="px-8 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Search Input */}
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search student or phone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full text-xs border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 outline-none focus:ring-2 focus:ring-emerald-300 bg-gray-50/50"
            />
          </div>

          {/* Outcome Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-400 font-medium">Outcome:</span>
            <select
              value={selectedOutcome}
              onChange={e => setSelectedOutcome(e.target.value)}
              className="text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none shadow-2xs cursor-pointer hover:bg-gray-50"
            >
              <option value="ALL">All Outcomes</option>
              <option value="Connected">📞 Connected</option>
              <option value="Ringing">🔔 Ringing</option>
              <option value="Call back">⏰ Call Back</option>
              <option value="Not Connected">📵 Not Connected</option>
              <option value="No Answer">⛔ No Answer</option>
              <option value="Busy">⏳ Busy</option>
            </select>
          </div>

          {/* Stage Filter */}
          <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
            <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
              <Layers size={12} className="text-indigo-600" /> Stage:
            </span>
            <select
              value={selectedStage}
              onChange={e => setSelectedStage(e.target.value)}
              className="text-xs font-semibold bg-white border border-indigo-200 text-indigo-900 rounded-lg px-2.5 py-1.5 outline-none shadow-2xs cursor-pointer hover:bg-indigo-50/50"
            >
              <option value="ALL">🏷️ All Stages</option>
              {stages.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Counselor Filter (for TL & Managers) */}
          {canManageLeads(user) && (
            <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
              <span className="text-xs text-gray-400 font-medium flex items-center gap-1">
                <Users size={12} className="text-indigo-600" /> Counselor:
              </span>
              <select
                value={selectedCounselor}
                onChange={e => setSelectedCounselor(e.target.value)}
                className="text-xs font-semibold bg-white border border-indigo-200 text-indigo-900 rounded-lg px-2.5 py-1.5 outline-none shadow-2xs cursor-pointer hover:bg-indigo-50/50"
              >
                <option value="ALL">👥 All Counselors ({activities.length} calls)</option>
                {counselors.map(c => (
                  <option key={c.id} value={c.id}>
                    👤 {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Service Stream Filter */}
          <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
            <select
              value={serviceFilter}
              onChange={e => setServiceFilter(e.target.value as any)}
              className="text-xs font-semibold bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none shadow-2xs cursor-pointer hover:bg-gray-50"
            >
              <option value="all">🌐 All Services</option>
              <option value="study_abroad">🎓 Study Abroad</option>
              <option value="visa_process">🛂 Visa Process</option>
            </select>
          </div>
        </div>

        {/* Right Action: Go to Main Pipeline */}
        <Link
          href="/leads"
          className="text-xs font-bold text-gray-700 hover:text-black bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
        >
          <LayoutList size={13} />
          <span>Open Main Leads Pipeline</span>
          <ArrowRight size={12} />
        </Link>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-200 rounded-2xl shadow-xs p-8 max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center mx-auto mb-3">
              <PhoneOff size={22} />
            </div>
            <h3 className="text-sm font-bold text-gray-900">No calls recorded for this period</h3>
            <p className="text-xs text-gray-500 mt-1">
              {dateRange === 'today' ? "You haven't made any calls today yet. Open the leads pipeline to start dialing!" : "No calls match the selected filter."}
            </p>
            <Link
              href="/leads"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold shadow-xs"
            >
              Start Calling Leads <ArrowRight size={13} />
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-3.5 bg-gray-50/80 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">
                Showing {filteredRows.length} {filteredRows.length === 1 ? 'call' : 'calls'}
              </span>
              <span className="text-[11px] text-gray-400">
                Sorted by most recent call at top
              </span>
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Student & Track</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Priority</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Phone & Call</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Call Outcome</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Call Time</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Stage</th>
                  <th className="px-6 py-3 font-semibold text-gray-600 text-xs">Counselor</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => {
                  const callDate = new Date(row.callTime)
                  const isCallToday = callDate >= startOfToday && callDate <= endOfToday
                  const isCallYesterday = callDate >= startOfYesterday && callDate <= endOfYesterday
                  const timeStr = callDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  const dateLabel = isCallToday ? 'Today' : isCallYesterday ? 'Yesterday' : callDate.toLocaleDateString([], { month: 'short', day: 'numeric' })

                  return (
                    <tr key={row.activityId} className="hover:bg-gray-50/80 transition-colors group">
                      {/* Name & Badges */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <Link href={`/leads/${row.leadId}`} className="font-bold text-gray-900 hover:text-blue-600 transition-colors">
                            {row.leadName}
                          </Link>
                          <div className="flex items-center gap-1.5 flex-wrap mt-1">
                            {row.serviceTrack === 'visa_process' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                                🛂 Visa Process
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                                🎓 Study Abroad
                              </span>
                            )}

                            {(row.leadCountry || row.leadPhone) && formatCountryBadge(row.leadCountry, row.leadPhone) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                                {formatCountryBadge(row.leadCountry, row.leadPhone)}
                              </span>
                            )}

                            {(row.leadCourse || row.leadProgramme) && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
                                🎓 {row.leadCourse || row.leadProgramme}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="px-6 py-4">
                        {row.leadPriority === 'Hot' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            🔥 Hot
                          </span>
                        ) : row.leadPriority === 'Warm' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            ☀️ Warm
                          </span>
                        ) : row.leadPriority === 'Cold' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            ❄️ Cold
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">⚪ Unset</span>
                        )}
                      </td>

                      {/* Phone & One-Click Call */}
                      <td className="px-6 py-4 text-gray-600">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-gray-900 text-xs">{row.leadPhone}</span>

                          {/* Quick Call Button */}
                          <button
                            type="button"
                            onClick={(e) => handleCall(e, row)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer shadow-2xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 active:scale-95"
                            title={`Call ${row.leadName} & open notes`}
                          >
                            <Phone size={11} className="text-emerald-600" />
                            <span>Call</span>
                          </button>

                          {/* Line Selector Buttons */}
                          <div className="inline-flex items-center rounded-md border border-gray-200 overflow-hidden text-[10px] bg-white shadow-2xs">
                            <button
                              type="button"
                              onClick={(e) => handleCall(e, row, 'uk')}
                              className="px-1.5 py-0.5 hover:bg-blue-50 hover:text-blue-700 text-gray-600 font-semibold border-r border-gray-200 cursor-pointer"
                              title="Call using UK Line (+44)"
                            >
                              🇬🇧 UK
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleCall(e, row, 'usa')}
                              className="px-1.5 py-0.5 hover:bg-emerald-50 hover:text-emerald-700 text-gray-600 font-semibold cursor-pointer"
                              title="Call using USA Line (+1)"
                            >
                              🇺🇸 USA
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Call Outcome Badge */}
                      <td className="px-6 py-4">
                        <Link href={`/leads/${row.leadId}`}>
                          {row.callOutcome === 'Connected' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-2xs">
                              <PhoneCall size={12} className="text-emerald-600" />
                              <span>Connected</span>
                            </span>
                          ) : row.callOutcome === 'Ringing' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors shadow-2xs">
                              <span>🔔 Ringing</span>
                            </span>
                          ) : (row.callOutcome === 'Call back' || row.callOutcome === 'Callback') ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors shadow-2xs">
                              <Clock size={12} className="text-purple-600" />
                              <span>Call Back</span>
                            </span>
                          ) : (row.callOutcome === 'Not Connected' || row.callOutcome === 'Not connected') ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors shadow-2xs">
                              <PhoneOff size={12} className="text-orange-600" />
                              <span>Not Connected</span>
                            </span>
                          ) : row.callOutcome === 'No Answer' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shadow-2xs">
                              <PhoneOff size={12} className="text-rose-600" />
                              <span>No Answer</span>
                            </span>
                          ) : row.callOutcome === 'Busy' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors shadow-2xs">
                              <XCircle size={12} className="text-amber-600" />
                              <span>Busy</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                              {row.callOutcome}
                            </span>
                          )}
                        </Link>
                      </td>

                      {/* Exact Call Time */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={`inline-flex items-center gap-1 font-bold text-xs ${isCallToday ? 'text-emerald-700' : 'text-blue-700'
                            }`}>
                            <Clock size={12} className={isCallToday ? 'text-emerald-600' : 'text-blue-600'} />
                            <span>{dateLabel}, {timeStr}</span>
                          </span>
                        </div>
                      </td>

                      {/* Pipeline Stage Dropdown */}
                      <td className="px-6 py-4">
                        <select
                          value={row.leadStage || 'New'}
                          disabled={updatingStageId === row.leadId}
                          onChange={(e) => handleStageChange(row.leadId, e.target.value)}
                          className={`text-xs font-semibold px-2.5 py-1 rounded-md border outline-none cursor-pointer transition-all shadow-2xs ${updatingStageId === row.leadId
                              ? 'opacity-50 cursor-wait bg-gray-100 text-gray-400'
                              : getStageBadgeClass(row.leadStage)
                            }`}
                        >
                          {stages.map(s => (
                            <option key={s} value={s} className="bg-white text-gray-900 font-medium">
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Counselor Name */}
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          {row.counselorName || row.leadOwnerName || 'Counselor'}
                        </span>
                      </td>

                      {/* Details view link */}
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/leads/${row.leadId}`}
                          className="text-gray-400 hover:text-black opacity-0 group-hover:opacity-100 transition-all inline-flex items-center gap-1 text-xs font-semibold"
                        >
                          Profile <ArrowRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TodayCallsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading calls...</div>}>
      <TodayCallsContent />
    </Suspense>
  )
}


'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { 
  PhoneCall, 
  Phone, 
  MessageSquare, 
  Search, 
  Filter, 
  RotateCcw, 
  Clock, 
  User, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Repeat, 
  ExternalLink, 
  Flame, 
  SunMedium, 
  Snowflake,
  Volume2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { deduplicateCallActivities } from '@/lib/callDeduplicator'
import { openCallHippoDialer, CallHippoLine } from '@/lib/callhippo'
import { cleanPhoneE164 } from '@/lib/phoneHelper'
import { isTeamLeader, isManager, parseUserTeamMeta } from '@/lib/teamHelper'

export interface TodayCallRecord {
  id: string
  lead_id: string | null
  lead_name: string
  lead_phone: string
  lead_country?: string
  lead_stage?: string
  lead_priority?: string
  lead_attempts?: number
  user_id: string | null
  counselor_name: string
  counselor_email: string
  outcome: string
  duration_text?: string
  duration_seconds?: number
  notes?: string
  recording_url?: string
  time: string
  repeat_today_count: number // How many times this lead was called today
  call_index_today: number   // Which call of the day for this lead (1st, 2nd, 3rd)
}

interface TodayCallsLogSectionProps {
  currentUser: any
}

export default function TodayCallsLogSection({ currentUser }: TodayCallsLogSectionProps) {
  const [calls, setCalls] = useState<TodayCallRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [counselorsList, setCounselorsList] = useState<{ id: string; name: string }[]>([])
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | 'connected' | 'unanswered' | 'busy' | 'callback' | 'repeat' | 'my_calls'>('all')
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('all')

  const userIsTL = isTeamLeader(currentUser)
  const userIsManager = isManager(currentUser)

  const fetchTodayCalls = useCallback(async () => {
    try {
      setRefreshing(true)

      // Start of Today in Local Time
      const now = new Date()
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
      const startOfTodayISO = startOfToday.toISOString()

      // 1. Fetch Users (for counselor names)
      const { data: usersData } = await supabase.from('users').select('id, name, email')
      const userMap: Record<string, { name: string; email: string }> = {}
      ;(usersData || []).forEach(u => {
        userMap[u.id] = { name: u.name || 'Unnamed', email: u.email || '' }
      })
      setCounselorsList((usersData || []).map(u => ({ id: u.id, name: u.name || u.email })))

      // 2. Fetch all call activities from start of today
      const { data: actsData, error: actsErr } = await supabase
        .from('activities')
        .select('id, user_id, lead, type, outcome, text, time')
        .eq('type', 'call')
        .gte('time', startOfTodayISO)
        .order('time', { ascending: false })

      if (actsErr) throw actsErr
      const rawActs = actsData || []

      // De-duplicate multi-events (timer, disposition, webhook) into clean VoIP call sessions
      const dedupedActs = deduplicateCallActivities(rawActs)

      // 3. Collect lead IDs to enrich with lead info
      const leadIds = Array.from(new Set(dedupedActs.map(a => a.lead).filter(Boolean))) as string[]

      const leadMap: Record<string, any> = {}
      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, name, phone, stage, priority, country, attempts, owner_id')
          .in('id', leadIds)

        ;(leadsData || []).forEach(l => {
          leadMap[l.id] = l
        })
      }

      // 4. Calculate repeat counts today per lead/destination
      const leadCallsTodayMap: Record<string, number> = {}
      // Sort oldest to newest to assign chronological 1st, 2nd, 3rd call index
      const chronological = [...dedupedActs].sort((a, b) => {
        return new Date(a.time || 0).getTime() - new Date(b.time || 0).getTime()
      })

      const callIndexMap: Record<string, number> = {}
      chronological.forEach(act => {
        const key = act.lead || (act.text && act.text.includes('Destination:') ? act.text.split('Destination:')[1].split('\n')[0].trim() : act.id)
        leadCallsTodayMap[key] = (leadCallsTodayMap[key] || 0) + 1
        callIndexMap[act.id] = leadCallsTodayMap[key]
      })

      // 5. Build enriched call records
      const enrichedRecords: TodayCallRecord[] = dedupedActs.map(act => {
        const leadObj = act.lead ? leadMap[act.lead] : null
        const counselorObj = act.user_id ? userMap[act.user_id] : null

        // Parse duration, notes, and recording from text
        const text = act.text || ''
        let durationText = ''
        let notes = ''
        let recordingUrl = ''
        let destPhone = ''

        const lines = text.split('\n')
        lines.forEach((line: string) => {
          if (line.includes('Call Duration:')) {
            durationText = line.split('Call Duration:')[1].trim()
          } else if (line.includes('Duration:')) {
            durationText = line.split('Duration:')[1].trim()
          } else if (line.includes('Notes:')) {
            notes = line.split('Notes:')[1].trim()
          } else if (line.includes('Recording:')) {
            recordingUrl = line.split('Recording:')[1].trim()
          } else if (line.includes('Destination:')) {
            destPhone = line.split('Destination:')[1].trim()
          }
        })

        const leadKey = act.lead || destPhone || act.id
        const repeatCount = leadCallsTodayMap[leadKey] || 1
        const callIndex = callIndexMap[act.id] || 1

        return {
          id: act.id,
          lead_id: act.lead || null,
          lead_name: leadObj?.name || (destPhone ? `Direct Call (${destPhone})` : 'Unlisted Student'),
          lead_phone: leadObj?.phone || destPhone || 'No Phone',
          lead_country: leadObj?.country,
          lead_stage: leadObj?.stage || 'New',
          lead_priority: leadObj?.priority,
          lead_attempts: leadObj?.attempts || 1,
          user_id: act.user_id,
          counselor_name: counselorObj?.name || (act.user_id === currentUser?.id ? 'You' : 'Counselor'),
          counselor_email: counselorObj?.email || '',
          outcome: act.outcome || 'Connected',
          duration_text: durationText,
          notes,
          recording_url: recordingUrl,
          time: act.time || new Date().toISOString(),
          repeat_today_count: repeatCount,
          call_index_today: callIndex
        }
      })

      // Newest calls first
      enrichedRecords.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

      setCalls(enrichedRecords)
    } catch (err) {
      console.error('Failed to load today calls:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [currentUser?.id])

  useEffect(() => {
    fetchTodayCalls()

    // Realtime channel for live calling feed
    const channel = supabase
      .channel('today-calls-live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchTodayCalls()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchTodayCalls()
      })
      .subscribe()

    // 15-second heartbeat poll to keep relative times fresh
    const interval = setInterval(fetchTodayCalls, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [fetchTodayCalls])

  // Filtered Calls list
  const filteredCalls = useMemo(() => {
    return calls.filter(call => {
      // 1. Counselor filter
      if (selectedCounselorId !== 'all') {
        if (call.user_id !== selectedCounselorId) return false
      }

      // 2. Tab filter
      if (outcomeFilter === 'my_calls') {
        if (call.user_id !== currentUser?.id) return false
      } else if (outcomeFilter === 'repeat') {
        if (call.repeat_today_count <= 1) return false
      } else if (outcomeFilter === 'connected') {
        if (call.outcome !== 'Connected') return false
      } else if (outcomeFilter === 'unanswered') {
        if (call.outcome !== 'No Answer' && call.outcome !== 'Ringing') return false
      } else if (outcomeFilter === 'busy') {
        if (call.outcome !== 'Busy' && call.outcome !== 'Not Connected') return false
      } else if (outcomeFilter === 'callback') {
        if (call.outcome !== 'Callback' && call.outcome !== 'Call back') return false
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = call.lead_name.toLowerCase().includes(q)
        const matchPhone = call.lead_phone.toLowerCase().includes(q)
        const matchCounselor = call.counselor_name.toLowerCase().includes(q)
        const matchNotes = (call.notes || '').toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchCounselor && !matchNotes) return false
      }

      return true
    })
  }, [calls, selectedCounselorId, outcomeFilter, searchQuery, currentUser?.id])

  // Summary Metrics for Today
  const totalCallsToday = calls.length
  const uniqueLeadsToday = useMemo(() => {
    const set = new Set(calls.map(c => c.lead_id || c.lead_phone))
    return set.size
  }, [calls])

  const repeatCallsToday = calls.filter(c => c.repeat_today_count > 1).length
  const connectedCount = calls.filter(c => c.outcome === 'Connected').length
  const unansweredCount = calls.filter(c => c.outcome === 'No Answer' || c.outcome === 'Ringing').length
  const busyCount = calls.filter(c => c.outcome === 'Busy' || c.outcome === 'Not Connected').length
  const myCallsTodayCount = calls.filter(c => c.user_id === currentUser?.id).length

  const connectRate = totalCallsToday > 0 ? Math.round((connectedCount / totalCallsToday) * 100) : 0

  // Format Time helpers
  const formatTime = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      return ''
    }
  }

  const formatAgo = (isoString: string) => {
    try {
      const diffMs = Date.now() - new Date(isoString).getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      const diffHours = Math.floor(diffMins / 60)
      return `${diffHours}h ago`
    } catch {
      return ''
    }
  }

  // Dial handler
  const handleDial = (phone: string, name: string, leadId?: string | null, country?: string, e?: React.MouseEvent) => {
    if (!phone) return
    openCallHippoDialer(phone, e, {
      name,
      leadId: leadId || undefined,
      country
    })
  }

  return (
    <div id="todays-calls" className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden mb-8 transition-all">
      {/* ── Top Header ── */}
      <div className="p-5 md:p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50/60 via-white to-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <span className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <PhoneCall size={18} />
            </span>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">
              Today&apos;s Calls Log • आज की कॉलिंग
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Feed
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Real-time record of all calls made today — including repeated calls, follow-ups, and calls to existing leads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchTodayCalls()}
            disabled={refreshing}
            className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            title="Refresh calling feed"
          >
            <RotateCcw size={12} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            <span>{refreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Summary Stats Pills ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 p-4 bg-gray-50/70 border-b border-gray-200 text-xs">
        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-gray-500 block">Total Calls Today</span>
          <span className="text-xl font-bold text-gray-900">{totalCallsToday}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-gray-500 block">Unique Students</span>
          <span className="text-xl font-bold text-blue-700">{uniqueLeadsToday}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-amber-800 block flex items-center gap-1">
            <Repeat size={11} className="text-amber-600" />
            Repeat Calls
          </span>
          <span className="text-xl font-bold text-amber-700">{repeatCallsToday}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-emerald-800 block flex items-center gap-1">
            <CheckCircle2 size={11} className="text-emerald-600" />
            Connected ({connectRate}%)
          </span>
          <span className="text-xl font-bold text-emerald-700">{connectedCount}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-yellow-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-yellow-800 block">No Answer / Ringing</span>
          <span className="text-xl font-bold text-yellow-700">{unansweredCount}</span>
        </div>

        <div className="bg-white p-3 rounded-xl border border-rose-200 shadow-2xs">
          <span className="text-[11px] font-semibold text-rose-800 block">Busy / Failed</span>
          <span className="text-xl font-bold text-rose-700">{busyCount}</span>
        </div>
      </div>

      {/* ── Filters & Search Toolbar ── */}
      <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setOutcomeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              outcomeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All Calls ({totalCallsToday})
          </button>

          <button
            type="button"
            onClick={() => setOutcomeFilter('my_calls')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              outcomeFilter === 'my_calls'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <User size={12} />
            <span>My Calls ({myCallsTodayCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setOutcomeFilter('repeat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              outcomeFilter === 'repeat'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
            }`}
            title="Show only leads that received repeat calls today"
          >
            <Repeat size={12} />
            <span>Repeat Calls ({repeatCallsToday})</span>
          </button>

          <button
            type="button"
            onClick={() => setOutcomeFilter('connected')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              outcomeFilter === 'connected'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
            }`}
          >
            Connected ({connectedCount})
          </button>

          <button
            type="button"
            onClick={() => setOutcomeFilter('unanswered')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              outcomeFilter === 'unanswered'
                ? 'bg-yellow-600 text-white shadow-xs'
                : 'bg-yellow-50 text-yellow-800 border border-yellow-200 hover:bg-yellow-100'
            }`}
          >
            No Answer ({unansweredCount})
          </button>

          <button
            type="button"
            onClick={() => setOutcomeFilter('busy')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              outcomeFilter === 'busy'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
            }`}
          >
            Busy ({busyCount})
          </button>
        </div>

        {/* Right side: Counselor dropdown + search */}
        <div className="flex items-center gap-2 flex-wrap">
          {(userIsManager || userIsTL) && (
            <select
              value={selectedCounselorId}
              onChange={e => setSelectedCounselorId(e.target.value)}
              className="text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
            >
              <option value="all">All Counselors</option>
              {counselorsList.map(c => (
                <option key={c.id} value={c.id}>
                  👤 {c.name}
                </option>
              ))}
            </select>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, phone, notes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 w-48 sm:w-60"
            />
          </div>
        </div>
      </div>

      {/* ── Table of Calls ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Student / Lead</th>
              <th className="px-4 py-3">Call Type</th>
              <th className="px-4 py-3">Counselor</th>
              <th className="px-4 py-3">Outcome & Duration</th>
              <th className="px-4 py-3">Details & Notes</th>
              <th className="px-4 py-3 text-right">Quick Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mb-2"></div>
                  <p>Loading today&apos;s calling history...</p>
                </td>
              </tr>
            ) : filteredCalls.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  <PhoneCall size={32} className="mx-auto text-gray-300 mb-2" />
                  <p className="font-semibold text-gray-600">No calls found for the selected filter.</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Calls placed via CallHippo or manual timer will appear here live.</p>
                </td>
              </tr>
            ) : (
              filteredCalls.map((call) => {
                const isCurrentUser = call.user_id === currentUser?.id
                const isRepeat = call.repeat_today_count > 1

                return (
                  <tr key={call.id} className="hover:bg-blue-50/30 transition-colors">
                    {/* Time Column */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-bold text-gray-900">{formatTime(call.time)}</div>
                      <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Clock size={10} />
                        {formatAgo(call.time)}
                      </div>
                    </td>

                    {/* Student / Lead Column */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {call.lead_id ? (
                          <Link
                            href={`/leads/${call.lead_id}`}
                            className="font-bold text-gray-900 hover:text-blue-600 transition-colors hover:underline"
                          >
                            {call.lead_name}
                          </Link>
                        ) : (
                          <span className="font-bold text-gray-900">{call.lead_name}</span>
                        )}

                        {/* Priority Badge */}
                        {call.lead_priority === 'Hot' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-0.5">
                            <Flame size={10} /> Hot
                          </span>
                        )}
                        {call.lead_priority === 'Warm' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-0.5">
                            <SunMedium size={10} /> Warm
                          </span>
                        )}
                      </div>

                      <div className="text-gray-500 font-medium text-[11px] mt-0.5 flex items-center gap-1.5">
                        <span>{call.lead_phone}</span>
                        {call.lead_stage && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-gray-100 text-gray-600 border border-gray-200">
                            {call.lead_stage}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Call Type / Repeat Badge Column */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {isRepeat ? (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-in fade-in">
                          <Repeat size={10} />
                          <span>Call #{call.call_index_today} today ({call.repeat_today_count}x)</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          1st Call Today
                        </span>
                      )}
                      {call.lead_attempts && call.lead_attempts > 1 && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Total attempts: {call.lead_attempts}
                        </div>
                      )}
                    </td>

                    {/* Counselor Column */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold flex items-center justify-center">
                          {call.counselor_name.slice(0, 2).toUpperCase()}
                        </span>
                        <span>{call.counselor_name}</span>
                        {isCurrentUser && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-600 text-white">
                            You
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Outcome & Duration Column */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {call.outcome === 'Connected' ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Connected
                          </span>
                        ) : call.outcome === 'No Answer' || call.outcome === 'Ringing' ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-yellow-50 text-yellow-800 border border-yellow-200 flex items-center gap-1">
                            <Clock size={11} /> {call.outcome}
                          </span>
                        ) : call.outcome === 'Busy' || call.outcome === 'Not Connected' ? (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                            <XCircle size={11} /> {call.outcome}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            {call.outcome}
                          </span>
                        )}
                      </div>

                      {call.duration_text && (
                        <div className="text-[10px] text-gray-500 font-medium mt-0.5">
                          ⏱️ {call.duration_text}
                        </div>
                      )}
                    </td>

                    {/* Details / Notes Column */}
                    <td className="px-4 py-3 max-w-xs">
                      {call.notes ? (
                        <p className="text-gray-700 text-[11px] line-clamp-2 italic bg-gray-50 p-1.5 rounded border border-gray-100">
                          &ldquo;{call.notes}&rdquo;
                        </p>
                      ) : (
                        <span className="text-gray-400 text-[11px] italic">No note logged</span>
                      )}

                      {call.recording_url && (
                        <a
                          href={call.recording_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline mt-1"
                        >
                          <Volume2 size={11} /> Listen Recording
                        </a>
                      )}
                    </td>

                    {/* Quick Action Column */}
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => handleDial(call.lead_phone, call.lead_name, call.lead_id, call.lead_country, e)}
                          className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                          title="Call again via CallHippo"
                        >
                          <Phone size={10} /> Call Again
                        </button>

                        {call.lead_id && (
                          <Link
                            href={`/leads/${call.lead_id}`}
                            className="p-1 rounded text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                            title="Open Lead Profile & Notes"
                          >
                            <ExternalLink size={13} />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer info */}
      <div className="p-3 bg-gray-50 border-t border-gray-200 text-center text-[11px] text-gray-500 flex flex-wrap items-center justify-between px-5">
        <span>Showing <strong>{filteredCalls.length}</strong> of <strong>{totalCallsToday}</strong> calls made today</span>
        <span>Includes click-to-call, manual dispositions, repeat attempts &amp; CallHippo webhooks</span>
      </div>
    </div>
  )
}

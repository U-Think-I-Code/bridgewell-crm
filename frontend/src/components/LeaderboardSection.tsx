'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Trophy, PhoneCall, PhoneOff, XCircle, Flame, Users, 
  ArrowUpRight, RefreshCw, Download, Search, CheckCircle2,
  Clock, AlertCircle, TrendingUp, Sparkles, Award
} from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthWrapper'

interface CounselorStat {
  id: string
  name: string
  email: string
  active: boolean
  totalLeads: number
  hotLeads: number
  enrolledLeads: number
  uncalledLeads: number
  callsCount: number
  connectedCount: number
  noAnswerCount: number
  busyCount: number
  wrongNumCount: number
  connectRate: number
  lastCallTime: string | null
  activityStatus: 'active_now' | 'active_today' | 'idle'
}

export default function LeaderboardSection() {
  const { user: currentUser } = useAuth()
  const [timeframe, setTimeframe] = useState<'today' | 'week' | 'all'>('today')
  const [stats, setStats] = useState<CounselorStat[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchLeaderboard()

    // 1. Supabase Real-time WebSocket channel for instant updates
    const channel = supabase
      .channel(`leaderboard-realtime-${timeframe}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchLeaderboard()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeaderboard()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchLeaderboard()
      })
      .subscribe()

    // 2. 15-second heartbeat poll to keep relative times and stats fresh
    const pollInterval = setInterval(() => {
      fetchLeaderboard()
    }, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(pollInterval)
    }
  }, [timeframe])

  const fetchLeaderboard = async () => {
    setLoading(true)
    try {
      // 1. Fetch counselors
      const { data: counselorsData } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'counselor')
        .order('name', { ascending: true })

      const counselors = counselorsData || []

      // 2. Fetch all leads
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, owner_id, stage, priority, last_call_outcome, attempts, created_at')

      const leads = leadsData || []

      // Map lead ID to owner_id for fallback activity matching
      const leadOwnerMap: Record<string, string> = {}
      leads.forEach(l => {
        if (l.owner_id) leadOwnerMap[l.id] = l.owner_id
      })

      // 3. Timeframe boundary
      let startTimeISO: string | null = null
      const now = new Date()

      if (timeframe === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
        startTimeISO = startOfToday.toISOString()
      } else if (timeframe === 'week') {
        const startOfWeek = new Date(now)
        const day = startOfWeek.getDay() || 7
        startOfWeek.setDate(startOfWeek.getDate() - day + 1)
        startOfWeek.setHours(0, 0, 0, 0)
        startTimeISO = startOfWeek.toISOString()
      }

      // 4. Fetch activities for the timeframe
      let actQuery = supabase
        .from('activities')
        .select('id, user_id, lead, type, outcome, text, time')
        .eq('type', 'call')
        .order('time', { ascending: false })

      if (startTimeISO) {
        actQuery = actQuery.gte('time', startTimeISO)
      }

      const { data: actsData } = await actQuery
      const activities = actsData || []

      // Also get today's start for active_now / active_today calculations
      const startOfTodayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).getTime()
      const oneHourAgoMs = Date.now() - 60 * 60 * 1000

      // 5. Aggregate stats per counselor
      const counselorStats: CounselorStat[] = counselors.map(c => {
        const cLeads = leads.filter(l => l.owner_id === c.id)
        const totalLeads = cLeads.length
        const hotLeads = cLeads.filter(l => l.priority === 'Hot').length
        const enrolledLeads = cLeads.filter(l => l.stage === 'Enrolled').length
        const uncalledLeads = cLeads.filter(l => !l.last_call_outcome || l.last_call_outcome === 'Not Called' || (l.attempts || 0) === 0).length

        // Match activities by user_id, or fallback to lead's owner
        const cActivities = activities.filter(a => {
          if (a.user_id) return a.user_id === c.id
          return a.lead && leadOwnerMap[a.lead] === c.id
        })

        const callsCount = cActivities.length

        let connectedCount = 0
        let noAnswerCount = 0
        let busyCount = 0
        let wrongNumCount = 0

        cActivities.forEach(a => {
          const outcome = a.outcome || ''
          const text = a.text || ''
          if (outcome === 'Connected' || text.includes('Outcome: Connected')) {
            connectedCount++
          } else if (outcome === 'No Answer' || text.includes('Outcome: No Answer')) {
            noAnswerCount++
          } else if (outcome === 'Busy' || text.includes('Outcome: Busy')) {
            busyCount++
          } else if (outcome === 'Wrong Num' || outcome === 'Wrong Number' || text.includes('Wrong Num')) {
            wrongNumCount++
          }
        })

        const connectRate = callsCount > 0 ? Math.round((connectedCount / callsCount) * 100) : 0
        const lastCallTime = cActivities.length > 0 ? cActivities[0].time : null

        let activityStatus: 'active_now' | 'active_today' | 'idle' = 'idle'
        if (lastCallTime) {
          const lastTimeMs = new Date(lastCallTime).getTime()
          if (lastTimeMs >= oneHourAgoMs) {
            activityStatus = 'active_now'
          } else if (lastTimeMs >= startOfTodayMs) {
            activityStatus = 'active_today'
          }
        }

        return {
          id: c.id,
          name: c.name || 'Unnamed Counselor',
          email: c.email || '',
          active: c.active !== false,
          totalLeads,
          hotLeads,
          enrolledLeads,
          uncalledLeads,
          callsCount,
          connectedCount,
          noAnswerCount,
          busyCount,
          wrongNumCount,
          connectRate,
          lastCallTime,
          activityStatus
        }
      })

      // Sort by callsCount DESC, then connectedCount DESC, then hotLeads DESC
      counselorStats.sort((a, b) => {
        if (b.callsCount !== a.callsCount) return b.callsCount - a.callsCount
        if (b.connectedCount !== a.connectedCount) return b.connectedCount - a.connectedCount
        return b.hotLeads - a.hotLeads
      })

      setStats(counselorStats)
    } catch (err) {
      console.error('Leaderboard error:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchLeaderboard()
  }

  // Export report to CSV
  const handleExportCSV = () => {
    if (stats.length === 0) return

    const headers = [
      'Rank',
      'Counselor Name',
      'Email',
      'Status',
      'Calls Made',
      'Connected Calls',
      'Connect Rate (%)',
      'No Answer',
      'Busy',
      'Wrong Num',
      'Hot Leads',
      'Total Leads Assigned',
      'Pending Uncalled',
      'Last Active'
    ]

    const rows = stats.map((s, idx) => [
      idx + 1,
      `"${s.name.replace(/"/g, '""')}"`,
      `"${s.email.replace(/"/g, '""')}"`,
      s.activityStatus === 'active_now' ? 'Active Now' : s.activityStatus === 'active_today' ? 'Active Today' : 'Idle',
      s.callsCount,
      s.connectedCount,
      `${s.connectRate}%`,
      s.noAnswerCount,
      s.busyCount,
      s.wrongNumCount,
      s.hotLeads,
      s.totalLeads,
      s.uncalledLeads,
      s.lastCallTime ? `"${new Date(s.lastCallTime).toLocaleString()}"` : 'None'
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `counselor_calling_report_${timeframe}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Aggregate Totals
  const totalCalls = stats.reduce((acc, s) => acc + s.callsCount, 0)
  const totalConnected = stats.reduce((acc, s) => acc + s.connectedCount, 0)
  const avgConnectRate = totalCalls > 0 ? Math.round((totalConnected / totalCalls) * 100) : 0
  const activeCounselorsCount = stats.filter(s => s.activityStatus !== 'idle').length
  const topPerformer = stats.length > 0 && stats[0].callsCount > 0 ? stats[0] : null

  // Filter by search
  const filteredStats = stats.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.email.toLowerCase().includes(search.toLowerCase())
  )

  // Current Counselor personal score
  const myStat = currentUser ? stats.find(s => s.id === currentUser.id) : null
  const myRank = currentUser ? stats.findIndex(s => s.id === currentUser.id) + 1 : 0

  const formatTimeAgo = (isoString: string | null) => {
    if (!isoString) return 'No calls yet'
    const diffMs = Date.now() - new Date(isoString).getTime()
    const diffMins = Math.floor(diffMs / (60 * 1000))
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return new Date(isoString).toLocaleDateString()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
      {/* Top Header */}
      <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/50">
        <div>
          <div className="flex items-center gap-2.5 mb-1 flex-wrap">
            <span className="p-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg">
              <Trophy size={18} />
            </span>
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">
              Daily Calling Leaderboard & Performance
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Realtime Sync
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Live telecaller activity tracking, call volume, and conversion performance
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Timeframe selector */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-2xs">
            <button
              onClick={() => setTimeframe('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeframe === 'today'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeframe('week')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeframe === 'week'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setTimeframe('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeframe === 'all'
                  ? 'bg-white text-gray-900 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            title="Refresh Leaderboard"
            className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Counselor Personal Score Banner */}
      {currentUser?.role === 'counselor' && myStat && (
        <div className="mx-6 mt-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 border border-blue-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              #{myRank || '-'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-900">Your Live Calling Score</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {currentUser.name} • Team Rank #{myRank} of {stats.length} Telecallers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 text-xs flex-wrap">
            <span className="bg-white/90 border border-blue-200 px-3 py-1.5 rounded-lg font-bold text-gray-800 shadow-2xs">
              📞 {myStat.callsCount} Calls Today
            </span>
            <span className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-bold text-emerald-800 shadow-2xs">
              ✅ {myStat.connectedCount} Connected ({myStat.connectRate}%)
            </span>
            <span className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg font-bold text-rose-800 shadow-2xs">
              🔥 {myStat.hotLeads} Hot Leads
            </span>
          </div>
        </div>
      )}

      {/* KPI Cards Row */}
      <div className="p-6 border-b border-gray-100 bg-white grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className="p-4 rounded-xl border border-gray-200/80 bg-gray-50/50">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1 font-medium">
            <span>Total Calls ({timeframe === 'today' ? 'Today' : timeframe === 'week' ? 'Week' : 'All Time'})</span>
            <PhoneCall size={14} className="text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{totalCalls}</span>
            <span className="text-xs text-gray-500">calls made</span>
          </div>
        </div>

        {/* Connected Calls */}
        <div className="p-4 rounded-xl border border-emerald-200/70 bg-emerald-50/30">
          <div className="flex items-center justify-between text-xs text-emerald-800 mb-1 font-medium">
            <span>Connected Calls</span>
            <CheckCircle2 size={14} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-700">{totalConnected}</span>
            <span className="text-xs font-semibold text-emerald-600">
              ({avgConnectRate}% connect rate)
            </span>
          </div>
        </div>

        {/* Active Counselors */}
        <div className="p-4 rounded-xl border border-blue-200/70 bg-blue-50/30">
          <div className="flex items-center justify-between text-xs text-blue-800 mb-1 font-medium">
            <span>Active Telecallers</span>
            <Users size={14} className="text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-900">
              {activeCounselorsCount} <span className="text-base text-gray-500 font-normal">/ {stats.length}</span>
            </span>
            <span className="text-xs text-blue-700">active {timeframe === 'today' ? 'today' : ''}</span>
          </div>
        </div>

        {/* Top Performer */}
        <div className="p-4 rounded-xl border border-amber-200/70 bg-amber-50/30">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-1 font-medium">
            <span>#1 Top Performer</span>
            <Award size={14} className="text-amber-600" />
          </div>
          {topPerformer ? (
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-base font-bold text-gray-900 truncate max-w-[130px]">
                🥇 {topPerformer.name}
              </span>
              <span className="text-xs font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-md">
                {topPerformer.callsCount} calls
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-400">No calls logged yet</span>
          )}
        </div>
      </div>

      {/* Search Bar & Filter Header */}
      <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-gray-200 transition-all shadow-2xs"
          />
        </div>
        <span className="text-xs text-gray-400 font-medium">
          Showing {filteredStats.length} employee{filteredStats.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Leaderboard Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black mx-auto mb-2"></div>
            <p className="text-xs text-gray-500">Calculating employee performance metrics...</p>
          </div>
        ) : filteredStats.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs">
            No counselors found. Add employees in the Team section to start tracking.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-3.5 w-16 text-center">Rank</th>
                <th className="px-6 py-3.5">Employee / Counselor</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5 text-center">Calls Made</th>
                <th className="px-6 py-3.5 text-center">Connected</th>
                <th className="px-6 py-3.5 text-center">Unanswered / Busy</th>
                <th className="px-6 py-3.5 text-center">Hot Leads</th>
                <th className="px-6 py-3.5 text-center">Assigned / Pending</th>
                <th className="px-6 py-3.5">Last Call</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredStats.map((c, index) => {
                const maxCalls = stats[0]?.callsCount || 1
                const callPercent = maxCalls > 0 ? Math.min(100, Math.round((c.callsCount / maxCalls) * 100)) : 0
                const isCurrentUser = currentUser?.id === c.id

                return (
                  <tr 
                    key={c.id} 
                    className={`transition-colors group ${
                      isCurrentUser 
                        ? 'bg-blue-50/50 hover:bg-blue-50/70 border-l-4 border-l-blue-600' 
                        : 'hover:bg-gray-50/80'
                    }`}
                  >
                    {/* Rank */}
                    <td className="px-6 py-4 text-center font-bold">
                      {index === 0 && c.callsCount > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-800 text-xs shadow-2xs">
                          🥇
                        </span>
                      ) : index === 1 && c.callsCount > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-xs shadow-2xs">
                          🥈
                        </span>
                      ) : index === 2 && c.callsCount > 0 ? (
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-200/60 text-amber-900 text-xs shadow-2xs">
                          🥉
                        </span>
                      ) : (
                        <span className="text-gray-400 font-semibold text-xs">#{index + 1}</span>
                      )}
                    </td>

                    {/* Employee Profile */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold uppercase shrink-0 ${
                          isCurrentUser 
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs' 
                            : 'bg-gray-100 text-gray-700 border-gray-200'
                        }`}>
                          {c.name.slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-gray-900 text-xs leading-tight">{c.name}</p>
                            {isCurrentUser && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-600 text-white uppercase tracking-wider shadow-2xs">
                                You
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">{c.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Activity Status */}
                    <td className="px-6 py-4">
                      {c.activityStatus === 'active_now' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Active now
                        </span>
                      ) : c.activityStatus === 'active_today' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Active today
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                          Idle today
                        </span>
                      )}
                    </td>

                    {/* Calls Made with Mini Progress Bar */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-bold text-gray-900">{c.callsCount}</span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              c.callsCount > 0 ? (isCurrentUser ? 'bg-blue-600' : 'bg-gray-800') : 'bg-transparent'
                            }`}
                            style={{ width: `${callPercent}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Connected */}
                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex flex-col items-center">
                        <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {c.connectedCount} calls
                        </span>
                        {c.callsCount > 0 && (
                          <span className="text-[10px] text-emerald-600 font-medium mt-0.5">
                            {c.connectRate}% rate
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Unanswered / Busy */}
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span title="No Answer" className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                          📵 {c.noAnswerCount}
                        </span>
                        <span title="Busy" className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-semibold">
                          ⏳ {c.busyCount}
                        </span>
                      </div>
                    </td>

                    {/* Hot Leads */}
                    <td className="px-6 py-4 text-center">
                      {c.hotLeads > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          🔥 {c.hotLeads}
                        </span>
                      ) : (
                        <span className="text-gray-300 font-medium">—</span>
                      )}
                    </td>

                    {/* Assigned & Pending Uncalled */}
                    <td className="px-6 py-4 text-center">
                      <div className="text-xs">
                        <span className="font-semibold text-gray-900">{c.totalLeads}</span>
                        <span className="text-gray-400"> total</span>
                        {c.uncalledLeads > 0 && (
                          <span className="block text-[10px] text-amber-600 font-medium">
                            ({c.uncalledLeads} uncalled)
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Last Call */}
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap text-[11px]">
                      {formatTimeAgo(c.lastCallTime)}
                    </td>

                    {/* View Leads Link */}
                    <td className="px-6 py-4 text-right">
                      {isCurrentUser ? (
                        <Link
                          href="/leads"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-2xs"
                        >
                          <span>My Leads</span>
                          <ArrowUpRight size={12} />
                        </Link>
                      ) : currentUser?.role === 'manager' ? (
                        <Link
                          href={`/leads?counselor=${c.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors shadow-2xs"
                        >
                          <span>Leads</span>
                          <ArrowUpRight size={12} />
                        </Link>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

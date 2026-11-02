'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import {
  BarChart3, TrendingUp, Users, Flame, PhoneCall, Target,
  Calendar, Download, RefreshCw, ArrowUpRight, ArrowDownRight,
  CheckCircle2, XCircle, Filter, Percent
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, LineChart, Line
} from 'recharts'

// Color palettes
const STAGE_COLORS = [
  '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8',
  '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
  '#f97316', '#ef4444', '#a855f7'
]
const PRIORITY_COLORS = { Hot: '#ef4444', Warm: '#f59e0b', Cold: '#3b82f6', Unset: '#d1d5db' }
const OUTCOME_COLORS = { Connected: '#10b981', 'No Answer': '#ef4444', Busy: '#f59e0b', 'Wrong Num': '#8b5cf6', None: '#d1d5db' }

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'all'

export default function AnalyticsPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [leads, setLeads] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [employees, setEmployees] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [timeRange, setTimeRange] = useState<TimeRange>('month')

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/')
      return
    }
    fetchAllData()

    // Realtime listeners
    const channel = supabase
      .channel('analytics-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => fetchAllData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchAllData())
      .subscribe()

    const interval = setInterval(fetchAllData, 30000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [user])

  const fetchAllData = async () => {
    const [
      { data: leadsData },
      { data: activitiesData },
      { data: usersData },
      { data: stagesData }
    ] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.from('activities').select('*').order('time', { ascending: false }),
      supabase.from('users').select('*').eq('role', 'counselor'),
      supabase.from('stages').select('*').order('stage_order', { ascending: true })
    ])

    setLeads(leadsData || [])
    setActivities(activitiesData || [])
    setEmployees(usersData || [])
    setStages(stagesData || [])
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAllData()
    setTimeout(() => setRefreshing(false), 600)
  }

  // ── Time-range filtering ──
  const getStartDate = (range: TimeRange): Date | null => {
    const now = new Date()
    if (range === 'today') {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return d
    }
    if (range === 'week') {
      const d = new Date(now)
      const day = d.getDay() || 7
      d.setDate(d.getDate() - day + 1)
      d.setHours(0, 0, 0, 0)
      return d
    }
    if (range === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1)
    }
    if (range === 'quarter') {
      const qMonth = Math.floor(now.getMonth() / 3) * 3
      return new Date(now.getFullYear(), qMonth, 1)
    }
    return null // 'all'
  }

  const filteredLeads = useMemo(() => {
    const start = getStartDate(timeRange)
    if (!start) return leads
    return leads.filter(l => new Date(l.created_at) >= start)
  }, [leads, timeRange])

  const filteredActivities = useMemo(() => {
    const start = getStartDate(timeRange)
    if (!start) return activities
    return activities.filter(a => new Date(a.time) >= start)
  }, [activities, timeRange])

  // ── KPI Calculations ──
  const kpis = useMemo(() => {
    const total = filteredLeads.length
    const enrolled = filteredLeads.filter(l => l.stage === 'Enrolled').length
    const hot = filteredLeads.filter(l => l.priority === 'Hot').length
    const warm = filteredLeads.filter(l => l.priority === 'Warm').length
    const cold = filteredLeads.filter(l => l.priority === 'Cold').length
    const conversionRate = total > 0 ? Math.round((enrolled / total) * 100) : 0

    const callActivities = filteredActivities.filter(a => a.type === 'call')
    const totalCalls = callActivities.length
    const connectedCalls = callActivities.filter(a => a.outcome === 'Connected').length
    const connectRate = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0
    const avgCallsPerLead = total > 0 ? (totalCalls / total).toFixed(1) : '0'

    const overdue = filteredLeads.filter(l =>
      l.next_follow_up && new Date(l.next_follow_up) < new Date()
    ).length

    // Prev period comparison
    const start = getStartDate(timeRange)
    let prevTotal = 0
    if (start && timeRange !== 'all') {
      const duration = Date.now() - start.getTime()
      const prevStart = new Date(start.getTime() - duration)
      prevTotal = leads.filter(l => {
        const d = new Date(l.created_at)
        return d >= prevStart && d < start
      }).length
    }
    const growthRate = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0

    return { total, enrolled, hot, warm, cold, conversionRate, totalCalls, connectedCalls, connectRate, avgCallsPerLead, overdue, growthRate, prevTotal }
  }, [filteredLeads, filteredActivities, leads, timeRange])

  // ── Stage Funnel ──
  const stageFunnel = useMemo(() => {
    return stages.map((s, i) => ({
      name: s.name,
      count: filteredLeads.filter(l => l.stage === s.name).length,
      fill: STAGE_COLORS[i % STAGE_COLORS.length]
    }))
  }, [filteredLeads, stages])

  // ── Priority Distribution ──
  const priorityData = useMemo(() => {
    const hot = filteredLeads.filter(l => l.priority === 'Hot').length
    const warm = filteredLeads.filter(l => l.priority === 'Warm').length
    const cold = filteredLeads.filter(l => l.priority === 'Cold').length
    const unset = filteredLeads.filter(l => !l.priority).length
    return [
      { name: '🔥 Hot', value: hot, fill: PRIORITY_COLORS.Hot },
      { name: '☀️ Warm', value: warm, fill: PRIORITY_COLORS.Warm },
      { name: '❄️ Cold', value: cold, fill: PRIORITY_COLORS.Cold },
      { name: '⚪ Unset', value: unset, fill: PRIORITY_COLORS.Unset },
    ].filter(d => d.value > 0)
  }, [filteredLeads])

  // ── Call Outcome Breakdown ──
  const outcomeData = useMemo(() => {
    const callActs = filteredActivities.filter(a => a.type === 'call')
    const connected = callActs.filter(a => a.outcome === 'Connected').length
    const noAnswer = callActs.filter(a => a.outcome === 'No Answer').length
    const busy = callActs.filter(a => a.outcome === 'Busy').length
    const wrongNum = callActs.filter(a => a.outcome === 'Wrong Num').length
    return [
      { name: 'Connected', value: connected, fill: OUTCOME_COLORS.Connected },
      { name: 'No Answer', value: noAnswer, fill: OUTCOME_COLORS['No Answer'] },
      { name: 'Busy', value: busy, fill: OUTCOME_COLORS.Busy },
      { name: 'Wrong Num', value: wrongNum, fill: OUTCOME_COLORS['Wrong Num'] },
    ].filter(d => d.value > 0)
  }, [filteredActivities])

  // ── Lead Trend Over Time (Area Chart) ──
  const leadTrend = useMemo(() => {
    const start = getStartDate(timeRange)
    const relevantLeads = start ? leads.filter(l => new Date(l.created_at) >= start) : leads
    if (relevantLeads.length === 0) return []

    // Group by date
    const groups: Record<string, number> = {}
    relevantLeads.forEach(l => {
      const d = new Date(l.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
      groups[d] = (groups[d] || 0) + 1
    })

    return Object.entries(groups)
      .map(([date, count]) => ({ date, leads: count }))
      .slice(-30) // max 30 data points
  }, [leads, timeRange])

  // ── Employee Performance Comparison ──
  const employeePerformance = useMemo(() => {
    return employees.filter(e => e.active !== false).map(emp => {
      const empLeads = filteredLeads.filter(l => l.owner_id === emp.id)
      const empCalls = filteredActivities.filter(a => a.user_id === emp.id && a.type === 'call')
      const connected = empCalls.filter(a => a.outcome === 'Connected').length
      const hot = empLeads.filter(l => l.priority === 'Hot').length
      const enrolled = empLeads.filter(l => l.stage === 'Enrolled').length

      return {
        name: emp.name?.split(' ')[0] || emp.email?.split('@')[0] || 'Unknown',
        fullName: emp.name || emp.email,
        calls: empCalls.length,
        connected,
        hot,
        enrolled,
        total: empLeads.length,
        connectRate: empCalls.length > 0 ? Math.round((connected / empCalls.length) * 100) : 0
      }
    }).sort((a, b) => b.calls - a.calls)
  }, [employees, filteredLeads, filteredActivities])

  // ── Source Distribution ──
  const sourceData = useMemo(() => {
    const groups: Record<string, number> = {}
    filteredLeads.forEach(l => {
      const src = l.source || 'Unknown'
      groups[src] = (groups[src] || 0) + 1
    })
    const colors = ['#1e293b', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899']
    return Object.entries(groups)
      .map(([name, value], i) => ({ name, value, fill: colors[i % colors.length] }))
      .sort((a, b) => b.value - a.value)
  }, [filteredLeads])

  // ── Programme Level Distribution ──
  const programmeData = useMemo(() => {
    const groups: Record<string, number> = {}
    filteredLeads.forEach(l => {
      const prog = l.programme_level || 'Not specified'
      groups[prog] = (groups[prog] || 0) + 1
    })
    return Object.entries(groups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [filteredLeads])

  // ── Country Distribution (Top 8) ──
  const countryData = useMemo(() => {
    const groups: Record<string, number> = {}
    filteredLeads.forEach(l => {
      const country = l.country || 'Unknown'
      groups[country] = (groups[country] || 0) + 1
    })
    return Object.entries(groups)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [filteredLeads])

  // ── Export CSV Report ──
  const handleExportCSV = () => {
    const headers = ['Lead Name', 'Email', 'Phone', 'Stage', 'Priority', 'Source', 'Country', 'Programme', 'Call Outcome', 'Attempts', 'Owner', 'Created']
    const rows = filteredLeads.map(l => [
      `"${l.name || ''}"`,
      l.email || '',
      l.phone || '',
      l.stage || '',
      l.priority || '',
      l.source || '',
      l.country || '',
      l.programme_level || '',
      l.last_call_outcome || '',
      l.attempts || 0,
      employees.find(e => e.id === l.owner_id)?.name || '',
      l.created_at ? `"${new Date(l.created_at).toLocaleDateString()}"` : ''
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const link = document.createElement('a')
    link.setAttribute('href', encodeURI(csvContent))
    link.setAttribute('download', `bridgewell_analytics_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ── Custom Tooltip ──
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 text-xs">
        <p className="font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-gray-600">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color || p.fill }}></span>
            {p.name}: <span className="font-bold text-gray-900">{p.value}</span>
          </p>
        ))}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFDFD]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFD] p-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Analytics & Reports</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Realtime Sync
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Comprehensive lead funnel, calling activity, and conversion performance metrics.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Time Range Selector */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 shadow-2xs">
            {([
              ['today', 'Today'],
              ['week', 'Week'],
              ['month', 'Month'],
              ['quarter', 'Quarter'],
              ['all', 'All Time'],
            ] as [TimeRange, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTimeRange(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === key
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="px-3.5 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ──────── KPI Cards ──────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-8">
        {/* Total Leads */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Total Leads</span>
            <Users size={14} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{kpis.total}</span>
            {timeRange !== 'all' && kpis.prevTotal > 0 && (
              <span className={`inline-flex items-center text-[10px] font-bold ${
                kpis.growthRate >= 0 ? 'text-emerald-600' : 'text-red-600'
              }`}>
                {kpis.growthRate >= 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                {Math.abs(kpis.growthRate)}%
              </span>
            )}
          </div>
        </div>

        {/* Conversion Rate */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Conversion Rate</span>
            <Percent size={14} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{kpis.conversionRate}%</span>
            <span className="text-[10px] text-gray-400">{kpis.enrolled}/{kpis.total}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${kpis.conversionRate}%` }} />
          </div>
        </div>

        {/* Total Calls */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Total Calls</span>
            <PhoneCall size={14} className="text-blue-500" />
          </div>
          <span className="text-2xl font-bold text-gray-900">{kpis.totalCalls}</span>
        </div>

        {/* Connect Rate */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Connect Rate</span>
            <CheckCircle2 size={14} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{kpis.connectRate}%</span>
            <span className="text-[10px] text-gray-400">{kpis.connectedCalls} connected</span>
          </div>
        </div>

        {/* Hot Leads */}
        <div className="bg-white border border-rose-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-rose-700 font-medium">Hot Leads</span>
            <Flame size={14} className="text-rose-500" />
          </div>
          <span className="text-2xl font-bold text-rose-600">{kpis.hot}</span>
        </div>

        {/* Avg Calls/Lead */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Avg Calls/Lead</span>
            <Target size={14} className="text-gray-400" />
          </div>
          <span className="text-2xl font-bold text-gray-900">{kpis.avgCallsPerLead}</span>
        </div>
      </div>

      {/* ──────── Charts Row 1: Funnel + Priority ──────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Pipeline Stage Funnel (2 cols) */}
        <div className="xl:col-span-2 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <BarChart3 size={16} className="text-gray-400" />
            Pipeline Stage Funnel
          </h2>
          <p className="text-xs text-gray-400 mb-5">Lead distribution across each pipeline stage</p>
          {stageFunnel.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={stageFunnel} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#475569' }} width={140} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={28}>
                  {stageFunnel.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[320px] flex items-center justify-center text-gray-400 text-sm">No data available</div>
          )}
        </div>

        {/* Priority Distribution (1 col) */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Flame size={16} className="text-gray-400" />
            Lead Priority Split
          </h2>
          <p className="text-xs text-gray-400 mb-5">Hot / Warm / Cold distribution</p>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="45%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {priorityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', color: '#64748b' }}
                  formatter={(value: string, entry: any) => `${value} (${entry.payload.value})`}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">No priority data</div>
          )}
        </div>
      </div>

      {/* ──────── Charts Row 2: Lead Trend + Call Outcome ──────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Lead Trend Over Time */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <TrendingUp size={16} className="text-gray-400" />
            Lead Acquisition Trend
          </h2>
          <p className="text-xs text-gray-400 mb-5">New leads created over time</p>
          {leadTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={leadTrend} margin={{ top: 0, right: 12, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1e293b" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#1e293b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="leads" stroke="#1e293b" strokeWidth={2} fill="url(#leadGradient)" dot={{ r: 3, fill: '#1e293b', strokeWidth: 0 }} activeDot={{ r: 5, fill: '#1e293b' }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No trend data yet</div>
          )}
        </div>

        {/* Call Outcome Breakdown */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <PhoneCall size={16} className="text-gray-400" />
            Call Outcome Breakdown
          </h2>
          <p className="text-xs text-gray-400 mb-5">Connected vs No Answer vs Busy distribution</p>
          {outcomeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={outcomeData}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {outcomeData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', color: '#64748b' }}
                  formatter={(value: string, entry: any) => `${value} (${entry.payload.value})`}
                />
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No call data yet</div>
          )}
        </div>
      </div>

      {/* ──────── Charts Row 3: Employee Performance ──────── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          Employee Performance Comparison
        </h2>
        <p className="text-xs text-gray-400 mb-5">Calls, Connected, Hot Leads, and Enrolled per counselor</p>
        {employeePerformance.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(260, employeePerformance.length * 55)}>
            <BarChart data={employeePerformance} layout="vertical" margin={{ top: 0, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#1e293b', fontWeight: 600 }} width={90} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
              <Bar dataKey="calls" name="Total Calls" fill="#1e293b" radius={[0, 4, 4, 0]} maxBarSize={20} />
              <Bar dataKey="connected" name="Connected" fill="#10b981" radius={[0, 4, 4, 0]} maxBarSize={20} />
              <Bar dataKey="hot" name="Hot Leads" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={20} />
              <Bar dataKey="enrolled" name="Enrolled" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">No employee data</div>
        )}
      </div>

      {/* ──────── Charts Row 4: Source + Programme + Country ──────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Source Distribution */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Lead Sources</h2>
          <p className="text-xs text-gray-400 mb-5">Where your leads come from</p>
          {sourceData.length > 0 ? (
            <div className="space-y-3">
              {sourceData.map((s, i) => {
                const maxVal = sourceData[0]?.value || 1
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{s.name}</span>
                      <span className="font-bold text-gray-900">{s.value} <span className="text-gray-400 font-normal">({filteredLeads.length > 0 ? Math.round((s.value / filteredLeads.length) * 100) : 0}%)</span></span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(s.value / maxVal) * 100}%`, backgroundColor: s.fill }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No source data</div>
          )}
        </div>

        {/* Programme Level Distribution */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Programme Levels</h2>
          <p className="text-xs text-gray-400 mb-5">Which programmes generate most interest</p>
          {programmeData.length > 0 ? (
            <div className="space-y-3">
              {programmeData.map((p, i) => {
                const maxVal = programmeData[0]?.value || 1
                const colors = ['#1e293b', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{p.name}</span>
                      <span className="font-bold text-gray-900">{p.value}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(p.value / maxVal) * 100}%`, backgroundColor: colors[i % colors.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No programme data</div>
          )}
        </div>

        {/* Country Distribution */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Top Countries</h2>
          <p className="text-xs text-gray-400 mb-5">Geographic distribution of your leads</p>
          {countryData.length > 0 ? (
            <div className="space-y-3">
              {countryData.map((c, i) => {
                const maxVal = countryData[0]?.value || 1
                const colors = ['#1e293b', '#475569', '#64748b', '#94a3b8', '#3b82f6', '#10b981', '#f59e0b', '#ef4444']
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{c.name}</span>
                      <span className="font-bold text-gray-900">{c.value}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(c.value / maxVal) * 100}%`, backgroundColor: colors[i % colors.length] }} />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-gray-400 text-sm">No country data</div>
          )}
        </div>
      </div>

      {/* ──────── Employee Detailed Stats Table ──────── */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Users size={16} className="text-gray-400" />
              Counselor Detailed Report
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Individual performance breakdown for {timeRange === 'today' ? 'Today' : timeRange === 'week' ? 'This Week' : timeRange === 'month' ? 'This Month' : timeRange === 'quarter' ? 'This Quarter' : 'All Time'}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-500 uppercase tracking-wider font-semibold text-[10px]">
                <th className="px-6 py-3">#</th>
                <th className="px-6 py-3">Counselor</th>
                <th className="px-6 py-3 text-center">Assigned</th>
                <th className="px-6 py-3 text-center">Calls</th>
                <th className="px-6 py-3 text-center">Connected</th>
                <th className="px-6 py-3 text-center">Connect %</th>
                <th className="px-6 py-3 text-center">🔥 Hot</th>
                <th className="px-6 py-3 text-center">✅ Enrolled</th>
                <th className="px-6 py-3 text-center">Conversion %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employeePerformance.map((emp, i) => (
                <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                  <td className="px-6 py-3.5 text-center font-bold text-gray-400">{i + 1}</td>
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-700 uppercase shrink-0">
                        {emp.fullName?.slice(0, 2) || '?'}
                      </div>
                      <span className="font-semibold text-gray-900">{emp.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-center font-semibold text-gray-900">{emp.total}</td>
                  <td className="px-6 py-3.5 text-center font-bold text-gray-900">{emp.calls}</td>
                  <td className="px-6 py-3.5 text-center">
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">{emp.connected}</span>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <span className={`font-bold ${emp.connectRate >= 50 ? 'text-emerald-600' : emp.connectRate >= 25 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {emp.connectRate}%
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {emp.hot > 0 ? (
                      <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">{emp.hot}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    {emp.enrolled > 0 ? (
                      <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">{emp.enrolled}</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-center">
                    <span className={`font-bold ${emp.total > 0 && Math.round((emp.enrolled / emp.total) * 100) > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {emp.total > 0 ? Math.round((emp.enrolled / emp.total) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              ))}
              {employeePerformance.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">No employee data available</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

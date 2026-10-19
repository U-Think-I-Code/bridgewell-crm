'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { 
  Clock, 
  Phone, 
  MessageSquare, 
  CheckCircle2, 
  User, 
  Calendar, 
  Filter, 
  Search, 
  Download, 
  RotateCcw, 
  Activity as ActivityIcon, 
  Zap, 
  ChevronRight, 
  TrendingUp, 
  Users, 
  ArrowRightLeft, 
  PhoneCall, 
  LogIn, 
  LogOut, 
  AlarmClock, 
  FileSpreadsheet,
  AlertCircle,
  Eye,
  Check,
  Smartphone,
  ShieldAlert,
  ArrowUpRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Legend, 
  CartesianGrid 
} from 'recharts'

interface ActivityItem {
  id: string
  lead?: string | null
  user_id?: string | null
  type: string
  outcome?: string | null
  text?: string | null
  time: string
  lead_name?: string
  lead_phone?: string
  counselor_name?: string
  counselor_email?: string
}

interface UserPresence {
  id: string
  name: string
  email: string
  role: string
  active?: boolean
  last_login_at?: string | null
  last_active_at?: string | null
  status?: string
  today_calls: number
  today_actions: number
  last_action?: string
  first_login_today?: string
}

interface SessionRecord {
  id: string
  user_id: string
  session_id: string
  login_at: string
  last_active_at: string
  logout_at?: string | null
  duration_seconds: number
  device_info?: string | null
  is_active: boolean
  user_name?: string
}

export default function EmployeeActivityLogPage() {
  const { user } = useAuth()
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [counselors, setCounselors] = useState<UserPresence[]>([])
  const [sessions, setSessions] = useState<SessionRecord[]>([])
  const [leadsMap, setLeadsMap] = useState<Record<string, { name: string; phone: string }>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'matrix' | 'sessions'>('timeline')
  
  // Filters
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('all')
  const [selectedType, setSelectedType] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all'>('today')
  const [searchQuery, setSearchQuery] = useState('')
  const [newActivityAlert, setNewActivityAlert] = useState<string | null>(null)

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true)

      // 1. Fetch Users
      const { data: usersData } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true })

      // 2. Fetch Leads (id, name, phone) for fast reference
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, name, phone')

      const lMap: Record<string, { name: string; phone: string }> = {}
      leadsData?.forEach(l => {
        lMap[l.id] = { name: l.name, phone: l.phone }
      })
      setLeadsMap(lMap)

      // 3. Fetch Activities (all records, ordered by time DESC)
      const { data: actsData } = await supabase
        .from('activities')
        .select('*')
        .order('time', { ascending: false })
        .limit(400)

      // 4. Fetch User Sessions
      const { data: sessData } = await supabase
        .from('user_sessions')
        .select('*')
        .order('login_at', { ascending: false })
        .limit(100)

      // Map users
      const usersList = usersData || []
      const actsList = actsData || []
      const userDict: Record<string, any> = {}
      usersList.forEach(u => {
        userDict[u.id] = u
      })

      // Calculate Counselor Presence & Today Stats
      const todayStr = new Date().toISOString().split('T')[0]
      const presences: UserPresence[] = usersList.map(u => {
        const userActs = actsList.filter(a => a.user_id === u.id)
        const todayActs = userActs.filter(a => a.time && a.time.startsWith(todayStr))
        const todayCalls = todayActs.filter(a => a.type?.toLowerCase() === 'call').length

        // Last action
        const lastAct = userActs[0]
        let lastActionStr = 'No recent actions'
        if (lastAct) {
          const actType = lastAct.type?.toUpperCase() || 'ACTION'
          const target = lastAct.lead && lMap[lastAct.lead] ? lMap[lastAct.lead].name : ''
          lastActionStr = `${actType} ${target ? '• ' + target : ''}`
        }

        // Today first login
        const todayLogins = userActs.filter(a => a.type === 'login' && a.time?.startsWith(todayStr))
        const firstLogin = todayLogins.length > 0 ? todayLogins[todayLogins.length - 1].time : (u.last_login_at?.startsWith(todayStr) ? u.last_login_at : null)

        // Evaluate online/idle status
        let effectiveStatus = u.status || 'offline'
        if (u.last_active_at) {
          const diffMins = (Date.now() - new Date(u.last_active_at).getTime()) / (1000 * 60)
          if (diffMins > 20) {
            effectiveStatus = 'offline'
          } else if (diffMins > 6) {
            effectiveStatus = 'idle'
          } else {
            effectiveStatus = 'online'
          }
        }

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active,
          last_login_at: u.last_login_at,
          last_active_at: u.last_active_at,
          status: effectiveStatus,
          today_calls: todayCalls,
          today_actions: todayActs.length,
          last_action: lastActionStr,
          first_login_today: firstLogin
        }
      })

      setCounselors(presences)

      // Enrich activities with user and lead names
      const enrichedActs: ActivityItem[] = actsList.map(a => ({
        ...a,
        lead_name: a.lead && lMap[a.lead] ? lMap[a.lead].name : 'General Action',
        lead_phone: a.lead && lMap[a.lead] ? lMap[a.lead].phone : '',
        counselor_name: a.user_id && userDict[a.user_id] ? userDict[a.user_id].name : 'System / Auto',
        counselor_email: a.user_id && userDict[a.user_id] ? userDict[a.user_id].email : ''
      }))

      setActivities(enrichedActs)

      // Enrich sessions with user names
      const enrichedSess: SessionRecord[] = (sessData || []).map(s => ({
        ...s,
        user_name: userDict[s.user_id]?.name || 'Unknown Staff'
      }))
      setSessions(enrichedSess)

    } catch (err) {
      console.error('Error fetching activity log:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Setup Realtime Subscription on activities & users & user_sessions
    const activitiesSub = supabase
      .channel('realtime-employee-activity')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activities' },
        (payload: any) => {
          const newAct = payload.new
          setActivities(prev => [
            {
              ...newAct,
              lead_name: newAct.lead && leadsMap[newAct.lead] ? leadsMap[newAct.lead].name : 'General Action',
              lead_phone: newAct.lead && leadsMap[newAct.lead] ? leadsMap[newAct.lead].phone : '',
              counselor_name: counselors.find(c => c.id === newAct.user_id)?.name || 'Staff'
            },
            ...prev
          ])
          setNewActivityAlert(`New ${newAct.type} logged!`)
          setTimeout(() => setNewActivityAlert(null), 4000)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users' },
        (payload: any) => {
          const updatedUser = payload.new
          setCounselors(prev => prev.map(c => c.id === updatedUser.id ? { ...c, ...updatedUser } : c))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(activitiesSub)
    }
  }, [])

  // Filter activities
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      // Counselor filter
      if (selectedCounselorId !== 'all') {
        if (act.user_id !== selectedCounselorId) return false
      }

      // Type filter
      if (selectedType !== 'all') {
        const typeNorm = act.type?.toLowerCase() || ''
        if (selectedType === 'call' && typeNorm !== 'call') return false
        if (selectedType === 'stage' && !typeNorm.includes('stage')) return false
        if (selectedType === 'assignment' && typeNorm !== 'assignment') return false
        if (selectedType === 'note' && typeNorm !== 'note') return false
        if (selectedType === 'whatsapp' && typeNorm !== 'whatsapp') return false
        if (selectedType === 'session' && typeNorm !== 'login' && typeNorm !== 'logout') return false
        if (selectedType === 'snooze' && typeNorm !== 'snooze') return false
      }

      // Date filter
      if (dateFilter !== 'all' && act.time) {
        const actDate = new Date(act.time)
        const now = new Date()

        if (dateFilter === 'today') {
          const isToday = actDate.toDateString() === now.toDateString()
          if (!isToday) return false
        } else if (dateFilter === 'yesterday') {
          const yesterday = new Date(now)
          yesterday.setDate(now.getDate() - 1)
          const isYest = actDate.toDateString() === yesterday.toDateString()
          if (!isYest) return false
        } else if (dateFilter === '7days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (actDate < sevenDaysAgo) return false
        } else if (dateFilter === '30days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          if (actDate < thirtyDaysAgo) return false
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const textMatch = act.text?.toLowerCase().includes(q)
        const leadMatch = act.lead_name?.toLowerCase().includes(q)
        const counselorMatch = act.counselor_name?.toLowerCase().includes(q)
        const outcomeMatch = act.outcome?.toLowerCase().includes(q)
        if (!textMatch && !leadMatch && !counselorMatch && !outcomeMatch) return false
      }

      return true
    })
  }, [activities, selectedCounselorId, selectedType, dateFilter, searchQuery])

  // Hourly velocity chart data (Today: 9 AM to 7 PM)
  const hourlyData = useMemo(() => {
    const hours = ['9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM']
    const dataMap: Record<string, { calls: number; stageChanges: number; other: number }> = {}

    hours.forEach(h => {
      dataMap[h] = { calls: 0, stageChanges: 0, other: 0 }
    })

    const todayStr = new Date().toDateString()

    activities.forEach(act => {
      if (!act.time) return
      const actDate = new Date(act.time)
      if (actDate.toDateString() !== todayStr) return

      // If counselor filtered, match counselor
      if (selectedCounselorId !== 'all' && act.user_id !== selectedCounselorId) return

      const hour = actDate.getHours()
      let label = ''
      if (hour >= 9 && hour <= 19) {
        if (hour < 12) label = `${hour} AM`
        else if (hour === 12) label = '12 PM'
        else label = `${hour - 12} PM`
      }

      if (label && dataMap[label]) {
        const typeNorm = act.type?.toLowerCase() || ''
        if (typeNorm === 'call') {
          dataMap[label].calls += 1
        } else if (typeNorm.includes('stage')) {
          dataMap[label].stageChanges += 1
        } else {
          dataMap[label].other += 1
        }
      }
    })

    return hours.map(h => ({
      hour: h,
      Calls: dataMap[h].calls,
      'Stage Updates': dataMap[h].stageChanges,
      'Other Actions': dataMap[h].other
    }))
  }, [activities, selectedCounselorId])

  // Matrix Stats by Counselor
  const counselorMatrix = useMemo(() => {
    return counselors.map(c => {
      const cActs = activities.filter(a => a.user_id === c.id)
      const calls = cActs.filter(a => a.type?.toLowerCase() === 'call')
      const connected = calls.filter(a => a.outcome?.toLowerCase() === 'connected').length
      const stageChanges = cActs.filter(a => a.type?.toLowerCase().includes('stage')).length
      const assignments = cActs.filter(a => a.type?.toLowerCase() === 'assignment').length
      const notes = cActs.filter(a => a.type?.toLowerCase() === 'note').length
      const snoozes = cActs.filter(a => a.type?.toLowerCase() === 'snooze').length
      const whatsapps = cActs.filter(a => a.type?.toLowerCase() === 'whatsapp').length

      // Active duration from sessions today
      const todayStr = new Date().toISOString().split('T')[0]
      const userTodaySess = sessions.filter(s => s.user_id === c.id && s.login_at?.startsWith(todayStr))
      const totalSeconds = userTodaySess.reduce((acc, s) => acc + (s.duration_seconds || 0), 0)
      const hours = Math.floor(totalSeconds / 3600)
      const mins = Math.floor((totalSeconds % 3600) / 60)

      return {
        ...c,
        totalCalls: calls.length,
        connectedCalls: connected,
        connectRate: calls.length > 0 ? Math.round((connected / calls.length) * 100) : 0,
        stageChanges,
        assignments,
        notes,
        snoozes,
        whatsapps,
        totalActions: cActs.length,
        todayActiveHours: `${hours}h ${mins}m`
      }
    })
  }, [counselors, activities, sessions])

  // Top Counters
  const totalCallsToday = useMemo(() => {
    const todayStr = new Date().toDateString()
    return activities.filter(a => a.type?.toLowerCase() === 'call' && new Date(a.time).toDateString() === todayStr).length
  }, [activities])

  const onlineStaffCount = counselors.filter(c => c.status === 'online').length
  const idleStaffCount = counselors.filter(c => c.status === 'idle').length
  const offlineStaffCount = counselors.filter(c => c.status === 'offline' || !c.status).length

  // CSV Export
  const handleExportCSV = () => {
    if (filteredActivities.length === 0) {
      alert('No activities to export with current filters.')
      return
    }

    const headers = ['Date', 'Time', 'Employee Name', 'Action Type', 'Lead / Student', 'Outcome', 'Details']
    const rows = filteredActivities.map(a => {
      const d = new Date(a.time)
      const datePart = d.toLocaleDateString('en-GB')
      const timePart = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      return [
        `"${datePart}"`,
        `"${timePart}"`,
        `"${a.counselor_name || 'System'}"`,
        `"${a.type || 'Action'}"`,
        `"${a.lead_name || 'N/A'}"`,
        `"${a.outcome || 'N/A'}"`,
        `"${(a.text || '').replace(/"/g, '""')}"`
      ]
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Bridgewell_Activity_Log_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Formatting helpers
  const formatTimeAgo = (isoStr: string) => {
    if (!isoStr) return 'N/A'
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const formatClockTime = (isoStr: string) => {
    if (!isoStr) return '--:--'
    return new Date(isoStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const renderActionBadge = (type: string, outcome?: string | null) => {
    const t = type?.toLowerCase() || ''
    if (t === 'call') {
      const o = outcome?.toLowerCase() || ''
      if (o === 'connected') {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <PhoneCall size={11} /> Call Connected
          </span>
        )
      }
      if (o === 'busy' || o === 'no answer') {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Phone size={11} /> Call ({outcome})
          </span>
        )
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Phone size={11} /> Call Logged
        </span>
      )
    }
    if (t.includes('stage')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
          <TrendingUp size={11} /> Stage Change
        </span>
      )
    }
    if (t === 'assignment') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
          <ArrowRightLeft size={11} /> Reassignment
        </span>
      )
    }
    if (t === 'whatsapp') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <Smartphone size={11} /> WhatsApp
        </span>
      )
    }
    if (t === 'note') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
          <MessageSquare size={11} /> Note Added
        </span>
      )
    }
    if (t === 'snooze') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <AlarmClock size={11} /> Snoozed Follow-up
        </span>
      )
    }
    if (t === 'login') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <LogIn size={11} /> Logged In
        </span>
      )
    }
    if (t === 'logout') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-300">
          <LogOut size={11} /> Logged Out
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200">
        <ActivityIcon size={11} /> {type}
      </span>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#FDFDFD] p-6 lg:p-8 space-y-6 animate-in fade-in duration-300">
      {/* Toast Alert for Live Activity */}
      {newActivityAlert && (
        <div className="fixed top-5 right-5 z-50 bg-gray-900 text-white px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2.5 text-xs font-medium animate-in slide-in-from-top duration-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{newActivityAlert}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <Clock className="text-gray-900" size={24} />
              Employee Activity Log
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Presence & Audit Trail
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Real-time staff attendance, login timestamps, active work duration, and full activity stream.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shadow-xs transition-colors"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-gray-900 rounded-xl hover:bg-black shadow-xs transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Active Staff */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Staff Online</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{onlineStaffCount}</span>
              <span className="text-xs text-emerald-600 font-medium">Active now</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span> {onlineStaffCount} online
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 ml-1"></span> {idleStaffCount} idle
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400 ml-1"></span> {offlineStaffCount} offline
            </div>
          </div>
          <div className="w-11 h-11 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100">
            <Users size={20} />
          </div>
        </div>

        {/* Calls Logged Today */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Calls Logged Today</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{totalCallsToday}</span>
              <span className="text-xs text-blue-600 font-medium">Team Total</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Across all active counselors</div>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
            <PhoneCall size={20} />
          </div>
        </div>

        {/* Total Actions Today */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Actions Recorded</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{activities.length}</span>
              <span className="text-xs text-indigo-600 font-medium">In Log</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Calls, stages, notes & logins</div>
          </div>
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100">
            <Zap size={20} />
          </div>
        </div>

        {/* Registered Staff */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Registered Staff</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{counselors.length}</span>
              <span className="text-xs text-purple-600 font-medium">Employees</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">Managers & Counselors</div>
          </div>
          <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center border border-purple-100">
            <User size={20} />
          </div>
        </div>
      </div>

      {/* Counselor Live Presence Cards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Team Presence & Output (Click to filter)
          </h2>
          {selectedCounselorId !== 'all' && (
            <button
              onClick={() => setSelectedCounselorId('all')}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              Clear Filter (Show All)
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {counselors.map(c => {
            const isSelected = selectedCounselorId === c.id
            const isOnline = c.status === 'online'
            const isIdle = c.status === 'idle'

            return (
              <div
                key={c.id}
                onClick={() => setSelectedCounselorId(isSelected ? 'all' : c.id)}
                className={`bg-white border rounded-2xl p-4 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-gray-900 ring-2 ring-gray-900/10 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-xs'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-sm">
                        {c.name.substring(0, 2).toUpperCase()}
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
                          isOnline
                            ? 'bg-emerald-500 animate-pulse'
                            : isIdle
                            ? 'bg-amber-500'
                            : 'bg-gray-400'
                        }`}
                        title={isOnline ? 'Online' : isIdle ? 'Idle' : 'Offline'}
                      ></span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900 text-sm">{c.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium capitalize">
                          {c.role}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 block truncate max-w-[170px]">{c.email}</span>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      isOnline
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isIdle
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                  >
                    {isOnline ? 'Active Now' : isIdle ? 'Idle' : 'Offline'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50/80 rounded-xl p-2.5 mb-2.5 border border-gray-100">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-medium">Calls Today</span>
                    <span className="font-semibold text-gray-900">{c.today_calls} calls</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-medium">Actions Today</span>
                    <span className="font-semibold text-gray-900">{c.today_actions} actions</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-medium">First Login</span>
                    <span className="text-gray-700 font-medium">
                      {c.first_login_today ? formatClockTime(c.first_login_today) : 'No login yet'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-medium">Last Active</span>
                    <span className="text-gray-700 font-medium">
                      {c.last_active_at ? formatTimeAgo(c.last_active_at) : 'Never'}
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-gray-500 flex items-center justify-between">
                  <span className="truncate max-w-[200px]">
                    <span className="font-medium text-gray-700">Recent:</span> {c.last_action}
                  </span>
                  <ChevronRight size={13} className="text-gray-400" />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Hourly Velocity Chart */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <TrendingUp size={16} className="text-gray-900" />
              Calling & Work Velocity Today (9 AM – 7 PM)
            </h3>
            <p className="text-xs text-gray-500">
              Distribution of employee actions across business hours to monitor consistency and identify quiet periods.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-3 h-3 rounded-sm bg-gray-900"></span> Calls
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-3 h-3 rounded-sm bg-indigo-500"></span> Stage Updates
            </span>
            <span className="flex items-center gap-1.5 text-gray-600">
              <span className="w-3 h-3 rounded-sm bg-gray-300"></span> Other
            </span>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0F0F0" />
              <XAxis dataKey="hour" stroke="#888888" fontSize={11} tickLine={false} />
              <YAxis stroke="#888888" fontSize={11} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                  fontSize: '12px'
                }}
              />
              <Bar dataKey="Calls" fill="#111827" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Stage Updates" fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="Other Actions" fill="#D1D5DB" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Main View Tabs & Filters */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50/50 px-4 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-t border-x ${
              activeTab === 'timeline'
                ? 'bg-white border-gray-200 text-gray-900 shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Clock size={14} />
            Live Activity Timeline ({filteredActivities.length})
          </button>

          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-t border-x ${
              activeTab === 'matrix'
                ? 'bg-white border-gray-200 text-gray-900 shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Users size={14} />
            Staff Productivity Matrix
          </button>

          <button
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-t border-x ${
              activeTab === 'sessions'
                ? 'bg-white border-gray-200 text-gray-900 shadow-xs'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <LogIn size={14} />
            Attendance & Login Sessions ({sessions.length})
          </button>
        </div>

        {/* Filters Header (Active on timeline & matrix) */}
        <div className="p-4 border-b border-gray-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search staff, student, or notes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
              />
            </div>

            {/* Counselor filter */}
            <select
              value={selectedCounselorId}
              onChange={e => setSelectedCounselorId(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-xs rounded-xl px-3 py-1.5 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="all">All Staff Members</option>
              {counselors.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.role})</option>
              ))}
            </select>

            {/* Type filter */}
            <select
              value={selectedType}
              onChange={e => setSelectedType(e.target.value)}
              className="bg-gray-50 border border-gray-200 text-xs rounded-xl px-3 py-1.5 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
            >
              <option value="all">All Action Types</option>
              <option value="call">Calls Only</option>
              <option value="stage">Stage Updates</option>
              <option value="assignment">Reassignments</option>
              <option value="note">Notes Added</option>
              <option value="whatsapp">WhatsApp Messages</option>
              <option value="snooze">Snoozed Follow-ups</option>
              <option value="session">Login & Sessions</option>
            </select>

            {/* Date filter */}
            <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-0.5 text-xs font-medium">
              <button
                onClick={() => setDateFilter('today')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  dateFilter === 'today' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setDateFilter('yesterday')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  dateFilter === 'yesterday' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Yesterday
              </button>
              <button
                onClick={() => setDateFilter('7days')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  dateFilter === '7days' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Last 7d
              </button>
              <button
                onClick={() => setDateFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  dateFilter === 'all' ? 'bg-white text-gray-900 shadow-xs font-semibold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                All Time
              </button>
            </div>
          </div>

          <div className="text-xs text-gray-500">
            Showing <strong className="text-gray-900">{filteredActivities.length}</strong> items
          </div>
        </div>

        {/* Content by Tab */}
        {activeTab === 'timeline' && (
          <div className="divide-y divide-gray-100">
            {filteredActivities.length === 0 ? (
              <div className="p-16 text-center text-gray-400">
                <Clock size={36} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-700">No activities found</p>
                <p className="text-xs text-gray-400 mt-1">Try resetting the filters or check back when counselors log calls.</p>
              </div>
            ) : (
              filteredActivities.map((act, index) => {
                const actDate = new Date(act.time)
                const isCall = act.type?.toLowerCase() === 'call'

                return (
                  <div
                    key={act.id || index}
                    className="p-4 hover:bg-gray-50/70 transition-colors flex items-start gap-3.5 group"
                  >
                    {/* Counselor Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-xs shrink-0 mt-0.5">
                      {(act.counselor_name || 'U').substring(0, 2).toUpperCase()}
                    </div>

                    {/* Main Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-xs">
                          {act.counselor_name || 'Staff Member'}
                        </span>

                        {renderActionBadge(act.type, act.outcome)}

                        {act.lead && (
                          <Link
                            href={`/leads/${act.lead}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-900 hover:text-indigo-600 hover:underline"
                          >
                            <span>{act.lead_name}</span>
                            <ArrowUpRight size={11} className="text-gray-400" />
                          </Link>
                        )}

                        <span className="text-[11px] text-gray-400 ml-auto whitespace-nowrap">
                          {formatClockTime(act.time)} • {formatTimeAgo(act.time)}
                        </span>
                      </div>

                      {/* Text content / notes */}
                      {act.text && (
                        <p className="text-xs text-gray-600 bg-gray-50/80 border border-gray-100 rounded-xl px-3 py-1.5 mt-1">
                          {act.text}
                        </p>
                      )}

                      {/* Lead phone if available */}
                      {act.lead_phone && (
                        <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-400">
                          <span>Phone: {act.lead_phone}</span>
                          {act.outcome && <span>Outcome: <strong className="text-gray-700">{act.outcome}</strong></span>}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {activeTab === 'matrix' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Live Status</th>
                  <th className="py-3 px-4">Calls Made</th>
                  <th className="py-3 px-4">Connected</th>
                  <th className="py-3 px-4">Connect Rate</th>
                  <th className="py-3 px-4">Stage Updates</th>
                  <th className="py-3 px-4">Notes Added</th>
                  <th className="py-3 px-4">WhatsApp</th>
                  <th className="py-3 px-4">Today Active Time</th>
                  <th className="py-3 px-4">Total Output</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {counselorMatrix.map(m => (
                  <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-gray-900">{m.name}</div>
                      <div className="text-[11px] text-gray-400 capitalize">{m.role} • {m.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        m.status === 'online'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : m.status === 'idle'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          m.status === 'online' ? 'bg-emerald-500' : m.status === 'idle' ? 'bg-amber-500' : 'bg-gray-400'
                        }`}></span>
                        {m.status || 'Offline'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-gray-900">{m.totalCalls}</td>
                    <td className="py-3.5 px-4 text-emerald-600 font-semibold">{m.connectedCalls}</td>
                    <td className="py-3.5 px-4">
                      <span className={`font-semibold ${m.connectRate >= 50 ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {m.connectRate}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-indigo-600 font-semibold">{m.stageChanges}</td>
                    <td className="py-3.5 px-4 text-gray-700">{m.notes}</td>
                    <td className="py-3.5 px-4 text-emerald-600 font-semibold">{m.whatsapps}</td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">{m.todayActiveHours}</td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-gray-100 font-bold text-gray-800">
                        {m.totalActions}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Login Time</th>
                  <th className="py-3 px-4">Last Ping</th>
                  <th className="py-3 px-4">Logout Time</th>
                  <th className="py-3 px-4">Session Duration</th>
                  <th className="py-3 px-4">Device & Browser</th>
                  <th className="py-3 px-4">Session Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">
                      No session records logged yet. Sessions will appear automatically as employees log in.
                    </td>
                  </tr>
                ) : (
                  sessions.map(s => {
                    const durHours = Math.floor(s.duration_seconds / 3600)
                    const durMins = Math.floor((s.duration_seconds % 3600) / 60)
                    const durSecs = s.duration_seconds % 60
                    const durStr = durHours > 0 ? `${durHours}h ${durMins}m` : `${durMins}m ${durSecs}s`

                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3.5 px-4 font-semibold text-gray-900">{s.user_name}</td>
                        <td className="py-3.5 px-4 text-gray-700">
                          {new Date(s.login_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-3.5 px-4 text-gray-500">
                          {formatTimeAgo(s.last_active_at)}
                        </td>
                        <td className="py-3.5 px-4 text-gray-700">
                          {s.logout_at ? (
                            new Date(s.logout_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
                          ) : (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              Active Now
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-gray-900">{durStr}</td>
                        <td className="py-3.5 px-4 text-gray-400 max-w-xs truncate" title={s.device_info || ''}>
                          {s.device_info || 'Standard Web Browser'}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            s.is_active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-gray-100 text-gray-600 border border-gray-200'
                          }`}>
                            {s.is_active ? 'In Session' : 'Ended'}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

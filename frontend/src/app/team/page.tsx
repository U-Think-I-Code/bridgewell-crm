'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  Users, UserPlus, KeyRound, Trash2, CheckCircle2, 
  XCircle, Shield, Mail, User, Lock, Copy, Check, X,
  PhoneCall, ShieldAlert, Sparkles, Trophy, ArrowLeftRight,
  Clock, Calendar, Filter, Search, ArrowUpRight, Activity, AlertCircle
} from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LeaderboardSection from '@/components/LeaderboardSection'

interface Employee {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  auth_id: string | null
  leads_count?: number
  last_active_at?: string | null
  last_login_at?: string | null
  status?: string
  today_login_time?: string | null
  first_login_today_iso?: string | null
  effective_status: 'online' | 'idle' | 'offline'
}

interface LoginLogItem {
  id: string
  user_id: string
  time: string
  text?: string | null
  user_name?: string
  user_email?: string
  user_role?: string
}

function isSameDayAsToday(isoString?: string | null): boolean {
  if (!isoString) return false
  try {
    const d = new Date(isoString)
    const today = new Date()
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    )
  } catch {
    return false
  }
}

function isSameDayAsYesterday(isoString?: string | null): boolean {
  if (!isoString) return false
  try {
    const d = new Date(isoString)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    return (
      d.getFullYear() === yesterday.getFullYear() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getDate() === yesterday.getDate()
    )
  } catch {
    return false
  }
}

export default function TeamPage() {
  const { user } = useAuth()
  const router = useRouter()
  
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [teamTab, setTeamTab] = useState<'members' | 'attendance' | 'leaderboard'>('members')
  const [loginLogs, setLoginLogs] = useState<LoginLogItem[]>([])
  const [attendanceDateFilter, setAttendanceDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all'>('today')
  const [selectedCounselorFilter, setSelectedCounselorFilter] = useState<string>('all')
  const [attendanceSearch, setAttendanceSearch] = useState<string>('')
  
  // Add Employee Modal State
  const [showAddModal, setShowAddModal] = useState(false)
  const [addName, setAddName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [addPassword, setAddPassword] = useState('')
  const [addRole, setAddRole] = useState('counselor')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [createdSuccess, setCreatedSuccess] = useState<{ email: string; password: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)

  // Sync tab with URL search params on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const tabParam = params.get('tab')
      if (tabParam === 'attendance') setTeamTab('attendance')
      else if (tabParam === 'leaderboard') setTeamTab('leaderboard')
      const counselorParam = params.get('counselor')
      if (counselorParam) setSelectedCounselorFilter(counselorParam)
    }
  }, [])

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/')
      return
    }
    fetchEmployees()

    // Realtime listener for employee accounts, logins, and lead assignments
    const channel = supabase
      .channel('team-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        fetchEmployees()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchEmployees()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
        fetchEmployees()
      })
      .subscribe()

    const interval = setInterval(fetchEmployees, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [user])

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      // 1. Fetch users
      const { data: usersData, error } = await supabase
        .from('users')
        .select('*')
        .order('role', { ascending: false })

      if (error) {
        console.error('Error fetching employees:', error)
        setLoading(false)
        return
      }

      // 2. Fetch lead counts for each user
      const { data: leadsData } = await supabase
        .from('leads')
        .select('owner_id')

      const leadCountMap: Record<string, number> = {}
      leadsData?.forEach((lead: any) => {
        if (lead.owner_id) {
          leadCountMap[lead.owner_id] = (leadCountMap[lead.owner_id] || 0) + 1
        }
      })

      // 3. Fetch login activities
      const { data: loginActs } = await supabase
        .from('activities')
        .select('id, user_id, type, text, time')
        .eq('type', 'login')
        .order('time', { ascending: false })
        .limit(500)

      const userMap: Record<string, any> = {}
      ;(usersData || []).forEach(u => {
        userMap[u.id] = u
      })

      // Enrich employees with today's login time & presence
      const enriched = (usersData || []).map((u: any) => {
        let effectiveStatus: 'online' | 'idle' | 'offline' = u.status || 'offline'
        if (u.last_active_at) {
          const diffMins = (Date.now() - new Date(u.last_active_at).getTime()) / (1000 * 60)
          if (diffMins > 20) {
            effectiveStatus = 'offline'
          } else if (diffMins > 5) {
            effectiveStatus = 'idle'
          } else {
            effectiveStatus = 'online'
          }
        }

        // Find today's logins for this user using timezone-safe date match
        const userLoginsToday = (loginActs || [])
          .filter(a => a.user_id === u.id && a.time && isSameDayAsToday(a.time))
          .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

        let earliestLoginIso = userLoginsToday[0]?.time || (isSameDayAsToday(u.last_login_at) ? u.last_login_at : null)

        // Failsafe: If user is active right now (online or idle), they must NEVER show as "Not logged in today"
        if (!earliestLoginIso && (effectiveStatus === 'online' || effectiveStatus === 'idle')) {
          earliestLoginIso = isSameDayAsToday(u.last_active_at) ? u.last_active_at : new Date().toISOString()
        }

        let todayLoginFormatted: string | null = null
        if (earliestLoginIso) {
          try {
            todayLoginFormatted = new Date(earliestLoginIso).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: true
            })
          } catch {}
        }

        return {
          ...u,
          leads_count: leadCountMap[u.id] || 0,
          today_login_time: todayLoginFormatted,
          first_login_today_iso: earliestLoginIso,
          effective_status: effectiveStatus
        }
      })

      setEmployees(enriched)

      // Map enriched login activities
      const enrichedLogs: LoginLogItem[] = (loginActs || []).map(a => ({
        id: a.id,
        user_id: a.user_id,
        time: a.time,
        text: a.text,
        user_name: a.user_id && userMap[a.user_id] ? userMap[a.user_id].name : 'Counselor',
        user_email: a.user_id && userMap[a.user_id] ? userMap[a.user_id].email : '',
        user_role: a.user_id && userMap[a.user_id] ? userMap[a.user_id].role : 'counselor'
      }))

      setLoginLogs(enrichedLogs)
    } finally {
      setLoading(false)
    }
  }

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    setAddLoading(true)

    if (addPassword.length < 6) {
      setAddError('Password must be at least 6 characters.')
      setAddLoading(false)
      return
    }

    try {
      const { data, error } = await supabase.rpc('create_employee', {
        p_name: addName.trim(),
        p_email: addEmail.trim().toLowerCase(),
        p_password: addPassword,
        p_role: addRole
      })

      if (error) {
        setAddError(error.message || 'Failed to create employee')
        setAddLoading(false)
        return
      }

      if (data && !data.success) {
        setAddError(data.error || 'Failed to create employee')
        setAddLoading(false)
        return
      }

      setCreatedSuccess({
        email: addEmail.trim().toLowerCase(),
        password: addPassword,
        name: addName.trim()
      })
      
      setAddName('')
      setAddEmail('')
      setAddPassword('')
      setAddRole('counselor')
      await fetchEmployees()
    } catch (err: any) {
      setAddError(err.message || 'Unexpected error occurred')
    } finally {
      setAddLoading(false)
    }
  }

  const handleToggleStatus = async (employee: Employee) => {
    if (employee.email === 'admin@bridgewell.com') {
      alert('Cannot deactivate the primary administrator.')
      return
    }

    const newStatus = !employee.active
    await supabase.rpc('toggle_employee_status', {
      p_user_id: employee.id,
      p_active: newStatus
    })
    await fetchEmployees()
  }

  const handleOpenResetPassword = (employee: Employee) => {
    setSelectedEmployee(employee)
    setNewPassword('')
    setResetError('')
    setResetSuccess(false)
    setShowPasswordModal(true)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmployee) return
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters.')
      return
    }

    setResetLoading(true)
    setResetError('')

    const { data, error } = await supabase.rpc('reset_employee_password', {
      p_user_id: selectedEmployee.id,
      p_new_password: newPassword
    })

    setResetLoading(false)
    if (error || (data && !data.success)) {
      setResetError(error?.message || data?.error || 'Failed to reset password.')
    } else {
      setResetSuccess(true)
    }
  }

  const handleDeleteEmployee = async (employee: Employee) => {
    if (employee.email === 'admin@bridgewell.com') {
      alert('Cannot delete the primary administrator account.')
      return
    }

    const confirmed = confirm(
      `Are you sure you want to delete ${employee.name} (${employee.email})?\n\nTheir login credentials will be removed. Any leads assigned to them will be unassigned.`
    )
    if (!confirmed) return

    const { data, error } = await supabase.rpc('remove_employee_account', {
      p_user_id: employee.id
    })

    if (error || (data && !data.success)) {
      alert(error?.message || data?.error || 'Failed to delete employee')
    } else {
      await fetchEmployees()
    }
  }

  const copyCredentials = (email: string, pass: string) => {
    const text = `Bridgewell CRM Login Details:\nPortal: ${window.location.origin}\nEmail: ${email}\nPassword: ${pass}`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const totalCounselorsCount = employees.filter(e => e.role !== 'manager').length
  const activeCounselorsCount = employees.filter(e => e.role === 'counselor' && e.active).length
  const managersCount = employees.filter(e => e.role === 'manager').length
  const onlineCounselorsCount = employees.filter(e => e.role !== 'manager' && e.effective_status === 'online').length
  
  const counselorIdsLoggedInToday = useMemo(() => {
    const ids = new Set<string>()
    loginLogs.forEach(l => {
      if (l.time && isSameDayAsToday(l.time)) {
        ids.add(l.user_id)
      }
    })
    return ids
  }, [loginLogs])

  const counselorsPresentTodayCount = employees.filter(
    e => e.role !== 'manager' && (counselorIdsLoggedInToday.has(e.id) || e.today_login_time)
  ).length

  const activeOnlineCount = employees.filter(e => e.effective_status === 'online').length

  const pendingCounselorsToday = employees.filter(
    e => e.role !== 'manager' && e.active && !counselorIdsLoggedInToday.has(e.id) && !e.today_login_time
  )

  const earliestClockIn = useMemo(() => {
    const todayActs = loginLogs
      .filter(l => l.time && isSameDayAsToday(l.time))
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
    if (todayActs.length === 0) return null
    const first = todayActs[0]
    try {
      const timeStr = new Date(first.time).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      })
      return { time: timeStr, counselorName: first.user_name || 'Counselor' }
    } catch {
      return null
    }
  }, [loginLogs])

  const filteredLoginLogs = useMemo(() => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    return loginLogs.filter(log => {
      if (selectedCounselorFilter !== 'all' && log.user_id !== selectedCounselorFilter) {
        return false
      }

      if (attendanceDateFilter !== 'all' && log.time) {
        if (attendanceDateFilter === 'today' && !isSameDayAsToday(log.time)) return false
        if (attendanceDateFilter === 'yesterday' && !isSameDayAsYesterday(log.time)) return false
        if (attendanceDateFilter === '7days' && new Date(log.time) < sevenDaysAgo) return false
        if (attendanceDateFilter === '30days' && new Date(log.time) < thirtyDaysAgo) return false
      }

      if (attendanceSearch.trim()) {
        const q = attendanceSearch.toLowerCase()
        const nameMatch = log.user_name?.toLowerCase().includes(q)
        const emailMatch = log.user_email?.toLowerCase().includes(q)
        const textMatch = log.text?.toLowerCase().includes(q)
        if (!nameMatch && !emailMatch && !textMatch) return false
      }

      return true
    })
  }, [loginLogs, selectedCounselorFilter, attendanceDateFilter, attendanceSearch])

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFD] p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight flex items-center gap-2.5 flex-wrap">
              <span>Team & Staff</span>
              <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2.5 py-0.5 rounded-full border border-gray-200">
                {employees.length} {employees.length === 1 ? 'member' : 'members'}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Realtime Sync
              </span>
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Create unique login accounts for employees, monitor daily counselor login timings, and manage access.
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Link
              href="/reassign"
              className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-2xs shrink-0"
            >
              <ArrowLeftRight size={15} className="text-indigo-600" />
              <span>Lead Reassignment (Drag & Drop)</span>
            </Link>

            {teamTab === 'members' && (
              <button
                onClick={() => {
                  setCreatedSuccess(null)
                  setAddError('')
                  setShowAddModal(true)
                }}
                className="inline-flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm shrink-0"
              >
                <UserPlus size={16} />
                <span>Add Employee</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-8 gap-6 overflow-x-auto">
          <button
            onClick={() => setTeamTab('members')}
            className={`pb-3.5 px-1 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              teamTab === 'members'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Users size={16} />
            <span>Employee Accounts ({employees.length})</span>
          </button>

          <button
            onClick={() => setTeamTab('attendance')}
            className={`pb-3.5 px-1 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              teamTab === 'attendance'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Clock size={16} className="text-emerald-600" />
            <span>Daily Attendance & Timings</span>
            {counselorsPresentTodayCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {counselorsPresentTodayCount} Present Today
              </span>
            )}
          </button>

          <button
            onClick={() => setTeamTab('leaderboard')}
            className={`pb-3.5 px-1 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              teamTab === 'leaderboard'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Trophy size={16} className="text-amber-500" />
            <span>Calling Performance Leaderboard</span>
          </button>
        </div>

        {teamTab === 'leaderboard' && <LeaderboardSection />}

        {/* Attendance Tab View */}
        {teamTab === 'attendance' && (
          <div className="space-y-6">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              {/* 1. Present Today */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 size={16} />
                  </div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Present Today</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {counselorsPresentTodayCount} <span className="text-sm font-normal text-gray-500">/ {totalCounselorsCount}</span>
                </p>
                <p className="text-xs text-emerald-600 font-medium mt-1">
                  {totalCounselorsCount > 0 ? Math.round((counselorsPresentTodayCount / totalCounselorsCount) * 100) : 0}% Counselors Logged In
                </p>
              </div>

              {/* 2. Active Now */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                    <Activity size={16} />
                  </div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Right Now</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900">{activeOnlineCount}</p>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online heartbeats active
                </p>
              </div>

              {/* 3. Earliest Clock-In */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                    <Clock size={16} />
                  </div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Earliest Clock-In</h3>
                </div>
                <p className="text-xl font-bold text-gray-900 truncate">
                  {earliestClockIn ? earliestClockIn.time : 'None yet'}
                </p>
                <p className="text-xs text-gray-500 truncate mt-1">
                  {earliestClockIn ? earliestClockIn.counselorName : 'No logins recorded today'}
                </p>
              </div>

              {/* 4. Yet to Clock-In */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-600">
                    <AlertCircle size={16} />
                  </div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Yet to Clock-In</h3>
                </div>
                <p className="text-2xl font-bold text-gray-900">{pendingCounselorsToday.length}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {pendingCounselorsToday.length === 0 ? 'All counselors active!' : 'Staff pending login'}
                </p>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Date Pill Filters */}
              <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg w-full md:w-auto overflow-x-auto">
                {(['today', 'yesterday', '7days', '30days', 'all'] as const).map((filterKey) => {
                  const labels: Record<string, string> = {
                    today: 'Today',
                    yesterday: 'Yesterday',
                    '7days': 'Last 7 Days',
                    '30days': 'Last 30 Days',
                    all: 'All Time'
                  }
                  const active = attendanceDateFilter === filterKey
                  return (
                    <button
                      key={filterKey}
                      onClick={() => setAttendanceDateFilter(filterKey)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                        active ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {labels[filterKey]}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                {/* Counselor Selector */}
                <div className="relative min-w-[200px]">
                  <select
                    value={selectedCounselorFilter}
                    onChange={(e) => setSelectedCounselorFilter(e.target.value)}
                    className="w-full appearance-none bg-white border border-gray-200 text-gray-800 rounded-lg px-3 py-2 text-xs font-medium focus:ring-2 focus:ring-black outline-none"
                  >
                    <option value="all">All Counselors & Staff</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.name} ({e.role})</option>
                    ))}
                  </select>
                </div>

                {/* Search */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search counselor..."
                    value={attendanceSearch}
                    onChange={(e) => setAttendanceSearch(e.target.value)}
                    className="w-48 bg-white border border-gray-200 text-gray-800 rounded-lg pl-8 pr-3 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                  />
                  <Search size={13} className="absolute left-2.5 top-2.5 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Counselor Daily Login Timings</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Exact clock-in timestamps recorded whenever a counselor logs in</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                  {filteredLoginLogs.length} Records Found
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50/80 text-gray-500 font-semibold border-b border-gray-100">
                    <tr>
                      <th className="py-3 px-6">Counselor / Staff</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Exact Clock-In Time</th>
                      <th className="py-3 px-4">Live Status</th>
                      <th className="py-3 px-4">Activity Note</th>
                      <th className="py-3 px-6 text-right">Audit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLoginLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-gray-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Clock size={28} className="text-gray-300" />
                            <span>No login records match the selected date or counselor filter.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredLoginLogs.map((log) => {
                        const dateObj = new Date(log.time)
                        const dateStr = dateObj.toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })
                        const timeStr = dateObj.toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true
                        })

                        const emp = employees.find(e => e.id === log.user_id)
                        const status = emp?.effective_status || 'offline'

                        return (
                          <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                                  {log.user_name ? log.user_name.slice(0, 2).toUpperCase() : 'ST'}
                                </div>
                                <div>
                                  <div className="font-semibold text-gray-900">{log.user_name}</div>
                                  <div className="text-[11px] text-gray-400">{log.user_email} • <span className="capitalize">{log.user_role}</span></div>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-4 font-medium text-gray-700 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} className="text-gray-400" />
                                <span>{dateStr}</span>
                              </div>
                            </td>

                            <td className="py-4 px-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                                <Clock size={13} className="text-emerald-600" />
                                <span>{timeStr}</span>
                              </span>
                            </td>

                            <td className="py-4 px-4 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                                status === 'online'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : status === 'idle'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-gray-100 text-gray-600 border border-gray-200'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  status === 'online' ? 'bg-emerald-500 animate-pulse' : status === 'idle' ? 'bg-amber-500' : 'bg-gray-400'
                                }`}></span>
                                {status === 'online' ? 'Active Now' : status === 'idle' ? 'Idle (5m+)' : 'Offline'}
                              </span>
                            </td>

                            <td className="py-4 px-4 text-gray-600 max-w-sm truncate" title={log.text || ''}>
                              <span className="bg-gray-50 border border-gray-100 px-2.5 py-1 rounded-md text-[11px]">
                                {log.text || `User logged in at ${timeStr}`}
                              </span>
                            </td>

                            <td className="py-4 px-6 text-right whitespace-nowrap">
                              <Link
                                href={`/activity?counselor=${log.user_id}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-black hover:underline"
                              >
                                <span>Timeline</span>
                                <ArrowUpRight size={12} />
                              </Link>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Members Tab View */}
        {teamTab === 'members' && (
          <>
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users size={15} className="text-blue-500" />
                </div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Staff</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">{employees.length}</p>
              <p className="text-xs text-gray-500 mt-1">
                {totalCounselorsCount} counselors • {managersCount} managers
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <PhoneCall size={15} className="text-emerald-500" />
                </div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Counselors on Duty</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-emerald-600">{onlineCounselorsCount}</p>
                <span className="text-sm font-medium text-gray-400">/ {totalCounselorsCount} active</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {onlineCounselorsCount > 0
                  ? `${onlineCounselorsCount} online right now • ${Math.max(0, totalCounselorsCount - onlineCounselorsCount)} offline`
                  : `0 online right now • ${totalCounselorsCount} offline`}
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                  <Shield size={15} className="text-purple-500" />
                </div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admins / Managers</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900">{managersCount}</p>
              <p className="text-xs text-gray-500 mt-1">
                {employees.filter(e => e.role === 'manager' && e.effective_status === 'online').length} online right now
              </p>
            </div>
          </div>

        {/* Employee List Table */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">All Employees & Logins</h2>
              <span className="text-xs text-gray-400">Live work status and daily clock-in times for all team members</span>
            </div>
            <span className="text-xs text-gray-400">Each employee uses their personal email to login</span>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
            </div>
          ) : employees.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              No employees registered yet. Click &ldquo;Add Employee&rdquo; to create your first team login.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {employees.map((emp) => {
                const isPrimaryAdmin = emp.email === 'admin@bridgewell.com'
                return (
                  <div
                    key={emp.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-semibold text-sm ${
                        emp.role === 'manager' 
                          ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}>
                        {emp.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-gray-900">{emp.name}</h3>
                          {isPrimaryAdmin && (
                            <span className="text-[10px] uppercase font-bold tracking-wider bg-gray-900 text-white px-2 py-0.5 rounded">
                              Super Admin
                            </span>
                          )}
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                            emp.role === 'manager'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {emp.role === 'manager' ? 'Manager' : 'Counselor'}
                          </span>
                          {!emp.active && (
                            <span className="text-[11px] font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full border border-red-200">
                              Inactive
                            </span>
                          )}

                          {/* Live Presence Status Pill */}
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            emp.effective_status === 'online'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : emp.effective_status === 'idle'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-gray-100 text-gray-500 border border-gray-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              emp.effective_status === 'online'
                                ? 'bg-emerald-500 animate-pulse'
                                : emp.effective_status === 'idle'
                                ? 'bg-amber-500'
                                : 'bg-gray-400'
                            }`}></span>
                            {emp.effective_status === 'online' ? 'Active Now' : emp.effective_status === 'idle' ? 'Idle' : 'Offline'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Mail size={12} className="text-gray-400" />
                            <strong className="text-gray-700 font-medium">{emp.email}</strong>
                          </span>
                          <span>•</span>
                          <span>{emp.leads_count || 0} leads assigned</span>
                          <span>•</span>

                          {/* Today's Exact Clock-In Time */}
                          {emp.today_login_time ? (
                            <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Clock size={11} className="text-emerald-600" />
                              <span>Login Today: <strong>{emp.today_login_time}</strong></span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-200">
                              <Clock size={11} className="text-gray-400" />
                              <span>Not logged in today</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      <button
                        onClick={() => {
                          setSelectedCounselorFilter(emp.id)
                          setTeamTab('attendance')
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                        title="View Daily Attendance & Exact Login Timings"
                      >
                        <Clock size={13} className="text-indigo-600" />
                        <span>Attendance Log</span>
                      </button>

                      {!isPrimaryAdmin && (
                        <button
                          onClick={() => handleToggleStatus(emp)}
                          title={emp.active ? 'Deactivate Account' : 'Activate Account'}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            emp.active
                              ? 'border-gray-200 text-gray-600 hover:bg-gray-100'
                              : 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                        >
                          {emp.active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenResetPassword(emp)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                        title="Change Login Password"
                      >
                        <KeyRound size={13} className="text-gray-500" />
                        <span>Reset Password</span>
                      </button>

                      {!isPrimaryAdmin && (
                        <button
                          onClick={() => handleDeleteEmployee(emp)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete Employee Account"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
      )}

      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-gray-900" />
                <h3 className="text-base font-semibold text-gray-900">Add New Employee</h3>
              </div>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            {createdSuccess ? (
              <div className="p-6 space-y-5">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                  <CheckCircle2 size={24} />
                </div>
                <div className="text-center">
                  <h4 className="text-base font-semibold text-gray-900">Account Created Successfully!</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Share these credentials with {createdSuccess.name} so they can sign in.
                  </p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center py-1 border-b border-gray-200">
                    <span className="text-gray-500">Login Email:</span>
                    <span className="font-mono font-semibold text-gray-900">{createdSuccess.email}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-gray-500">Password:</span>
                    <span className="font-mono font-semibold text-gray-900">{createdSuccess.password}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyCredentials(createdSuccess.email, createdSuccess.password)}
                  className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white py-2.5 rounded-lg text-xs font-medium transition-all"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copied ? 'Credentials Copied to Clipboard!' : 'Copy Login Details to Clipboard'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCreatedSuccess(null)
                    setShowAddModal(false)
                  }}
                  className="w-full border border-gray-200 hover:bg-gray-50 text-gray-700 py-2.5 rounded-lg text-xs font-medium transition-all"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleAddEmployee} className="p-6 space-y-4">
                {addError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg flex items-center gap-2">
                    <XCircle size={14} className="shrink-0" />
                    <span>{addError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Full Name *</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={addName}
                      onChange={e => setAddName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Work Email (Login ID) *</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={addEmail}
                      onChange={e => setAddEmail(e.target.value)}
                      placeholder="rahul@bridgewell.com"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Initial Password *</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      required
                      value={addPassword}
                      onChange={e => setAddPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-gray-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    value={addRole}
                    onChange={e => setAddRole(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-gray-900"
                  >
                    <option value="counselor">Counselor (Views & manages assigned leads)</option>
                    <option value="manager">Manager / Admin (Full access to all leads, team, & settings)</option>
                  </select>
                </div>

                <div className="pt-3 flex justify-end gap-2 border-t border-gray-100 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="px-5 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-lg shadow-sm transition-all disabled:opacity-50"
                  >
                    {addLoading ? 'Creating...' : 'Create Employee Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showPasswordModal && selectedEmployee && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-gray-900" />
                <h3 className="text-base font-semibold text-gray-900">Reset Password</h3>
              </div>
              <button 
                onClick={() => setShowPasswordModal(false)}
                className="text-gray-400 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            {resetSuccess ? (
              <div className="p-6 space-y-4 text-center">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto border border-emerald-100">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Password Updated!</h4>
                  <p className="text-xs text-gray-500 mt-1">
                    Password for {selectedEmployee.name} ({selectedEmployee.email}) has been updated.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="w-full bg-black text-white py-2 rounded-lg text-xs font-medium"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="p-6 space-y-4">
                <p className="text-xs text-gray-500">
                  Enter a new login password for <strong>{selectedEmployee.name}</strong> ({selectedEmployee.email}).
                </p>

                {resetError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg">
                    {resetError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">New Password *</label>
                  <input
                    type="text"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-gray-900"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="px-5 py-2 text-xs font-medium text-white bg-black hover:bg-gray-800 rounded-lg shadow-sm transition-all disabled:opacity-50"
                  >
                    {resetLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

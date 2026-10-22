'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Crown, Users, User, PhoneCall, Flame, Award, Clock,
  ArrowRight, ArrowLeftRight, CheckCircle2, AlertCircle, Search,
  ExternalLink, Sparkles, RefreshCw, Phone, UserCheck, Shield
} from 'lucide-react'
import Link from 'next/link'
import { parseUserTeamMeta } from '@/lib/teamHelper'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  languages?: string
  last_active_at?: string
  last_login_at?: string
  effective_status: 'online' | 'idle' | 'offline'
  today_login_time: string | null
  total_leads: number
  hot_leads: number
  enrolled_leads: number
  calls_today: number
}

interface TeamLeaderDashboardSectionProps {
  currentUser: any
}

export default function TeamLeaderDashboardSection({ currentUser }: TeamLeaderDashboardSectionProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [myPoolCount, setMyPoolCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'idle' | 'offline'>('all')
  const [refreshing, setRefreshing] = useState(false)

  const tlMeta = useMemo(() => parseUserTeamMeta(currentUser?.languages), [currentUser?.languages])
  const teamName = tlMeta.team_name || `${currentUser?.name || 'Leader'}'s Team`

  const fetchTeamData = async () => {
    if (!currentUser) return
    try {
      // 1. Fetch all counselors & team users
      const { data: usersData, error: usersErr } = await supabase
        .from('users')
        .select('*')
        .order('name', { ascending: true })

      if (usersErr) throw usersErr

      const allUsers = usersData || []

      // 2. Determine member IDs assigned to this Team Leader
      const directMemberIds = new Set<string>(tlMeta.member_ids || [])
      const matchedMembers = allUsers.filter(u => {
        if (u.id === currentUser.id) return false // exclude the leader themselves from the member list
        if (directMemberIds.has(u.id)) return true
        const cMeta = parseUserTeamMeta(u.languages)
        return cMeta.team_leader_id === currentUser.id
      })

      const memberIds = matchedMembers.map(m => m.id)
      const allScopeIds = [currentUser.id, ...memberIds]

      // 3. Fetch leads for this team scope
      const { data: leadsData } = await supabase
        .from('leads')
        .select('id, owner_id, stage, priority, created_at')
        .in('owner_id', allScopeIds)

      const leads = leadsData || []

      // Leads in TL's personal pool (assigned by admin to TL to be distributed)
      const poolLeads = leads.filter(l => l.owner_id === currentUser.id)
      setMyPoolCount(poolLeads.length)

      // Map leads by member
      const memberLeadsMap: Record<string, { total: number; hot: number; enrolled: number }> = {}
      memberIds.forEach(id => {
        memberLeadsMap[id] = { total: 0, hot: 0, enrolled: 0 }
      })

      leads.forEach(l => {
        if (l.owner_id && memberLeadsMap[l.owner_id]) {
          memberLeadsMap[l.owner_id].total++
          if (l.priority === 'Hot') memberLeadsMap[l.owner_id].hot++
          if (l.stage === 'Enrolled') memberLeadsMap[l.owner_id].enrolled++
        }
      })

      // 4. Fetch today's activities (calls and logins)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayISO = today.toISOString()

      const { data: actsData } = await supabase
        .from('activities')
        .select('id, user_id, type, time')
        .in('user_id', allScopeIds)
        .gte('time', todayISO)

      const acts = actsData || []

      // Map calls today and logins today
      const callsCountMap: Record<string, number> = {}
      const firstLoginMap: Record<string, string> = {}

      acts.forEach(a => {
        if (!a.user_id) return
        if (a.type === 'call') {
          callsCountMap[a.user_id] = (callsCountMap[a.user_id] || 0) + 1
        }
        if (a.type === 'login' && a.time) {
          if (!firstLoginMap[a.user_id] || new Date(a.time) < new Date(firstLoginMap[a.user_id])) {
            firstLoginMap[a.user_id] = a.time
          }
        }
      })

      // 5. Enrich members
      const enrichedMembers: TeamMember[] = matchedMembers.map(u => {
        let effStatus: 'online' | 'idle' | 'offline' = u.status || 'offline'
        if (u.last_active_at) {
          const diffMins = (Date.now() - new Date(u.last_active_at).getTime()) / (1000 * 60)
          if (diffMins > 20) {
            effStatus = 'offline'
          } else if (diffMins > 5) {
            effStatus = 'idle'
          } else {
            effStatus = 'online'
          }
        }

        const loginIso = firstLoginMap[u.id] || (u.last_login_at && new Date(u.last_login_at) >= today ? u.last_login_at : null)
        let loginFormatted: string | null = null
        if (loginIso) {
          try {
            loginFormatted = new Date(loginIso).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
            })
          } catch {}
        }

        const stats = memberLeadsMap[u.id] || { total: 0, hot: 0, enrolled: 0 }

        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          active: u.active ?? true,
          languages: u.languages,
          last_active_at: u.last_active_at,
          last_login_at: u.last_login_at,
          effective_status: effStatus,
          today_login_time: loginFormatted,
          total_leads: stats.total,
          hot_leads: stats.hot,
          enrolled_leads: stats.enrolled,
          calls_today: callsCountMap[u.id] || 0
        }
      })

      setMembers(enrichedMembers)
    } catch (err) {
      console.error('Failed to fetch team data for team leader section:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchTeamData()

    // Realtime subscription
    const channel = supabase
      .channel('tl-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchTeamData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => fetchTeamData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => fetchTeamData())
      .subscribe()

    const interval = setInterval(fetchTeamData, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [currentUser?.id, currentUser?.languages])

  // Summary Metrics
  const onlineCount = members.filter(m => m.effective_status === 'online').length
  const idleCount = members.filter(m => m.effective_status === 'idle').length
  const totalTeamLeads = members.reduce((sum, m) => sum + m.total_leads, 0)
  const totalTeamHot = members.reduce((sum, m) => sum + m.hot_leads, 0)
  const totalTeamEnrolled = members.reduce((sum, m) => sum + m.enrolled_leads, 0)
  const totalCallsToday = members.reduce((sum, m) => sum + m.calls_today, 0)

  // Filtered members list
  const filteredMembers = members.filter(m => {
    if (statusFilter !== 'all' && m.effective_status !== statusFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
    }
    return true
  })

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden mb-8">
      {/* Top Banner Header */}
      <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
              <Crown size={22} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">
                  {teamName}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <Crown size={11} /> Team Leader Dashboard
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Live Team Presence
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                Realtime roster of counselors under your leadership, their calling activity, and assigned lead pipelines.
              </p>
            </div>
          </div>

          {/* Quick Action buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => {
                setRefreshing(true)
                fetchTeamData()
              }}
              title="Refresh Team Roster"
              className="p-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:text-gray-900 transition-all shadow-2xs"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>

            <Link
              href="/reassign"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-amber-600/20"
            >
              <ArrowLeftRight size={13} />
              <span>Reassignment Board</span>
            </Link>

            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-semibold transition-all shadow-2xs"
            >
              <span>All Team Leads</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="p-5 sm:p-6 bg-gray-50/50 border-b border-gray-200 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Team Members */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Team Members</span>
            <Users size={14} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-gray-900">{members.length}</span>
            <span className="text-[11px] text-emerald-600 font-bold">({onlineCount} online)</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Counselors on duty</p>
        </div>

        {/* 2. My Allocated Pool */}
        <Link
          href="/reassign"
          className="bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200 hover:border-amber-400 rounded-xl p-3.5 shadow-2xs transition-all group"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1">
              <Crown size={11} className="text-amber-600" /> My Pool
            </span>
            <ArrowRight size={13} className="text-amber-500 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-800">{myPoolCount}</span>
            <span className="text-[10px] font-bold text-amber-700 uppercase bg-amber-100/80 px-1 rounded">to assign</span>
          </div>
          <p className="text-[10px] text-amber-700 font-medium mt-0.5">Distribute to team →</p>
        </Link>

        {/* 3. Team Active Leads */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Assigned Leads</span>
            <UserCheck size={14} className="text-blue-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-gray-900">{totalTeamLeads}</span>
            <span className="text-[10px] text-gray-400">active</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Across counselors</p>
        </div>

        {/* 4. Hot Leads */}
        <div className="bg-white border border-rose-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">Hot Leads</span>
            <Flame size={14} className="text-rose-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-rose-600">{totalTeamHot}</span>
            <span className="text-[10px] text-rose-500 font-semibold">high priority</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Requires immediate calls</p>
        </div>

        {/* 5. Team Enrollments */}
        <div className="bg-white border border-emerald-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Enrolled</span>
            <Award size={14} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-700">{totalTeamEnrolled}</span>
            <span className="text-[10px] text-emerald-600 font-semibold">students</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Converted admissions</p>
        </div>

        {/* 6. Calls Today */}
        <div className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Calls Today</span>
            <PhoneCall size={14} className="text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-gray-900">{totalCallsToday}</span>
            <span className="text-[10px] text-gray-400">outreach</span>
          </div>
          <p className="text-[10px] text-gray-400 mt-0.5">Logged team calls</p>
        </div>
      </div>

      {/* Roster Controls: Search & Presence Filter */}
      <div className="p-4 sm:px-6 bg-white border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
            Team Roster ({filteredMembers.length})
          </h3>
          <span className="text-xs text-gray-400">· Counselors currently assigned to your team</span>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status filter tabs */}
          <div className="inline-flex bg-gray-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'all' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All ({members.length})
            </button>
            <button
              onClick={() => setStatusFilter('online')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                statusFilter === 'online' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Online ({onlineCount})
            </button>
            <button
              onClick={() => setStatusFilter('idle')}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                statusFilter === 'idle' ? 'bg-white text-amber-700 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Idle ({idleCount})
            </button>
            <button
              onClick={() => setStatusFilter('offline')}
              className={`px-2.5 py-1 rounded-md transition-all ${
                statusFilter === 'offline' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              Offline ({members.length - onlineCount - idleCount})
            </button>
          </div>

          {/* Search box */}
          <div className="relative min-w-[200px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search member..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-black bg-gray-50/50"
            />
          </div>
        </div>
      </div>

      {/* Member Roster Grid */}
      <div className="p-5 sm:p-6 bg-white">
        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-center">
            <RefreshCw size={24} className="text-gray-400 animate-spin mb-2" />
            <p className="text-xs text-gray-500 font-medium">Loading your team members...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center text-center border border-dashed border-gray-200 rounded-xl p-6">
            <Users size={32} className="text-gray-300 mb-2" />
            <h4 className="text-sm font-bold text-gray-800">
              {members.length === 0 ? 'No Counselors in Your Team Yet' : 'No Members Match Filter'}
            </h4>
            <p className="text-xs text-gray-500 max-w-md mt-1">
              {members.length === 0
                ? 'Your Admin or Manager can allocate counselors to your team from the Team & Staff page. Once assigned, their presence and leads will appear here.'
                : 'Try clearing your search query or switching to "All" status filter to see all team members.'}
            </p>
            {myPoolCount > 0 && (
              <Link
                href="/reassign"
                className="mt-3.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                <span>View {myPoolCount} leads in your pool</span>
                <ArrowRight size={12} />
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredMembers.map(member => {
              const isOnline = member.effective_status === 'online'
              const isIdle = member.effective_status === 'idle'

              return (
                <div
                  key={member.id}
                  className="bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 shadow-2xs hover:shadow-sm transition-all group flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Avatar, Name & Live Status */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-gray-100 to-gray-200 border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-700 shrink-0">
                            {member.name.slice(0, 2).toUpperCase()}
                          </div>
                          {/* Live Presence Dot */}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center ${
                              isOnline ? 'bg-emerald-500' : isIdle ? 'bg-amber-400' : 'bg-gray-300'
                            }`}
                          >
                            {isOnline && (
                              <span className="w-full h-full rounded-full bg-emerald-400 animate-ping opacity-75"></span>
                            )}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-gray-900 truncate group-hover:text-amber-700 transition-colors">
                            {member.name}
                          </h4>
                          <p className="text-[11px] text-gray-400 truncate">{member.email}</p>
                        </div>
                      </div>

                      {/* Status Pill */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
                          isOnline
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : isIdle
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOnline ? 'bg-emerald-500 animate-pulse' : isIdle ? 'bg-amber-400' : 'bg-gray-400'
                          }`}
                        ></span>
                        {isOnline ? 'Active Now' : isIdle ? 'Idle' : 'Offline'}
                      </span>
                    </div>

                    {/* Today's Login Time */}
                    <div className="mb-3 flex items-center gap-1.5 text-[11px] text-gray-600 bg-gray-50 px-2.5 py-1 rounded-lg border border-gray-100">
                      <Clock size={12} className="text-gray-400 shrink-0" />
                      <span className="font-medium">Clock-in:</span>
                      {member.today_login_time ? (
                        <span className="font-bold text-emerald-700">{member.today_login_time}</span>
                      ) : (
                        <span className="text-gray-400 italic">Not logged in today</span>
                      )}
                    </div>

                    {/* Metrics 4-Grid */}
                    <div className="grid grid-cols-4 gap-1.5 mb-3.5 text-center">
                      <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <span className="block text-[10px] text-gray-500 font-semibold uppercase">Leads</span>
                        <span className="block text-sm font-black text-gray-900 mt-0.5">{member.total_leads}</span>
                      </div>
                      <div className="bg-rose-50/60 p-2 rounded-lg border border-rose-100">
                        <span className="block text-[10px] text-rose-700 font-bold uppercase">Hot</span>
                        <span className="block text-sm font-black text-rose-600 mt-0.5">{member.hot_leads}</span>
                      </div>
                      <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                        <span className="block text-[10px] text-emerald-700 font-bold uppercase">Enrolled</span>
                        <span className="block text-sm font-black text-emerald-700 mt-0.5">{member.enrolled_leads}</span>
                      </div>
                      <div className="bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                        <span className="block text-[10px] text-indigo-700 font-bold uppercase">Calls</span>
                        <span className="block text-sm font-black text-indigo-700 mt-0.5">{member.calls_today}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                    <Link
                      href={`/leads?counselor=${member.id}`}
                      className="flex-1 text-center py-1.5 px-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                    >
                      <span>View Leads</span>
                      <ExternalLink size={10} />
                    </Link>

                    <Link
                      href={`/reassign?counselor=${member.id}`}
                      className="flex-1 text-center py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1"
                    >
                      <ArrowLeftRight size={10} />
                      <span>Reassign</span>
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

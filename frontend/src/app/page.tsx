'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Activity, TrendingUp, Users, Clock, ArrowRight, Flame } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthWrapper'
import LeaderboardSection from '@/components/LeaderboardSection'

export default function Dashboard() {
  const [stats, setStats] = useState({ total: 0, newToday: 0, enrolled: 0, overdue: 0, hot: 0 })
  const [recentLeads, setRecentLeads] = useState<any[]>([])
  const { user } = useAuth()

  useEffect(() => {
    async function loadDashboard() {
      const isCounselor = user?.role === 'counselor'
      const matchOpts = isCounselor ? { owner_id: user.id } : {}

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const nowISO = new Date().toISOString()

      // Execute all 5 count queries + recent leads in parallel
      const [
        { count: total },
        { count: newToday },
        { count: enrolled },
        { count: overdue },
        { count: hot },
        { data: recentData }
      ] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).match(matchOpts),
        supabase.from('leads').select('id', { count: 'exact', head: true }).match(matchOpts).gte('created_at', today.toISOString()),
        supabase.from('leads').select('id', { count: 'exact', head: true }).match(matchOpts).eq('stage', 'Enrolled'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).match(matchOpts).lt('next_follow_up', nowISO),
        supabase.from('leads').select('id', { count: 'exact', head: true }).match(matchOpts).eq('priority', 'Hot'),
        (() => {
          let q = supabase
            .from('leads')
            .select('id, name, phone, email, stage, priority, country, course, created_at')
            .order('created_at', { ascending: false })
            .limit(5)
          if (isCounselor) q = q.eq('owner_id', user.id)
          return q
        })(),
      ])

      setStats({
        total: total || 0,
        newToday: newToday || 0,
        enrolled: enrolled || 0,
        overdue: overdue || 0,
        hot: hot || 0,
      })

      setRecentLeads(recentData || [])
    }
    
    if (user) {
      loadDashboard()

      // Realtime listener for leads, activities, assignments, and users
      const channel = supabase
        .channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          loadDashboard()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
          loadDashboard()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
          loadDashboard()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
          loadDashboard()
        })
        .subscribe()

      const interval = setInterval(loadDashboard, 15000)

      return () => {
        supabase.removeChannel(channel)
        clearInterval(interval)
      }
    }
  }, [user])

  return (
    <main className="flex-1 overflow-auto bg-[#FDFDFD] p-6 lg:p-8 animate-in fade-in duration-300">
      <header className="mb-6 flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight mb-1">Overview</h1>
          <p className="text-gray-500 text-sm">Here&apos;s what&apos;s happening with your leads today.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live Realtime Sync
        </span>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-6">
        <Link href="/leads" className="bg-white border border-gray-200 hover:border-gray-300 hover:shadow-md rounded-xl p-5 shadow-sm transition-all group">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <Users size={15} className="text-gray-500" />
            </div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Leads</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
        </Link>
        
        <Link href="/leads?priority=Hot" className="bg-white border border-rose-200 hover:border-rose-300 hover:shadow-md rounded-xl p-5 shadow-sm transition-all group">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
              <Flame size={15} className="text-rose-500" />
            </div>
            <h3 className="text-xs font-semibold text-rose-600 uppercase tracking-wide">Hot Leads</h3>
          </div>
          <p className="text-3xl font-bold text-rose-600">{stats.hot}</p>
        </Link>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Activity size={15} className="text-blue-500" />
            </div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Today</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.newToday}</p>
        </div>

        <div className="bg-white border border-emerald-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <TrendingUp size={15} className="text-emerald-600" />
            </div>
            <h3 className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Enrolled</h3>
          </div>
          <p className="text-3xl font-bold text-emerald-700">{stats.enrolled}</p>
        </div>

        <Link href="/tasks" className="bg-white border border-gray-200 hover:border-red-200 rounded-xl p-5 shadow-sm transition-all">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
              <Clock size={15} className="text-red-500" />
            </div>
            <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wide">Overdue</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.overdue}</p>
        </Link>
      </div>

      {/* Live Calling Leaderboard & Counselor Performance */}
      <div className="mb-6">
        <LeaderboardSection />
      </div>

      {/* Recent Leads */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-sm font-bold text-gray-900">Recent Leads</h3>
          <Link href="/leads" className="text-xs font-semibold text-gray-400 hover:text-black flex items-center gap-1 transition-colors">View all <ArrowRight size={12}/></Link>
        </div>
        <div className="divide-y divide-gray-100">
          {recentLeads.map(lead => (
            <Link href={`/leads/${lead.id}`} key={lead.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors group">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">{lead.name}</p>
                  {lead.priority && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                      lead.priority === 'Hot'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : lead.priority === 'Warm'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                      {lead.priority === 'Hot' ? '🔥 Hot' : lead.priority === 'Warm' ? '☀️ Warm' : '❄️ Cold'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{lead.programme_level || 'No programme'} · {lead.source}</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-600 shrink-0 ml-3">
                {lead.stage}
              </span>
            </Link>
          ))}
          {recentLeads.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-10">No leads found.</p>
          )}
        </div>
      </div>
    </main>
  )
}

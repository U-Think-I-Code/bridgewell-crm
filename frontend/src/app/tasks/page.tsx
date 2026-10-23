'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Calendar, CheckCircle2, Clock, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/components/AuthWrapper'

export default function TasksPage() {
  const [overdueLeads, setOverdueLeads] = useState<any[]>([])
  const [todayLeads, setTodayLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  useEffect(() => {
    async function fetchTasks() {
      const now = new Date()
      
      const startOfToday = new Date()
      startOfToday.setHours(0,0,0,0)
      
      const endOfToday = new Date()
      endOfToday.setHours(23,59,59,999)

      let overdueQuery = supabase.from('leads')
        .select('*').not('next_follow_up', 'is', null)
        .neq('stage', 'Enrolled')
        .lt('next_follow_up', now.toISOString())
        .order('next_follow_up', { ascending: true })

      let todayQuery = supabase.from('leads')
        .select('*').not('next_follow_up', 'is', null)
        .neq('stage', 'Enrolled')
        .gte('next_follow_up', now.toISOString())
        .lte('next_follow_up', endOfToday.toISOString())
        .order('next_follow_up', { ascending: true })

      if (user?.role === 'counselor') {
        overdueQuery = overdueQuery.eq('owner_id', user.id)
        todayQuery = todayQuery.eq('owner_id', user.id)
      }

      const { data: overdue } = await overdueQuery
      const { data: today } = await todayQuery

      setOverdueLeads(overdue || [])
      setTodayLeads(today || [])
      setLoading(false)
    }
    if (user) {
      fetchTasks()

      // Realtime listener on leads, activities, assignments
      const channel = supabase
        .channel('tasks-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
          fetchTasks()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activities' }, () => {
          fetchTasks()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
          fetchTasks()
        })
        .subscribe()

      const interval = setInterval(fetchTasks, 15000)

      return () => {
        supabase.removeChannel(channel)
        clearInterval(interval)
      }
    }
  }, [user])

  return (
    <div className="p-8 animate-in fade-in duration-300 flex-1 overflow-auto bg-[#FDFDFD]">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">My Day</h1>
          <p className="text-gray-500 text-xs mt-1">Daily calling tasks and follow-up reminders</p>
        </div>
        
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/calendar"
            className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
          >
            <CalendarDays size={14} className="text-gray-600" />
            <span>Switch to Calendar View</span>
          </Link>
          
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Live Realtime Sync
          </span>
        </div>
      </div>
      
      {loading ? (
        <div className="flex justify-center mt-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4 uppercase tracking-wider">
                <Clock className="text-red-500" size={16} /> Overdue Follow-ups
              </h2>
              {overdueLeads.length > 0 ? (
                <div className="space-y-3">
                  {overdueLeads.map(lead => (
                    <Link href={`/leads/${lead.id}`} key={lead.id} className="block p-4 bg-red-50 border border-red-100 rounded-lg hover:bg-red-100/50 transition-colors">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{lead.name}</span>
                          {lead.priority && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                              lead.priority === 'Hot' ? 'bg-rose-100 text-rose-800 border-rose-200' : lead.priority === 'Warm' ? 'bg-amber-100 text-amber-800 border-amber-200' : lead.priority === 'Cold' ? 'bg-blue-100 text-blue-800 border-blue-200' : lead.priority === 'Callback' ? 'bg-purple-100 text-purple-800 border-purple-200' : lead.priority === 'Ringing' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-gray-100 text-gray-800 border-gray-200'
                            }`}>
                              {lead.priority === 'Hot' ? '🔥 Hot' : lead.priority === 'Warm' ? '☀️ Warm' : lead.priority === 'Cold' ? '❄️ Cold' : lead.priority === 'Callback' ? '📞 Callback' : lead.priority === 'Ringing' ? '🔔 Ringing' : lead.priority}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-red-600 font-medium bg-red-100 px-2 py-0.5 rounded-full">Overdue</span>
                      </div>
                      <p className="text-xs text-gray-600">{lead.phone} • {lead.stage}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 py-8 text-sm text-center bg-gray-50 rounded-lg border border-gray-100">No overdue follow-ups! You&apos;re all caught up.</div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4 uppercase tracking-wider">
                <Calendar className="text-blue-500" size={16} /> Today&apos;s Tasks
              </h2>
              {todayLeads.length > 0 ? (
                <div className="space-y-3">
                  {todayLeads.map(lead => (
                    <Link href={`/leads/${lead.id}`} key={lead.id} className="block p-4 bg-white border border-gray-200 shadow-sm rounded-lg hover:border-gray-300 transition-colors">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 text-sm">{lead.name}</span>
                          {lead.priority && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${
                              lead.priority === 'Hot' ? 'bg-rose-50 text-rose-700 border-rose-200' : lead.priority === 'Warm' ? 'bg-amber-50 text-amber-800 border-amber-200' : lead.priority === 'Cold' ? 'bg-blue-50 text-blue-700 border-blue-200' : lead.priority === 'Callback' ? 'bg-purple-50 text-purple-700 border-purple-200' : lead.priority === 'Ringing' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-50 text-gray-700 border-gray-200'
                            }`}>
                              {lead.priority === 'Hot' ? '🔥 Hot' : lead.priority === 'Warm' ? '☀️ Warm' : lead.priority === 'Cold' ? '❄️ Cold' : lead.priority === 'Callback' ? '📞 Callback' : lead.priority === 'Ringing' ? '🔔 Ringing' : lead.priority}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-0.5 rounded-full">{new Date(lead.next_follow_up).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      <p className="text-xs text-gray-500">{lead.phone} • {lead.stage}</p>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-gray-500 py-8 text-sm text-center bg-gray-50 rounded-lg border border-gray-100">No tasks scheduled for the rest of today.</div>
              )}
            </div>
            
          </div>
          
          <div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm sticky top-0">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-4 uppercase tracking-wider">
                <CheckCircle2 className="text-emerald-500" size={16} /> Completed Today
              </h2>
              <div className="text-gray-500 py-8 text-center bg-gray-50 rounded-lg border border-gray-100 text-xs">
                Activity logging history will appear here.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

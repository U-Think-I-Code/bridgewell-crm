'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Filter, LayoutList, Kanban, Users, ArrowRight, Upload, Flame, SunMedium, Snowflake, Phone, PhoneCall, PhoneOff, XCircle, PhoneForwarded, ArrowLeftRight, GraduationCap, Globe, Calendar } from 'lucide-react'
import { openJustCallDialer, getJustCallDialerUrl } from '@/lib/justcall'
import { formatCountryBadge, matchesCountryFilter, matchesProgrammeFilter } from '@/lib/countryHelper'
import { getLeadServiceType, getServiceBadgeInfo, ServiceTrack } from '@/lib/leadTypeHelper'
import AddLeadModal from '@/components/AddLeadModal'
import CSVImportModal from '@/components/CSVImportModal'
import Link from 'next/link'
import { useAuth } from '@/components/AuthWrapper'
import { useSearchParams, useRouter } from 'next/navigation'
import { canManageLeads, isCounselor, isTeamLeader, parseUserTeamMeta } from '@/lib/teamHelper'

function LeadsContent() {
  const router = useRouter()
  const [leads, setLeads] = useState<any[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list'|'kanban'>('list')
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const searchQuery = searchParams?.get('search') || ''
  const initialPriority = searchParams?.get('priority') || 'ALL'
  const counselorParam = searchParams?.get('counselor') || ''
  const tabParam = searchParams?.get('tab')

  // Tab State: 'active' (Default: excludes Enrolled) | 'enrolled' (Only Enrolled) | 'all' (Master)
  const [activeTab, setActiveTab] = useState<'active' | 'enrolled' | 'all'>(
    tabParam === 'enrolled' ? 'enrolled' : tabParam === 'all' ? 'all' : 'active'
  )

  useEffect(() => {
    if (tabParam === 'enrolled') {
      setActiveTab('enrolled')
    } else if (tabParam === 'all') {
      setActiveTab('all')
    } else {
      setActiveTab('active')
    }
  }, [tabParam])

  const handleTabChange = (t: 'active' | 'enrolled' | 'all') => {
    setActiveTab(t)
    const currentParams = new URLSearchParams(searchParams?.toString() || '')
    if (t === 'active') {
      currentParams.delete('tab')
    } else {
      currentParams.set('tab', t)
    }
    const q = currentParams.toString() ? `?${currentParams.toString()}` : ''
    router.replace(`/leads${q}`, { scroll: false })
  }
  
  // Priority Filter State: 'ALL' | 'Hot' | 'Warm' | 'Cold' | 'UNSET'
  const [selectedPriority, setSelectedPriority] = useState<string>(initialPriority)
  // Call Outcome Filter State: 'ALL' | 'Connected' | 'No Answer' | 'Busy' | 'Wrong Num' | 'UNSET'
  const [selectedOutcome, setSelectedOutcome] = useState<string>('ALL')
  // Country / Ad Target Filter State: 'ALL' | 'USA' | 'UK' | 'Canada' | 'Australia' | etc.
  const countryParam = searchParams?.get('country') || 'ALL'
  const [selectedCountry, setSelectedCountry] = useState<string>(countryParam)
  // Programme / Degree Level Filter State: 'ALL' | 'Master' | 'Bachelor' | 'Doctorate'
  const programmeParam = searchParams?.get('programme') || 'ALL'
  const [selectedProgramme, setSelectedProgramme] = useState<string>(programmeParam)

  // Date Filter State: 'ALL' | 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'custom'
  const dateParam = searchParams?.get('date') || 'ALL'
  const [selectedDatePreset, setSelectedDatePreset] = useState<string>(dateParam)
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  // Service Stream Track: 'all' | 'study_abroad' | 'visa_process'
  const serviceParam = (searchParams?.get('service') as ServiceTrack) || 'all'
  const [serviceTrack, setServiceTrack] = useState<ServiceTrack>(
    serviceParam === 'visa_process' || serviceParam === 'study_abroad' ? serviceParam : 'all'
  )

  useEffect(() => {
    fetchLeads()
    fetchStages()

    // Realtime channel for live updates across counselors and admins
    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchLeads()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages' }, () => {
        fetchStages()
        fetchLeads()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => {
        fetchLeads()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, searchQuery, counselorParam])

  const fetchStages = async () => {
    const { data } = await supabase.from('stages').select('name').order('stage_order', { ascending: true })
    if (data) setStages(data.map(s => s.name))
  }

  const fetchLeads = async () => {
    setLoading(true)
    let query = supabase
      .from('leads')
      .select('id, name, email, phone, country, source, stage, owner_id, next_follow_up, priority, created_at, course, programme_level, last_call_outcome, attempts, metadata, owner:owner_id(name)')
      .order('created_at', { ascending: false })
      .limit(1000)
    
    if (isCounselor(user)) {
      query = query.eq('owner_id', user.id)
    } else if (isTeamLeader(user)) {
      const meta = parseUserTeamMeta(user.languages)
      const allowed = Array.from(new Set([user.id, ...(meta.member_ids || [])]))
      if (counselorParam) {
        query = query.eq('owner_id', counselorParam)
      } else {
        query = query.or(`owner_id.in.(${allowed.join(',')}),owner_id.is.null`)
      }
    } else if (counselorParam) {
      query = query.eq('owner_id', counselorParam)
    }

    if (searchQuery) {
      // Security: Strip commas, parens, quotes to prevent PostgREST filter injection
      const sanitized = searchQuery.replace(/[,()."']/g, '').trim()
      if (sanitized) {
        query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%`)
      }
    }

    const { data, error } = await query
    if (error) console.error('Supabase Error:', error)
    else setLeads(data || [])
    setLoading(false)
  }

  const handleUpdatePriority = async (leadId: string, newPriority: string) => {
    const val = newPriority || null
    
    // Optimistic UI update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, priority: val } : l))

    // DB update
    await supabase.from('leads').update({ priority: val }).eq('id', leadId)
    
    // Log activity
    const label = val === 'Hot' ? '🔥 Hot' : val === 'Warm' ? '☀️ Warm' : val === 'Cold' ? '❄️ Cold' : '⚪ Unset'
    await supabase.from('activities').insert([{
      lead: leadId,
      user_id: user?.id,
      type: 'priority change',
      text: `Lead priority marked as ${label}`,
      time: new Date().toISOString()
    }])
  }

  const handleUpdateCallOutcome = async (leadId: string, outcome: string) => {
    const val = outcome || null
    
    // Optimistic UI update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, last_call_outcome: val } : l))

    // DB update
    await supabase.from('leads').update({ last_call_outcome: val }).eq('id', leadId)

    if (val) {
      const isUnanswered = ['No Answer', 'Busy'].includes(val)
      const leadItem = leads.find(l => l.id === leadId)
      if (isUnanswered && leadItem) {
        const newAttempts = (leadItem.attempts || 0) + 1
        await supabase.from('leads').update({ attempts: newAttempts }).eq('id', leadId)
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, attempts: newAttempts } : l))
      }

      await supabase.from('activities').insert([{
        lead: leadId,
        user_id: user?.id,
        type: 'call',
        outcome: val,
        text: `Call outcome marked as ${val}`,
        time: new Date().toISOString()
      }])
    }
  }

  // Count calculations
  const totalCount = leads.length
  const activeLeads = leads.filter(l => l.stage !== 'Enrolled')
  const enrolledLeads = leads.filter(l => l.stage === 'Enrolled')
  const activeCount = activeLeads.length
  const enrolledCount = enrolledLeads.length

  // Base pool depending on current tab
  const basePool = activeTab === 'active' ? activeLeads : activeTab === 'enrolled' ? enrolledLeads : leads

  const hotCount = basePool.filter(l => l.priority === 'Hot').length
  const warmCount = basePool.filter(l => l.priority === 'Warm').length
  const coldCount = basePool.filter(l => l.priority === 'Cold').length
  const unsetCount = basePool.filter(l => !l.priority).length

  // Service Track Counts
  const studyAbroadCount = basePool.filter(l => getLeadServiceType(l) === 'study_abroad').length
  const visaProcessCount = basePool.filter(l => getLeadServiceType(l) === 'visa_process').length

  // Helper to test if a lead created_at falls inside selected date filter
  const matchesDateFilter = (createdAtStr: string | null | undefined): boolean => {
    if (selectedDatePreset === 'ALL') return true
    if (!createdAtStr) return false

    const leadDate = new Date(createdAtStr)
    if (isNaN(leadDate.getTime())) return false

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    if (selectedDatePreset === 'today') {
      return leadDate >= startOfToday && leadDate <= endOfToday
    }

    if (selectedDatePreset === 'yesterday') {
      const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000)
      const endOfYesterday = new Date(endOfToday.getTime() - 24 * 60 * 60 * 1000)
      return leadDate >= startOfYesterday && leadDate <= endOfYesterday
    }

    if (selectedDatePreset === 'last7') {
      const startOf7DaysAgo = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000)
      return leadDate >= startOf7DaysAgo && leadDate <= endOfToday
    }

    if (selectedDatePreset === 'last30') {
      const startOf30DaysAgo = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000)
      return leadDate >= startOf30DaysAgo && leadDate <= endOfToday
    }

    if (selectedDatePreset === 'this_month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      return leadDate >= startOfMonth && leadDate <= endOfToday
    }

    if (selectedDatePreset === 'custom') {
      if (customStartDate) {
        const s = new Date(customStartDate)
        s.setHours(0, 0, 0, 0)
        if (leadDate < s) return false
      }
      if (customEndDate) {
        const e = new Date(customEndDate)
        e.setHours(23, 59, 59, 999)
        if (leadDate > e) return false
      }
      return true
    }

    return true
  }

  // Filtered leads based on priority, call outcome, country, programme level, and date
  const filteredLeads = basePool.filter(l => {
    if (selectedPriority !== 'ALL') {
      if (selectedPriority === 'UNSET' && l.priority) return false
      if (selectedPriority !== 'UNSET' && l.priority !== selectedPriority) return false
    }

    if (selectedOutcome !== 'ALL') {
      if (selectedOutcome === 'UNSET' && l.last_call_outcome) return false
      if (selectedOutcome !== 'UNSET' && l.last_call_outcome !== selectedOutcome) return false
    }

    if (selectedCountry !== 'ALL') {
      if (!matchesCountryFilter(l, selectedCountry)) return false
    }

    if (selectedProgramme !== 'ALL') {
      if (!matchesProgrammeFilter(l, selectedProgramme)) return false
    }

    if (!matchesDateFilter(l.created_at)) {
      return false
    }

    // Service Stream Track Filter: Study Abroad vs Visa Process
    if (serviceTrack !== 'all') {
      if (getLeadServiceType(l) !== serviceTrack) return false
    }

    return true
  })

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD]">
      {/* Top Header */}
      <header className="px-8 py-5 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white z-10 shrink-0">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>{activeTab === 'enrolled' ? '🎓 Enrolled Students' : activeTab === 'all' ? 'All Leads Master' : 'Active Leads Pipeline'}</span>
            </h1>
            {searchQuery && (
              <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
                Search: &ldquo;{searchQuery}&rdquo;
              </span>
            )}
            {counselorParam && (
              <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-200 flex items-center gap-1.5">
                <span>Counselor Filter Active</span>
                <Link href="/leads" className="text-blue-500 hover:text-blue-900 font-bold text-sm leading-none ml-0.5">×</Link>
              </span>
            )}
            {selectedDatePreset !== 'ALL' && (
              <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
                <span>📅 Date: {selectedDatePreset === 'today' ? 'Today' : selectedDatePreset === 'yesterday' ? 'Yesterday' : selectedDatePreset === 'last7' ? 'Last 7 Days' : selectedDatePreset === 'last30' ? 'Last 30 Days' : selectedDatePreset === 'this_month' ? 'This Month' : customStartDate || customEndDate ? `${customStartDate || '...'} to ${customEndDate || '...'}` : 'Custom Range'}</span>
                <button
                  type="button"
                  onClick={() => { setSelectedDatePreset('ALL'); setCustomStartDate(''); setCustomEndDate(''); }}
                  className="text-emerald-600 hover:text-emerald-950 font-bold text-sm leading-none ml-0.5 cursor-pointer"
                  title="Clear Date Filter"
                >×</button>
              </span>
            )}
            <span className="text-xs bg-gray-100 text-gray-600 font-medium px-2 py-0.5 rounded-full border border-gray-200">
              {filteredLeads.length} {filteredLeads.length === 1 ? 'lead' : 'leads'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Realtime Sync
            </span>
          </div>

          {/* Primary View Switcher: Active Leads vs Enrolled Students vs All */}
          <div className="flex items-center gap-1.5 bg-gray-100/90 p-1 rounded-xl w-fit">
            <button
              onClick={() => handleTabChange('active')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'active'
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5 font-bold'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
              }`}
            >
              <span>⚡ Active Calling Leads</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'active' ? 'bg-black text-white' : 'bg-gray-200 text-gray-700'
              }`}>
                {activeCount}
              </span>
            </button>

            <button
              onClick={() => handleTabChange('enrolled')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'enrolled'
                  ? 'bg-emerald-600 text-white shadow-xs font-bold'
                  : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50/50'
              }`}
            >
              <GraduationCap size={14} className={activeTab === 'enrolled' ? 'text-white' : 'text-emerald-600'} />
              <span>🎓 Enrolled Students</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'enrolled' ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {enrolledCount}
              </span>
            </button>

            <button
              onClick={() => handleTabChange('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5 font-bold'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
              title="Show all leads including both active and enrolled"
            >
              <span>All Master</span>
              <span className="text-[10px] text-gray-400">({totalCount})</span>
            </button>
          </div>

          {/* Service Stream Switcher: Study Abroad vs Visa Process */}
          <div className="flex items-center gap-1 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/70 p-1 rounded-xl w-fit shadow-2xs">
            <button
              onClick={() => setServiceTrack('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                serviceTrack === 'all'
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5 font-bold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
              title="View all leads regardless of service track"
            >
              <span>🌐 All Services</span>
              <span className="text-[10px] text-gray-400">({basePool.length})</span>
            </button>

            <button
              onClick={() => setServiceTrack('study_abroad')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                serviceTrack === 'study_abroad'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-blue-700 hover:bg-white/80'
              }`}
              title="Show University Admissions & Course Shortlisting Leads"
            >
              <GraduationCap size={14} className={serviceTrack === 'study_abroad' ? 'text-white' : 'text-blue-600'} />
              <span>🎓 Study Abroad</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                serviceTrack === 'study_abroad' ? 'bg-white text-blue-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {studyAbroadCount}
              </span>
            </button>

            <button
              onClick={() => setServiceTrack('visa_process')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                serviceTrack === 'visa_process'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-indigo-700 hover:bg-white/80'
              }`}
              title="Show F-1 Visa Processing & SEVIS Leads"
            >
              <Globe size={14} className={serviceTrack === 'visa_process' ? 'text-white' : 'text-indigo-600'} />
              <span>🛂 Visa Process</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                serviceTrack === 'visa_process' ? 'bg-white text-indigo-800' : 'bg-indigo-100 text-indigo-800'
              }`}>
                {visaProcessCount}
              </span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* List / Kanban switcher */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setView('list')} 
              title="List View"
              className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <LayoutList size={16} />
            </button>
            <button 
              onClick={() => setView('kanban')} 
              title="Kanban Board View"
              className={`p-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <Kanban size={16} />
            </button>
          </div>

          {canManageLeads(user) && (
            <Link
              href="/reassign"
              className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs"
              title="Drag & Drop Lead Re-assignment Board"
            >
              <ArrowLeftRight size={13} className="text-indigo-600" />
              <span className="hidden md:inline">Reassign Board</span>
            </Link>
          )}
          
          {canManageLeads(user) && (
            <div className="flex gap-2">
              <button 
                onClick={() => setShowImportModal(true)}
                className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm"
              >
                <Upload size={15} /> <span>Import</span>
              </button>
              <button 
                onClick={() => setShowModal(true)}
                className="bg-black hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all shadow-sm"
              >
                <Plus size={15} /> <span>Add Lead</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Priority Filter Toolbar */}
      <div className="px-8 py-3 bg-gray-50/80 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 mr-1">
            <Filter size={13} className="text-gray-400" /> Filter:
          </span>

          {/* All */}
          <button
            onClick={() => setSelectedPriority('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selectedPriority === 'ALL'
                ? 'bg-black text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
            }`}
          >
            {activeTab === 'active'
              ? `All Active (${activeCount})`
              : activeTab === 'enrolled'
              ? `All Enrolled (${enrolledCount})`
              : `All Leads (${totalCount})`}
          </button>

          {/* Hot */}
          <button
            onClick={() => setSelectedPriority('Hot')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              selectedPriority === 'Hot'
                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-200 font-semibold'
                : 'bg-white border border-rose-200 text-rose-700 hover:bg-rose-50'
            }`}
          >
            <span>🔥 Hot Leads</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              selectedPriority === 'Hot' ? 'bg-rose-700 text-white' : 'bg-rose-100 text-rose-800'
            }`}>
              {hotCount}
            </span>
          </button>

          {/* Warm */}
          <button
            onClick={() => setSelectedPriority('Warm')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              selectedPriority === 'Warm'
                ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-200 font-semibold'
                : 'bg-white border border-amber-200 text-amber-800 hover:bg-amber-50'
            }`}
          >
            <span>☀️ Warm Leads</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              selectedPriority === 'Warm' ? 'bg-amber-700 text-white' : 'bg-amber-100 text-amber-800'
            }`}>
              {warmCount}
            </span>
          </button>

          {/* Cold */}
          <button
            onClick={() => setSelectedPriority('Cold')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              selectedPriority === 'Cold'
                ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200 font-semibold'
                : 'bg-white border border-blue-200 text-blue-700 hover:bg-blue-50'
            }`}
          >
            <span>❄️ Cold Leads</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              selectedPriority === 'Cold' ? 'bg-blue-700 text-white' : 'bg-blue-100 text-blue-800'
            }`}>
              {coldCount}
            </span>
          </button>

          {/* Unset */}
          {unsetCount > 0 && (
            <button
              onClick={() => setSelectedPriority('UNSET')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedPriority === 'UNSET'
                  ? 'bg-gray-800 text-white shadow-sm font-semibold'
                  : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              ⚪ Unset ({unsetCount})
            </button>
          )}

          {/* Outcome Filter */}
          <div className="flex items-center gap-1.5 sm:border-l sm:border-gray-200 sm:pl-3 sm:ml-1">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Call Status:</span>
            <select
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              className="bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-2.5 py-1.5 font-medium outline-none shadow-xs hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 transition-all cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="Connected">📞 Connected</option>
              <option value="No Answer">📵 No Answer</option>
              <option value="Busy">⏳ Busy</option>
              <option value="Wrong Num">↪️ Wrong Num</option>
              <option value="UNSET">⚪ Not Called</option>
            </select>
          </div>

          {/* Country / Ad Campaign Filter */}
          <div className="flex items-center gap-1.5 sm:border-l sm:border-gray-200 sm:pl-3 sm:ml-1">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap flex items-center gap-1">
              <Globe size={12} className="text-gray-400" /> Ad Country:
            </span>
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              className="bg-white border border-blue-200 text-blue-900 text-xs rounded-lg px-2.5 py-1.5 font-semibold outline-none shadow-xs hover:bg-blue-50/50 focus:ring-2 focus:ring-blue-200 transition-all cursor-pointer"
            >
              <option value="ALL">🌐 All Countries</option>
              <option value="USA">🇺🇸 USA Ad Leads</option>
              <option value="UK">🇬🇧 UK Ad Leads</option>
              <option value="Canada">🇨🇦 Canada Ad Leads</option>
              <option value="Australia">🇦🇺 Australia Ad Leads</option>
              <option value="Germany">🇩🇪 Germany Ad Leads</option>
              <option value="Ireland">🇮🇪 Ireland Ad Leads</option>
              <option value="Europe">🇪🇺 Europe Ad Leads</option>
              <option value="Saudi Arabia">🇸🇦 Saudi Arabia Leads</option>
              <option value="South Africa">🇿🇦 South Africa Leads</option>
              <option value="UAE">🇦🇪 UAE Ad Leads</option>
              <option value="India">🇮🇳 India Leads</option>
            </select>
          </div>

          {/* Programme / Degree Level Filter */}
          <div className="flex items-center gap-1.5 sm:border-l sm:border-gray-200 sm:pl-3 sm:ml-1">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap flex items-center gap-1">
              <GraduationCap size={13} className="text-purple-600" /> Degree:
            </span>
            <select
              value={selectedProgramme}
              onChange={(e) => setSelectedProgramme(e.target.value)}
              className="bg-white border border-purple-200 text-purple-900 text-xs rounded-lg px-2.5 py-1.5 font-semibold outline-none shadow-xs hover:bg-purple-50/50 focus:ring-2 focus:ring-purple-200 transition-all cursor-pointer"
            >
              <option value="ALL">🎓 All Degrees</option>
              <option value="Master">🎓 Master</option>
              <option value="Bachelor">🎓 Bachelor</option>
              <option value="Doctorate">🎓 Doctorate</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-1.5 sm:border-l sm:border-gray-200 sm:pl-3 sm:ml-1">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap flex items-center gap-1">
              <Calendar size={13} className="text-emerald-600" /> Date:
            </span>
            <select
              value={selectedDatePreset}
              onChange={(e) => setSelectedDatePreset(e.target.value)}
              className="bg-white border border-emerald-300 text-emerald-900 text-xs rounded-lg px-2.5 py-1.5 font-semibold outline-none shadow-xs hover:bg-emerald-50/50 focus:ring-2 focus:ring-emerald-200 transition-all cursor-pointer"
            >
              <option value="ALL">📅 All Dates</option>
              <option value="today">⚡ Today</option>
              <option value="yesterday">⏪ Yesterday</option>
              <option value="last7">🗓️ Last 7 Days</option>
              <option value="last30">📅 Last 30 Days</option>
              <option value="this_month">📆 This Month</option>
              <option value="custom">✏️ Custom Range...</option>
            </select>

            {selectedDatePreset === 'custom' && (
              <div className="flex items-center gap-1 bg-white border border-emerald-300 rounded-lg p-1 shadow-2xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="text-[11px] font-medium text-gray-700 outline-none px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded"
                  title="Start Date (From)"
                />
                <span className="text-[10px] text-gray-400 font-bold px-0.5">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="text-[11px] font-medium text-gray-700 outline-none px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded"
                  title="End Date (To)"
                />
              </div>
            )}
          </div>
        </div>

        {(selectedPriority !== 'ALL' || selectedOutcome !== 'ALL' || selectedCountry !== 'ALL' || selectedProgramme !== 'ALL' || selectedDatePreset !== 'ALL' || serviceTrack !== 'all') && (
          <button
            onClick={() => {
              setSelectedPriority('ALL');
              setSelectedOutcome('ALL');
              setSelectedCountry('ALL');
              setSelectedProgramme('ALL');
              setSelectedDatePreset('ALL');
              setServiceTrack('all');
              setCustomStartDate('');
              setCustomEndDate('');
            }}
            className="text-xs text-blue-600 hover:text-black font-semibold underline cursor-pointer"
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Main Area */}
      <div className="flex-1 overflow-auto p-8">
        {activeTab === 'enrolled' && (
          <div className="mb-6 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-300/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <GraduationCap size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-950 flex items-center gap-2">
                  <span>🎓 Confirmed Admissions Archive</span>
                  <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                    {enrolledCount} Enrolled
                  </span>
                </h3>
                <p className="text-xs text-emerald-800 mt-0.5">
                  These leads have finalized admissions and enrollment. They are completely separated from the active calling pipeline.
                </p>
              </div>
            </div>
            <Link
              href="/enrolled"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all w-fit shrink-0"
            >
              <span>Full Enrolled Portal</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : view === 'list' ? (
          /* List View */
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium text-gray-500">Name & Source</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Priority / Temp</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Contact</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Call Outcome</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Assigned To</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Stage</th>
                  <th className="px-6 py-3 font-medium text-gray-500">Added</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors group">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex flex-col">
                        <Link href={`/leads/${lead.id}`} className="hover:underline font-semibold text-gray-900 leading-tight">
                          {lead.name}
                        </Link>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {/* Service Track Tag */}
                          {getLeadServiceType(lead) === 'visa_process' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                              🛂 Visa Process
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                              🎓 Study Abroad
                            </span>
                          )}

                          {/* Visa Specific Info Chips */}
                          {getLeadServiceType(lead) === 'visa_process' && (
                            <>
                              {(lead.metadata?.campaign_answers?.['SEVIS I-901 Fee Paid?'] || lead.metadata?.['have_you_paid_your_sevis_i-901_fee?']) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  SEVIS: {lead.metadata?.campaign_answers?.['SEVIS I-901 Fee Paid?'] || lead.metadata?.['have_you_paid_your_sevis_i-901_fee?']}
                                </span>
                              )}
                              {(lead.metadata?.campaign_answers?.['I-20 Received From US University?'] || lead.metadata?.['have_you_received_your_i-20_from_a_us_university?']) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-800 border border-purple-200">
                                  I-20: {lead.metadata?.campaign_answers?.['I-20 Received From US University?'] || lead.metadata?.['have_you_received_your_i-20_from_a_us_university?']}
                                </span>
                              )}
                            </>
                          )}

                          {(lead.country || lead.phone) && formatCountryBadge(lead.country, lead.phone) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                              {formatCountryBadge(lead.country, lead.phone)}
                            </span>
                          )}
                          {(lead.course || lead.programme_level) && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs">
                              🎓 {lead.course || lead.programme_level}
                            </span>
                          )}
                          {lead.metadata?.campus_mode && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                              {String(lead.metadata.campus_mode).toLowerCase().includes('campus') ? '🏛️ On Campus' :
                               String(lead.metadata.campus_mode).toLowerCase().includes('online') ? '💻 Online' :
                               '🌐 ' + lead.metadata.campus_mode}
                            </span>
                          )}
                          {lead.source && (
                            <span className="text-[11px] text-gray-500 font-medium">
                              via {lead.source}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Inline Priority Dropdown */}
                    <td className="px-6 py-4">
                      <select
                        value={lead.priority || ''}
                        onChange={(e) => handleUpdatePriority(lead.id, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-lg border outline-none cursor-pointer transition-all shadow-xs ${
                          lead.priority === 'Hot'
                            ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 focus:ring-2 focus:ring-rose-200'
                            : lead.priority === 'Warm'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 focus:ring-2 focus:ring-amber-200'
                            : lead.priority === 'Cold'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 focus:ring-2 focus:ring-blue-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <option value="">⚪ Unset</option>
                        <option value="Hot">🔥 Hot</option>
                        <option value="Warm">☀️ Warm</option>
                        <option value="Cold">❄️ Cold</option>
                      </select>
                    </td>

                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <span>{lead.phone}</span>
                        <a
                          href={getJustCallDialerUrl(lead.phone)}
                          onClick={(e) => openJustCallDialer(lead.phone, e)}
                          className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-colors cursor-pointer"
                          title="Call via JustCall"
                        >
                          <Phone size={12} />
                        </a>
                      </div>
                    </td>
                    
                    {/* Call Outcome Status Badge */}
                    <td className="px-6 py-4">
                      <Link href={`/leads/${lead.id}`}>
                        {lead.last_call_outcome === 'Connected' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors shadow-2xs">
                            <PhoneCall size={12} className="text-emerald-600" />
                            <span>Connected</span>
                          </span>
                        ) : lead.last_call_outcome === 'No Answer' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shadow-2xs">
                            <PhoneOff size={12} className="text-rose-600" />
                            <span>No Answer</span>
                          </span>
                        ) : lead.last_call_outcome === 'Busy' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors shadow-2xs">
                            <XCircle size={12} className="text-amber-600" />
                            <span>Busy</span>
                          </span>
                        ) : lead.last_call_outcome === 'Wrong Num' || lead.last_call_outcome === 'Wrong Number' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors shadow-2xs">
                            <PhoneForwarded size={12} className="text-gray-500" />
                            <span>Wrong Num</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gray-50 text-gray-400 border border-gray-200 hover:bg-gray-100 transition-colors">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                            <span>Not Called</span>
                          </span>
                        )}
                      </Link>
                    </td>
                    
                    {/* Owner */}
                    <td className="px-6 py-4">
                      {lead.owner?.name ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          {lead.owner.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-400 bg-gray-100">
                          Unassigned
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                        {lead.stage}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">{new Date(lead.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/leads/${lead.id}`} className="text-gray-400 hover:text-black opacity-0 group-hover:opacity-100 transition-all inline-flex items-center gap-1 text-xs font-medium">
                        View <ArrowRight size={14} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeads.length === 0 && (
              <div className="text-center py-16 text-gray-500 text-sm">
                No leads match the selected filter.
              </div>
            )}
          </div>
        ) : (
          /* Kanban Board View */
          <div className="flex gap-6 overflow-x-auto pb-4 h-full">
            {stages
              .filter(stage => activeTab !== 'active' || stage !== 'Enrolled')
              .map(stage => {
              const stageLeads = filteredLeads.filter(l => l.stage === stage)
              if (stageLeads.length === 0) return null
              return (
                <div key={stage} className="w-80 shrink-0 flex flex-col">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{stage}</h3>
                    <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full">
                      {stageLeads.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3">
                    {stageLeads.map(lead => (
                      <Link 
                        href={`/leads/${lead.id}`} 
                        key={lead.id} 
                        className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-medium text-gray-900 text-sm group-hover:text-blue-600 transition-colors">
                            {lead.name}
                          </h4>
                          {lead.priority && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
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
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-500">{lead.phone}</p>
                          <a
                            href={getJustCallDialerUrl(lead.phone)}
                            onClick={(e) => openJustCallDialer(lead.phone, e)}
                            className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-colors cursor-pointer"
                            title="Call via JustCall"
                          >
                            <Phone size={12} />
                          </a>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100 text-[10px]">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Service Track Tag */}
                            {getLeadServiceType(lead) === 'visa_process' ? (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-bold text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200">
                                🛂 Visa
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                                🎓 Study
                              </span>
                            )}
                            {(lead.country || lead.phone) && formatCountryBadge(lead.country, lead.phone) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200">
                                {formatCountryBadge(lead.country, lead.phone)}
                              </span>
                            )}
                            {(lead.course || lead.programme_level) && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded font-semibold text-[10px] bg-purple-50 text-purple-700 border border-purple-200">
                                🎓 {lead.course || lead.programme_level}
                              </span>
                            )}
                            {lead.source && <span className="font-medium uppercase tracking-wider text-gray-400">{lead.source}</span>}
                            {lead.last_call_outcome && (
                              <span className={`px-1.5 py-0.5 rounded font-semibold text-[10px] ${
                                lead.last_call_outcome === 'Connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                lead.last_call_outcome === 'No Answer' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                                lead.last_call_outcome === 'Busy' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                                'bg-gray-100 text-gray-700 border border-gray-200'
                              }`}>
                                {lead.last_call_outcome}
                              </span>
                            )}
                          </div>
                          {lead.owner?.name ? (
                            <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 truncate max-w-[120px]">
                              {lead.owner.name}
                            </span>
                          ) : (
                            <span className="text-gray-400">Unassigned</span>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && <AddLeadModal onClose={() => setShowModal(false)} onSuccess={fetchLeads} />}
      {showImportModal && <CSVImportModal onClose={() => setShowImportModal(false)} onSuccess={fetchLeads} />}
    </div>
  )
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <LeadsContent />
    </Suspense>
  )
}

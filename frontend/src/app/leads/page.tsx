'use client'
import { useState, useEffect, useMemo, useTransition, useCallback, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Search, Filter, LayoutList, Kanban, Users, ArrowRight, Upload, Flame, SunMedium, Snowflake, Phone, PhoneCall, PhoneOff, XCircle, PhoneForwarded, ArrowLeftRight, GraduationCap, Globe, Calendar, Check, CheckSquare, Trash2, Sparkles } from 'lucide-react'
import { openCallHippoDialer, getCallHippoDialerUrl } from '@/lib/callhippo'
import { formatCountryBadge, matchesCountryFilter, matchesProgrammeFilter } from '@/lib/countryHelper'
import { getLeadServiceType, getServiceBadgeInfo, ServiceTrack } from '@/lib/leadTypeHelper'
import AddLeadModal from '@/components/AddLeadModal'
import CSVImportModal from '@/components/CSVImportModal'
import Link from 'next/link'
import { useAuth } from '@/components/AuthWrapper'
import { useSearchParams, useRouter } from 'next/navigation'
import { canManageLeads, isCounselor, isTeamLeader, isManager, parseUserTeamMeta, getAssignableCounselors } from '@/lib/teamHelper'
import { notifyLeadAssigned } from '@/lib/notifications'

function LeadsContent() {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [leads, setLeads] = useState<any[]>([])
  const [counselors, setCounselors] = useState<any[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [showModal, setShowModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list'|'kanban'>('list')
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [bulkTargetCounselor, setBulkTargetCounselor] = useState<string>('')
  const [bulkProcessing, setBulkProcessing] = useState(false)
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const searchQuery = searchParams?.get('search') || ''
  const initialPriority = searchParams?.get('priority') || 'ALL'
  const counselorParam = searchParams?.get('counselor') || ''
  const tabParam = searchParams?.get('tab')

  // Tab State: 'active' (Default: excludes Enrolled & Junk) | 'enrolled' (Only Enrolled) | 'junk' (Only Junk) | 'all' (Master)
  const [activeTab, setActiveTab] = useState<'active' | 'enrolled' | 'junk' | 'all'>(
    tabParam === 'enrolled' ? 'enrolled' : tabParam === 'junk' ? 'junk' : tabParam === 'all' ? 'all' : 'active'
  )

  useEffect(() => {
    if (tabParam === 'enrolled') {
      setActiveTab('enrolled')
    } else if (tabParam === 'junk') {
      setActiveTab('junk')
    } else if (tabParam === 'all') {
      setActiveTab('all')
    } else {
      setActiveTab('active')
    }
  }, [tabParam])

  const handleTabChange = (t: 'active' | 'enrolled' | 'junk' | 'all') => {
    startTransition(() => {
      setActiveTab(t)
      setDisplayLimit(100)
    })
    const currentParams = new URLSearchParams(searchParams?.toString() || '')
    if (t === 'active') {
      currentParams.delete('tab')
    } else {
      currentParams.set('tab', t)
    }
    const q = currentParams.toString() ? `?${currentParams.toString()}` : ''
    router.replace(`/leads${q}`, { scroll: false })
  }
  
  // Counselor Filter State: 'ALL' | 'UNASSIGNED' | 'MY_POOL' | counselor_id
  const [selectedCounselor, setSelectedCounselor] = useState<string>(counselorParam || 'ALL')

  useEffect(() => {
    if (counselorParam) {
      setSelectedCounselor(counselorParam)
    } else {
      setSelectedCounselor('ALL')
    }
  }, [counselorParam])

  const handleCounselorFilterChange = (counselorId: string) => {
    startTransition(() => {
      setSelectedCounselor(counselorId)
      setDisplayLimit(100)
    })
    const currentParams = new URLSearchParams(searchParams?.toString() || '')
    if (counselorId === 'ALL') {
      currentParams.delete('counselor')
    } else {
      currentParams.set('counselor', counselorId)
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

  // Progressive display limit to render table in < 16ms while maintaining instant interactivity
  const [displayLimit, setDisplayLimit] = useState<number>(100)

  // Service Stream Track: 'all' | 'study_abroad' | 'visa_process'
  const serviceParam = (searchParams?.get('service') as ServiceTrack) || 'all'
  const [serviceTrack, setServiceTrack] = useState<ServiceTrack>(
    serviceParam === 'visa_process' || serviceParam === 'study_abroad' ? serviceParam : 'all'
  )

  const fetchStages = async () => {
    const { data } = await supabase.from('stages').select('name').order('stage_order', { ascending: true })
    if (data) setStages(data.map(s => s.name))
  }

  const fetchCounselors = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role, languages, active')
      .order('name', { ascending: true })
    if (data) setCounselors(data)
  }

  const fetchLeads = async () => {
    if (!user) return
    setLoading(true)
    let query = supabase
      .from('leads')
      .select('id, name, email, phone, country, source, stage, owner_id, next_follow_up, priority, created_at, course, programme_level, last_call_outcome, attempts, metadata, owner:owner_id(name)')
      .order('created_at', { ascending: false })
      .limit(1000)
    
    if (isCounselor(user)) {
      query = query.eq('owner_id', user.id)
    } else if (isTeamLeader(user)) {
      const meta = parseUserTeamMeta(user?.languages)
      const memberSet = new Set<string>(meta.member_ids || [])
      // Include counselors who have team_leader_id set to user.id
      const { data: allUsers } = await supabase.from('users').select('id, languages')
      ;(allUsers || []).forEach(u => {
        const uMeta = parseUserTeamMeta(u.languages)
        if (uMeta.team_leader_id === user.id) {
          memberSet.add(u.id)
        }
      })
      memberSet.add(user.id)
      query = query.in('owner_id', Array.from(memberSet))
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

  useEffect(() => {
    if (user) {
      fetchLeads()
      fetchStages()
      fetchCounselors()

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
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
          fetchCounselors()
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [user, searchQuery])

  // Counselors that current user is allowed to assign/reassign leads to
  const assignableCounselors = useMemo(() => {
    return getAssignableCounselors(user, counselors, true)
  }, [user, counselors])

  // Precompute lead counts per counselor in a single O(N) pass for instant O(1) lookup
  const leadCountsByCounselor = useMemo(() => {
    const counts: Record<string, number> = {}
    let unassigned = 0
    for (let i = 0; i < leads.length; i++) {
      const oId = leads[i].owner_id
      if (!oId) unassigned++
      else counts[oId] = (counts[oId] || 0) + 1
    }
    return { counts, unassigned }
  }, [leads])

  // Pre-render counselor option lists once so rows don't repeat array allocations
  const counselorSelectOptions = useMemo(() => {
    return assignableCounselors
      .filter(c => !isTeamLeader(user) || c.id !== user?.id)
      .map(c => (
        <option key={c.id} value={c.id}>
          👤 {c.name}
        </option>
      ))
  }, [assignableCounselors, user?.id])

  // Pre-render counselor bulk assignment dropdown options
  const counselorBulkOptions = useMemo(() => {
    return assignableCounselors
      .filter(c => !isTeamLeader(user) || c.id !== user?.id)
      .map(c => {
        const count = leadCountsByCounselor.counts[c.id] || 0
        return (
          <option key={c.id} value={c.id}>
            👤 {c.name} ({count} leads)
          </option>
        )
      })
  }, [assignableCounselors, user?.id, leadCountsByCounselor])

  // Inline lead reassignment handler
  const handleReassignLead = async (leadId: string, newOwnerId: string) => {
    const targetOwnerId = newOwnerId || null
    const targetCounselor = counselors.find(c => c.id === targetOwnerId)
    const targetName = targetCounselor ? targetCounselor.name : targetOwnerId === user?.id ? (user?.name || 'My Pool') : 'Unassigned'

    setReassigningId(leadId)

    const targetLead = leads.find(l => l.id === leadId)
    const isJunkRevival = targetLead?.stage === 'Junk/duplicate'
    const newStage = isJunkRevival ? 'New' : targetLead?.stage

    // Optimistic UI update
    setLeads(prev => prev.map(l => {
      if (l.id === leadId) {
        return {
          ...l,
          owner_id: targetOwnerId,
          stage: newStage,
          owner: targetOwnerId ? { name: targetName } : null
        }
      }
      return l
    }))

    try {
      // 1. Update lead in DB (auto-revive stage to 'New' if junk!)
      const updatePayload: any = { owner_id: targetOwnerId }
      if (isJunkRevival) {
        updatePayload.stage = 'New'
      }

      const { error } = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', leadId)

      if (error) throw error

      // 2. Insert activity log
      await supabase.from('activities').insert([{
        lead: leadId,
        user_id: user?.id,
        type: isJunkRevival ? 'lead_revived' : 'reassigned',
        text: isJunkRevival
          ? `Lead revived from Junk/duplicate and reassigned to ${targetName} by ${user?.name || 'Leader'}. Stage reset to New.`
          : `Lead reassigned to ${targetName} by ${user?.name || 'Leader'}`
      }])

      // 3. Insert assignment history record
      if (targetOwnerId) {
        const currentLead = leads.find(l => l.id === leadId)
        await supabase.from('assignments').insert([{
          lead_id: leadId,
          from_user: currentLead?.owner_id || null,
          to_user: targetOwnerId,
          assigned_by: user?.id,
          reason: isTeamLeader(user) ? 'Team Leader Reassignment' : 'Manager Reassignment',
          time: new Date().toISOString()
        }])

        // 4. Send notification
        const targetLead = leads.find(l => l.id === leadId)
        await notifyLeadAssigned({
          recipientId: targetOwnerId,
          leadId,
          leadName: targetLead?.name || 'Student Lead',
          senderName: user?.name || 'Team Leader'
        })
      }
    } catch (err: any) {
      console.error('Failed to reassign lead:', err)
      alert(err?.message || 'Failed to reassign lead. Please try again.')
      fetchLeads()
    } finally {
      setReassigningId(null)
    }
  }

  // Bulk Selection Handlers
  const toggleSelectLead = (leadId: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    )
  }

  const toggleSelectAllLeads = () => {
    const filteredIds = filteredLeads.map(l => l.id)
    const isAll = filteredIds.length > 0 && filteredIds.every(id => selectedLeadIds.includes(id))
    if (isAll) {
      setSelectedLeadIds(prev => prev.filter(id => !filteredIds.includes(id)))
    } else {
      setSelectedLeadIds(prev => Array.from(new Set([...prev, ...filteredIds])))
    }
  }

  const handleBulkReassignLeads = async (customIds?: string[]) => {
    const idsToReassign = customIds && customIds.length > 0 ? customIds : selectedLeadIds
    if (idsToReassign.length === 0) {
      alert('Please select at least one lead using the checkboxes or "Select All".')
      return
    }
    if (!bulkTargetCounselor) {
      alert('Please select a counselor from the dropdown to assign the leads to.')
      return
    }

    const targetOwnerId = bulkTargetCounselor === 'unassigned' ? null : bulkTargetCounselor
    const targetCounselor = counselors.find(c => c.id === targetOwnerId)
    const targetName = targetOwnerId === user?.id ? (user?.name || 'My Pool') : targetCounselor ? targetCounselor.name : 'Unassigned'

    if (!confirm(`Reassign all ${idsToReassign.length} selected leads to ${targetName}?`)) return

    setBulkProcessing(true)

    // Optimistic UI update
    setLeads(prev => prev.map(l => {
      if (idsToReassign.includes(l.id)) {
        const isJunk = l.stage === 'Junk/duplicate'
        return {
          ...l,
          owner_id: targetOwnerId,
          stage: isJunk ? 'New' : l.stage,
          owner: targetOwnerId ? { name: targetName } : null
        }
      }
      return l
    }))

    try {
      // 1. Separate regular leads and junk leads needing revival
      const junkIds = idsToReassign.filter(id => {
        const l = leads.find(lead => lead.id === id)
        return l?.stage === 'Junk/duplicate'
      })
      const nonJunkIds = idsToReassign.filter(id => !junkIds.includes(id))

      if (nonJunkIds.length > 0) {
        const { error } = await supabase
          .from('leads')
          .update({ owner_id: targetOwnerId })
          .in('id', nonJunkIds)
        if (error) throw error
      }

      if (junkIds.length > 0) {
        // Auto-revive stage to 'New' when moving from Junk!
        const { error } = await supabase
          .from('leads')
          .update({ owner_id: targetOwnerId, stage: 'New' })
          .in('id', junkIds)
        if (error) throw error
      }

      // 2. Audit entries for assignments and activities
      const assignmentInserts = idsToReassign.map(leadId => {
        const lead = leads.find(l => l.id === leadId)
        return {
          lead_id: leadId,
          from_user: lead?.owner_id || null,
          to_user: targetOwnerId,
          assigned_by: user?.id,
          reason: isTeamLeader(user) ? 'Bulk Team Leader Reassignment' : 'Bulk Manager Reassignment',
          time: new Date().toISOString()
        }
      })
      await supabase.from('assignments').insert(assignmentInserts)

      const activityInserts = idsToReassign.map(leadId => {
        const l = leads.find(lead => lead.id === leadId)
        const isJunkRevival = l?.stage === 'Junk/duplicate'
        return {
          lead: leadId,
          user_id: user?.id,
          type: isJunkRevival ? 'lead_revived' : 'reassigned',
          text: isJunkRevival
            ? `Lead revived from Junk/duplicate and reassigned to ${targetName} by ${user?.name || 'Leader'}. Stage reset to New.`
            : `Bulk reassigned to ${targetName} by ${user?.name || 'Leader'}`
        }
      })
      await supabase.from('activities').insert(activityInserts)

      // 3. Notification to the assigned counselor
      if (targetOwnerId && targetOwnerId !== user?.id) {
        notifyLeadAssigned({
          recipientId: targetOwnerId,
          leadId: idsToReassign[0],
          leadName: `${idsToReassign.length} Leads`,
          senderName: user?.name || (isTeamLeader(user) ? 'Team Leader' : 'Manager')
        }).catch(console.error)
      }

      setSelectedLeadIds([])
      setBulkTargetCounselor('')
      await fetchLeads()
    } catch (err: any) {
      console.error('Failed to bulk reassign leads:', err)
      alert(err?.message || 'Failed to bulk reassign leads.')
      await fetchLeads()
    } finally {
      setBulkProcessing(false)
    }
  }

  const handleBulkUpdatePriority = async (newPriority: string) => {
    if (selectedLeadIds.length === 0) return
    const val = newPriority === 'UNSET' ? null : newPriority

    // Check if any selected lead is in Junk/duplicate
    const junkSelected = selectedLeadIds.filter(id => {
      const l = leads.find(lead => lead.id === id)
      return l?.stage === 'Junk/duplicate'
    })

    if (val && junkSelected.length > 0) {
      const shouldRevive = confirm(
        `${junkSelected.length} of the selected leads are currently in "Junk/duplicate" stage.\n\nSetting their priority to "${val}" will automatically revive them back to "New" stage so they appear in active calling.\n\nProceed and revive them to New?`
      )
      if (!shouldRevive) return

      try {
        await supabase
          .from('leads')
          .update({ priority: val, stage: 'New' })
          .in('id', junkSelected)

        const nonJunk = selectedLeadIds.filter(id => !junkSelected.includes(id))
        if (nonJunk.length > 0) {
          await supabase
            .from('leads')
            .update({ priority: val })
            .in('id', nonJunk)
        }

        setSelectedLeadIds([])
        await fetchLeads()
      } catch (err: any) {
        console.error('Failed to bulk update priority:', err)
        alert(err?.message || 'Failed to update priority.')
      }
      return
    }

    // Optimistic UI update
    setLeads(prev => prev.map(l => selectedLeadIds.includes(l.id) ? { ...l, priority: val } : l))

    try {
      await supabase.from('leads').update({ priority: val }).in('id', selectedLeadIds)
      setSelectedLeadIds([])
    } catch (err: any) {
      console.error('Failed to bulk update priority:', err)
      alert(err?.message || 'Failed to update priority.')
      fetchLeads()
    }
  }

  const handleUpdatePriority = async (leadId: string, newPriority: string) => {
    const val = newPriority || null
    const lead = leads.find(l => l.id === leadId)

    if (val && lead?.stage === 'Junk/duplicate') {
      const shouldRevive = confirm(
        `This lead is currently in "Junk/duplicate" stage.\n\nSetting priority to "${val}" will automatically revive this lead back to "New" stage so it appears in active calling.\n\nProceed and revive to New?`
      )
      if (!shouldRevive) return

      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, priority: val, stage: 'New' } : l))
      await supabase.from('leads').update({ priority: val, stage: 'New' }).eq('id', leadId)
      const formattedPriority = val === 'Hot' ? '🔥 Hot' : val === 'Warm' ? '☀️ Warm' : val === 'Cold' ? '❄️ Cold' : val === 'Callback' ? '📞 Callback' : val === 'Ringing' ? '🔔 Ringing' : val
      await supabase.from('activities').insert([{
        lead: leadId,
        user_id: user?.id,
        type: 'lead_revived',
        text: `Lead revived from Junk/duplicate to New and priority marked as ${formattedPriority}`,
        time: new Date().toISOString()
      }])
      await fetchLeads()
      return
    }
    
    // Optimistic UI update
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, priority: val } : l))

    // DB update
    await supabase.from('leads').update({ priority: val }).eq('id', leadId)
    
    // Log activity
    const label = val === 'Hot' ? '🔥 Hot' : val === 'Warm' ? '☀️ Warm' : val === 'Cold' ? '❄️ Cold' : val === 'Callback' ? '📞 Callback' : val === 'Ringing' ? '🔔 Ringing' : '⚪ Unset'
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

  // Scope all leads by counselor filter first so tab counts are always accurate
  const counselorFilteredAllLeads = useMemo(() => {
    if (selectedCounselor === 'ALL') return leads
    if (selectedCounselor === 'UNASSIGNED') return leads.filter(l => !l.owner_id)
    if (selectedCounselor === 'MY_POOL') return leads.filter(l => l.owner_id === user?.id)
    return leads.filter(l => l.owner_id === selectedCounselor)
  }, [leads, selectedCounselor, user?.id])

  // Counts for the primary view switcher tabs (scoped by selected counselor)
  const activeCount = counselorFilteredAllLeads.filter(l => l.stage !== 'Enrolled' && l.stage !== 'Junk/duplicate').length
  const enrolledCount = counselorFilteredAllLeads.filter(l => l.stage === 'Enrolled').length
  const junkCount = counselorFilteredAllLeads.filter(l => l.stage === 'Junk/duplicate').length
  const totalCount = counselorFilteredAllLeads.length

  // Base pool depending on current tab
  const counselorScopedPool = useMemo(() => {
    if (activeTab === 'active') {
      return counselorFilteredAllLeads.filter(l => l.stage !== 'Enrolled' && l.stage !== 'Junk/duplicate')
    }
    if (activeTab === 'enrolled') {
      return counselorFilteredAllLeads.filter(l => l.stage === 'Enrolled')
    }
    if (activeTab === 'junk') {
      return counselorFilteredAllLeads.filter(l => l.stage === 'Junk/duplicate')
    }
    return counselorFilteredAllLeads
  }, [counselorFilteredAllLeads, activeTab])

  const basePool = counselorScopedPool

  // Single-pass memoized count calculation across priorities and service tracks
  const {
    hotCount,
    warmCount,
    coldCount,
    callbackCount,
    ringingCount,
    unsetCount,
    studyAbroadCount,
    visaProcessCount
  } = useMemo(() => {
    let hot = 0, warm = 0, cold = 0, callback = 0, ringing = 0, unset = 0, study = 0, visa = 0
    for (let i = 0; i < counselorScopedPool.length; i++) {
      const l = counselorScopedPool[i]
      if (l.priority === 'Hot') hot++
      else if (l.priority === 'Warm') warm++
      else if (l.priority === 'Cold') cold++
      else if (l.priority === 'Callback') callback++
      else if (l.priority === 'Ringing') ringing++
      else if (!l.priority) unset++

      if (getLeadServiceType(l) === 'visa_process') visa++
      else study++
    }
    return {
      hotCount: hot,
      warmCount: warm,
      coldCount: cold,
      callbackCount: callback,
      ringingCount: ringing,
      unsetCount: unset,
      studyAbroadCount: study,
      visaProcessCount: visa
    }
  }, [counselorScopedPool])

  // Helper to test if a lead created_at falls inside selected date filter
  const matchesDateFilter = useCallback((createdAtStr: string | null | undefined): boolean => {
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
  }, [selectedDatePreset, customStartDate, customEndDate])

  // Memoized filtered leads based on priority, call outcome, country, programme level, and date
  const filteredLeads = useMemo(() => {
    return counselorScopedPool.filter(l => {
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
  }, [counselorScopedPool, selectedPriority, selectedOutcome, selectedCountry, selectedProgramme, serviceTrack, matchesDateFilter])

  // Progressive slice of leads for instant initial and filtered table paints (< 16ms INP)
  const visibleLeads = useMemo(() => {
    return filteredLeads.slice(0, displayLimit)
  }, [filteredLeads, displayLimit])

  // Single-pass stage grouping for Kanban board view
  const leadsByStage = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (let i = 0; i < filteredLeads.length; i++) {
      const s = filteredLeads[i].stage || 'New'
      if (!map[s]) map[s] = []
      map[s].push(filteredLeads[i])
    }
    return map
  }, [filteredLeads])

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD]">
      {/* Top Header */}
      <header className="px-8 py-5 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white z-10 shrink-0">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <span>{activeTab === 'enrolled' ? '🎓 Enrolled Students' : activeTab === 'junk' ? '🗑️ Junk Leads Archive' : activeTab === 'all' ? 'All Leads Master' : 'Active Leads Pipeline'}</span>
            </h1>
            {searchQuery && (
              <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md">
                Search: &ldquo;{searchQuery}&rdquo;
              </span>
            )}
            {selectedCounselor !== 'ALL' && (
              <span className="text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-200 flex items-center gap-1.5 shadow-2xs">
                <span>👤 Counselor: {
                  selectedCounselor === 'UNASSIGNED' ? 'Unassigned Leads' :
                  selectedCounselor === 'MY_POOL' ? 'My Allocated Pool' :
                  counselors.find(c => c.id === selectedCounselor)?.name || 'Selected Counselor'
                }</span>
                <button
                  type="button"
                  onClick={() => handleCounselorFilterChange('ALL')}
                  className="text-indigo-500 hover:text-indigo-900 font-bold text-sm leading-none ml-0.5 cursor-pointer"
                  title="Clear Counselor Filter"
                >×</button>
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

          {/* Primary View Switcher: Active Leads vs Enrolled Students vs Junk vs All */}
          <div className="flex items-center gap-1.5 bg-gray-100/90 p-1 rounded-xl w-fit flex-wrap">
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
              onClick={() => handleTabChange('junk')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'junk'
                  ? 'bg-red-600 text-white shadow-xs font-bold'
                  : 'text-gray-600 hover:text-red-700 hover:bg-red-50/50'
              }`}
            >
              <Trash2 size={14} className={activeTab === 'junk' ? 'text-white' : 'text-red-500'} />
              <span>🗑️ Junk Leads</span>
              <span className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'junk' ? 'bg-white text-red-800' : 'bg-red-100 text-red-800'
              }`}>
                {junkCount}
              </span>
            </button>

            <button
              onClick={() => handleTabChange('all')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5 font-bold'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200/50'
              }`}
              title="Show all leads including active, enrolled, and junk"
            >
              <span>All Master</span>
              <span className="text-[10px] text-gray-400">({totalCount})</span>
            </button>
          </div>

          {/* Service Stream Switcher: Study Abroad vs Visa Process */}
          <div className="flex items-center gap-1 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/70 p-1 rounded-xl w-fit shadow-2xs">
            <button
              onClick={() => {
                startTransition(() => {
                  setServiceTrack('all')
                  setDisplayLimit(100)
                })
              }}
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
              onClick={() => {
                startTransition(() => {
                  setServiceTrack('study_abroad')
                  setDisplayLimit(100)
                })
              }}
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
              onClick={() => {
                startTransition(() => {
                  setServiceTrack('visa_process')
                  setDisplayLimit(100)
                })
              }}
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
            onClick={() => {
              startTransition(() => {
                setSelectedPriority('ALL')
                setDisplayLimit(100)
              })
            }}
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
            onClick={() => {
              startTransition(() => {
                setSelectedPriority('Hot')
                setDisplayLimit(100)
              })
            }}
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
            onClick={() => {
              startTransition(() => {
                setSelectedPriority('Warm')
                setDisplayLimit(100)
              })
            }}
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
            onClick={() => {
              startTransition(() => {
                setSelectedPriority('Cold')
                setDisplayLimit(100)
              })
            }}
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

          {/* Callback */}
          <button
            onClick={() => {
              startTransition(() => {
                setSelectedPriority('Callback')
                setDisplayLimit(100)
              })
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              selectedPriority === 'Callback'
                ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-200 font-semibold'
                : 'bg-white border border-purple-200 text-purple-700 hover:bg-purple-50'
            }`}
          >
            <span>📞 Callback</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              selectedPriority === 'Callback' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'
            }`}>
              {callbackCount}
            </span>
          </button>

          {/* Ringing */}
          <button
            onClick={() => {
              startTransition(() => {
                setSelectedPriority('Ringing')
                setDisplayLimit(100)
              })
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
              selectedPriority === 'Ringing'
                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-200 font-semibold'
                : 'bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span>🔔 Ringing</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
              selectedPriority === 'Ringing' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {ringingCount}
            </span>
          </button>

          {/* Unset */}
          {unsetCount > 0 && (
            <button
              onClick={() => {
                startTransition(() => {
                  setSelectedPriority('UNSET')
                  setDisplayLimit(100)
                })
              }}
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
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSelectedOutcome(val)
                  setDisplayLimit(100)
                })
              }}
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
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSelectedCountry(val)
                  setDisplayLimit(100)
                })
              }}
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
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSelectedProgramme(val)
                  setDisplayLimit(100)
                })
              }}
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
              onChange={(e) => {
                const val = e.target.value
                startTransition(() => {
                  setSelectedDatePreset(val)
                  setDisplayLimit(100)
                })
              }}
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
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => {
                      setCustomStartDate(val)
                      setDisplayLimit(100)
                    })
                  }}
                  className="text-[11px] font-medium text-gray-700 outline-none px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded"
                  title="Start Date (From)"
                />
                <span className="text-[10px] text-gray-400 font-bold px-0.5">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => {
                      setCustomEndDate(val)
                      setDisplayLimit(100)
                    })
                  }}
                  className="text-[11px] font-medium text-gray-700 outline-none px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded"
                  title="End Date (To)"
                />
              </div>
            )}
          </div>

          {/* Counselor Filter (For Managers & Team Leaders) */}
          {(isManager(user) || isTeamLeader(user)) && (
            <div className="flex items-center gap-1.5 sm:border-l sm:border-gray-200 sm:pl-3 sm:ml-1">
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap flex items-center gap-1">
                <Users size={13} className="text-indigo-600" /> Counselor:
              </span>
              <select
                value={selectedCounselor}
                onChange={(e) => handleCounselorFilterChange(e.target.value)}
                className="bg-white border border-indigo-200 text-indigo-900 text-xs rounded-lg px-2.5 py-1.5 font-semibold outline-none shadow-xs hover:bg-indigo-50/50 focus:ring-2 focus:ring-indigo-200 transition-all cursor-pointer"
              >
                {isManager(user) ? (
                  <>
                    <option value="ALL">👥 All Counselors ({leads.length})</option>
                    <option value="UNASSIGNED">⚪ Unassigned Leads ({leadCountsByCounselor.unassigned})</option>
                    {counselors.map(c => {
                      const count = leadCountsByCounselor.counts[c.id] || 0
                      return (
                        <option key={c.id} value={c.id}>
                          👤 {c.name} ({count})
                        </option>
                      )
                    })}
                  </>
                ) : (
                  <>
                    <option value="ALL">👥 All Team Leads ({leads.length})</option>
                    <option value="MY_POOL">
                      👑 My Allocated Pool ({leadCountsByCounselor.counts[user?.id || ''] || 0})
                    </option>
                    {assignableCounselors
                      .filter(c => c.id !== user?.id)
                      .map(c => {
                        const count = leadCountsByCounselor.counts[c.id] || 0
                        return (
                          <option key={c.id} value={c.id}>
                            👤 {c.name} ({count})
                          </option>
                        )
                      })}
                  </>
                )}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Select All in Toolbar */}
          {filteredLeads.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllLeads}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer ${
                selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0
                  ? 'bg-blue-600 text-white border-blue-700'
                  : selectedLeadIds.length > 0
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <CheckSquare size={13} />
              <span>
                {selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0
                  ? `Deselect All (${filteredLeads.length})`
                  : selectedLeadIds.length > 0
                  ? `Selected (${selectedLeadIds.length}/${filteredLeads.length})`
                  : `Select All (${filteredLeads.length})`}
              </span>
            </button>
          )}

          {(selectedPriority !== 'ALL' || selectedOutcome !== 'ALL' || selectedCountry !== 'ALL' || selectedProgramme !== 'ALL' || selectedDatePreset !== 'ALL' || serviceTrack !== 'all' || selectedCounselor !== 'ALL') && (
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
                handleCounselorFilterChange('ALL');
              }}
              className="text-xs text-blue-600 hover:text-black font-semibold underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
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

        {activeTab === 'junk' && (
          <div className="mb-6 bg-gradient-to-r from-red-500/10 via-amber-500/5 to-rose-500/10 border border-red-300/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-red-950 flex items-center gap-2">
                  <span>🗑️ Junk &amp; Duplicate Leads Archive</span>
                  <span className="text-[10px] font-semibold bg-red-100 text-red-800 border border-red-300 px-2 py-0.5 rounded-full">
                    {junkCount} Leads
                  </span>
                </h3>
                <p className="text-xs text-red-800 mt-0.5">
                  These leads were marked as junk, invalid, or duplicate. Their priorities and follow-up schedules are cleared to protect active pipeline metrics.
                </p>
              </div>
            </div>
            {canManageLeads(user) && filteredLeads.length > 0 && (
              <button
                type="button"
                onClick={async () => {
                  const targetIds = selectedLeadIds.length > 0 ? selectedLeadIds : filteredLeads.map(l => l.id)
                  if (!confirm(`Revive ${targetIds.length} junk lead(s) back to active pipeline (Stage = 'New')?`)) return
                  setBulkProcessing(true)
                  try {
                    const { error } = await supabase
                      .from('leads')
                      .update({ stage: 'New', updated_at: new Date().toISOString() })
                      .in('id', targetIds)
                    if (error) throw error

                    // Audit trail log
                    await supabase.from('activities').insert(
                      targetIds.map(id => ({
                        lead_id: id,
                        type: 'STAGE_CHANGE',
                        title: 'Lead Revived from Junk',
                        description: `Lead revived from Junk/duplicate back to 'New' pipeline by ${user?.name || 'User'}`,
                        created_by: user?.id,
                        created_at: new Date().toISOString()
                      }))
                    )

                    setLeads(prev => prev.map(l => targetIds.includes(l.id) ? { ...l, stage: 'New' } : l))
                    setSelectedLeadIds([])
                    alert(`Successfully revived ${targetIds.length} lead(s) to 'New'!`)
                  } catch (err: any) {
                    alert(`Failed to revive leads: ${err.message}`)
                  } finally {
                    setBulkProcessing(false)
                  }
                }}
                disabled={bulkProcessing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-all w-fit shrink-0 cursor-pointer"
              >
                <Sparkles size={13} />
                <span>
                  {selectedLeadIds.length > 0
                    ? `Revive Selected (${selectedLeadIds.length}) to 'New'`
                    : `Revive All (${filteredLeads.length}) to 'New'`}
                </span>
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
          </div>
        ) : view === 'list' ? (
          /* List View */
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            {/* ─── Always-Visible Bulk Selection & Assignment Header Bar ─── */}
            <div className="px-5 py-3 bg-gradient-to-r from-gray-50 via-blue-50/40 to-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Master Select All Checkbox Button */}
                <button
                  type="button"
                  onClick={toggleSelectAllLeads}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 border cursor-pointer ${
                    selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : selectedLeadIds.length > 0
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-100 shadow-2xs'
                  }`}
                  title="Click to select or deselect all filtered leads"
                >
                  <CheckSquare size={14} className={selectedLeadIds.length > 0 ? 'text-blue-500' : 'text-gray-400'} />
                  <span>
                    {selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0
                      ? `Deselect All (${filteredLeads.length})`
                      : selectedLeadIds.length > 0
                      ? `Selected (${selectedLeadIds.length}/${filteredLeads.length})`
                      : `Select All (${filteredLeads.length} leads)`}
                  </span>
                </button>

                {selectedLeadIds.length > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200 animate-in fade-in">
                    ✓ {selectedLeadIds.length} selected
                  </span>
                )}

                {selectedLeadIds.length > 0 && selectedLeadIds.length < filteredLeads.length && (
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds(filteredLeads.map(l => l.id))}
                    className="text-xs text-blue-700 hover:text-blue-900 font-semibold underline cursor-pointer"
                  >
                    Select all {filteredLeads.length}
                  </button>
                )}

                {selectedLeadIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds([])}
                    className="text-xs text-gray-500 hover:text-black font-medium cursor-pointer"
                  >
                    Clear selection
                  </button>
                )}

                {selectedLeadIds.length > 0 && (
                  <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
                    <span className="text-xs font-semibold text-gray-600">Priority:</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkUpdatePriority(e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className="text-xs font-semibold text-gray-800 bg-white border border-gray-300 rounded-lg px-2 py-1 outline-none cursor-pointer shadow-2xs hover:bg-gray-50"
                      defaultValue=""
                    >
                      <option value="" disabled>Set Priority ({selectedLeadIds.length})...</option>
                      <option value="Hot">🔥 Hot</option>
                      <option value="Warm">☀️ Warm</option>
                      <option value="Cold">❄️ Cold</option>
                      <option value="Callback">📞 Callback</option>
                      <option value="Ringing">🔔 Ringing</option>
                      <option value="UNSET">⚪ Unset</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Bulk Reassign to Counselor (Always visible for TL & Admin) */}
              {canManageLeads(user) && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-gray-700 flex items-center gap-1">
                    <Users size={13} className="text-blue-600" />
                    Assign {selectedLeadIds.length > 0 ? `(${selectedLeadIds.length})` : ''} to:
                  </span>

                  <select
                    value={bulkTargetCounselor}
                    onChange={e => setBulkTargetCounselor(e.target.value)}
                    className="text-xs font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-black cursor-pointer shadow-2xs"
                  >
                    <option value="">Choose Counselor...</option>
                    {isManager(user) && (
                      <option value="unassigned">⚪ Unassigned Pool</option>
                    )}
                    {isTeamLeader(user) && (
                      <option value={user.id}>👑 My Allocated Pool ({user.name || 'Me'})</option>
                    )}
                    {counselorBulkOptions}
                  </select>

                  <button
                    type="button"
                    disabled={bulkProcessing}
                    onClick={() => {
                      if (selectedLeadIds.length === 0) {
                        const allIds = filteredLeads.map(l => l.id)
                        setSelectedLeadIds(allIds)
                        if (!bulkTargetCounselor) {
                          alert(`Selected all ${allIds.length} leads! Now choose a counselor from the dropdown and click Assign.`)
                          return
                        }
                        handleBulkReassignLeads(allIds)
                        return
                      }
                      if (!bulkTargetCounselor) {
                        alert('Please choose a counselor from the dropdown to assign the selected leads.')
                        return
                      }
                      handleBulkReassignLeads()
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                      selectedLeadIds.length > 0 && bulkTargetCounselor
                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                        : selectedLeadIds.length > 0
                        ? 'bg-black hover:bg-gray-800 text-white'
                        : 'bg-black hover:bg-gray-800 text-white'
                    }`}
                  >
                    <ArrowRight size={13} />
                    <span>
                      {selectedLeadIds.length > 0
                        ? `Assign (${selectedLeadIds.length})`
                        : `Assign All (${filteredLeads.length})`}
                    </span>
                  </button>
                </div>
              )}
            </div>

            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="w-12 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length}
                      ref={input => {
                        if (input) {
                          input.indeterminate = selectedLeadIds.length > 0 && selectedLeadIds.length < filteredLeads.length
                        }
                      }}
                      onChange={toggleSelectAllLeads}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                      title="Select all filtered leads"
                    />
                  </th>
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
                {visibleLeads.map((lead) => {
                  const isSelected = selectedLeadIds.includes(lead.id)
                  return (
                    <tr
                      key={lead.id}
                      className={`transition-colors group ${
                        isSelected ? 'bg-blue-50/50 hover:bg-blue-50/70' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="w-12 px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
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
                            : lead.priority === 'Callback'
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 focus:ring-2 focus:ring-purple-200'
                            : lead.priority === 'Ringing'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 focus:ring-2 focus:ring-emerald-200'
                            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        <option value="">⚪ Unset</option>
                        <option value="Hot">🔥 Hot</option>
                        <option value="Warm">☀️ Warm</option>
                        <option value="Cold">❄️ Cold</option>
                        <option value="Callback">📞 Callback</option>
                        <option value="Ringing">🔔 Ringing</option>
                      </select>
                    </td>

                    <td className="px-6 py-4 text-gray-600">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-900">{lead.phone}</span>
                        <a
                          href={getCallHippoDialerUrl(lead.phone)}
                          onClick={(e) => openCallHippoDialer(lead.phone, e)}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md text-[11px] font-semibold transition-all cursor-pointer shadow-2xs"
                          title="Call via CallHippo"
                        >
                          <Phone size={11} className="text-emerald-600" />
                          <span>CallHippo</span>
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
                    
                    {/* Owner / Reassign Inline */}
                    <td className="px-6 py-4">
                      {canManageLeads(user) ? (
                        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={lead.owner_id || ''}
                            disabled={reassigningId === lead.id}
                            onChange={(e) => handleReassignLead(lead.id, e.target.value)}
                            title="Click to reassign to any counselor"
                            className={`text-xs font-semibold px-2.5 py-1 rounded-md border outline-none cursor-pointer transition-all shadow-2xs ${
                              reassigningId === lead.id
                                ? 'opacity-50 cursor-wait bg-gray-100 text-gray-400 border-gray-200'
                                : lead.owner_id
                                ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100/80 hover:border-blue-300 focus:ring-2 focus:ring-blue-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200 focus:ring-2 focus:ring-gray-300'
                            }`}
                          >
                            {isManager(user) && (
                              <option value="">⚪ Unassigned</option>
                            )}

                            {isTeamLeader(user) && (
                              <option value={user.id}>
                                👑 My Pool ({user.name || 'Me'})
                              </option>
                            )}

                            {lead.owner_id &&
                              lead.owner_id !== user.id &&
                              !assignableCounselors.some(c => c.id === lead.owner_id) && (
                                <option value={lead.owner_id}>
                                  👤 {lead.owner?.name || 'Current Owner'}
                                </option>
                            )}

                            {counselorSelectOptions}
                          </select>
                        </div>
                      ) : (
                        lead.owner?.name ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            {lead.owner.name}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs text-gray-400 bg-gray-100">
                            Unassigned
                          </span>
                        )
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
                )
              })}
              </tbody>
            </table>
            {filteredLeads.length > displayLimit && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3.5 bg-gray-50/90 border-t border-gray-200">
                <span className="text-xs text-gray-500 font-medium">
                  Showing first <strong className="text-gray-900">{visibleLeads.length}</strong> of <strong className="text-gray-900">{filteredLeads.length}</strong> filtered leads
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(prev => prev + 100)}
                    className="px-3.5 py-1.5 bg-white border border-gray-300 text-gray-800 hover:bg-gray-100 rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  >
                    Load Next 100 Leads
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisplayLimit(filteredLeads.length)}
                    className="px-3.5 py-1.5 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  >
                    Show All ({filteredLeads.length})
                  </button>
                </div>
              </div>
            )}
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
              const stageLeads = leadsByStage[stage] || []
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
                                : lead.priority === 'Cold'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : lead.priority === 'Callback'
                                ? 'bg-purple-50 text-purple-700 border-purple-200'
                                : lead.priority === 'Ringing'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-50 text-gray-700 border-gray-200'
                            }`}>
                              {lead.priority === 'Hot' ? '🔥 Hot' : lead.priority === 'Warm' ? '☀️ Warm' : lead.priority === 'Cold' ? '❄️ Cold' : lead.priority === 'Callback' ? '📞 Callback' : lead.priority === 'Ringing' ? '🔔 Ringing' : lead.priority}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-500 font-medium">{lead.phone}</p>
                          <a
                            href={getCallHippoDialerUrl(lead.phone)}
                            onClick={(e) => openCallHippoDialer(lead.phone, e)}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded text-[10px] font-semibold transition-colors cursor-pointer"
                            title="Call via CallHippo"
                          >
                            <Phone size={11} className="text-emerald-600" />
                            <span>Call</span>
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
      {/* ─── Floating Bulk Action Pill (Fixed at bottom when leads are selected) ─── */}
      {selectedLeadIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-950/95 backdrop-blur-md text-white px-5 py-3 rounded-2xl shadow-2xl border border-gray-700 flex items-center gap-3.5 flex-wrap animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-bold text-white">
              {selectedLeadIds.length} lead(s) selected
            </span>
          </div>

          <div className="h-4 w-px bg-gray-700 mx-1 hidden sm:block" />

          {selectedLeadIds.length < filteredLeads.length ? (
            <button
              type="button"
              onClick={() => setSelectedLeadIds(filteredLeads.map(l => l.id))}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline cursor-pointer"
            >
              Select all ({filteredLeads.length})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedLeadIds([])}
              className="text-xs text-gray-400 hover:text-white font-medium cursor-pointer"
            >
              Deselect all
            </button>
          )}

          {canManageLeads(user) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-300 font-medium">Assign to:</span>
              <select
                value={bulkTargetCounselor}
                onChange={e => setBulkTargetCounselor(e.target.value)}
                className="text-xs font-semibold text-gray-900 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 outline-none cursor-pointer"
              >
                <option value="">Select Counselor...</option>
                {isManager(user) && (
                  <option value="unassigned">⚪ Unassigned Pool</option>
                )}
                {isTeamLeader(user) && (
                  <option value={user.id}>👑 My Allocated Pool ({user.name || 'Me'})</option>
                )}
                {assignableCounselors
                  .filter(c => !isTeamLeader(user) || c.id !== user.id)
                  .map(c => (
                    <option key={c.id} value={c.id}>
                      👤 {c.name}
                    </option>
                  ))}
              </select>

              <button
                type="button"
                disabled={!bulkTargetCounselor || bulkProcessing}
                onClick={() => handleBulkReassignLeads()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer shadow-xs"
              >
                Confirm Move ({selectedLeadIds.length})
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSelectedLeadIds([])}
            className="text-xs text-gray-400 hover:text-white font-medium ml-1 cursor-pointer"
          >
            Cancel
          </button>
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

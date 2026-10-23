'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeftRight, Users, User, Flame, Phone, CheckCircle2,
  AlertCircle, GripVertical, Search, Filter, Sparkles, RefreshCw,
  ExternalLink, ArrowRight, ShieldAlert, CheckSquare, Square,
  Layers, ChevronDown, Check, ArrowDownUp, Globe, GraduationCap,
  Crown, Zap, Calendar
} from 'lucide-react'
import { notifyLeadAssigned } from '@/lib/notifications'
import { formatCountryBadge, matchesCountryFilter, matchesProgrammeFilter } from '@/lib/countryHelper'
import { canManageLeads, isManager, isTeamLeader, getAssignableCounselors, getAllowedOwnerIds } from '@/lib/teamHelper'
import { getLeadServiceType, getServiceBadgeInfo, ServiceTrack } from '@/lib/leadTypeHelper'

interface Counselor {
  id: string
  name: string
  email: string
  open_lead_cap?: number
  active: boolean
  languages?: string
}

interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  stage: string
  priority?: string
  source?: string
  course?: string
  programme_level?: string
  country?: string
  owner_id?: string | null
  created_at: string
  last_call_outcome?: string
  metadata?: any
}

export default function LeadReassignmentPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [leads, setLeads] = useState<Lead[]>([])
  const [counselors, setCounselors] = useState<Counselor[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const searchParams = useSearchParams()
  const initialCountry = searchParams?.get('country') || 'all'
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStage, setSelectedStage] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [selectedCountry, setSelectedCountry] = useState<string>(initialCountry)
  const [selectedProgramme, setSelectedProgramme] = useState<string>('all')

  // Service Track Filter: 'all' | 'study_abroad' | 'visa_process'
  const [serviceTrack, setServiceTrack] = useState<ServiceTrack>('all')

  // Date Filter State: 'ALL' | 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'custom'
  const [selectedDatePreset, setSelectedDatePreset] = useState<string>('ALL')
  const [customStartDate, setCustomStartDate] = useState<string>('')
  const [customEndDate, setCustomEndDate] = useState<string>('')

  // Drag and Drop State
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null) // counselor.id or 'unassigned'
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastMovedLead, setLastMovedLead] = useState<{ leadName: string; toName: string } | null>(null)

  // Bulk Selection State
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [bulkTargetCounselorId, setBulkTargetCounselorId] = useState<string>('')

  // Manager or Team Leader Access Guard
  useEffect(() => {
    if (user && !canManageLeads(user)) {
      router.push('/')
    }
  }, [user, router])

  const fetchData = async () => {
    const [
      { data: counselorsData },
      { data: leadsData },
      { data: stagesData },
    ] = await Promise.all([
      supabase.from('users').select('id, name, email, role, languages, active').eq('active', true).order('name', { ascending: true }),
      supabase.from('leads').select('id, name, phone, email, country, course, programme_level, stage, owner_id, priority, created_at, metadata').neq('stage', 'Enrolled').order('created_at', { ascending: false }).limit(500),
      supabase.from('stages').select('name').order('stage_order', { ascending: true }),
    ])

    const activeCounselors = (counselorsData || []).filter(c => c.role === 'counselor')
    const assignableCounselors = getAssignableCounselors(user, activeCounselors)
    setCounselors(assignableCounselors)

    // Filter leads to match role scope:
    // Manager: All leads (including unassigned)
    // Team Leader: ONLY leads assigned to Team Leader or their team members (NO unassigned leads)
    const allowedOwners = getAllowedOwnerIds(user, activeCounselors)
    const scopedLeads = allowedOwners
      ? (leadsData || []).filter(l => l.owner_id && allowedOwners.has(l.owner_id))
      : (leadsData || [])

    setLeads(scopedLeads)
    setStages((stagesData || []).map(s => s.name))

    if (assignableCounselors.length > 0 && !bulkTargetCounselorId) {
      setBulkTargetCounselorId(assignableCounselors[0].id)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    // Realtime subscription for leads and assignments
    const channel = supabase
      .channel('reassign-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () => fetchData())
      .subscribe()

    const interval = setInterval(fetchData, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setTimeout(() => setRefreshing(false), 500)
  }

  const studyAbroadCount = useMemo(() => leads.filter(l => getLeadServiceType(l) === 'study_abroad').length, [leads])
  const visaProcessCount = useMemo(() => leads.filter(l => getLeadServiceType(l) === 'visa_process').length, [leads])

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

  // ── Filtered Leads ──
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      // Service Track Filter (Study Abroad vs Visa Process)
      if (serviceTrack !== 'all') {
        const sType = getLeadServiceType(l)
        if (sType !== serviceTrack) return false
      }
      // Date Filter
      if (!matchesDateFilter(l.created_at)) return false

      if (selectedStage !== 'all' && l.stage !== selectedStage) return false
      if (selectedPriority !== 'all' && l.priority !== selectedPriority) return false
      if (selectedCountry !== 'all') {
        if (!matchesCountryFilter(l, selectedCountry)) return false
      }
      if (selectedProgramme !== 'all') {
        if (!matchesProgrammeFilter(l, selectedProgramme)) return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = l.name?.toLowerCase().includes(q)
        const matchPhone = l.phone?.toLowerCase().includes(q)
        const matchCourse = l.course?.toLowerCase().includes(q)
        const matchCountry = l.country?.toLowerCase().includes(q)
        if (!matchName && !matchPhone && !matchCourse && !matchCountry) return false
      }
      return true
    })
  }, [leads, serviceTrack, selectedDatePreset, customStartDate, customEndDate, selectedStage, selectedPriority, selectedCountry, selectedProgramme, searchQuery])

  // ── Group leads by counselor ID (or 'unassigned') ──
  const leadsByCounselor = useMemo(() => {
    const map: Record<string, Lead[]> = { unassigned: [] }
    if (user?.id) {
      map[user.id] = []
    }
    counselors.forEach(c => {
      map[c.id] = []
    })

    filteredLeads.forEach(l => {
      if (!l.owner_id) {
        map.unassigned.push(l)
      } else if (map[l.owner_id]) {
        map[l.owner_id].push(l)
      } else {
        map.unassigned.push(l)
      }
    })

    return map
  }, [filteredLeads, counselors, user?.id])

  // ── KPI Summary Stats ──
  const stats = useMemo(() => {
    const total = leads.length
    const unassigned = leads.filter(l => !l.owner_id).length
    const myPool = user?.id ? leads.filter(l => l.owner_id === user.id).length : 0
    const activeCounselorCount = counselors.length
    const avgLeads = activeCounselorCount > 0 ? Math.round((total - unassigned - myPool) / activeCounselorCount) : 0
    return { total, unassigned, myPool, activeCounselorCount, avgLeads }
  }, [leads, counselors, user?.id])

  // ── Drag and Drop Handler ──
  const handleDropLead = async (targetColumnId: string) => {
    if (!draggedLeadId) return
    if (isTeamLeader(user) && targetColumnId === 'unassigned') {
      alert('Team Leaders cannot move leads to the general unassigned pool.')
      setDraggedLeadId(null)
      setDragOverColumnId(null)
      return
    }

    const lead = leads.find(l => l.id === draggedLeadId)
    if (!lead) return

    const newOwnerId = targetColumnId === 'unassigned' ? null : targetColumnId
    const oldOwnerId = lead.owner_id

    // No-op if dropped in same column
    if (newOwnerId === oldOwnerId) {
      setDraggedLeadId(null)
      setDragOverColumnId(null)
      return
    }

    const targetCounselor = counselors.find(c => c.id === newOwnerId)
    const targetName =
      targetColumnId === 'unassigned'
        ? 'Unassigned Pool'
        : newOwnerId === user?.id
        ? '👑 My Leads Pool'
        : targetCounselor
        ? targetCounselor.name
        : 'Assigned User'

    const isJunkLead = lead.stage === 'Junk/duplicate'
    const newStage = isJunkLead ? 'New' : lead.stage

    // Optimistic UI update
    setLeads(prev =>
      prev.map(l => (l.id === draggedLeadId ? { ...l, owner_id: newOwnerId, stage: newStage } : l))
    )
    setLastMovedLead({ leadName: lead.name, toName: targetName })
    setTimeout(() => setLastMovedLead(null), 4000)

    setDraggedLeadId(null)
    setDragOverColumnId(null)
    setIsProcessing(true)

    try {
      // 1. Update Lead table (Auto-revive to 'New' if lead was in Junk/duplicate)
      const updatePayload: any = { owner_id: newOwnerId, updated_at: new Date().toISOString() }
      if (isJunkLead) {
        updatePayload.stage = 'New'
      }
      await supabase.from('leads').update(updatePayload).eq('id', lead.id)

      // 2. Insert Assignment Audit Record
      await supabase.from('assignments').insert([
        {
          lead_id: lead.id,
          from_user: oldOwnerId || null,
          to_user: newOwnerId,
          assigned_by: user?.id,
          reason: isJunkLead
            ? 'Revived from Junk/duplicate & Reassigned'
            : isTeamLeader(user)
            ? 'Team Leader Reassignment'
            : 'Manager Reassignment',
          time: new Date().toISOString(),
        },
      ])

      // 3. Log Activity Timeline
      await supabase.from('activities').insert([
        {
          lead: lead.id,
          user_id: user?.id,
          type: isJunkLead ? 'STAGE_CHANGE' : 'assignment',
          text: isJunkLead
            ? `Lead revived from Junk/duplicate and reassigned to ${targetName}. Stage reset to New.`
            : `Reassigned to ${targetName} via Drag & Drop distribution board.`,
          time: new Date().toISOString(),
        },
      ])

      // 4. Trigger in-app notification to new counselor
      if (newOwnerId && newOwnerId !== user?.id) {
        notifyLeadAssigned({
          recipientId: newOwnerId,
          leadId: lead.id,
          leadName: lead.name,
          senderName: user?.name || (isTeamLeader(user) ? 'Team Leader' : 'Manager'),
        }).catch(console.error)
      }
    } catch (err) {
      console.error('Error reassigning lead:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Auto-Distribute Leads (Round Robin) ──
  const handleAutoDistribute = async () => {
    if (isManager(user)) {
      const unassignedList = leads.filter(l => !l.owner_id)
      if (unassignedList.length === 0) {
        alert('No unassigned leads found in the pool to distribute.')
        return
      }
      if (counselors.length === 0) {
        alert('No active counselors available to receive leads.')
        return
      }

      const confirmMsg = `Auto-distribute all ${unassignedList.length} unassigned leads equally among ${counselors.length} active staff?`
      if (!confirm(confirmMsg)) return

      setIsProcessing(true)

      try {
        for (let i = 0; i < unassignedList.length; i++) {
          const lead = unassignedList[i]
          const targetCounselor = counselors[i % counselors.length]
          const isJunk = lead.stage === 'Junk/duplicate'
          const updatePayload: any = { owner_id: targetCounselor.id, updated_at: new Date().toISOString() }
          if (isJunk) updatePayload.stage = 'New'

          await supabase.from('leads').update(updatePayload).eq('id', lead.id)

          await supabase.from('assignments').insert([
            {
              lead_id: lead.id,
              from_user: null,
              to_user: targetCounselor.id,
              assigned_by: user?.id,
              reason: isJunk ? 'Revived from Junk & Auto-Distributed' : 'Manager Auto-Distributed via Round Robin',
              time: new Date().toISOString(),
            },
          ])

          await supabase.from('activities').insert([
            {
              lead: lead.id,
              user_id: user?.id,
              type: isJunk ? 'STAGE_CHANGE' : 'assignment',
              text: isJunk
                ? `Lead revived from Junk/duplicate and assigned to ${targetCounselor.name}. Stage reset to New.`
                : `Assigned to ${targetCounselor.name} via Auto-Distribution.`,
              time: new Date().toISOString(),
            },
          ])

          notifyLeadAssigned({
            recipientId: targetCounselor.id,
            leadId: lead.id,
            leadName: lead.name,
            senderName: user?.name || 'Manager',
          }).catch(console.error)
        }

        await fetchData()
        setLastMovedLead({
          leadName: `${unassignedList.length} Leads`,
          toName: `All ${counselors.length} Staff Members (Round Robin)`,
        })
        setTimeout(() => setLastMovedLead(null), 4000)
      } catch (err) {
        console.error('Error during auto-distribution:', err)
      } finally {
        setIsProcessing(false)
      }
    } else if (isTeamLeader(user)) {
      const myPool = leads.filter(l => l.owner_id === user?.id)
      if (myPool.length === 0) {
        alert('No leads in your pool to distribute. When Admin allocates leads to you, they will appear here.')
        return
      }
      if (counselors.length === 0) {
        alert('No counselors assigned to your team yet. Please contact Admin.')
        return
      }

      const confirmMsg = `Auto-distribute all ${myPool.length} leads from your pool equally among your ${counselors.length} team counselors?`
      if (!confirm(confirmMsg)) return

      setIsProcessing(true)

      try {
        for (let i = 0; i < myPool.length; i++) {
          const lead = myPool[i]
          const targetCounselor = counselors[i % counselors.length]
          const isJunk = lead.stage === 'Junk/duplicate'
          const updatePayload: any = { owner_id: targetCounselor.id, updated_at: new Date().toISOString() }
          if (isJunk) updatePayload.stage = 'New'

          await supabase.from('leads').update(updatePayload).eq('id', lead.id)

          await supabase.from('assignments').insert([
            {
              lead_id: lead.id,
              from_user: user?.id,
              to_user: targetCounselor.id,
              assigned_by: user?.id,
              reason: isJunk ? 'Revived from Junk & TL Auto-Distributed' : 'Team Leader Auto-Distribute',
              time: new Date().toISOString(),
            },
          ])

          await supabase.from('activities').insert([
            {
              lead: lead.id,
              user_id: user?.id,
              type: isJunk ? 'STAGE_CHANGE' : 'assignment',
              text: isJunk
                ? `Lead revived from Junk/duplicate and assigned to ${targetCounselor.name}. Stage reset to New.`
                : `Assigned to ${targetCounselor.name} by Team Leader.`,
              time: new Date().toISOString(),
            },
          ])

          notifyLeadAssigned({
            recipientId: targetCounselor.id,
            leadId: lead.id,
            leadName: lead.name,
            senderName: user?.name || 'Team Leader',
          }).catch(console.error)
        }

        await fetchData()
        setLastMovedLead({
          leadName: `${myPool.length} Leads`,
          toName: `Your ${counselors.length} Team Counselors (Round Robin)`,
        })
        setTimeout(() => setLastMovedLead(null), 4000)
      } catch (err) {
        console.error('Error during TL auto-distribution:', err)
      } finally {
        setIsProcessing(false)
      }
    }
  }

  // ── Bulk Reassign Selected Leads ──
  const handleBulkReassign = async () => {
    if (selectedLeadIds.length === 0 || !bulkTargetCounselorId) return

    const targetCounselor = counselors.find(c => c.id === bulkTargetCounselorId)
    const targetName = targetCounselor ? targetCounselor.name : 'Selected Counselor'

    if (!confirm(`Reassign ${selectedLeadIds.length} selected leads to ${targetName}?`)) return

    setIsProcessing(true)

    try {
      for (const leadId of selectedLeadIds) {
        const lead = leads.find(l => l.id === leadId)
        const isJunk = lead?.stage === 'Junk/duplicate'
        const updatePayload: any = { owner_id: bulkTargetCounselorId, updated_at: new Date().toISOString() }
        if (isJunk) updatePayload.stage = 'New'
        await supabase.from('leads').update(updatePayload).eq('id', leadId)

        await supabase.from('assignments').insert([
          {
            lead_id: leadId,
            from_user: lead?.owner_id || null,
            to_user: bulkTargetCounselorId,
            assigned_by: user?.id,
            reason: isJunk ? 'Revived from Junk & Reassigned' : 'Bulk Reassignment',
            time: new Date().toISOString(),
          },
        ])

        await supabase.from('activities').insert([
          {
            lead: leadId,
            user_id: user?.id,
            type: isJunk ? 'STAGE_CHANGE' : 'assignment',
            text: isJunk
              ? `Lead revived from Junk/duplicate and bulk reassigned to ${targetName}. Stage reset to New.`
              : `Bulk reassigned to ${targetName}.`,
            time: new Date().toISOString(),
          },
        ])
      }

      notifyLeadAssigned({
        recipientId: bulkTargetCounselorId,
        leadId: selectedLeadIds[0],
        leadName: `${selectedLeadIds.length} bulk leads`,
        senderName: user?.name || 'Manager',
      }).catch(console.error)

      setSelectedLeadIds([])
      setBulkMode(false)
      await fetchData()

      setLastMovedLead({
        leadName: `${selectedLeadIds.length} Leads`,
        toName: targetName,
      })
      setTimeout(() => setLastMovedLead(null), 4000)
    } catch (err) {
      console.error('Error in bulk reassignment:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // Bulk checkbox toggle
  const toggleSelectLead = (leadId: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    )
  }

  const toggleSelectAllInColumn = (columnLeads: Lead[]) => {
    setBulkMode(true)
    const columnIds = columnLeads.map(l => l.id)
    const allSelected = columnIds.length > 0 && columnIds.every(id => selectedLeadIds.includes(id))

    if (allSelected) {
      setSelectedLeadIds(prev => prev.filter(id => !columnIds.includes(id)))
    } else {
      setSelectedLeadIds(prev => Array.from(new Set([...prev, ...columnIds])))
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFDFD]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#FDFDFD] animate-in fade-in duration-300">
      {/* ──────── Top Header Bar ──────── */}
      <div className="p-6 pb-4 border-b border-gray-200 bg-white shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                Lead Re-assignment
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                <ArrowLeftRight size={11} />
                Drag & Drop Board
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Realtime Sync
              </span>
              {isTeamLeader(user) && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
                  👑 Team Leader Workspace (Assigning to your team)
                </span>
              )}
            </div>
            <p className="text-gray-500 text-xs mt-1">
              {isTeamLeader(user)
                ? 'Distribute your allocated lead pool and balance workloads between counselors in your team.'
                : 'Drag student cards between counselor columns to instantly rebalance workloads and reassign leads.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Auto Distribute Round Robin Button */}
            <button
              onClick={handleAutoDistribute}
              disabled={isProcessing || (isManager(user) ? stats.unassigned === 0 : stats.myPool === 0)}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <Sparkles size={13} className="text-amber-500" />
              <span>
                {isManager(user)
                  ? `Auto-Distribute (${stats.unassigned} Unassigned)`
                  : `Auto-Distribute My Pool (${stats.myPool} Leads)`}
              </span>
            </button>

            {/* Global Select All Leads Button */}
            {filteredLeads.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!bulkMode) setBulkMode(true)
                  const allIds = filteredLeads.map(l => l.id)
                  const allSelected = allIds.length > 0 && allIds.every(id => selectedLeadIds.includes(id))
                  if (allSelected) {
                    setSelectedLeadIds([])
                  } else {
                    setSelectedLeadIds(allIds)
                  }
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border shadow-2xs cursor-pointer ${
                  selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0
                    ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                    : selectedLeadIds.length > 0
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
                title="Select all filtered leads across the entire board"
              >
                <CheckSquare size={13} />
                <span>
                  {selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0
                    ? `Deselect All (${filteredLeads.length})`
                    : selectedLeadIds.length > 0
                    ? `Selected (${selectedLeadIds.length}/${filteredLeads.length})`
                    : `Select All Board (${filteredLeads.length})`}
                </span>
              </button>
            )}

            {/* Bulk Mode Toggle Button */}
            <button
              onClick={() => {
                setBulkMode(!bulkMode)
                setSelectedLeadIds([])
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                bulkMode
                  ? 'bg-black text-white border-black shadow-xs'
                  : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 shadow-2xs'
              }`}
            >
              <CheckSquare size={13} />
              <span>{bulkMode ? 'Cancel Selection' : 'Bulk Select'}</span>
            </button>

            {/* Refresh */}
            <button
              onClick={handleRefresh}
              title="Refresh leads and counselors"
              className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
            </button>
          </div>
        </div>

        {/* ──────── KPI Badges & Quick Stats Row ──────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100">
          <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                {isManager(user) ? 'Total Pipeline' : 'Team Leads'}
              </span>
              <span className="text-lg font-bold text-gray-900">{stats.total} Leads</span>
            </div>
            <Layers size={16} className="text-gray-400" />
          </div>

          <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">
                {isManager(user) ? 'Unassigned Queue' : 'My Distributable Pool'}
              </span>
              <span className="text-lg font-bold text-amber-900">
                {isManager(user) ? `${stats.unassigned} Leads` : `${stats.myPool} Leads`}
              </span>
            </div>
            {isManager(user) ? <AlertCircle size={16} className="text-amber-500" /> : <Crown size={16} className="text-amber-600" />}
          </div>

          <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                {isManager(user) ? 'Active Staff' : 'My Team Counselors'}
              </span>
              <span className="text-lg font-bold text-gray-900">
                {stats.activeCounselorCount} {isManager(user) ? 'Staff' : 'Counselors'}
              </span>
            </div>
            <Users size={16} className="text-gray-400" />
          </div>

          <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Avg Workload</span>
              <span className="text-lg font-bold text-gray-900">{stats.avgLeads} / Counselor</span>
            </div>
            <ArrowDownUp size={16} className="text-gray-400" />
          </div>
        </div>

        {/* ──────── Service Stream Switcher: Study Abroad vs Visa Process ──────── */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap">
          <div className="flex items-center gap-1 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200/70 p-1 rounded-xl shadow-2xs">
            <button
              onClick={() => setServiceTrack('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                serviceTrack === 'all'
                  ? 'bg-white text-gray-900 shadow-xs ring-1 ring-black/5 font-bold'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
              }`}
              title="View all leads regardless of service track"
            >
              <span>🌐 All Services</span>
              <span className="text-[10px] text-gray-400">({leads.length})</span>
            </button>

            <button
              onClick={() => setServiceTrack('study_abroad')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                serviceTrack === 'study_abroad'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-blue-700 hover:bg-white/80'
              }`}
              title="Show University Admissions & Course Shortlisting Leads"
            >
              <GraduationCap size={13} className={serviceTrack === 'study_abroad' ? 'text-white' : 'text-blue-600'} />
              <span>🎓 Study Abroad</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                serviceTrack === 'study_abroad' ? 'bg-white text-blue-800' : 'bg-blue-100 text-blue-800'
              }`}>
                {studyAbroadCount}
              </span>
            </button>

            <button
              onClick={() => setServiceTrack('visa_process')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                serviceTrack === 'visa_process'
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'text-indigo-700 hover:bg-white/80'
              }`}
              title="Show F-1 Visa Processing & SEVIS Leads"
            >
              <Globe size={13} className={serviceTrack === 'visa_process' ? 'text-white' : 'text-indigo-600'} />
              <span>🛂 Visa Process</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                serviceTrack === 'visa_process' ? 'bg-white text-indigo-800' : 'bg-indigo-100 text-indigo-800'
              }`}>
                {visaProcessCount}
              </span>
            </button>
          </div>
        </div>

        {/* ──────── Filter Row ──────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Stage filter */}
            <div className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 text-xs">
              <Filter size={12} className="text-gray-400" />
              <select
                value={selectedStage}
                onChange={e => setSelectedStage(e.target.value)}
                className="bg-transparent font-medium text-gray-800 outline-none cursor-pointer"
              >
                <option value="all">All Stages ({stages.length})</option>
                {stages.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Country / Ad filter */}
            <div className="flex items-center gap-1.5 bg-blue-50/60 px-2.5 py-1.5 rounded-xl border border-blue-200 text-xs">
              <Globe size={12} className="text-blue-600" />
              <select
                value={selectedCountry}
                onChange={e => setSelectedCountry(e.target.value)}
                className="bg-transparent font-semibold text-blue-900 outline-none cursor-pointer"
              >
                <option value="all">🌐 All Countries</option>
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
            <div className="flex items-center gap-1.5 bg-purple-50/60 px-2.5 py-1.5 rounded-xl border border-purple-200 text-xs">
              <GraduationCap size={13} className="text-purple-600" />
              <select
                value={selectedProgramme}
                onChange={e => setSelectedProgramme(e.target.value)}
                className="bg-transparent font-semibold text-purple-900 outline-none cursor-pointer"
              >
                <option value="all">🎓 All Degrees</option>
                <option value="Master">🎓 Master</option>
                <option value="Bachelor">🎓 Bachelor</option>
                <option value="Doctorate">🎓 Doctorate</option>
              </select>
            </div>

            {/* Date Filter */}
            <div className="flex items-center gap-1.5 bg-emerald-50/60 px-2.5 py-1.5 rounded-xl border border-emerald-200 text-xs">
              <Calendar size={12} className="text-emerald-600" />
              <select
                value={selectedDatePreset}
                onChange={e => setSelectedDatePreset(e.target.value)}
                className="bg-transparent font-semibold text-emerald-900 outline-none cursor-pointer"
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
                <div className="flex items-center gap-1 bg-white border border-emerald-300 rounded-lg p-0.5 shadow-2xs">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={e => setCustomStartDate(e.target.value)}
                    className="text-[11px] font-medium text-gray-700 outline-none px-1 py-0.5 bg-gray-50 border border-gray-200 rounded"
                  />
                  <span className="text-[10px] text-gray-400 font-bold px-0.5">to</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={e => setCustomEndDate(e.target.value)}
                    className="text-[11px] font-medium text-gray-700 outline-none px-1 py-0.5 bg-gray-50 border border-gray-200 rounded"
                  />
                </div>
              )}
            </div>

            {/* Priority filter */}
            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-xl border border-gray-200 text-xs">
              {(
                [
                  ['all', 'All'],
                  ['Hot', '🔥 Hot'],
                  ['Warm', '☀️ Warm'],
                  ['Cold', '❄️ Cold'],
                ] as const
              ).map(([pKey, pLabel]) => (
                <button
                  key={pKey}
                  onClick={() => setSelectedPriority(pKey)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedPriority === pKey
                      ? 'bg-white text-gray-900 font-bold shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {pLabel}
                </button>
              ))}
            </div>

            {(selectedStage !== 'all' || selectedCountry !== 'all' || selectedProgramme !== 'all' || selectedPriority !== 'all' || selectedDatePreset !== 'ALL' || serviceTrack !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedStage('all')
                  setSelectedCountry('all')
                  setSelectedProgramme('all')
                  setSelectedPriority('all')
                  setSelectedDatePreset('ALL')
                  setCustomStartDate('')
                  setCustomEndDate('')
                  setServiceTrack('all')
                  setSearchQuery('')
                }}
                className="text-xs text-blue-600 hover:text-black font-semibold underline cursor-pointer ml-1"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-64">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search leads to reassign..."
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* ──────── Bulk Action Bar (When Bulk Mode is active) ──────── */}
        {bulkMode && (
          <div className="mt-3 p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-center justify-between gap-4 animate-in fade-in duration-200 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-xs font-bold text-blue-900">
                {selectedLeadIds.length} lead(s) selected
              </span>
              <div className="flex items-center gap-1.5 ml-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const allIds = filteredLeads.map(l => l.id)
                    setSelectedLeadIds(allIds)
                  }}
                  className="px-2 py-0.5 bg-blue-100 hover:bg-blue-200 text-blue-900 rounded text-[11px] font-semibold transition-colors"
                >
                  Select All ({filteredLeads.length})
                </button>
                {isManager(user) && (leadsByCounselor.unassigned?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleSelectAllInColumn(leadsByCounselor.unassigned)}
                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[11px] font-semibold transition-colors"
                  >
                    Select Pool ({leadsByCounselor.unassigned?.length})
                  </button>
                )}
                {isTeamLeader(user) && (leadsByCounselor[user.id]?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleSelectAllInColumn(leadsByCounselor[user.id] || [])}
                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded text-[11px] font-semibold transition-colors"
                  >
                    Select My Pool ({leadsByCounselor[user.id]?.length})
                  </button>
                )}
                {selectedLeadIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedLeadIds([])}
                    className="px-2 py-0.5 text-gray-500 hover:text-gray-900 rounded text-[11px] font-medium transition-colors"
                  >
                    Deselect All
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-700">Move to:</span>
              <select
                value={bulkTargetCounselorId}
                onChange={e => setBulkTargetCounselorId(e.target.value)}
                className="bg-white border border-gray-300 text-gray-900 rounded-lg px-2.5 py-1 text-xs outline-none font-medium"
              >
                {isTeamLeader(user) && (
                  <option value={user.id}>
                    👑 My Leads Pool ({leadsByCounselor[user.id]?.length || 0} leads)
                  </option>
                )}
                {counselors.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({leadsByCounselor[c.id]?.length || 0} leads)
                  </option>
                ))}
              </select>

              <button
                disabled={selectedLeadIds.length === 0 || isProcessing}
                onClick={handleBulkReassign}
                className="px-3.5 py-1 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              >
                Confirm Move ({selectedLeadIds.length})
              </button>
            </div>
          </div>
        )}

        {/* ──────── Reassignment Confirmation Toast ──────── */}
        {lastMovedLead && (
          <div className="mt-2 py-1.5 px-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
            <CheckCircle2 size={14} className="text-emerald-600" />
            <span>
              Successfully reassigned <strong>{lastMovedLead.leadName}</strong> to <strong>{lastMovedLead.toName}</strong>!
            </span>
          </div>
        )}
      </div>

      {/* ──────── Main Kanban Columns Canvas ──────── */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-5 items-start">
        {/* ======================================================== */}
        {/* COLUMN 1 FOR MANAGER: UNASSIGNED LEADS (Admin Pool)     */}
        {/* ======================================================== */}
        {isManager(user) && (
          <div
            onDragOver={e => {
              e.preventDefault()
              setDragOverColumnId('unassigned')
            }}
            onDragLeave={() => {
              if (dragOverColumnId === 'unassigned') setDragOverColumnId(null)
            }}
            onDrop={e => {
              e.preventDefault()
              handleDropLead('unassigned')
            }}
            className={`w-80 shrink-0 flex flex-col rounded-2xl border transition-all duration-200 max-h-full ${
              dragOverColumnId === 'unassigned'
                ? 'border-dashed border-2 border-amber-500 bg-amber-50/40 ring-4 ring-amber-500/10 scale-[1.01]'
                : 'border-amber-200/90 bg-amber-50/20 shadow-xs'
            }`}
          >
            {/* Column Header */}
            <div className="p-4 border-b border-amber-200/70 bg-amber-50/50 rounded-t-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold text-xs">
                    <AlertCircle size={14} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs">Unassigned Pool</h3>
                    <span className="text-[10px] text-gray-500">Needs Counselor Allocation</span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200/80 text-amber-900">
                  {leadsByCounselor.unassigned?.length || 0}
                </span>
              </div>

              {/* Select All in this column */}
              {(leadsByCounselor.unassigned?.length || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => toggleSelectAllInColumn(leadsByCounselor.unassigned)}
                  className="mt-2 text-[10px] text-amber-900 font-bold hover:underline flex items-center gap-1.5"
                >
                  <CheckSquare size={12} className="text-amber-700" />
                  <span>
                    {leadsByCounselor.unassigned.every(l => selectedLeadIds.includes(l.id))
                      ? `Deselect pool (${leadsByCounselor.unassigned.length})`
                      : `Select all in pool (${leadsByCounselor.unassigned.length})`}
                  </span>
                </button>
              )}
            </div>

            {/* Cards List */}
            <div className="p-3 space-y-2.5 overflow-y-auto flex-1 min-h-[300px]">
              {(leadsByCounselor.unassigned?.length || 0) === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-amber-200 rounded-xl">
                  <CheckCircle2 size={24} className="text-amber-500/70 mb-1.5" />
                  <span className="text-xs font-semibold text-gray-700">All Leads Assigned</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">Drop leads here to unassign</span>
                </div>
              ) : (
                leadsByCounselor.unassigned.map(lead => renderLeadCard(lead, 'unassigned'))
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* COLUMN 1 FOR TEAM LEADER: MY ALLOCATED LEADS POOL       */}
        {/* ======================================================== */}
        {isTeamLeader(user) && (
          <div
            onDragOver={e => {
              e.preventDefault()
              setDragOverColumnId(user.id)
            }}
            onDragLeave={() => {
              if (dragOverColumnId === user.id) setDragOverColumnId(null)
            }}
            onDrop={e => {
              e.preventDefault()
              handleDropLead(user.id)
            }}
            className={`w-80 shrink-0 flex flex-col rounded-2xl border transition-all duration-200 max-h-full ${
              dragOverColumnId === user.id
                ? 'border-dashed border-2 border-amber-500 bg-amber-50/40 ring-4 ring-amber-500/10 scale-[1.01]'
                : 'border-amber-300 bg-gradient-to-b from-amber-50/40 via-white to-white shadow-xs'
            }`}
          >
            {/* Column Header */}
            <div className="p-4 border-b border-amber-200 bg-amber-100/70 rounded-t-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                    <Crown size={14} />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                      <span>My Allocated Pool</span>
                    </h3>
                    <span className="text-[10px] text-amber-800 font-medium">Leads given to you by Admin to assign</span>
                  </div>
                </div>

                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-950 border border-amber-300 shadow-2xs">
                  {leadsByCounselor[user.id]?.length || 0}
                </span>
              </div>

              {/* Select All in this column */}
              {(leadsByCounselor[user.id]?.length || 0) > 0 && (
                <button
                  type="button"
                  onClick={() => toggleSelectAllInColumn(leadsByCounselor[user.id] || [])}
                  className="mt-2 text-[10px] text-amber-950 font-bold hover:underline flex items-center gap-1.5"
                >
                  <CheckSquare size={12} className="text-amber-700" />
                  <span>
                    {(leadsByCounselor[user.id] || []).every(l => selectedLeadIds.includes(l.id))
                      ? `Deselect my pool (${leadsByCounselor[user.id]?.length || 0})`
                      : `Select all in my pool (${leadsByCounselor[user.id]?.length || 0})`}
                  </span>
                </button>
              )}
            </div>

            {/* Cards List */}
            <div className="p-3 space-y-2.5 overflow-y-auto flex-1 min-h-[300px]">
              {(leadsByCounselor[user.id]?.length || 0) === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-amber-200 rounded-xl bg-amber-50/20">
                  <Crown size={24} className="text-amber-500/70 mb-1.5" />
                  <span className="text-xs font-semibold text-gray-700">No Leads in Your Pool</span>
                  <span className="text-[10px] text-gray-500 mt-1 max-w-[200px]">
                    When Admin allocates leads to you, they will appear here so you can assign them to your team.
                  </span>
                </div>
              ) : (
                (leadsByCounselor[user.id] || []).map(lead => renderLeadCard(lead, user.id))
              )}
            </div>
          </div>
        )}

        {/* Empty state if Team Leader has no counselors assigned yet */}
        {isTeamLeader(user) && counselors.length === 0 && (
          <div className="w-80 p-8 border border-dashed border-gray-300 rounded-2xl bg-white text-center shrink-0">
            <Users size={32} className="text-gray-400 mx-auto mb-2" />
            <h4 className="text-sm font-semibold text-gray-900">No Counselors in Team</h4>
            <p className="text-xs text-gray-500 mt-1">
              Ask Admin to assign counselors to your team in the Team Management page.
            </p>
          </div>
        )}

        {/* ======================================================== */}
        {/* COUNSELOR COLUMNS */}
        {/* ======================================================== */}
        {counselors.map(counselor => {
          const colLeads = leadsByCounselor[counselor.id] || []
          const isDragOver = dragOverColumnId === counselor.id
          const cap = counselor.open_lead_cap || 50
          const capPercent = Math.min(100, Math.round((colLeads.length / cap) * 100))
          const isNearCap = colLeads.length >= cap * 0.9

          return (
            <div
              key={counselor.id}
              onDragOver={e => {
                e.preventDefault()
                setDragOverColumnId(counselor.id)
              }}
              onDragLeave={() => {
                if (dragOverColumnId === counselor.id) setDragOverColumnId(null)
              }}
              onDrop={e => {
                e.preventDefault()
                handleDropLead(counselor.id)
              }}
              className={`w-80 shrink-0 flex flex-col rounded-2xl border transition-all duration-200 max-h-full ${
                isDragOver
                  ? 'border-dashed border-2 border-blue-600 bg-blue-50/40 ring-4 ring-blue-500/10 scale-[1.01]'
                  : 'border-gray-200 bg-white shadow-xs'
              }`}
            >
              {/* Column Header */}
              <div className="p-4 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] uppercase shrink-0 ${
                      isTeamLeader(counselor)
                        ? 'bg-amber-100 border border-amber-300 text-amber-800'
                        : 'bg-gray-200 border border-gray-300 text-gray-800'
                    }`}>
                      {isTeamLeader(counselor) ? <Crown size={12} className="text-amber-600" /> : counselor.name?.slice(0, 2) || 'CO'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-xs truncate max-w-[130px] flex items-center gap-1">
                        <span>{counselor.name}</span>
                        {isTeamLeader(counselor) && (
                          <span className="text-[9px] bg-amber-100 text-amber-800 px-1 py-0.2 rounded font-semibold shrink-0">TL</span>
                        )}
                      </h3>
                      <span className="text-[10px] text-gray-400 truncate block">
                        {counselor.email?.split('@')[0]}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      isNearCap
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {colLeads.length} leads
                  </span>
                </div>

                {/* Workload Capacity Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span>Workload ({colLeads.length}/{cap})</span>
                    <span className={isNearCap ? 'text-rose-600 font-bold' : ''}>{capPercent}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isNearCap ? 'bg-rose-500' : capPercent > 60 ? 'bg-amber-500' : 'bg-black'
                      }`}
                      style={{ width: `${capPercent}%` }}
                    />
                  </div>
                </div>

                {/* Select All in this column */}
                {colLeads.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleSelectAllInColumn(colLeads)}
                    className="mt-2 text-[10px] text-blue-700 font-bold hover:underline flex items-center gap-1.5"
                  >
                    <CheckSquare size={12} className="text-blue-600" />
                    <span>
                      {colLeads.every(l => selectedLeadIds.includes(l.id))
                        ? `Deselect all (${colLeads.length})`
                        : `Select all (${colLeads.length})`}
                    </span>
                  </button>
                )}
              </div>

              {/* Cards List */}
              <div className="p-3 space-y-2.5 overflow-y-auto flex-1 min-h-[300px]">
                {colLeads.length === 0 ? (
                  <div className="h-44 flex flex-col items-center justify-center text-center p-4 border border-dashed border-gray-200 rounded-xl">
                    <Users size={22} className="text-gray-300 mb-1.5" />
                    <span className="text-xs font-semibold text-gray-700">No Assigned Leads</span>
                    <span className="text-[10px] text-gray-400 mt-0.5">Drag student cards here</span>
                  </div>
                ) : (
                  colLeads.map(lead => renderLeadCard(lead, counselor.id))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  // ── Helper: Render Single Lead Card ──
  function renderLeadCard(lead: Lead, currentColumnId: string) {
    const isSelected = selectedLeadIds.includes(lead.id)
    const isBeingDragged = draggedLeadId === lead.id
    const sType = getLeadServiceType(lead)
    const sInfo = getServiceBadgeInfo(sType)
    const formattedDate = lead.created_at
      ? new Date(lead.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      : null

    return (
      <div
        key={lead.id}
        draggable={!bulkMode}
        onDragStart={e => {
          e.dataTransfer.setData('text/plain', lead.id)
          e.dataTransfer.effectAllowed = 'move'
          setDraggedLeadId(lead.id)
        }}
        onDragEnd={() => setDraggedLeadId(null)}
        onClick={() => {
          if (bulkMode) toggleSelectLead(lead.id)
        }}
        className={`p-3.5 bg-white border rounded-xl shadow-2xs transition-all relative group select-none ${
          isBeingDragged
            ? 'opacity-30 border-blue-400 scale-95'
            : isSelected
            ? 'ring-2 ring-blue-600 border-blue-400 bg-blue-50/20'
            : 'border-gray-200 hover:border-gray-400 hover:shadow-sm'
        } ${bulkMode ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'}`}
      >
        <div className="flex items-start justify-between gap-1.5 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* Grip Icon */}
            {!bulkMode && (
              <GripVertical
                size={13}
                className="text-gray-300 group-hover:text-gray-500 shrink-0"
              />
            )}

            {/* Bulk Checkbox */}
            {bulkMode && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelectLead(lead.id)}
                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-0 cursor-pointer"
              />
            )}

            <h4 className="text-xs font-bold text-gray-900 truncate">{lead.name}</h4>
          </div>

          {/* Priority Pill */}
          {lead.priority && (
            <span
              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md shrink-0 ${
                lead.priority === 'Hot'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : lead.priority === 'Warm'
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : lead.priority === 'Cold'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : lead.priority === 'Callback'
                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                  : lead.priority === 'Ringing'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-gray-50 text-gray-700 border border-gray-200'
              }`}
            >
              {lead.priority === 'Hot' ? '🔥 Hot' : lead.priority === 'Warm' ? '☀️ Warm' : lead.priority === 'Cold' ? '❄️ Cold' : lead.priority === 'Callback' ? '📞 Callback' : lead.priority === 'Ringing' ? '🔔 Ringing' : lead.priority}
            </span>
          )}
        </div>

        {/* Service Badge & Country Badge & Source */}
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${sInfo.badgeClass}`}>
            <span>{sInfo.icon}</span>
            <span>{sInfo.label}</span>
          </span>
          {lead.country && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
              {formatCountryBadge(lead.country)}
            </span>
          )}
          {lead.source && (
            <span className="text-[10px] text-gray-400 font-medium truncate max-w-[140px]">
              {lead.source}
            </span>
          )}
        </div>

        {/* Contact info & Phone */}
        <p className="text-[11px] text-gray-500 mb-1.5 truncate font-mono">
          {lead.phone}
        </p>

        {lead.course && (
          <p className="text-[11px] font-medium text-gray-700 mb-2 truncate bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
            🎓 {lead.course}
          </p>
        )}

        {/* Footer: Stage + Date + Action Link */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
              {lead.stage}
            </span>
            {formattedDate && (
              <span className="text-[10px] text-gray-400 font-medium flex items-center gap-0.5">
                <Calendar size={10} />
                {formattedDate}
              </span>
            )}
          </div>

          <Link
            href={`/leads/${lead.id}`}
            onClick={e => e.stopPropagation()}
            className="text-gray-400 hover:text-black inline-flex items-center gap-0.5 font-medium hover:underline"
          >
            Profile <ExternalLink size={10} />
          </Link>
        </div>
      </div>
    )
  }
}

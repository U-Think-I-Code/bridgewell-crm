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
  Layers, ChevronDown, Check, ArrowDownUp, Globe
} from 'lucide-react'
import { notifyLeadAssigned } from '@/lib/notifications'
import { formatCountryBadge } from '@/lib/countryHelper'

interface Counselor {
  id: string
  name: string
  email: string
  open_lead_cap?: number
  active: boolean
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

  // Drag and Drop State
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null) // counselor.id or 'unassigned'
  const [isProcessing, setIsProcessing] = useState(false)
  const [lastMovedLead, setLastMovedLead] = useState<{ leadName: string; toName: string } | null>(null)

  // Bulk Selection State
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([])
  const [bulkTargetCounselorId, setBulkTargetCounselorId] = useState<string>('')

  // Manager Access Guard
  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/')
    }
  }, [user, router])

  const fetchData = async () => {
    const [
      { data: counselorsData },
      { data: leadsData },
      { data: stagesData },
    ] = await Promise.all([
      supabase.from('users').select('id, name, email, role, active').eq('active', true).order('name', { ascending: true }),
      supabase.from('leads').select('id, name, phone, email, country, course, stage, owner_id, priority, created_at').neq('stage', 'Enrolled').order('created_at', { ascending: false }).limit(300),
      supabase.from('stages').select('name').order('stage_order', { ascending: true }),
    ])

    const activeCounselors = (counselorsData || []).filter(c => c.role === 'counselor')
    setCounselors(activeCounselors)
    setLeads(leadsData || [])
    setStages((stagesData || []).map(s => s.name))

    if (activeCounselors.length > 0 && !bulkTargetCounselorId) {
      setBulkTargetCounselorId(activeCounselors[0].id)
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

  // ── Filtered Leads ──
  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (selectedStage !== 'all' && l.stage !== selectedStage) return false
      if (selectedPriority !== 'all' && l.priority !== selectedPriority) return false
      if (selectedCountry !== 'all') {
        if (!l.country || l.country.toUpperCase() !== selectedCountry.toUpperCase()) return false
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
  }, [leads, selectedStage, selectedPriority, selectedCountry, searchQuery])

  // ── Group leads by counselor ID (or 'unassigned') ──
  const leadsByCounselor = useMemo(() => {
    const map: Record<string, Lead[]> = { unassigned: [] }
    counselors.forEach(c => {
      map[c.id] = []
    })

    filteredLeads.forEach(l => {
      if (!l.owner_id || !map[l.owner_id]) {
        map.unassigned.push(l)
      } else {
        map[l.owner_id].push(l)
      }
    })

    return map
  }, [filteredLeads, counselors])

  // ── KPI Summary Stats ──
  const stats = useMemo(() => {
    const total = leads.length
    const unassigned = leads.filter(l => !l.owner_id).length
    const activeCounselorCount = counselors.length
    const avgLeads = activeCounselorCount > 0 ? Math.round((total - unassigned) / activeCounselorCount) : 0
    return { total, unassigned, activeCounselorCount, avgLeads }
  }, [leads, counselors])

  // ── Drag and Drop Handler ──
  const handleDropLead = async (targetColumnId: string) => {
    if (!draggedLeadId) return
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
    const targetName = targetCounselor ? targetCounselor.name : 'Unassigned'

    // Optimistic UI update
    setLeads(prev =>
      prev.map(l => (l.id === draggedLeadId ? { ...l, owner_id: newOwnerId } : l))
    )
    setLastMovedLead({ leadName: lead.name, toName: targetName })
    setTimeout(() => setLastMovedLead(null), 4000)

    setDraggedLeadId(null)
    setDragOverColumnId(null)
    setIsProcessing(true)

    try {
      // 1. Update Lead table
      await supabase.from('leads').update({ owner_id: newOwnerId }).eq('id', lead.id)

      // 2. Insert Assignment Audit Record
      await supabase.from('assignments').insert([
        {
          lead_id: lead.id,
          from_user: oldOwnerId || null,
          to_user: newOwnerId,
          assigned_by: user?.id,
          reason: 'Reassigned via Drag & Drop Board',
          time: new Date().toISOString(),
        },
      ])

      // 3. Log Activity Timeline
      await supabase.from('activities').insert([
        {
          lead: lead.id,
          user_id: user?.id,
          type: 'assignment',
          text: `Reassigned to ${targetName} via Drag & Drop distribution board.`,
          time: new Date().toISOString(),
        },
      ])

      // 4. Trigger in-app notification to new counselor
      if (newOwnerId) {
        notifyLeadAssigned({
          recipientId: newOwnerId,
          leadId: lead.id,
          leadName: lead.name,
          senderName: user?.name || 'Manager',
        }).catch(console.error)
      }
    } catch (err) {
      console.error('Error reassigning lead:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Auto-Distribute Unassigned Leads (Round Robin) ──
  const handleAutoDistributeUnassigned = async () => {
    const unassignedList = leads.filter(l => !l.owner_id)
    if (unassignedList.length === 0) {
      alert('No unassigned leads found to distribute.')
      return
    }
    if (counselors.length === 0) {
      alert('No active counselors available to receive leads.')
      return
    }

    const confirmMsg = `Auto-distribute all ${unassignedList.length} unassigned leads equally among ${counselors.length} active counselors?`
    if (!confirm(confirmMsg)) return

    setIsProcessing(true)

    try {
      // Distribute round-robin
      for (let i = 0; i < unassignedList.length; i++) {
        const lead = unassignedList[i]
        const targetCounselor = counselors[i % counselors.length]

        await supabase.from('leads').update({ owner_id: targetCounselor.id }).eq('id', lead.id)

        await supabase.from('assignments').insert([
          {
            lead_id: lead.id,
            from_user: null,
            to_user: targetCounselor.id,
            assigned_by: user?.id,
            reason: 'Auto-distributed via Round Robin',
            time: new Date().toISOString(),
          },
        ])

        await supabase.from('activities').insert([
          {
            lead: lead.id,
            user_id: user?.id,
            type: 'assignment',
            text: `Assigned to ${targetCounselor.name} via Auto-Distribution.`,
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
        toName: `All ${counselors.length} Counselors (Round Robin)`,
      })
      setTimeout(() => setLastMovedLead(null), 4000)
    } catch (err) {
      console.error('Error during auto-distribution:', err)
    } finally {
      setIsProcessing(false)
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
        await supabase.from('leads').update({ owner_id: bulkTargetCounselorId }).eq('id', leadId)

        await supabase.from('assignments').insert([
          {
            lead_id: leadId,
            from_user: lead?.owner_id || null,
            to_user: bulkTargetCounselorId,
            assigned_by: user?.id,
            reason: 'Bulk Reassignment',
            time: new Date().toISOString(),
          },
        ])

        await supabase.from('activities').insert([
          {
            lead: leadId,
            user_id: user?.id,
            type: 'assignment',
            text: `Bulk reassigned to ${targetName}.`,
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
    const columnIds = columnLeads.map(l => l.id)
    const allSelected = columnIds.every(id => selectedLeadIds.includes(id))

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
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Drag student cards between counselor columns to instantly rebalance workloads and reassign leads.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Auto Distribute Round Robin Button */}
            <button
              onClick={handleAutoDistributeUnassigned}
              disabled={isProcessing || stats.unassigned === 0}
              className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 text-gray-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <Sparkles size={13} className="text-amber-500" />
              <span>Auto-Distribute ({stats.unassigned} Unassigned)</span>
            </button>

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
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Total Pipeline</span>
              <span className="text-lg font-bold text-gray-900">{stats.total} Leads</span>
            </div>
            <Layers size={16} className="text-gray-400" />
          </div>

          <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Unassigned Queue</span>
              <span className="text-lg font-bold text-amber-900">{stats.unassigned} Leads</span>
            </div>
            <AlertCircle size={16} className="text-amber-500" />
          </div>

          <div className="bg-gray-50/70 border border-gray-200/80 rounded-xl px-3.5 py-2.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Active Counselors</span>
              <span className="text-lg font-bold text-gray-900">{stats.activeCounselorCount} Team</span>
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

        {/* ──────── Filter Row ──────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-gray-100 flex-wrap">
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
                <option value="all">🌐 All Countries (6 Ads)</option>
                <option value="USA">🇺🇸 USA Ad Leads</option>
                <option value="UK">🇬🇧 UK Ad Leads</option>
                <option value="Canada">🇨🇦 Canada Ad Leads</option>
                <option value="Australia">🇦🇺 Australia Ad Leads</option>
                <option value="Germany">🇩🇪 Germany Ad Leads</option>
                <option value="Ireland">🇮🇪 Ireland Ad Leads</option>
                <option value="UAE">🇦🇪 UAE Ad Leads</option>
                <option value="India">🇮🇳 India Leads</option>
              </select>
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
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
              <span className="text-xs font-bold text-blue-900">
                {selectedLeadIds.length} lead(s) selected
              </span>
              <span className="text-xs text-blue-600 font-normal">
                (Click card checkboxes to select)
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-700">Move to:</span>
              <select
                value={bulkTargetCounselorId}
                onChange={e => setBulkTargetCounselorId(e.target.value)}
                className="bg-white border border-gray-300 text-gray-900 rounded-lg px-2.5 py-1 text-xs outline-none font-medium"
              >
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
                Confirm Move
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
        {/* COLUMN 1: UNASSIGNED LEADS */}
        {/* ======================================================== */}
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
                {leadsByCounselor.unassigned.length}
              </span>
            </div>

            {/* Select All in this column */}
            {bulkMode && leadsByCounselor.unassigned.length > 0 && (
              <button
                onClick={() => toggleSelectAllInColumn(leadsByCounselor.unassigned)}
                className="mt-2 text-[10px] text-amber-800 font-bold hover:underline flex items-center gap-1"
              >
                <span>Select all in pool</span>
              </button>
            )}
          </div>

          {/* Cards List */}
          <div className="p-3 space-y-2.5 overflow-y-auto flex-1 min-h-[300px]">
            {leadsByCounselor.unassigned.length === 0 ? (
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
                    <div className="w-7 h-7 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center font-bold text-[10px] text-gray-800 uppercase shrink-0">
                      {counselor.name?.slice(0, 2) || 'CO'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 text-xs truncate max-w-[130px]">
                        {counselor.name}
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
                {bulkMode && colLeads.length > 0 && (
                  <button
                    onClick={() => toggleSelectAllInColumn(colLeads)}
                    className="mt-2 text-[10px] text-blue-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <span>Select all ({colLeads.length})</span>
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
                  : 'bg-blue-50 text-blue-700 border border-blue-200'
              }`}
            >
              {lead.priority}
            </span>
          )}
        </div>

        {/* Country Badge & Source */}
        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
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

        {/* Footer: Stage + Action Link */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[10px]">
          <span className="font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
            {lead.stage}
          </span>

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

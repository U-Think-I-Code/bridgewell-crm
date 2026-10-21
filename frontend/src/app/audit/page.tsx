'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  ClipboardList, 
  Search, 
  Filter, 
  Download, 
  RotateCcw, 
  ArrowRight, 
  User, 
  Calendar, 
  Clock, 
  ShieldCheck, 
  TrendingUp, 
  ArrowRightLeft, 
  Phone, 
  MessageSquare, 
  AlertCircle, 
  Sparkles, 
  Smartphone, 
  Eye, 
  X, 
  CheckCircle2, 
  ExternalLink,
  Tag,
  Flame,
  AlarmClock
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import { AuditLogItem } from '@/lib/auditLogger'

export default function AuditTrailPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [usersMap, setUsersMap] = useState<Record<string, { name: string; email: string; role: string }>>({})
  const [leadsMap, setLeadsMap] = useState<Record<string, { name: string; phone: string }>>({})
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAction, setSelectedAction] = useState('ALL')
  const [selectedUserId, setSelectedUserId] = useState('ALL')
  const [dateFilter, setDateFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all'>('all')
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)

  const fetchAuditData = async () => {
    try {
      setLoading(true)

      // 1. Fetch Users
      const { data: usersData } = await supabase.from('users').select('id, name, email, role')
      const uMap: Record<string, { name: string; email: string; role: string }> = {}
      usersData?.forEach(u => {
        uMap[u.id] = { name: u.name, email: u.email, role: u.role }
      })
      setUsersMap(uMap)

      // 2. Fetch Leads
      const { data: leadsData } = await supabase.from('leads').select('id, name, phone')
      const lMap: Record<string, { name: string; phone: string }> = {}
      leadsData?.forEach(l => {
        lMap[l.id] = { name: l.name, phone: l.phone }
      })
      setLeadsMap(lMap)

      // 3. Fetch Audit Logs
      const { data: auditData, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)

      if (error) {
        console.error('Error fetching audit logs:', error)
      }

      const enriched: AuditLogItem[] = (auditData || []).map(a => ({
        ...a,
        lead_name: a.lead_id && lMap[a.lead_id] ? lMap[a.lead_id].name : 'General CRM',
        user_name: a.user_id && uMap[a.user_id] ? uMap[a.user_id].name : 'System Automated',
        user_email: a.user_id && uMap[a.user_id] ? uMap[a.user_id].email : '',
        user_role: a.user_id && uMap[a.user_id] ? uMap[a.user_id].role : 'system'
      }))

      setLogs(enriched)
    } catch (err) {
      console.error('Error in fetchAuditData:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/')
      return
    }
    fetchAuditData()

    // Realtime subscription on audit_logs
    const channel = supabase
      .channel('realtime-audit-logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload: any) => {
          const newLog = payload.new
          setLogs(prev => [
            {
              ...newLog,
              lead_name: newLog.lead_id && leadsMap[newLog.lead_id] ? leadsMap[newLog.lead_id].name : 'General CRM',
              user_name: newLog.user_id && usersMap[newLog.user_id] ? usersMap[newLog.user_id].name : 'System Automated',
              user_email: newLog.user_id && usersMap[newLog.user_id] ? usersMap[newLog.user_id].email : '',
              user_role: newLog.user_id && usersMap[newLog.user_id] ? usersMap[newLog.user_id].role : 'system'
            },
            ...prev
          ])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [leadsMap, usersMap])

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Action filter
      if (selectedAction !== 'ALL') {
        if (log.action !== selectedAction) return false
      }

      // User filter
      if (selectedUserId !== 'ALL') {
        if (selectedUserId === 'SYSTEM') {
          if (log.user_id) return false
        } else {
          if (log.user_id !== selectedUserId) return false
        }
      }

      // Date filter
      if (dateFilter !== 'all' && log.created_at) {
        const logDate = new Date(log.created_at)
        const now = new Date()

        if (dateFilter === 'today') {
          if (logDate.toDateString() !== now.toDateString()) return false
        } else if (dateFilter === 'yesterday') {
          const yest = new Date(now)
          yest.setDate(now.getDate() - 1)
          if (logDate.toDateString() !== yest.toDateString()) return false
        } else if (dateFilter === '7days') {
          const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          if (logDate < sevenDaysAgo) return false
        } else if (dateFilter === '30days') {
          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          if (logDate < thirtyDaysAgo) return false
        }
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchSummary = log.summary?.toLowerCase().includes(q)
        const matchLead = log.lead_name?.toLowerCase().includes(q)
        const matchUser = log.user_name?.toLowerCase().includes(q)
        const matchField = log.field_name?.toLowerCase().includes(q)
        const matchOld = log.old_value?.toLowerCase().includes(q)
        const matchNew = log.new_value?.toLowerCase().includes(q)
        if (!matchSummary && !matchLead && !matchUser && !matchField && !matchOld && !matchNew) return false
      }

      return true
    })
  }, [logs, selectedAction, selectedUserId, dateFilter, searchQuery])

  // Metrics
  const metrics = useMemo(() => {
    const total = logs.length
    const stageChanges = logs.filter(l => l.action === 'STAGE_CHANGE').length
    const reassignments = logs.filter(l => l.action === 'REASSIGNMENT').length
    const calls = logs.filter(l => l.action === 'CALL_LOGGED').length
    const staffEdits = logs.filter(l => l.user_id !== null).length
    return { total, stageChanges, reassignments, calls, staffEdits }
  }, [logs])

  // CSV Export
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert('No logs match current filters.')
      return
    }

    const headers = ['Timestamp', 'Modified By', 'Role', 'Lead Name', 'Action Type', 'Field Changed', 'Old Value', 'New Value', 'Summary']
    const rows = filteredLogs.map(l => {
      const d = new Date(l.created_at).toLocaleString('en-IN')
      return [
        `"${d}"`,
        `"${l.user_name || 'System'}"`,
        `"${l.user_role || 'system'}"`,
        `"${l.lead_name || 'N/A'}"`,
        `"${l.action}"`,
        `"${l.field_name || ''}"`,
        `"${(l.old_value || '').replace(/"/g, '""')}"`,
        `"${(l.new_value || '').replace(/"/g, '""')}"`,
        `"${(l.summary || '').replace(/"/g, '""')}"`
      ]
    })

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Bridgewell_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const renderActionBadge = (action: string) => {
    switch (action) {
      case 'STAGE_CHANGE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <TrendingUp size={11} /> Stage Change
          </span>
        )
      case 'PRIORITY_CHANGE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <Flame size={11} /> Priority Change
          </span>
        )
      case 'REASSIGNMENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <ArrowRightLeft size={11} /> Reassignment
          </span>
        )
      case 'FOLLOWUP_SCHEDULED':
      case 'FOLLOWUP_SNOOZED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlarmClock size={11} /> Follow-up Update
          </span>
        )
      case 'CALL_LOGGED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Phone size={11} /> Call Logged
          </span>
        )
      case 'NOTE_ADDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <MessageSquare size={11} /> Note Added
          </span>
        )
      case 'LEAD_CREATED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Sparkles size={11} /> Lead Created
          </span>
        )
      case 'WHATSAPP_SENT':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Smartphone size={11} /> WhatsApp
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            <Tag size={11} /> {action}
          </span>
        )
    }
  }

  const formatClock = (isoStr: string) => {
    if (!isoStr) return 'N/A'
    const d = new Date(isoStr)
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatRelative = (isoStr: string) => {
    if (!isoStr) return ''
    const diff = (Date.now() - new Date(isoStr).getTime()) / 1000
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#FDFDFD] p-6 lg:p-8 space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <ClipboardList className="text-gray-900" size={24} />
              Audit Trail & Change History
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Audit Log
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Granular modification history tracking who made each change, old vs new value diffs, and exact timestamps.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAuditData}
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
            Export Audit CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Audited Events</div>
            <div className="text-2xl font-bold text-gray-900">{metrics.total}</div>
            <div className="text-[11px] text-gray-500 mt-1">Recorded in timeline</div>
          </div>
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100">
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Stage Transitions</div>
            <div className="text-2xl font-bold text-indigo-600">{metrics.stageChanges}</div>
            <div className="text-[11px] text-gray-500 mt-1">Lead progression events</div>
          </div>
          <div className="w-11 h-11 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center border border-indigo-100">
            <TrendingUp size={20} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Reassignments</div>
            <div className="text-2xl font-bold text-cyan-600">{metrics.reassignments}</div>
            <div className="text-[11px] text-gray-500 mt-1">Owner changes</div>
          </div>
          <div className="w-11 h-11 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center border border-cyan-100">
            <ArrowRightLeft size={20} />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Staff-Initiated Edits</div>
            <div className="text-2xl font-bold text-gray-900">{metrics.staffEdits}</div>
            <div className="text-[11px] text-gray-500 mt-1">By Counselors & Managers</div>
          </div>
          <div className="w-11 h-11 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center border border-purple-100">
            <User size={20} />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 flex-1">
          {/* Search */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search student, staff, or modification details..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>

          {/* Action Filter */}
          <select
            value={selectedAction}
            onChange={e => setSelectedAction(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-xs rounded-xl px-3 py-1.5 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="ALL">All Event Types</option>
            <option value="STAGE_CHANGE">Stage Changes</option>
            <option value="PRIORITY_CHANGE">Priority Changes</option>
            <option value="REASSIGNMENT">Reassignments</option>
            <option value="FOLLOWUP_SCHEDULED">Follow-ups</option>
            <option value="CALL_LOGGED">Calls Logged</option>
            <option value="NOTE_ADDED">Notes Added</option>
            <option value="LEAD_CREATED">Lead Created</option>
            <option value="WHATSAPP_SENT">WhatsApp</option>
          </select>

          {/* User Filter */}
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="bg-gray-50 border border-gray-200 text-xs rounded-xl px-3 py-1.5 text-gray-700 font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
          >
            <option value="ALL">All Actors (Staff & System)</option>
            {Object.entries(usersMap).map(([id, u]) => (
              <option key={id} value={id}>{u.name} ({u.role})</option>
            ))}
            <option value="SYSTEM">System Automated Only</option>
          </select>

          {/* Date Filter */}
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
              7 Days
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
          Showing <strong className="text-gray-900">{filteredLogs.length}</strong> audited records
        </div>
      </div>

      {/* Audit Log Table / Stream */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-200">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Modified By</th>
                <th className="py-3 px-4">Lead / Student</th>
                <th className="py-3 px-4">Action Type</th>
                <th className="py-3 px-4">Modification Diff</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <ClipboardList size={36} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-sm font-medium text-gray-700">No audit records found</p>
                    <p className="text-xs text-gray-400 mt-1">Try resetting the search or filter criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const hasDiff = log.old_value !== null && log.new_value !== null && (log.old_value || log.new_value)
                  const isStageOrPriority = log.action === 'STAGE_CHANGE' || log.action === 'PRIORITY_CHANGE'

                  return (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition-colors group">
                      {/* Timestamp */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-semibold text-gray-900">{formatClock(log.created_at)}</div>
                        <div className="text-[10px] text-gray-400">{formatRelative(log.created_at)}</div>
                      </td>

                      {/* Actor */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center font-bold text-gray-700 text-[10px]">
                            {(log.user_name || 'S').substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900 text-xs">{log.user_name}</div>
                            <div className="text-[10px] text-gray-400 capitalize">{log.user_role}</div>
                          </div>
                        </div>
                      </td>

                      {/* Lead */}
                      <td className="py-3.5 px-4">
                        {log.lead_id ? (
                          <Link
                            href={`/leads/${log.lead_id}`}
                            className="font-semibold text-gray-900 hover:text-indigo-600 hover:underline flex items-center gap-1"
                          >
                            <span>{log.lead_name}</span>
                            <ExternalLink size={10} className="text-gray-400" />
                          </Link>
                        ) : (
                          <span className="text-gray-400 italic">System Wide</span>
                        )}
                      </td>

                      {/* Action Type */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {renderActionBadge(log.action)}
                      </td>

                      {/* Diff Visualization */}
                      <td className="py-3.5 px-4">
                        {hasDiff && isStageOrPriority ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="line-through px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium">
                              {log.old_value || 'None'}
                            </span>
                            <ArrowRight size={11} className="text-gray-400 shrink-0" />
                            <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                              {log.new_value || 'None'}
                            </span>
                          </div>
                        ) : log.field_name ? (
                          <span className="text-[11px] font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {log.field_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-[11px]">—</span>
                        )}
                      </td>

                      {/* Summary */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <p className="text-xs text-gray-700 truncate" title={log.summary}>
                          {log.summary}
                        </p>
                      </td>

                      {/* Inspect button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors inline-flex items-center gap-1"
                        >
                          <Eye size={12} />
                          Details
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect Side Modal / Drawer */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="text-gray-900" size={20} />
              <h3 className="font-semibold text-gray-900 text-base">Audit Record Details</h3>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400 font-medium">Event ID:</span>
                  <span className="font-mono text-gray-700 text-[11px]">{selectedLog.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-medium">Timestamp:</span>
                  <span className="font-semibold text-gray-900">{formatClock(selectedLog.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400 font-medium">Action Type:</span>
                  <span>{renderActionBadge(selectedLog.action)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="text-gray-400 font-medium block mb-1">Actor (Changed By)</span>
                  <div className="font-semibold text-gray-900">{selectedLog.user_name}</div>
                  <div className="text-[10px] text-gray-500 capitalize">{selectedLog.user_role} • {selectedLog.user_email || 'No email'}</div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="text-gray-400 font-medium block mb-1">Target Lead</span>
                  <div className="font-semibold text-gray-900">{selectedLog.lead_name}</div>
                  {selectedLog.lead_id && (
                    <Link
                      href={`/leads/${selectedLog.lead_id}`}
                      className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 mt-0.5"
                    >
                      Open Lead Profile <ExternalLink size={10} />
                    </Link>
                  )}
                </div>
              </div>

              {/* Before vs After Diff Box */}
              {(selectedLog.old_value !== null || selectedLog.new_value !== null) && (
                <div className="bg-gray-50/80 rounded-xl p-3.5 border border-gray-200">
                  <span className="text-gray-500 font-semibold block mb-2 uppercase text-[10px] tracking-wider">
                    Field Modification: {selectedLog.field_name || 'General'}
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-2.5 rounded-lg border border-rose-100">
                      <span className="text-[10px] uppercase font-bold text-rose-500 block mb-1">Previous Value</span>
                      <div className="font-medium text-rose-700 break-words">{selectedLog.old_value || 'None'}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                      <span className="text-[10px] uppercase font-bold text-emerald-600 block mb-1">Updated Value</span>
                      <div className="font-bold text-emerald-700 break-words">{selectedLog.new_value || 'None'}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Human readable Summary */}
              <div className="bg-white border border-gray-200 rounded-xl p-3">
                <span className="text-gray-400 font-medium block mb-1">Full Summary</span>
                <p className="text-gray-800 leading-relaxed">{selectedLog.summary}</p>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

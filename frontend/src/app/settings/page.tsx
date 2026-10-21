'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { 
  PhoneCall, Plus, GripVertical, Trash2, Check, X, Copy, Share2, 
  Send, ArrowRight, Sparkles, CheckCircle2, Shield, Layers, HelpCircle,
  Database, Download, FileSpreadsheet, HardDrive, RefreshCw, FileJson,
  CheckCircle, AlertCircle, Clock, ShieldCheck, FileDown, Eye, Server
} from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SettingsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'pipeline' | 'meta' | 'justcall' | 'backup'>('pipeline')
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newStageName, setNewStageName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Meta Integration State
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [testName, setTestName] = useState('Rahul Sharma')
  const [testPhone, setTestPhone] = useState('+91 98765 43210')
  const [testCourse, setTestCourse] = useState('MBA International Business')
  const [testCountry, setTestCountry] = useState('USA')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  // JustCall Integration State
  const [copiedJustCallUrl, setCopiedJustCallUrl] = useState(false)
  const [justcallPhone, setJustcallPhone] = useState('+966593274396')
  const [justcallOutcome, setJustcallOutcome] = useState('Connected')
  const [justcallDuration, setJustcallDuration] = useState('185')
  const [isTestingJustCall, setIsTestingJustCall] = useState(false)
  const [justcallTestResult, setJustcallTestResult] = useState<any>(null)

  // Backup & Safety Vault State
  const [backupStats, setBackupStats] = useState<Record<string, number>>({})
  const [refreshingStats, setRefreshingStats] = useState(false)
  const [isExportingJson, setIsExportingJson] = useState(false)
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState<string | null>(null)
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null)
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null)
  const [verifiedBackup, setVerifiedBackup] = useState<any | null>(null)
  const [isVerifyingFile, setIsVerifyingFile] = useState(false)

  const verifyToken = process.env.NEXT_PUBLIC_META_VERIFY_TOKEN || 'bridgewell_meta_webhook_2026'
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  const webhookUrl = `${origin}/api/webhooks/meta`

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/')
      return
    }
    fetchStages()
    fetchBackupStats()

    if (typeof window !== 'undefined') {
      const storedLastBackup = localStorage.getItem('bridgewell_last_backup_time')
      if (storedLastBackup) setLastBackupTime(storedLastBackup)
    }

    // Realtime listener for pipeline stages
    const channel = supabase
      .channel('settings-stages-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stages' }, () => {
        fetchStages()
      })
      .subscribe()

    const interval = setInterval(fetchStages, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [user])

  const fetchStages = async () => {
    const { data } = await supabase.from('stages').select('*').order('stage_order', { ascending: true })
    setStages(data || [])
    setLoading(false)
  }

  const handleAddStage = async () => {
    if (!newStageName.trim()) return
    setIsAdding(true)
    const newOrder = stages.length > 0 ? Math.max(...stages.map(s => s.stage_order)) + 1 : 1
    
    await supabase.from('stages').insert([
      { name: newStageName.trim(), stage_order: newOrder, is_exit_stage: false }
    ])
    
    setNewStageName('')
    await fetchStages()
    setIsAdding(false)
  }

  const handleDeleteStage = async (id: string) => {
    if (confirm('Are you sure you want to delete this stage? Leads in this stage may not display correctly until reassigned.')) {
      setSavingId(id)
      await supabase.from('stages').delete().eq('id', id)
      await fetchStages()
      setSavingId(null)
    }
  }

  const handleRename = async (id: string, newName: string) => {
    if (!newName.trim()) return
    setSavingId(id)
    await supabase.from('stages').update({ name: newName.trim() }).eq('id', id)
    await fetchStages()
    setSavingId(null)
  }

  const copyToClipboard = (text: string, type: 'url' | 'token') => {
    navigator.clipboard.writeText(text)
    if (type === 'url') {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
  }

  const handleSendTestLead = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/webhooks/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testName,
          phone: testPhone,
          email: `${testName.toLowerCase().replace(/\s+/g, '')}@example.com`,
          course: testCourse,
          country: testCountry,
          campaign_name: `${testCountry} Ad Campaign`,
          source: `Meta Ads - ${testCountry}`,
        }),
      })

      const data = await res.json()
      setTestResult(data)
    } catch (err: any) {
      setTestResult({ error: err.message || 'Failed to send test lead' })
    } finally {
      setIsTesting(false)
    }
  }

  // Backup & Safety Vault Handlers
  const fetchBackupStats = async () => {
    setRefreshingStats(true)
    const tables = ['leads', 'users', 'stages', 'activities', 'assignments', 'audit_logs', 'notifications', 'email_templates']
    const counts: Record<string, number> = {}
    await Promise.all(
      tables.map(async (t) => {
        try {
          const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
          counts[t] = count || 0
        } catch {
          counts[t] = 0
        }
      })
    )
    setBackupStats(counts)
    setRefreshingStats(false)
  }

  const handleDownloadJson = () => {
    setIsExportingJson(true)
    const link = document.createElement('a')
    link.href = '/api/backup?download=1'
    link.download = `bridgewell_crm_full_backup_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    const nowStr = new Date().toLocaleString()
    setLastBackupTime(nowStr)
    if (typeof window !== 'undefined') {
      localStorage.setItem('bridgewell_last_backup_time', nowStr)
    }
    setBackupSuccessMessage('Full JSON database snapshot downloaded safely!')
    setTimeout(() => {
      setIsExportingJson(false)
      setBackupSuccessMessage(null)
    }, 4500)
  }

  const handleDownloadExcel = async () => {
    setIsExportingExcel(true)
    try {
      const res = await fetch('/api/backup')
      const json = await res.json()
      if (!json || !json.tables) throw new Error('Could not fetch database snapshot')

      const wb = XLSX.utils.book_new()

      // 1. Leads Sheet
      if (json.tables.leads && json.tables.leads.length > 0) {
        const cleanedLeads = json.tables.leads.map((l: any) => {
          const { metadata, ...rest } = l
          return {
            ...rest,
            metadata_details: metadata ? JSON.stringify(metadata) : ''
          }
        })
        const wsLeads = XLSX.utils.json_to_sheet(cleanedLeads)
        XLSX.utils.book_append_sheet(wb, wsLeads, 'Leads')
      }

      // 2. Activities & Calls Sheet
      if (json.tables.activities && json.tables.activities.length > 0) {
        const wsActivities = XLSX.utils.json_to_sheet(json.tables.activities)
        XLSX.utils.book_append_sheet(wb, wsActivities, 'Calls & Activities')
      }

      // 3. Team Sheet
      if (json.tables.users && json.tables.users.length > 0) {
        const wsUsers = XLSX.utils.json_to_sheet(json.tables.users)
        XLSX.utils.book_append_sheet(wb, wsUsers, 'Team')
      }

      // 4. Stages Sheet
      if (json.tables.stages && json.tables.stages.length > 0) {
        const wsStages = XLSX.utils.json_to_sheet(json.tables.stages)
        XLSX.utils.book_append_sheet(wb, wsStages, 'Pipeline Stages')
      }

      // 5. Assignments Sheet
      if (json.tables.assignments && json.tables.assignments.length > 0) {
        const wsAssignments = XLSX.utils.json_to_sheet(json.tables.assignments)
        XLSX.utils.book_append_sheet(wb, wsAssignments, 'Assignments')
      }

      // 6. Audit Logs Sheet
      if (json.tables.audit_logs && json.tables.audit_logs.length > 0) {
        const wsAudit = XLSX.utils.json_to_sheet(json.tables.audit_logs)
        XLSX.utils.book_append_sheet(wb, wsAudit, 'Audit Logs')
      }

      const filename = `bridgewell_crm_master_backup_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, filename)

      const nowStr = new Date().toLocaleString()
      setLastBackupTime(nowStr)
      if (typeof window !== 'undefined') {
        localStorage.setItem('bridgewell_last_backup_time', nowStr)
      }
      setBackupSuccessMessage('Complete Excel (.xlsx) master backup downloaded with all sheets!')
      setTimeout(() => setBackupSuccessMessage(null), 4500)
    } catch (e: any) {
      alert('Error exporting Excel: ' + (e?.message || 'Unknown error'))
    } finally {
      setIsExportingExcel(false)
    }
  }

  const handleDownloadCsv = async (table: 'leads' | 'activities') => {
    setIsExportingCsv(table)
    try {
      const { data, error } = await supabase.from(table).select('*').limit(50000)
      if (error) throw error
      if (!data || data.length === 0) {
        alert(`No records found in ${table} table`)
        return
      }
      const ws = XLSX.utils.json_to_sheet(data)
      const csv = XLSX.utils.sheet_to_csv(ws)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `bridgewell_${table}_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('Error exporting CSV: ' + (e?.message || 'Unknown error'))
    } finally {
      setIsExportingCsv(null)
    }
  }

  const handleVerifyBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsVerifyingFile(true)
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string)
        if (parsed.tables && parsed.metadata) {
          setVerifiedBackup(parsed)
        } else {
          alert('Uploaded JSON file is not a valid Bridgewell CRM backup snapshot.')
        }
      } catch {
        alert('Invalid JSON file. Please upload a valid backup .json file.')
      } finally {
        setIsVerifyingFile(false)
      }
    }
    reader.readAsText(file)
  }

  if (loading) return <div className="p-8 h-full flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div></div>

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFD] p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">CRM Settings</h1>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Live Realtime Sync
          </span>
        </div>
        <p className="text-gray-500 text-sm mb-6">Manage pipeline stages, lead automations, and Meta Ads integrations.</p>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-gray-200 mb-8">
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'pipeline'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Layers size={16} />
            <span>Pipeline Stages</span>
            <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 rounded-full text-gray-600 font-medium">
              {stages.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('meta')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'meta'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Share2 size={16} className="text-blue-600" />
            <span>Meta Ads (Facebook / Instagram)</span>
            <span className="ml-1 px-2 py-0.5 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-bold">
              Auto-Sync
            </span>
          </button>

          <button
            onClick={() => setActiveTab('justcall')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'justcall'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <PhoneCall size={16} className="text-emerald-600" />
            <span>JustCall Dialer</span>
            <span className="ml-1 px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
              Auto Call Logger
            </span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'backup'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Database size={16} className="text-amber-600" />
            <span>Database Backup & Vault</span>
            <span className="ml-1 px-2 py-0.5 text-xs bg-amber-50 text-amber-800 border border-amber-200 rounded-full font-bold">
              Safety Vault
            </span>
          </button>
        </div>

        {/* Tab 1: Pipeline Stages */}
        {activeTab === 'pipeline' && (
          <section className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Pipeline Stages</h2>
            <p className="text-gray-500 text-sm mb-6">Customize the stages that a lead goes through in your pipeline. The Kanban board will reflect this order.</p>

            <div className="space-y-3 mb-6">
              {stages.map((stage) => (
                <div key={stage.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3 group">
                  <div className="text-gray-400 cursor-grab active:cursor-grabbing">
                    <GripVertical size={16} />
                  </div>
                  <div className="flex-1 flex items-center gap-4">
                    <input 
                      type="text" 
                      defaultValue={stage.name}
                      onBlur={(e) => {
                        if (e.target.value !== stage.name) handleRename(stage.id, e.target.value)
                      }}
                      className="flex-1 bg-transparent border border-transparent hover:border-gray-200 focus:border-gray-300 focus:bg-white rounded px-2 py-1 outline-none text-sm font-medium text-gray-900 transition-colors"
                    />
                    {stage.is_exit_stage && (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-200/50 px-2 py-0.5 rounded">Exit Stage</span>
                    )}
                  </div>
                  <button 
                    onClick={() => handleDeleteStage(stage.id)}
                    disabled={savingId === stage.id}
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1.5 rounded-md hover:bg-red-50"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 bg-white border border-dashed border-gray-300 rounded-lg p-3 focus-within:border-black focus-within:ring-4 focus-within:ring-gray-100 transition-all">
              <Plus size={16} className="text-gray-400" />
              <input 
                type="text" 
                value={newStageName}
                onChange={e => setNewStageName(e.target.value)}
                placeholder="Add a new stage..."
                className="flex-1 outline-none text-sm font-medium text-gray-900 bg-transparent"
                onKeyDown={(e) => e.key === 'Enter' && handleAddStage()}
              />
              {newStageName && (
                <button 
                  onClick={handleAddStage}
                  disabled={isAdding}
                  className="bg-black text-white px-3 py-1.5 rounded-md text-xs font-medium shadow-sm hover:bg-gray-800 transition-colors"
                >
                  Add
                </button>
              )}
            </div>
          </section>
        )}

        {/* Tab 2: Meta Ads Integration */}
        {activeTab === 'meta' && (
          <div className="space-y-6">
            {/* Meta Banner */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-blue-800">
              <div className="flex items-start justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-200 border border-blue-400/30 mb-3">
                    <Sparkles size={12} />
                    <span>Real-Time Lead Ingestion</span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight mb-1">
                    Meta Ads (Facebook & Instagram) Direct Integration
                  </h2>
                  <p className="text-blue-100/80 text-sm max-w-2xl leading-relaxed">
                    Whenever a student fills your Facebook or Instagram Lead Form, they land in Bridgewell CRM automatically in real-time.
                  </p>
                </div>
              </div>

              {/* Assignment Notice */}
              <div className="mt-5 p-3.5 bg-white/10 rounded-xl border border-white/10 flex items-center gap-3">
                <Shield size={20} className="text-amber-300 shrink-0" />
                <p className="text-xs text-blue-50 font-medium">
                  <span className="font-bold text-amber-300">Admin Control Guaranteed:</span> Incoming Meta leads are strictly marked as <span className="underline font-bold">Unassigned</span> (`owner_id = null`). Only the Admin manually assigns them to counselors via the Reassignment board.
                </p>
              </div>
            </div>

            {/* Webhook Connection Details */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Webhook Credentials</h3>
              <p className="text-gray-500 text-xs mb-5">Use these details in your Facebook Developer Portal or Zapier/Make.com webhook trigger.</p>

              <div className="space-y-4">
                {/* Webhook URL */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Webhook Callback URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(webhookUrl, 'url')}
                      className="px-4 py-2.5 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {copiedUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedUrl ? 'Copied!' : 'Copy URL'}</span>
                    </button>
                  </div>
                </div>

                {/* Verify Token */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                    Verify Token (hub.verify_token)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={verifyToken}
                      className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(verifyToken, 'token')}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {copiedToken ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      <span>{copiedToken ? 'Copied!' : 'Copy Token'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Test Simulation Card */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-0.5">Test Lead Ingestion</h3>
                  <p className="text-gray-500 text-xs">Simulate a Meta Ad lead to verify real-time ingestion, notification, and Unassigned state.</p>
                </div>
                <Link
                  href="/reassign"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <span>Go to Reassign Board</span>
                  <ArrowRight size={13} />
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Target Ad Country</label>
                  <select
                    value={testCountry}
                    onChange={(e) => setTestCountry(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-blue-200 rounded-lg text-xs font-semibold text-blue-900 outline-none"
                  >
                    <option value="USA">🇺🇸 USA Ad</option>
                    <option value="UK">🇬🇧 UK Ad</option>
                    <option value="Canada">🇨🇦 Canada Ad</option>
                    <option value="Australia">🇦🇺 Australia Ad</option>
                    <option value="Germany">🇩🇪 Germany Ad</option>
                    <option value="Ireland">🇮🇪 Ireland Ad</option>
                    <option value="UAE">🇦🇪 UAE Ad</option>
                    <option value="India">🇮🇳 India Ad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Student Name</label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    placeholder="Student Name"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    placeholder="+1 or +44 number"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 mb-1">Course Interest</label>
                  <input
                    type="text"
                    value={testCourse}
                    onChange={(e) => setTestCourse(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                    placeholder="MBA, BSc, etc."
                  />
                </div>
              </div>

              <button
                onClick={handleSendTestLead}
                disabled={isTesting}
                className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                {isTesting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={13} />
                )}
                <span>{isTesting ? 'Sending...' : 'Send Test Meta Lead'}</span>
              </button>

              {testResult && (
                <div
                  className={`mt-4 p-4 rounded-xl border text-xs ${
                    testResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {testResult.success ? (
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold mb-0.5">Test Lead Ingested Successfully!</p>
                        <p className="text-emerald-700 leading-relaxed">
                          Lead ID: <span className="font-mono font-semibold">{testResult.leadId}</span>. Status is strictly <strong>Unassigned</strong>. Check your top notification bell and the Reassignment Board to assign them.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="font-semibold">Error: {testResult.error}</p>
                  )}
                </div>
              )}
            </section>

            {/* Step-by-Step Setup Guide */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Setup Instructions (2 Easy Ways)</h3>
              <p className="text-gray-500 text-xs mb-5">Choose whichever method fits your technical preference:</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Method 1: Zapier / Make / Pabbly */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[11px] font-bold">
                      Option 1 (Recommended - 2 Min Setup)
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Via Zapier / Make.com / Pabbly</h4>
                  <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>Create a new Zap or Scenario.</li>
                    <li><strong>Trigger:</strong> Choose <em>Facebook Lead Ads</em> &rarr; <em>New Lead</em>. Connect your FB Page & Form.</li>
                    <li><strong>Action:</strong> Choose <em>Webhooks</em> &rarr; <em>POST</em>.</li>
                    <li><strong>URL:</strong> Paste the Webhook URL above.</li>
                    <li><strong>Data Fields:</strong> Map <code>name</code>, <code>phone</code>, <code>email</code>, <code>course</code>.</li>
                    <li>Done! All leads will arrive live in CRM without counselor auto-assignment.</li>
                  </ol>
                </div>

                {/* Method 2: Direct Meta Webhooks */}
                <div className="p-4 rounded-xl bg-gray-50 border border-gray-200">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-[11px] font-bold">
                      Option 2 (Direct Meta App)
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Via Meta Developer Portal</h4>
                  <ol className="text-xs text-gray-600 space-y-2 list-decimal list-inside leading-relaxed">
                    <li>Go to <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">developers.facebook.com</a> &rarr; Your App.</li>
                    <li>Add the <strong>Webhooks</strong> product &rarr; Select <strong>Page</strong>.</li>
                    <li>Click <strong>Subscribe to this object</strong>:
                      <ul className="list-disc list-inside pl-2 text-gray-500 mt-1">
                        <li>Callback URL: Webhook Callback URL above</li>
                        <li>Verify Token: <code>{verifyToken}</code></li>
                      </ul>
                    </li>
                    <li>Subscribe to the <strong>leadgen</strong> field.</li>
                    <li>Add <code>META_PAGE_ACCESS_TOKEN</code> in your CRM's <code>.env.local</code>.</li>
                  </ol>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 3: JustCall Automatic Dialer Integration */}
        {activeTab === 'justcall' && (
          <div className="space-y-6">
            {/* JustCall Banner */}
            <div className="bg-gradient-to-r from-emerald-900 to-teal-950 text-white rounded-2xl p-6 shadow-sm border border-emerald-800">
              <div className="flex items-start justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 mb-3">
                    <Sparkles size={12} />
                    <span>Automatic Call Detection &amp; Duration Logger</span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">JustCall Dialer Integration</h2>
                  <p className="text-emerald-100/80 text-sm max-w-2xl leading-relaxed">
                    Whenever your counselor dials a lead via JustCall, our system automatically detects whether the call was <strong>Connected</strong> or <strong>Unanswered</strong>, logs the <strong>exact duration (minutes &amp; seconds)</strong>, attaches the <strong>recording link</strong>, and updates the timeline in real-time.
                  </p>
                </div>
                <div className="hidden sm:block">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                    <PhoneCall size={28} className="text-emerald-300" />
                  </div>
                </div>
              </div>
            </div>

            {/* Webhook Configuration Card */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">JustCall Webhook Endpoint</h3>
              <p className="text-gray-500 text-xs mb-4">
                Copy this URL and paste it into your JustCall account under <strong>Integrations &gt; Webhooks</strong>.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Webhook URL (Event: Call Completed)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${origin}/api/webhooks/justcall`}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/api/webhooks/justcall`)
                        setCopiedJustCallUrl(true)
                        setTimeout(() => setCopiedJustCallUrl(false), 2000)
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-black text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      {copiedJustCallUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedJustCallUrl ? 'Copied!' : 'Copy URL'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Test Simulator */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Test Automatic Call Logger</h3>
                  <p className="text-gray-500 text-xs">Simulate a call event to verify that duration, status, and timeline updates work immediately.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Student Phone</label>
                  <input
                    type="text"
                    value={justcallPhone}
                    onChange={(e) => setJustcallPhone(e.target.value)}
                    placeholder="+966593274396"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-black font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Outcome</label>
                  <select
                    value={justcallOutcome}
                    onChange={(e) => setJustcallOutcome(e.target.value)}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-black bg-white"
                  >
                    <option value="Connected">Connected (Answered)</option>
                    <option value="No Answer">No Answer (Missed)</option>
                    <option value="Busy">Busy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Duration (Seconds)</label>
                  <input
                    type="number"
                    value={justcallDuration}
                    onChange={(e) => setJustcallDuration(e.target.value)}
                    placeholder="185"
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-black font-mono"
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">
                    {justcallOutcome === 'Connected' ? `≈ ${Math.floor(Number(justcallDuration)/60)}m ${Number(justcallDuration)%60}s` : '0s'}
                  </span>
                </div>
              </div>

              <button
                disabled={isTestingJustCall || !justcallPhone}
                onClick={async () => {
                  setIsTestingJustCall(true)
                  setJustcallTestResult(null)
                  try {
                    const res = await fetch('/api/webhooks/justcall', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        type: 'call.completed',
                        data: {
                          contact_number: justcallPhone,
                          agent_name: user?.name || 'Counselor',
                          agent_email: user?.email || '',
                          call_info: {
                            direction: 'Outgoing',
                            type: justcallOutcome === 'Connected' ? 'Answered' : justcallOutcome,
                            duration: justcallOutcome === 'Connected' ? Number(justcallDuration) : 0
                          },
                          recording: justcallOutcome === 'Connected' ? 'https://app.justcall.io/recording/sample_demo.mp3' : '',
                          notes: 'Test call logged via Settings Simulator'
                        }
                      })
                    })
                    const data = await res.json()
                    setJustcallTestResult({ success: res.ok && data.success, data })
                  } catch (err: any) {
                    setJustcallTestResult({ success: false, data: { error: err.message } })
                  } finally {
                    setIsTestingJustCall(false)
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {isTestingJustCall ? <Sparkles size={14} className="animate-spin" /> : <PhoneCall size={14} />}
                <span>{isTestingJustCall ? 'Sending Test Call...' : 'Send Test Call Webhook'}</span>
              </button>

              {justcallTestResult && (
                <div
                  className={`mt-4 p-4 rounded-xl border text-xs ${
                    justcallTestResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {justcallTestResult.success ? (
                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold mb-0.5">Test Call Logged Successfully!</p>
                        <p className="text-emerald-700 leading-relaxed">
                          Matched Lead: <strong>{justcallTestResult.data.lead_name}</strong> • Outcome: <strong>{justcallTestResult.data.outcome}</strong> • Duration: <strong>{justcallTestResult.data.duration}</strong>.
                          Timeline updated in real-time.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="font-semibold">Error: {justcallTestResult.data?.message || justcallTestResult.data?.error || 'Failed to log test call'}</p>
                  )}
                </div>
              )}
            </section>

            {/* Step-by-Step JustCall Setup Guide */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">How to Enable in JustCall (2 Minutes)</h3>
              <p className="text-gray-500 text-xs mb-4">Follow these 3 simple steps inside your JustCall dashboard:</p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Login to JustCall</p>
                    <p className="text-xs text-gray-600 mt-0.5">Go to <a href="https://app.justcall.io" target="_blank" rel="noreferrer" className="text-emerald-600 underline font-semibold">app.justcall.io</a> &rarr; click on <strong>Settings</strong> (or <strong>Integrations</strong>) &rarr; select <strong>Webhooks</strong>.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Add New Webhook</p>
                    <p className="text-xs text-gray-600 mt-0.5">Click <strong>+ New Webhook</strong> &rarr; Select Event: <strong>Call Completed</strong> (or <code>call.completed</code>).</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Paste Webhook URL &amp; Save</p>
                    <p className="text-xs text-gray-600 mt-0.5">Paste the Webhook URL copied from above into the Endpoint URL field and click <strong>Save</strong>. Done!</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Tab 4: Database Backup & Vault */}
        {activeTab === 'backup' && (
          <div className="space-y-6">
            {/* Success Toast */}
            {backupSuccessMessage && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-3 text-emerald-900 text-sm font-semibold animate-in fade-in duration-200 shadow-xs">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>{backupSuccessMessage}</span>
              </div>
            )}

            {/* Health & Safety Vault Card */}
            <section className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-orange-500/10 border border-amber-300/80 rounded-2xl p-6 shadow-xs">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                    <ShieldCheck size={26} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-amber-950">Independent Database Backup &amp; Safety Vault</h2>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Data Safe &amp; Protected
                      </span>
                    </div>
                    <p className="text-xs text-amber-900 mt-1 max-w-2xl leading-relaxed">
                      While Supabase keeps live records safe, you can instantly export and store independent offline copies so your CRM data is 100% secure against accidental deletion, server outages, or compliance needs.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
                  <div className="text-right">
                    <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider block">Last Backup Generated</span>
                    <span className="text-xs font-semibold text-gray-900 flex items-center gap-1 mt-0.5">
                      <Clock size={12} className="text-gray-400" />
                      {lastBackupTime || 'No backup downloaded yet today'}
                    </span>
                  </div>
                  <button
                    onClick={fetchBackupStats}
                    disabled={refreshingStats}
                    className="p-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl text-gray-700 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                    title="Refresh live table counts"
                  >
                    <RefreshCw size={14} className={refreshingStats ? 'animate-spin text-black' : ''} />
                  </button>
                </div>
              </div>
            </section>

            {/* Live Table Counts Grid */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Live Database Overview</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Current record counts across all CRM database tables</p>
                </div>
                <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg">
                  {Object.values(backupStats).reduce((a, b) => a + b, 0)} Total Records
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block">Leads</span>
                  <span className="text-xl font-bold text-blue-950 mt-1 block">{backupStats.leads ?? '...'}</span>
                  <span className="text-[10px] text-blue-600">Prospective Students</span>
                </div>

                <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Calls &amp; Activities</span>
                  <span className="text-xl font-bold text-emerald-950 mt-1 block">{backupStats.activities ?? '...'}</span>
                  <span className="text-[10px] text-emerald-600">Timeline &amp; Notes</span>
                </div>

                <div className="p-3 bg-purple-50/60 border border-purple-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">Team Counselors</span>
                  <span className="text-xl font-bold text-purple-950 mt-1 block">{backupStats.users ?? '...'}</span>
                  <span className="text-[10px] text-purple-600">Active Staff</span>
                </div>

                <div className="p-3 bg-indigo-50/60 border border-indigo-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block">Pipeline Stages</span>
                  <span className="text-xl font-bold text-indigo-950 mt-1 block">{backupStats.stages ?? '...'}</span>
                  <span className="text-[10px] text-indigo-600">Workflow Columns</span>
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Assignments</span>
                  <span className="text-xl font-bold text-amber-950 mt-1 block">{backupStats.assignments ?? '...'}</span>
                  <span className="text-[10px] text-amber-600">Reassignment Logs</span>
                </div>

                <div className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block">Audit Logs</span>
                  <span className="text-xl font-bold text-rose-950 mt-1 block">{backupStats.audit_logs ?? '...'}</span>
                  <span className="text-[10px] text-rose-600">Security Events</span>
                </div>

                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">Email Templates</span>
                  <span className="text-xl font-bold text-gray-900 mt-1 block">{backupStats.email_templates ?? '...'}</span>
                  <span className="text-[10px] text-gray-500">Canned Responses</span>
                </div>

                <div className="p-3 bg-teal-50/60 border border-teal-200/80 rounded-xl">
                  <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wider block">Notifications</span>
                  <span className="text-xl font-bold text-teal-950 mt-1 block">{backupStats.notifications ?? '...'}</span>
                  <span className="text-[10px] text-teal-600">System Alerts</span>
                </div>
              </div>
            </section>

            {/* 1-Click Backup Export Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Option A: Full JSON Snapshot */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-bold">
                      <FileJson size={20} />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                      Disaster Recovery
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Complete JSON Database Snapshot</h3>
                  <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                    Downloads an all-in-one raw JSON archive with all 8 database tables, foreign keys, timestamps, and metadata. Suitable for instant full database restoration.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleDownloadJson}
                    disabled={isExportingJson}
                    className="w-full py-2.5 px-4 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isExportingJson ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Generating JSON Archive...</span>
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        <span>Download Full JSON Snapshot (.json)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Option B: Master Multi-Sheet Excel */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold">
                      <FileSpreadsheet size={20} />
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      Excel / Sheets Ready
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-gray-900">Master Multi-Sheet Excel Workbook</h3>
                  <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                    Compiles every table into separate tabs inside one organized <code>.xlsx</code> workbook: Leads, Call History, Team Members, Stages, and Assignments.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100">
                  <button
                    onClick={handleDownloadExcel}
                    disabled={isExportingExcel}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    {isExportingExcel ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        <span>Compiling Excel Workbook...</span>
                      </>
                    ) : (
                      <>
                        <FileDown size={14} />
                        <span>Download Master Excel (.xlsx)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick CSV Downloads */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-1">Quick Individual CSV Exports</h3>
              <p className="text-xs text-gray-500 mb-4">Export specific datasets directly into standard CSV format:</p>

              <div className="flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => handleDownloadCsv('leads')}
                  disabled={isExportingCsv === 'leads'}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 text-gray-800 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download size={13} className="text-blue-600" />
                  <span>{isExportingCsv === 'leads' ? 'Exporting...' : 'Export Leads (.CSV)'}</span>
                </button>

                <button
                  onClick={() => handleDownloadCsv('activities')}
                  disabled={isExportingCsv === 'activities'}
                  className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 text-gray-800 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download size={13} className="text-emerald-600" />
                  <span>{isExportingCsv === 'activities' ? 'Exporting...' : 'Export Calls & Activities (.CSV)'}</span>
                </button>
              </div>
            </section>

            {/* Automated CLI / Scheduled Backup Guide */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
                  <Server size={18} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-gray-900">Automated Terminal / Nightly Backup</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    You can also run automated offline backups from your terminal or schedule them as a daily Windows Task / Cron job:
                  </p>

                  <div className="mt-3 p-3 bg-gray-900 text-gray-100 rounded-xl font-mono text-xs flex items-center justify-between">
                    <span>npm run backup</span>
                    <span className="text-gray-400 text-[11px]">Saves timestamped JSON + CSV to /backups</span>
                  </div>

                  <p className="text-[11px] text-gray-500 mt-2">
                    Backups created with this command are stored permanently inside the root <code>/backups</code> folder with zero dependency on the browser.
                  </p>
                </div>
              </div>
            </section>

            {/* Backup Verification & Restore Drill Sandbox */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    <Eye size={16} className="text-indigo-600" />
                    <span>Backup Verification &amp; Inspection Tool</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Test and verify any previously exported backup file to confirm records and schema integrity without touching the live database.
                  </p>
                </div>
              </div>

              <div className="mt-4 p-4 border border-dashed border-gray-300 rounded-xl bg-gray-50/50 flex flex-col items-center justify-center text-center">
                <FileJson size={28} className="text-gray-400 mb-2" />
                <label className="cursor-pointer">
                  <span className="px-3.5 py-1.5 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-semibold inline-block transition-all shadow-xs">
                    Choose Backup File (.json) to Inspect
                  </span>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleVerifyBackupFile}
                    className="hidden"
                  />
                </label>
                <span className="text-[11px] text-gray-400 mt-1.5">Zero write risk: purely inspects structure and counts</span>
              </div>

              {verifiedBackup && (
                <div className="mt-4 p-4 bg-emerald-50/70 border border-emerald-300 rounded-xl animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 mb-2 text-emerald-900 font-bold text-xs">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span>Verified: Valid Bridgewell CRM Backup Snapshot</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-emerald-950 mt-2">
                    <div className="p-2 bg-white/70 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block font-semibold">Generated</span>
                      <span className="font-bold">{new Date(verifiedBackup.metadata?.generated_at).toLocaleString()}</span>
                    </div>
                    <div className="p-2 bg-white/70 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block font-semibold">Total Records</span>
                      <span className="font-bold">{verifiedBackup.metadata?.total_records || 'N/A'}</span>
                    </div>
                    <div className="p-2 bg-white/70 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block font-semibold">Leads Found</span>
                      <span className="font-bold">{verifiedBackup.tables?.leads?.length || 0}</span>
                    </div>
                    <div className="p-2 bg-white/70 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 block font-semibold">Activities Found</span>
                      <span className="font-bold">{verifiedBackup.tables?.activities?.length || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

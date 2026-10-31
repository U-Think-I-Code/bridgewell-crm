'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { 
  Phone, PhoneCall, Plus, GripVertical, Trash2, Check, X, Copy, Share2, 
  Send, ArrowRight, Sparkles, CheckCircle2, Shield, Layers, HelpCircle,
  Database, Download, FileSpreadsheet, HardDrive, RefreshCw, FileJson,
  CheckCircle, AlertCircle, Clock, ShieldCheck, FileDown, Eye, Server, Headphones, Radio, ExternalLink,
  Mail, Key, EyeOff
} from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { openCallHippoDialer, getCallHippoDialerUrl, getPreferredDialer, setPreferredDialer, usePreferredDialer, DialerType, useCallHippoLine } from '@/lib/dialer'

export default function SettingsPage() {
  const { user } = useAuth()
  const [lineConfig, updateLineConfig] = useCallHippoLine()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'pipeline' | 'meta' | 'callhippo' | 'backup' | 'email'>('pipeline')
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newStageName, setNewStageName] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Email & Direct SMTP Dispatch State
  const [smtpConfig, setSmtpConfig] = useState({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    user: '',
    pass: '',
    fromEmail: '',
    fromName: 'Bridgewell Academic'
  })
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(false)
  const [smtpSource, setSmtpSource] = useState<string>('')
  const [loadingSmtp, setLoadingSmtp] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [smtpStatusMessage, setSmtpStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Meta / Facebook Webhook State
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [testName, setTestName] = useState('Rahul Sharma')
  const [testPhone, setTestPhone] = useState('+919876543210')
  const [testCourse, setTestCourse] = useState('BSc Computer Science')
  const [testCountry, setTestCountry] = useState('UK')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<any>(null)

  // CallHippo Dialer & Webhook State
  const [preferredDialer, setPreferredDialerState] = usePreferredDialer()
  const [copiedCallHippoUrl, setCopiedCallHippoUrl] = useState(false)
  const [callhippoPhone, setCallhippoPhone] = useState('+91 98765 43210')
  const [callhippoOutcome, setCallhippoOutcome] = useState('Connected')
  const [callhippoDuration, setCallhippoDuration] = useState('145')
  const [callhippoRecordingUrl, setCallhippoRecordingUrl] = useState('https://callhippo-recordings.s3.amazonaws.com/demo_recording.mp3')
  const [isTestingCallHippo, setIsTestingCallHippo] = useState(false)
  const [callhippoTestResult, setCallhippoTestResult] = useState<any>(null)
  const [callhippoTestedDial, setCallhippoTestedDial] = useState(false)

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
  const metaSharedSecret = process.env.NEXT_PUBLIC_META_WEBHOOK_SHARED_SECRET || 'bw_meta_sec_c26109c580ed20dbf9e3b5588d0f8ad227855839'
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
  const webhookUrl = `${origin}/api/webhooks/meta`

  useEffect(() => {
    if (user && user.role !== 'manager') {
      router.push('/')
      return
    }
    fetchStages()
    fetchBackupStats()
    fetchSmtpConfig()

    if (typeof window !== 'undefined') {
      const storedLastBackup = localStorage.getItem('bridgewell_last_backup_time')
      if (storedLastBackup) setLastBackupTime(storedLastBackup)
      setPreferredDialerState(getPreferredDialer())
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

  const copyToClipboard = (text: string, type: 'url' | 'token' | 'secret') => {
    navigator.clipboard.writeText(text)
    if (type === 'url') {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    } else if (type === 'token') {
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    } else if (type === 'secret') {
      setCopiedSecret(true)
      setTimeout(() => setCopiedSecret(false), 2000)
    }
  }

  const handleSendTestLead = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/webhooks/meta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': metaSharedSecret,
        },
        body: JSON.stringify({
          name: testName,
          phone: testPhone,
          email: `${testName.toLowerCase().replace(/\s+/g, '')}@example.com`,
          course: testCourse,
          country: testCountry,
          campaign_name: `${testCountry} Ad Campaign`,
          ad_name: `${testCountry} Top Conversions Ad`,
          form_name: `${testCountry} Lead Qualification Form`,
          intake: 'September 2026',
          application_stage: 'Planning to Apply',
          travel_dates: 'August 2026',
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

  const handleTestCallHippoWebhook = async () => {
    setIsTestingCallHippo(true)
    setCallhippoTestResult(null)
    try {
      const res = await fetch('/api/webhooks/callhippo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_number: callhippoPhone,
          to: callhippoPhone,
          from: '+14155552671',
          duration: parseInt(callhippoDuration, 10) || 145,
          status: callhippoOutcome.toLowerCase(),
          disposition: callhippoOutcome,
          direction: 'outbound',
          agent_name: user?.name || 'Rahul Sharma (Counselor)',
          agent_email: user?.email || 'counselor@bridgewell.edu',
          recording_url: callhippoRecordingUrl,
          notes: 'Test call from CallHippo settings simulator.'
        }),
      })

      const data = await res.json()
      setCallhippoTestResult(data)
    } catch (err: any) {
      setCallhippoTestResult({ error: err.message || 'Failed to simulate CallHippo webhook' })
    } finally {
      setIsTestingCallHippo(false)
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

  const fetchSmtpConfig = async () => {
    setLoadingSmtp(true)
    try {
      const res = await fetch('/api/email/config')
      const data = await res.json()
      if (data.configured) {
        setIsSmtpConfigured(true)
        setSmtpSource(data.source)
        setSmtpConfig(prev => ({
          ...prev,
          host: data.config.host || 'smtp.gmail.com',
          port: data.config.port || 465,
          secure: data.config.secure ?? true,
          user: data.config.user || '',
          fromEmail: data.config.fromEmail || data.config.user || '',
          fromName: data.config.fromName || 'Bridgewell Academic',
          pass: ''
        }))
        if (data.config.user && !testRecipient) {
          setTestRecipient(data.config.user)
        }
      } else {
        setIsSmtpConfigured(false)
      }
    } catch (e) {
      console.error('Failed to load SMTP config', e)
    } finally {
      setLoadingSmtp(false)
    }
  }

  const handleSaveSmtp = async (sendTest = false) => {
    if (!smtpConfig.user || !smtpConfig.host) {
      alert('Please fill in your SMTP Host and User email')
      return
    }
    if (!smtpConfig.pass && !isSmtpConfigured) {
      alert('Please enter your SMTP password / App Password')
      return
    }

    if (sendTest) setTestingSmtp(true)
    else setSavingSmtp(true)
    setSmtpStatusMessage(null)

    try {
      const res = await fetch('/api/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...smtpConfig,
          testRecipient: sendTest ? (testRecipient || smtpConfig.user) : undefined
        })
      })

      const result = await res.json()
      if (result.success) {
        setIsSmtpConfigured(true)
        setSmtpStatusMessage({
          type: 'success',
          text: sendTest
            ? `✅ Connection verified! Test email successfully sent to ${testRecipient || smtpConfig.user}!`
            : '✅ SMTP Configuration successfully saved and verified!'
        })
        await fetchSmtpConfig()
      } else {
        setSmtpStatusMessage({
          type: 'error',
          text: `❌ Error: ${result.error || 'Failed to connect to SMTP server'}`
        })
      }
    } catch (err: any) {
      setSmtpStatusMessage({
        type: 'error',
        text: `❌ Connection failed: ${err.message}`
      })
    } finally {
      setSavingSmtp(false)
      setTestingSmtp(false)
    }
  }

  const applyPreset = (preset: 'gmail' | 'm365' | 'custom') => {
    if (preset === 'gmail') {
      setSmtpConfig(prev => ({
        ...prev,
        host: 'smtp.gmail.com',
        port: 465,
        secure: true
      }))
    } else if (preset === 'm365') {
      setSmtpConfig(prev => ({
        ...prev,
        host: 'smtp.office365.com',
        port: 587,
        secure: false
      }))
    }
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
            onClick={() => setActiveTab('callhippo')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'callhippo'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <PhoneCall size={16} className="text-emerald-600" />
            <span>CallHippo Dialer</span>
            <span className="ml-1 px-2 py-0.5 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">
              Official VoIP
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

          <button
            onClick={() => setActiveTab('email')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'email'
                ? 'border-black text-black'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Mail size={16} className="text-rose-600" />
            <span>Email Service (SMTP)</span>
            <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-bold ${
              isSmtpConfigured
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}>
              {isSmtpConfigured ? 'Direct Send Active' : 'Configure'}
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

                {/* Shared Webhook Secret (Zapier / Relay) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider">
                      Shared Secret Header (<code className="text-amber-700 font-mono">x-webhook-secret</code>)
                    </label>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Protected Endpoint
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs mb-2">
                    In Zapier, add Header <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-800 font-mono">x-webhook-secret</code> with this secret to authenticate leads.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={metaSharedSecret}
                      className="flex-1 px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 focus:outline-none"
                    />
                    <button
                      onClick={() => copyToClipboard(metaSharedSecret, 'secret')}
                      className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0"
                    >
                      {copiedSecret ? <Check size={14} className="text-white" /> : <Copy size={14} />}
                      <span>{copiedSecret ? 'Copied!' : 'Copy Secret'}</span>
                    </button>
                  </div>
                </div>

                {/* Zapier Setup Instructions Banner */}
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3.5 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 mb-1.5 text-amber-950">
                    <span>⚡ Zapier Connection Guide (Bypasses Meta Account Restrictions)</span>
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-gray-700 leading-relaxed text-[11px]">
                    <li><strong>Trigger:</strong> Facebook Lead Ads &rarr; Event: <em>New Lead</em> (Select your Page &amp; Lead Form).</li>
                    <li><strong>Action:</strong> Webhooks by Zapier &rarr; Event: <em>Custom Request</em> or <em>POST</em>.</li>
                    <li><strong>URL:</strong> Paste Webhook Callback URL: <code className="bg-white/80 border px-1 rounded font-mono text-gray-900">{webhookUrl}</code></li>
                    <li><strong>Headers:</strong> Add header <code className="bg-white/80 border px-1 rounded font-mono text-gray-900">x-webhook-secret</code> set to your Shared Secret above.</li>
                    <li><strong>Data:</strong> Send Lead answers (Intake, Application Stage, Travel Dates, Phone, Name, Email, Ad Name, Form Name).</li>
                  </ol>
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

        {/* Tab 3: CallHippo Automatic Dialer Integration */}
        {activeTab === 'callhippo' && (
          <div className="space-y-6">
            {/* CallHippo Hero Banner */}
            <div className="bg-gradient-to-r from-emerald-900 via-teal-950 to-slate-900 text-white rounded-2xl p-6 shadow-sm border border-emerald-800">
              <div className="flex items-start justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 mb-3">
                    <Sparkles size={12} />
                    <span>Permanent CRM Dialer &amp; Auto Call Logger</span>
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight mb-2">CallHippo Cloud Dialer Integration</h2>
                  <p className="text-emerald-100/80 text-sm max-w-2xl leading-relaxed">
                    CallHippo is now the <strong>official permanent dialer</strong> for Bridgewell CRM. 
                    Counselors can click to call any lead directly with CallHippo. When calls end, call durations, outcomes (Connected, No Answer, Busy), and audio recordings are automatically logged to the student timeline.
                  </p>
                </div>
                <div className="hidden sm:block">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center">
                    <PhoneCall size={28} className="text-emerald-300" />
                  </div>
                </div>
              </div>
            </div>

            {/* CallHippo Outbound Lines Configuration Card */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">CallHippo Outbound Lines &amp; Caller ID (UK vs USA)</h3>
                  <p className="text-gray-500 text-xs">Configure your UK (+44) and USA (+1) virtual numbers assigned to your counselor account in CallHippo.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    Active Calling Line
                  </label>
                  <select
                    value={lineConfig.activeLine}
                    onChange={(e) => updateLineConfig({ activeLine: e.target.value as any })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200 cursor-pointer"
                  >
                    <option value="uk">🇬🇧 UK Line (+44)</option>
                    <option value="usa">🇺🇸 USA Line (+1)</option>
                    <option value="auto">⚡ Smart Auto (Matches lead's country)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    🇬🇧 My UK Virtual Number
                  </label>
                  <input
                    type="text"
                    value={lineConfig.ukNumber}
                    onChange={(e) => updateLineConfig({ ukNumber: e.target.value })}
                    placeholder="+44..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Leave empty to use CallHippo default UK line</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    🇺🇸 My USA Virtual Number
                  </label>
                  <input
                    type="text"
                    value={lineConfig.usaNumber}
                    onChange={(e) => updateLineConfig({ usaNumber: e.target.value })}
                    placeholder="+1..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Leave empty to use CallHippo default USA line</p>
                </div>
              </div>
            </section>

            {/* Webhook Configuration Card */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">CallHippo Webhook Endpoint</h3>
              <p className="text-gray-500 text-xs mb-4">
                Copy this URL and paste it into your CallHippo Dashboard under <strong>Integrations &gt; Webhook</strong>.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Webhook URL (Events: Call Completed / Call Ended / Call Recording)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${origin}/api/webhooks/callhippo`}
                      className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-800 outline-none"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${origin}/api/webhooks/callhippo`)
                        setCopiedCallHippoUrl(true)
                        setTimeout(() => setCopiedCallHippoUrl(false), 2000)
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-black text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer shrink-0"
                    >
                      {copiedCallHippoUrl ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      <span>{copiedCallHippoUrl ? 'Copied!' : 'Copy URL'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Test CallHippo Webhook Ingestion */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Test CallHippo Webhook Ingestion</h3>
                  <p className="text-gray-500 text-xs">Simulate a CallHippo call event to verify that duration, status, and recording link save to the database.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Student Phone Number</label>
                  <input
                    type="text"
                    value={callhippoPhone}
                    onChange={(e) => setCallhippoPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Call Outcome</label>
                  <select
                    value={callhippoOutcome}
                    onChange={(e) => setCallhippoOutcome(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-800 outline-none cursor-pointer focus:ring-2 focus:ring-emerald-200"
                  >
                    <option value="Connected">🟢 Connected (Answered)</option>
                    <option value="No Answer">🔔 No Answer (Ringing / Missed)</option>
                    <option value="Busy">🔴 Busy / Rejected</option>
                    <option value="Callback">📞 Callback Requested</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">Duration (Seconds)</label>
                  <input
                    type="number"
                    value={callhippoDuration}
                    onChange={(e) => setCallhippoDuration(e.target.value)}
                    placeholder="145"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Recording URL (Optional)</label>
                <input
                  type="text"
                  value={callhippoRecordingUrl}
                  onChange={(e) => setCallhippoRecordingUrl(e.target.value)}
                  placeholder="https://callhippo-recordings.s3.amazonaws.com/recording.mp3"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 font-mono outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleTestCallHippoWebhook}
                  disabled={isTestingCallHippo || !callhippoPhone}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <PhoneCall size={14} />
                  <span>{isTestingCallHippo ? 'Simulating CallHippo Event...' : 'Simulate CallHippo Call Ingestion'}</span>
                </button>
              </div>

              {callhippoTestResult && (
                <div className={`mt-4 p-4 rounded-xl text-xs border ${
                  callhippoTestResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}>
                  <div className="flex items-center gap-2 font-bold mb-1">
                    {callhippoTestResult.success ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-rose-600" />}
                    <span>{callhippoTestResult.message || (callhippoTestResult.success ? 'CallHippo call successfully processed!' : 'Webhook processing error')}</span>
                  </div>
                  {callhippoTestResult.lead_name && (
                    <p className="text-[11px] text-gray-600 mt-1">
                      Matched Lead: <strong>{callhippoTestResult.lead_name}</strong> | Outcome: <strong>{callhippoTestResult.outcome}</strong> | Duration: <strong>{callhippoTestResult.duration}</strong>
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* Test CallHippo Click-to-Dial */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Test CallHippo Click-to-Dial</h3>
              <p className="text-gray-500 text-xs mb-4">
                Click below to verify that your browser opens the official CallHippo web dialer popup and triggers the Chrome extension.
              </p>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="flex-1">
                  <input
                    type="text"
                    value={callhippoPhone}
                    onChange={(e) => setCallhippoPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-gray-800 outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-500 font-mono">
                    <span className="font-semibold text-emerald-700">Dialer URL:</span>
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded font-bold text-gray-800 truncate max-w-md">
                      {getCallHippoDialerUrl(callhippoPhone)}
                    </span>
                  </div>
                </div>

                <div className="self-end">
                  <button
                    type="button"
                    onClick={() => {
                      openCallHippoDialer(callhippoPhone)
                      setCallhippoTestedDial(true)
                      setTimeout(() => setCallhippoTestedDial(false), 5000)
                    }}
                    className="w-full sm:w-auto px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <PhoneCall size={14} />
                    <span>Launch CallHippo Dialer</span>
                  </button>
                </div>
              </div>

              {callhippoTestedDial && (
                <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900 animate-in fade-in duration-200">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">CallHippo Dialer Triggered!</p>
                    <p className="text-emerald-800 mt-0.5">
                      CallHippo web dialer opened with <strong>{callhippoPhone}</strong>.
                    </p>
                  </div>
                </div>
              )}
            </section>

            {/* Step-by-Step Setup Instructions for CallHippo */}
            <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-semibold text-gray-900 mb-1">CallHippo 3-Step Setup Instructions</h3>
              <p className="text-gray-500 text-xs mb-4">How to connect CallHippo with Bridgewell CRM in 3 minutes:</p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                      <span>Add Webhook in CallHippo Dashboard</span>
                      <a href="https://app.callhippo.com" target="_blank" rel="noreferrer" className="text-emerald-600 inline-flex items-center gap-0.5 hover:underline font-semibold">
                        <span>app.callhippo.com</span>
                        <ExternalLink size={11} />
                      </a>
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Log into CallHippo &rarr; Go to <strong>Integrations</strong> &rarr; click <strong>Webhook</strong> &rarr; click <strong>Add Webhook</strong>.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Paste the Webhook URL and Select Events</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Paste the URL <code>{origin}/api/webhooks/callhippo</code> and enable <strong>Call Completed</strong>, <strong>Call Ended</strong>, and <strong>Call Recording</strong> events.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-gray-50 border border-gray-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</span>
                  <div>
                    <p className="text-xs font-bold text-gray-900">Install CallHippo Chrome Extension on Counselor Laptops</p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      Have counselors install the official <strong>CallHippo Click to Call</strong> extension from Chrome Web Store. Whenever they click on any phone number in the CRM, CallHippo will instantly dial!
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0">✓</span>
                  <div>
                    <p className="text-xs font-bold text-emerald-950">Seamless Automation Active!</p>
                    <p className="text-xs text-emerald-800 mt-0.5">
                      Every call dialed via CallHippo will now automatically log its duration, status, and recording link directly into the student&apos;s activity timeline!
                    </p>
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

        {/* Tab 6: Direct Email & SMTP Dispatch Service */}
        {activeTab === 'email' && (
          <div className="space-y-6">
            {/* Status Hero Card */}
            <div className={`p-6 rounded-2xl border transition-all ${
              isSmtpConfigured
                ? 'bg-gradient-to-br from-emerald-50/60 to-white border-emerald-200'
                : 'bg-gradient-to-br from-rose-50/60 to-white border-rose-200'
            }`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    isSmtpConfigured ? 'bg-emerald-600 text-white shadow-md shadow-emerald-200' : 'bg-rose-600 text-white shadow-md shadow-rose-200'
                  }`}>
                    <Mail size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-gray-900">Direct CRM Email Dispatching</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        isSmtpConfigured 
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}>
                        {isSmtpConfigured ? '🟢 Active & Ready' : '🟡 Using Web Gmail Fallback'}
                      </span>
                      {smtpSource && (
                        <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          Source: {smtpSource}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 max-w-xl leading-relaxed">
                      Send student admission emails, offer letters, and follow-ups <strong>directly from the CRM</strong> with 1-click. 
                      No desktop Outlook/Mail app required. Sent emails are automatically logged to the student's activity timeline.
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => fetchSmtpConfig()}
                    disabled={loadingSmtp}
                    className="px-3 py-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all"
                  >
                    <RefreshCw size={12} className={loadingSmtp ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Provider Quick Presets */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                <Sparkles size={14} className="text-amber-500" />
                Quick Provider Setup
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => applyPreset('gmail')}
                  className={`p-3.5 rounded-xl border text-left transition-all hover:border-blue-500 hover:bg-blue-50/30 ${
                    smtpConfig.host === 'smtp.gmail.com' ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-100' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-gray-900">Google Workspace / Gmail</span>
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">Recommended</span>
                  </div>
                  <p className="text-[11px] text-gray-500">smtp.gmail.com (Port 465 SSL)</p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('m365')}
                  className={`p-3.5 rounded-xl border text-left transition-all hover:border-sky-500 hover:bg-sky-50/30 ${
                    smtpConfig.host === 'smtp.office365.com' ? 'border-sky-500 bg-sky-50/50 ring-2 ring-sky-100' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-gray-900">Microsoft 365 / Outlook</span>
                  </div>
                  <p className="text-[11px] text-gray-500">smtp.office365.com (Port 587 STARTTLS)</p>
                </button>

                <button
                  type="button"
                  onClick={() => applyPreset('custom')}
                  className={`p-3.5 rounded-xl border text-left transition-all hover:border-gray-400 hover:bg-gray-50 ${
                    smtpConfig.host !== 'smtp.gmail.com' && smtpConfig.host !== 'smtp.office365.com' ? 'border-black bg-gray-50 ring-2 ring-gray-100' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-gray-900">Custom SMTP Server</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Zoho, Sendgrid, Amazon SES, or Private Host</p>
                </button>
              </div>
            </div>

            {/* SMTP Settings Form */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-xs space-y-5">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Server size={16} className="text-rose-600" />
                SMTP Server Credentials
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={smtpConfig.host}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, host: e.target.value }))}
                    placeholder="smtp.gmail.com"
                    className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Port</label>
                  <input
                    type="number"
                    value={smtpConfig.port}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 465 }))}
                    placeholder="465"
                    className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Sender Email / Username</label>
                  <input
                    type="email"
                    value={smtpConfig.user}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, user: e.target.value }))}
                    placeholder="admissions@bridgewell.edu"
                    className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">The email account used to authenticate with the SMTP server.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    App Password / SMTP Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={smtpConfig.pass}
                      onChange={(e) => setSmtpConfig(prev => ({ ...prev, pass: e.target.value }))}
                      placeholder={isSmtpConfigured ? '•••••••••••••••• (Leave blank to keep existing)' : 'Enter 16-character App Password'}
                      className="w-full text-xs px-3 py-2 pr-10 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">For Gmail, use a 16-character <strong>App Password</strong> (see guide below).</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">From Display Name</label>
                  <input
                    type="text"
                    value={smtpConfig.fromName}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, fromName: e.target.value }))}
                    placeholder="Bridgewell Academic Admissions"
                    className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">From Email (Optional if different)</label>
                  <input
                    type="email"
                    value={smtpConfig.fromEmail}
                    onChange={(e) => setSmtpConfig(prev => ({ ...prev, fromEmail: e.target.value }))}
                    placeholder={smtpConfig.user || 'admissions@bridgewell.edu'}
                    className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="smtpSecure"
                  checked={smtpConfig.secure}
                  onChange={(e) => setSmtpConfig(prev => ({ ...prev, secure: e.target.checked }))}
                  className="rounded border-gray-300 text-black focus:ring-black h-4 w-4"
                />
                <label htmlFor="smtpSecure" className="text-xs font-medium text-gray-700 cursor-pointer">
                  Use SSL/TLS (Always enabled for Port 465; uncheck for Port 587 STARTTLS)
                </label>
              </div>

              {/* Status Message */}
              {smtpStatusMessage && (
                <div className={`p-3.5 rounded-xl text-xs font-medium border flex items-start gap-2 ${
                  smtpStatusMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}>
                  {smtpStatusMessage.type === 'success' ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <span className="leading-relaxed">{smtpStatusMessage.text}</span>
                </div>
              )}

              {/* Test & Save Actions */}
              <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 max-w-sm">
                  <input
                    type="email"
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder="Test recipient email (e.g. your email)"
                    className="text-xs px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveSmtp(true)}
                    disabled={testingSmtp || savingSmtp || !smtpConfig.user}
                    className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-xs font-semibold shrink-0 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send size={13} className={testingSmtp ? 'animate-pulse' : ''} />
                    {testingSmtp ? 'Sending...' : 'Send Test'}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveSmtp(false)}
                    disabled={savingSmtp || testingSmtp}
                    className="w-full sm:w-auto px-5 py-2 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Check size={14} />
                    {savingSmtp ? 'Verifying & Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick 60-Second Setup Guide for Google Workspace / Gmail */}
            <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/30 border border-amber-200 rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                  <Key size={16} />
                </div>
                <div className="flex-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 mb-1">
                    How to get a Gmail / Google Workspace App Password (60 Seconds)
                  </h4>
                  <p className="text-xs text-amber-800 leading-relaxed mb-3">
                    Google requires an <strong>App Password</strong> instead of your regular password to protect your Google account:
                  </p>
                  <ol className="text-xs text-amber-900 space-y-2 list-decimal list-inside bg-white/70 p-3.5 rounded-xl border border-amber-200/80">
                    <li>
                      Go to your Google Account at{' '}
                      <a
                        href="https://myaccount.google.com/security"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5"
                      >
                        myaccount.google.com/security <ExternalLink size={10} />
                      </a>{' '}
                      and ensure <strong>2-Step Verification</strong> is turned ON.
                    </li>
                    <li>
                      Search for <strong>"App passwords"</strong> in the top search bar (or visit{' '}
                      <a
                        href="https://myaccount.google.com/apppasswords"
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold underline text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5"
                      >
                        myaccount.google.com/apppasswords <ExternalLink size={10} />
                      </a>
                      ).
                    </li>
                    <li>
                      Type <strong>"Bridgewell CRM"</strong> as the app name and click <strong>Create</strong>.
                    </li>
                    <li>
                      Copy the generated <strong>16-character code</strong> (e.g., <code>abcd efgh ijkl mnop</code>) and paste it into the password box above!
                    </li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Counselor Experience Explainer */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 text-xs text-gray-600 flex items-start gap-3">
              <Sparkles size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-gray-900 mb-0.5">How Counselors Send Emails</p>
                <p className="leading-relaxed">
                  On any student profile, counselors can click <strong>"✉️ Email Student"</strong>. 
                  With this SMTP configured, clicking <strong>"🚀 Send Email from CRM"</strong> immediately sends the email in the background, logs the activity to the CRM, and shows a confirmation toast. 
                  Counselors also have a 1-click <strong>"🌐 Web Gmail"</strong> fallback button to open the draft in Gmail web if they prefer!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


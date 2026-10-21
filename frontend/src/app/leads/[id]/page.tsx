'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Phone, MessageCircle, ArrowLeft, Clock, History, FileText, CheckCircle, CheckCircle2, Check, UserPlus, PhoneOff, PhoneCall, PhoneForwarded, XCircle, Mail, X, ClipboardList, ArrowRight, Calendar, GraduationCap, Sparkles, Save, ChevronDown, ChevronUp, Edit3 } from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { notifyLeadAssigned, notifyHotLead, notifyLeadEnrolled } from '@/lib/notifications'
import { calculateAutoFollowUp, toLocalDatetimeString } from '@/lib/followupRules'
import { logAuditTrail } from '@/lib/auditLogger'
import { openJustCallDialer, getJustCallDialerUrl } from '@/lib/justcall'
import { formatCountryBadge } from '@/lib/countryHelper'

export default function LeadProfile() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const { user: currentUser } = useAuth()
  
  const [lead, setLead] = useState<any>(null)
  const [activities, setActivities] = useState<any[]>([])
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [rightTab, setRightTab] = useState<'timeline' | 'audit'>('timeline')
  const [counselors, setCounselors] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const [note, setNote] = useState('')
  const [savingDetails, setSavingDetails] = useState(false)
  const [detailsSavedSuccess, setDetailsSavedSuccess] = useState(false)
  const [isNotesOpen, setIsNotesOpen] = useState(true)
  const isEditingNoteRef = useRef(false)
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [followUpDate, setFollowUpDate] = useState('')
  const [savingFollowUp, setSavingFollowUp] = useState(false)
  const [followUpSavedSuccess, setFollowUpSavedSuccess] = useState(false)
  const isEditingFollowUpRef = useRef(false)
  const [savingAction, setSavingAction] = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null)

  useEffect(() => {
    if (!id) return
    fetchLeadAndActivities()
    fetchTemplates()
    fetchStages()
    if (currentUser?.role === 'manager') fetchCounselors()

    // Realtime listener for live timeline, stage, and counselor updates
    const channel = supabase
      .channel(`lead-detail-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `id=eq.${id}` }, () => {
        fetchLeadAndActivities()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activities', filter: `lead=eq.${id}` }, () => {
        fetchLeadAndActivities()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `lead_id=eq.${id}` }, () => {
        fetchLeadAndActivities()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs', filter: `lead_id=eq.${id}` }, () => {
        fetchLeadAndActivities()
      })
      .subscribe()

    const interval = setInterval(fetchLeadAndActivities, 15000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [id, currentUser])

  async function fetchStages() {
    const { data } = await supabase.from('stages').select('name').order('stage_order', { ascending: true })
    if (data) setStages(data.map(s => s.name))
  }

  async function fetchTemplates() {
    const { data } = await supabase.from('email_templates').select('*')
    setTemplates(data || [])
  }

  async function fetchCounselors() {
    const { data } = await supabase.from('users').select('*').eq('role', 'counselor')
    setCounselors(data || [])
  }

  async function fetchLeadAndActivities() {
    const { data: leadData } = await supabase.from('leads').select('*, owner:owner_id(name)').eq('id', id).single()
    const { data: actsData } = await supabase.from('activities').select('*').eq('lead', id).order('time', { ascending: false })
    const { data: auditData } = await supabase.from('audit_logs').select('*').eq('lead_id', id).order('created_at', { ascending: false })

    const { data: allUsers } = await supabase.from('users').select('id, name, role')
    const uMap: Record<string, any> = {}
    allUsers?.forEach(u => { uMap[u.id] = u })

    const enrichedAudit = (auditData || []).map(a => ({
      ...a,
      user_name: a.user_id && uMap[a.user_id] ? uMap[a.user_id].name : 'System Automated',
      user_role: a.user_id && uMap[a.user_id] ? uMap[a.user_id].role : 'system'
    }))

    // Access Control: Counselors can only view their own assigned leads or unassigned leads
    if (currentUser?.role === 'counselor' && leadData?.owner_id && leadData.owner_id !== currentUser.id) {
      console.warn('[Security] Unauthorized lead access attempt blocked for counselor:', currentUser.id)
      setLead(null)
      setLoading(false)
      return
    }

    setLead(leadData)
    setActivities(actsData || [])
    setAuditLogs(enrichedAudit)
    
    // Only set follow-up date if user is not actively editing in input
    if (!isEditingFollowUpRef.current) {
      if (leadData?.next_follow_up) {
        setFollowUpDate(toLocalDatetimeString(leadData.next_follow_up))
      } else {
        setFollowUpDate('')
      }
    }
    
        // Load permanently saved student details into note if not actively editing
    if (!isEditingNoteRef.current) {
      if (leadData?.metadata?.student_profile) {
        setNote(leadData.metadata.student_profile)
      } else if (leadData?.notes) {
        setNote(leadData.notes)
      }
    }
    
    setLoading(false)
  }

  const handleSaveFollowUp = async (customDate?: string) => {
    const targetDate = customDate !== undefined ? customDate : followUpDate
    if (!targetDate) return

    setSavingFollowUp(true)
    try {
      const isoString = new Date(targetDate).toISOString()
      
      const { error } = await supabase
        .from('leads')
        .update({ next_follow_up: isoString })
        .eq('id', id)
        
      if (error) throw error

      const formattedDate = new Date(isoString).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
      
      await supabase.from('activities').insert([
        {
          lead: id,
          user_id: currentUser?.id || lead?.owner_id,
          type: 'followup_scheduled',
          text: `Follow-up scheduled for ${formattedDate}`,
          time: new Date().toISOString()
        }
      ])

      await logAuditTrail({
        leadId: id,
        userId: currentUser?.id,
        action: 'UPDATE',
        fieldName: 'next_follow_up',
        oldValue: lead?.next_follow_up || 'None',
        newValue: isoString,
        summary: `Next follow-up set to ${formattedDate}`
      })

      isEditingFollowUpRef.current = false
      setLead((prev: any) => ({ ...prev, next_follow_up: isoString }))
      setFollowUpDate(toLocalDatetimeString(isoString))
      setFollowUpSavedSuccess(true)
      setTimeout(() => setFollowUpSavedSuccess(false), 3000)
      fetchLeadAndActivities()
    } catch (err: any) {
      console.error('Error saving follow-up:', err)
      alert('Failed to save follow-up date: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingFollowUp(false)
    }
  }

  const handleClearFollowUp = async () => {
    setSavingFollowUp(true)
    try {
      const oldFollowUp = lead?.next_follow_up
      const { error } = await supabase.from('leads').update({ next_follow_up: null }).eq('id', id)
      if (error) throw error
      
      if (oldFollowUp) {
        await supabase.from('activities').insert([
          {
            lead: id,
            user_id: currentUser?.id || lead?.owner_id,
            type: 'followup_cleared',
            text: `Follow-up date cleared`,
            time: new Date().toISOString()
          }
        ])

        await logAuditTrail({
          leadId: id,
          userId: currentUser?.id,
          action: 'UPDATE',
          fieldName: 'next_follow_up',
          oldValue: oldFollowUp,
          newValue: 'None',
          summary: `Follow-up date cleared`
        })
      }

      isEditingFollowUpRef.current = false
      setLead((prev: any) => ({ ...prev, next_follow_up: null }))
      setFollowUpDate('')
      setFollowUpSavedSuccess(false)
      fetchLeadAndActivities()
    } catch (err: any) {
      console.error('Error clearing follow-up:', err)
      alert('Failed to clear follow-up: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingFollowUp(false)
    }
  }

  const handleOpenNotes = (textToLoad?: string) => {
    setIsNotesOpen(true)
    if (textToLoad) {
      setNote(textToLoad)
      isEditingNoteRef.current = true
    }
    setTimeout(() => {
      notesTextareaRef.current?.focus()
      notesTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 100)
  }

  const handleSaveStudentDetails = async () => {
    if (!note.trim()) return
    setSavingDetails(true)

    try {
      // 1. Parse structured key-value lines from the note
      const parsed: Record<string, string> = {}
      const lines = note.split('\n')
      for (const line of lines) {
        const colonIdx = line.indexOf(':')
        if (colonIdx > -1) {
          const key = line.slice(0, colonIdx).trim()
          const val = line.slice(colonIdx + 1).trim()
          if (key && val) {
            parsed[key] = val
          }
        }
      }

      // 2. Prepare merged metadata
      const currentMetadata = (lead?.metadata && typeof lead.metadata === 'object') ? lead.metadata : {}
      const updatedMetadata: Record<string, any> = {
        ...currentMetadata,
        student_profile: note,
      }

      if (parsed['Address']) updatedMetadata.address = parsed['Address']
      if (parsed['Qualification']) updatedMetadata.qualification = parsed['Qualification']
      if (parsed['GPA']) updatedMetadata.gpa = parsed['GPA']
      if (parsed['Preferred Country']) updatedMetadata.preferred_country = parsed['Preferred Country']
      if (parsed['Intake']) updatedMetadata.intake = parsed['Intake']
      if (parsed['Budget']) updatedMetadata.budget = parsed['Budget']
      if (parsed['Sponsor']) updatedMetadata.sponsor = parsed['Sponsor']

      // 3. Build lead update payload
      const updatePayload: any = {
        metadata: updatedMetadata,
      }

      if (parsed['Name']) updatePayload.name = parsed['Name']
      if (parsed['Email']) updatePayload.email = parsed['Email']
      if (parsed['Country']) updatePayload.country = parsed['Country']
      if (parsed['Course']) updatePayload.course = parsed['Course']
      if (parsed['Qualification']) updatePayload.highest_qualification = parsed['Qualification']
      if (parsed['Budget']) updatePayload.budget_range = parsed['Budget']

      // 4. Save to Supabase
      const { error } = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', id)

      if (error) throw error

      // 5. Insert activity record on timeline
      await supabase.from('activities').insert([
        {
          lead: id,
          user_id: currentUser?.id || lead?.owner_id,
          type: 'note',
          text: `Student details saved permanently:\n\n${note}`,
          time: new Date().toISOString()
        }
      ])

      // 6. Log audit trail
      await logAuditTrail({
        leadId: id,
        userId: currentUser?.id,
        action: 'UPDATE',
        fieldName: 'student_profile',
        oldValue: lead?.metadata?.student_profile || 'None',
        newValue: note,
        summary: `Student details saved permanently`
      })

      // 7. Update local state
      isEditingNoteRef.current = false
      setLead((prev: any) => ({
        ...prev,
        ...updatePayload,
        metadata: updatedMetadata
      }))

      setDetailsSavedSuccess(true)
      setTimeout(() => {
        setDetailsSavedSuccess(false)
        setIsNotesOpen(false)
      }, 1600)
      fetchLeadAndActivities()
    } catch (err: any) {
      console.error('Error saving student details:', err)
      alert('Failed to save student details: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingDetails(false)
    }
  }

  const handleInsertTemplate = () => {
    const template = [
      `Name: ${lead?.name || ''}`,
      `Phone / WhatsApp: ${lead?.phone || ''}`,
      `Email: ${lead?.email || ''}`,
      `Address: `,
      `Country: ${lead?.country || ''}`,
      `Qualification: `,
      `GPA: `,
      `Course: ${lead?.course || ''}`,
      `Preferred Country: `,
      `Intake: `,
      `Budget: `,
      `Sponsor: `
    ].join('\n')

    if (!note.trim()) {
      setNote(template)
    } else if (!note.includes('Name:') && !note.includes('Qualification:')) {
      setNote(note.trim() + '\n\n' + template)
    } else {
      if (confirm('Replace current note with a fresh Student Profile template?')) {
        setNote(template)
      }
    }
  }

  const logActivity = async (type: string, text: string) => {
    if (!text.trim() && type !== 'stage change' && type !== 'assignment') return
    setSavingAction(true)
    
    await supabase.from('activities').insert([
      { lead: id, user_id: currentUser?.id || lead?.owner_id, type, text, time: new Date().toISOString() }
    ])
    
    // Only update follow-up date if user explicitly entered or changed one
    if (followUpDate) {
      await supabase.from('leads').update({
        next_follow_up: new Date(followUpDate).toISOString()
      }).eq('id', id)
    }
    
    setNote('')
    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const logCallOutcome = async (outcome: string) => {
    setSavingAction(true)
    const isUnanswered = ['No Answer', 'Busy'].includes(outcome)
    const newAttempts = isUnanswered ? (lead.attempts || 0) + 1 : lead.attempts

    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id, 
        type: 'call', 
        outcome: outcome,
        text: note 
          ? `Call logged (${outcome}).\n\n--- Call Notes ---\n${note}`
          : `Call logged. Outcome: ${outcome}.`, 
        time: new Date().toISOString() 
      }
    ])

    // Only set next_follow_up if the counselor MANUALLY selected one in the input; never auto-calculate
    const nextFollowUpIso = followUpDate ? new Date(followUpDate).toISOString() : (lead?.next_follow_up || null)

    await supabase.from('leads').update({ 
      attempts: newAttempts,
      last_call_outcome: outcome,
      next_follow_up: nextFollowUpIso,
    }).eq('id', id)

    setLead((prev: any) => ({ ...prev, attempts: newAttempts, last_call_outcome: outcome, next_follow_up: nextFollowUpIso }))

    if (isUnanswered && newAttempts >= 6) {
      if (confirm(`This lead has been unresponsive ${newAttempts} times. The system suggests marking them as 'Not Reachable'. Would you like to update the stage now?`)) {
        await supabase.from('leads').update({ stage: 'Not reachable' }).eq('id', id)
        await supabase.from('activities').insert([
          { 
            lead: id, 
            user_id: currentUser?.id || lead?.owner_id,
            type: 'stage change', 
            text: `Changed stage to Not reachable. Note: Auto-suggested after ${newAttempts} failed attempts.`, 
            time: new Date().toISOString() 
          }
        ])
      }
    }

    setNote('')
    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const changeStage = async (newStage: string) => {
    if (newStage === lead.stage) return
    const reason = prompt(`Reason for moving to ${newStage}? (Short note required)`)
    if (reason === null) return 
    
    setSavingAction(true)
    
    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: 'stage change', 
        text: `Changed stage to ${newStage}. Note: ${reason}`, 
        time: new Date().toISOString() 
      }
    ])

    await logAuditTrail({
      leadId: id,
      userId: currentUser?.id,
      action: 'STAGE_CHANGE',
      fieldName: 'stage',
      oldValue: lead.stage,
      newValue: newStage,
      summary: `Stage changed from "${lead.stage}" to "${newStage}". Reason: ${reason}`
    })
    
    const updatePayload: any = { stage: newStage }
    if (newStage === 'Enrolled') {
      updatePayload.next_follow_up = null
    }
    await supabase.from('leads').update(updatePayload).eq('id', id)
    
    // Auto-notify enrollment
    if (newStage === 'Enrolled') {
      setFollowUpDate('')
      notifyLeadEnrolled({
        recipientIds: [],
        leadId: id,
        leadName: lead.name,
        counselorName: currentUser?.name || 'Counselor',
      }).catch(console.error)
    }

    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const assignLead = async (counselorId: string, counselorName: string) => {
    if (counselorId === lead.owner_id) return
    const reason = prompt(`Reason for assigning to ${counselorName}? (Optional)`)
    if (reason === null) return 
    
    setSavingAction(true)
    
    await supabase.from('assignments').insert([
      { lead_id: id, from_user: lead.owner_id, to_user: counselorId, assigned_by: currentUser.id, reason, time: new Date().toISOString() }
    ])

    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: 'assignment', 
        text: `Assigned to ${counselorName}. ${reason ? `Reason: ${reason}` : ''}`, 
        time: new Date().toISOString() 
      }
    ])

    await logAuditTrail({
      leadId: id,
      userId: currentUser?.id,
      action: 'REASSIGNMENT',
      fieldName: 'owner_id',
      oldValue: lead?.owner?.name || 'Unassigned',
      newValue: counselorName,
      summary: `Assigned to ${counselorName}. ${reason ? `Reason: ${reason}` : ''}`
    })
    
    await supabase.from('leads').update({ owner_id: counselorId }).eq('id', id)
    
    // Auto-notify assigned counselor
    notifyLeadAssigned({
      recipientId: counselorId,
      leadId: id,
      leadName: lead.name,
      senderName: currentUser?.name || 'Manager',
    }).catch(console.error)

    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const changePriority = async (newPriority: string) => {
    const val = newPriority || null
    setSavingAction(true)
    await supabase.from('leads').update({ priority: val }).eq('id', id)
    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: 'priority change', 
        text: `Priority updated to ${val ? (val === 'Hot' ? '🔥 Hot' : val === 'Warm' ? '☀️ Warm' : '❄️ Cold') : '⚪ Unset'}`, 
        time: new Date().toISOString() 
      }
    ])

    await logAuditTrail({
      leadId: id,
      userId: currentUser?.id,
      action: 'PRIORITY_CHANGE',
      fieldName: 'priority',
      oldValue: lead.priority || 'Unset',
      newValue: val || 'Unset',
      summary: `Priority changed from "${lead.priority || 'Unset'}" to "${val || 'Unset'}"`
    })

    setLead((prev: any) => ({ ...prev, priority: val }))

    // Auto-notify hot lead
    if (val === 'Hot' && lead.owner_id) {
      notifyHotLead({
        recipientId: lead.owner_id,
        leadId: id,
        leadName: lead.name,
      }).catch(console.error)
    }

    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const handleSendEmail = async () => {
    if (!selectedTemplate || !lead.email) return
    const subject = selectedTemplate.subject
    const body = selectedTemplate.body.replace('[Name]', lead.name)
    
    window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    
    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: 'email', 
        text: `Sent email template: ${selectedTemplate.name}`, 
        time: new Date().toISOString() 
      }
    ])
    
    setShowEmailModal(false)
    setSelectedTemplate(null)
    fetchLeadAndActivities()
  }

  if (loading) return <div className="p-8 h-full flex items-center justify-center bg-[#FDFDFD]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>
  if (!lead) return <div className="p-8 text-gray-900 bg-[#FDFDFD]">Lead not found.</div>

  return (
    <div className="flex h-full bg-[#FDFDFD]">
      {/* Email Modal */}
      {showEmailModal && (
        <div className="absolute inset-0 z-50 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white border border-gray-200 rounded-2xl w-[500px] shadow-[0_8px_30px_rgb(0,0,0,0.08)] animate-in zoom-in-95 duration-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Mail size={16} /> Send Email</h3>
              <button onClick={() => setShowEmailModal(false)} className="text-gray-400 hover:text-gray-900 p-1 hover:bg-gray-100 rounded-md transition-colors"><X size={16}/></button>
            </div>
            {!lead.email ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                 This lead does not have an email address saved.
              </div>
            ) : (
              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase mb-2">Select Template</label>
                  <select 
                    onChange={e => setSelectedTemplate(templates.find(t => t.id === e.target.value))}
                    className="w-full bg-white border border-gray-200 rounded-lg text-gray-900 px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all"
                    defaultValue=""
                  >
                    <option value="" disabled>Choose a template...</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                {selectedTemplate && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2 text-sm shadow-sm">
                    <p><span className="text-gray-500 font-medium">To:</span> <span className="text-gray-900">{lead.email}</span></p>
                    <p><span className="text-gray-500 font-medium">Subject:</span> <span className="text-gray-900">{selectedTemplate.subject}</span></p>
                    <div className="pt-3 border-t border-gray-200 whitespace-pre-wrap text-gray-700 mt-2">
                      {selectedTemplate.body.replace('[Name]', lead.name)}
                    </div>
                  </div>
                )}
                <button 
                  onClick={handleSendEmail} 
                  disabled={!selectedTemplate}
                  className="w-full bg-black hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg transition-all disabled:opacity-50 text-sm shadow-sm"
                >
                  Open in Email Client
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Left Column - Details */}
      <div className="w-full md:w-[390px] lg:w-[410px] shrink-0 bg-[#FAFAFA] border-r border-gray-200 overflow-y-auto">
        <div className="p-6 border-b border-gray-200 sticky top-0 bg-[#FAFAFA]/95 backdrop-blur-md z-10 space-y-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => router.push('/leads')} 
              className="text-gray-500 hover:text-gray-900 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
            >
              <ArrowLeft size={14} /> Back to Leads
            </button>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Sync
            </span>
          </div>
          
          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight leading-tight">{lead.name}</h1>
              <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                {lead.last_call_outcome && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    lead.last_call_outcome === 'Connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    lead.last_call_outcome === 'No Answer' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                    lead.last_call_outcome === 'Busy' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                    'bg-gray-100 text-gray-700 border-gray-200'
                  }`}>
                    {lead.last_call_outcome === 'Connected' ? '📞 Connected' :
                     lead.last_call_outcome === 'No Answer' ? '📵 No Answer' :
                     lead.last_call_outcome === 'Busy' ? '⏳ Busy' : '↪️ ' + lead.last_call_outcome}
                  </span>
                )}
                {lead.priority && (
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
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
            </div>
            <p className="text-gray-400 text-xs flex items-center gap-1.5 font-normal mt-1.5 flex-wrap">
              <Clock size={12} /> Added {new Date(lead.created_at).toLocaleDateString()}
              {lead.country && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                  {formatCountryBadge(lead.country)} Ad
                </span>
              )}
              {lead.source ? `• via ${lead.source}` : ''}
            </p>
          </div>

          {/* Enrolled Status Celebration Banner */}
          {lead.stage === 'Enrolled' && (
            <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border border-emerald-300 rounded-2xl p-4 flex items-center justify-between text-emerald-950 shadow-xs animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider">🎓 Enrolled Student</span>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full">
                      Admission Finalized
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 mt-0.5">
                    This student is officially enrolled and separated from the active calling pipeline.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Clean Controls Card with Equal-Height Labels & Proper Spacing */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 leading-none">
                  Priority
                </label>
                <select 
                  value={lead.priority || ''} 
                  onChange={(e) => changePriority(e.target.value)}
                  className={`w-full text-xs font-semibold px-3 py-2.5 rounded-xl border outline-none cursor-pointer transition-all ${
                    lead.priority === 'Hot' 
                      ? 'border-rose-300 text-rose-700 bg-rose-50/70 focus:ring-2 focus:ring-rose-200' 
                      : lead.priority === 'Warm' 
                      ? 'border-amber-300 text-amber-800 bg-amber-50/70 focus:ring-2 focus:ring-amber-200' 
                      : lead.priority === 'Cold' 
                      ? 'border-blue-300 text-blue-700 bg-blue-50/70 focus:ring-2 focus:ring-blue-200' 
                      : 'border-gray-200 text-gray-800 bg-white hover:bg-gray-50'
                  }`}
                >
                  <option value="">⚪ Unset</option>
                  <option value="Hot">🔥 Hot</option>
                  <option value="Warm">☀️ Warm</option>
                  <option value="Cold">❄️ Cold</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 leading-none">
                  Stage
                </label>
                <select 
                  value={lead.stage} 
                  onChange={(e) => changeStage(e.target.value)}
                  className="w-full bg-white border border-gray-200 text-gray-800 text-xs font-semibold px-3 py-2.5 rounded-xl outline-none hover:bg-gray-50 transition-all cursor-pointer focus:ring-2 focus:ring-gray-100"
                >
                  {stages.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5 leading-none">
                Assigned Counselor
              </label>
              {currentUser?.role === 'manager' ? (
                <select 
                  value={lead.owner_id || ''} 
                  onChange={(e) => assignLead(e.target.value, e.target.options[e.target.selectedIndex].text)}
                  className="w-full bg-white border border-gray-200 text-gray-800 text-xs font-semibold px-3 py-2.5 rounded-xl outline-none hover:bg-gray-50 transition-all cursor-pointer focus:ring-2 focus:ring-gray-100"
                >
                  <option value="">Unassigned</option>
                  {counselors.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                </select>
              ) : (
                <div className="w-full bg-gray-50 border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-2.5 rounded-xl truncate flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0"></span>
                  <span className="truncate">{lead.owner?.name || 'Unassigned'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-1">
             <a 
               href={getJustCallDialerUrl(lead.phone)} 
               onClick={(e) => {
                 logActivity('call', 'Initiated phone call via JustCall')
                 openJustCallDialer(lead.phone, e)
               }} 
               className="flex justify-center items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
               title="Call via JustCall"
             >
                <Phone size={13} className="text-gray-500 shrink-0" />
                <span>Call</span>
             </a>

             <a 
               target="_blank" 
               rel="noreferrer" 
               href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=Hi%20${encodeURIComponent(lead.name)},`} 
               onClick={() => logActivity('WhatsApp', 'Opened WhatsApp chat')} 
               className="flex justify-center items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 hover:bg-emerald-100/70 text-emerald-700 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs"
             >
                <MessageCircle size={13} className="text-emerald-600 shrink-0" />
                <span>WhatsApp</span>
             </a>

             <button 
               onClick={() => setShowEmailModal(true)} 
               className="flex justify-center items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs"
             >
                <Mail size={13} className="text-gray-500 shrink-0" />
                <span>Email</span>
             </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <section className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
               <span>Contact Information</span>
             </h3>
             <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Phone</span>
                   <span className="text-gray-900 font-semibold">{lead.phone}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                   <span className="text-gray-400 font-medium">Email</span>
                   <span className="text-gray-900 font-semibold truncate max-w-[180px]">{lead.email || 'Not provided'}</span>
                </div>
             </div>
          </section>

          <section className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                 Background & Preferences
               </h3>
               {lead.attempts > 0 && (
                 <span className="bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full text-[10px] font-bold border border-rose-100">
                   {lead.attempts} Failed Attempts
                 </span>
               )}
             </div>
             <div className="space-y-3 text-xs">
                {lead.country && (
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                     <span className="text-gray-400 font-medium">Target Country</span>
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                       {lead.country === 'USA' ? '🇺🇸 USA' :
                        lead.country === 'UK' ? '🇬🇧 UK' :
                        lead.country === 'Canada' ? '🇨🇦 Canada' :
                        lead.country === 'Australia' ? '🇦🇺 Australia' :
                        lead.country === 'Germany' ? '🇩🇪 Germany' :
                        lead.country === 'Ireland' ? '🇮🇪 Ireland' :
                        lead.country === 'UAE' ? '🇦🇪 UAE' :
                        lead.country === 'India' ? '🇮🇳 India' :
                        `🌍 ${lead.country}`}
                     </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Programme</span>
                   <span className="text-gray-900 font-semibold">{lead.programme_level || 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Source / Campaign</span>
                   <span className="text-gray-900 font-semibold">{lead.source}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Qualification</span>
                   <span className="text-gray-900 font-semibold">{lead.highest_qualification || 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Work Experience</span>
                   <span className="text-gray-900 font-semibold">{lead.work_experience || 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                   <span className="text-gray-400 font-medium">Budget Range</span>
                   <span className="text-gray-900 font-semibold">{lead.budget_range || 'Not provided'}</span>
                </div>
             </div>
          </section>

          {lead.metadata && Object.keys(lead.metadata).length > 0 && (
          <section className="bg-white border border-gray-200/80 rounded-2xl p-5 shadow-xs">
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
               Additional Details (From CSV)
             </h3>
             <div className="space-y-2 text-xs">
                {Object.entries(lead.metadata).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-start py-1.5 border-b border-gray-100 last:border-0 gap-3">
                     <span className="text-gray-400 font-medium capitalize shrink-0">{String(key).replace(/_/g, ' ')}</span>
                     <span className="text-gray-900 font-semibold text-right break-words">{String(value)}</span>
                  </div>
                ))}
             </div>
          </section>
          )}
        </div>
      </div>

      {/* Right Column - Timeline */}
      <div className="flex-1 bg-white flex flex-col relative overflow-hidden">
        <div className="h-[73px] border-b border-gray-200 flex items-center px-8 bg-white shrink-0 justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setRightTab('timeline')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                rightTab === 'timeline'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              Activity Timeline ({activities.length})
            </button>
            <button
              onClick={() => setRightTab('audit')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                rightTab === 'audit'
                  ? 'bg-gray-900 text-white shadow-xs'
                  : 'bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              <ClipboardList size={13} />
              Change History ({auditLogs.length})
            </button>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 relative">
          {rightTab === 'timeline' ? (
            <>
              <div className="absolute left-11 top-8 bottom-8 w-px bg-gray-100" />
              <div className="space-y-6">
                {activities.map((act) => (
                  <div key={act.id || act.time} className="flex gap-4 relative">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1.5 relative z-10 shadow-sm
                      ${act.type === 'stage change' ? 'bg-emerald-50 border border-emerald-200 text-emerald-600' : 
                        act.type === 'assignment' ? 'bg-indigo-50 border border-indigo-200 text-indigo-600' :
                        act.type === 'email' ? 'bg-purple-50 border border-purple-200 text-purple-600' :
                        act.type === 'call' ? 'bg-amber-50 border border-amber-200 text-amber-600' :
                        'bg-blue-50 border border-blue-200 text-blue-600'}`}>
                      {act.type === 'stage change' ? <CheckCircle size={12} /> : 
                       act.type === 'assignment' ? <UserPlus size={12} /> :
                       act.type === 'email' ? <Mail size={12} /> :
                       act.type === 'call' ? <PhoneCall size={12} /> :
                       <FileText size={12} />}
                    </div>
                    <div 
                      onClick={() => {
                        if (act.type === 'note' || act.text?.includes('Student details saved')) {
                          const cleanText = act.text?.replace(/^Student details saved permanently:\s*/i, '') || lead?.metadata?.student_profile || ''
                          handleOpenNotes(cleanText)
                        }
                      }}
                      className={`bg-white border p-4 rounded-xl flex-1 shadow-sm transition-all ${
                        (act.type === 'note' || act.text?.includes('Student details saved'))
                          ? 'border-blue-200 hover:border-blue-400 hover:shadow-md cursor-pointer group/note bg-gradient-to-br from-white to-blue-50/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      title={(act.type === 'note' || act.text?.includes('Student details saved')) ? 'Click to open these saved notes in Call Notes' : undefined}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-gray-900 capitalize flex items-center gap-2">
                          <span>{act.type}</span>
                          {(act.type === 'note' || act.text?.includes('Student details saved')) && (
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                              Saved Note
                            </span>
                          )}
                        </p>
                        {(act.type === 'note' || act.text?.includes('Student details saved')) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              const cleanText = act.text?.replace(/^Student details saved permanently:\s*/i, '') || lead?.metadata?.student_profile || ''
                              handleOpenNotes(cleanText)
                            }}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-md transition-colors cursor-pointer border border-blue-200 shadow-2xs group-hover/note:bg-blue-600 group-hover/note:text-white group-hover/note:border-blue-600"
                            title="Click to open these saved notes in the editor"
                          >
                            <Edit3 size={11} />
                            <span>Open Notes</span>
                          </button>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap leading-relaxed">{act.text}</p>
                      <p className="text-xs text-gray-400 font-medium">{new Date(act.time).toLocaleString()}</p>
                    </div>
                  </div>
                ))}

                <div className="flex gap-4 relative">
                  <div className="w-6 h-6 rounded-full bg-gray-50 border border-gray-200 text-gray-400 flex items-center justify-center shrink-0 mt-1.5 relative z-10 shadow-sm">
                    <History size={12} />
                  </div>
                  <div className="bg-white border border-gray-200 p-4 rounded-xl flex-1 shadow-sm">
                    <p className="text-sm font-semibold text-gray-900 mb-1">Lead Created</p>
                    <p className="text-xs text-gray-400 font-medium">System • {new Date(lead.created_at).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {auditLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <ClipboardList size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-medium text-gray-700">No change history recorded yet</p>
                  <p className="text-xs text-gray-400 mt-1">Modifications to stage, priority, and counselor will appear here.</p>
                </div>
              ) : (
                auditLogs.map((log) => {
                  const hasDiff = log.old_value !== null && log.new_value !== null && (log.old_value || log.new_value)
                  return (
                    <div key={log.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{log.user_name || 'Staff'}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-medium capitalize">
                            {log.user_role || 'system'}
                          </span>
                        </div>
                        <span className="text-[11px] text-gray-400">
                          {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>

                      {hasDiff && (
                        <div className="flex items-center gap-2 py-1 text-xs">
                          <span className="line-through px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[11px]">
                            {log.old_value || 'None'}
                          </span>
                          <ArrowRight size={11} className="text-gray-400" />
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                            {log.new_value || 'None'}
                          </span>
                        </div>
                      )}

                      <p className="text-xs text-gray-700 bg-gray-50/70 rounded-lg p-2 border border-gray-100">
                        {log.summary}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Input box for notes and follow-up */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 shrink-0">
           {!isNotesOpen ? (
             <div className="bg-white border border-blue-200 rounded-xl p-3 mb-4 shadow-2xs flex items-center justify-between gap-3 flex-wrap animate-fade-in">
               <div 
                 onClick={() => handleOpenNotes()}
                 className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-[200px]"
                 title="Click to open and edit student details"
               >
                 <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                   <FileText size={16} />
                 </div>
                 <div>
                   <p className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                     <span>{lead?.metadata?.student_profile ? 'Student Details & Notes (Saved)' : 'Call Notes & Student Details'}</span>
                     {lead?.metadata?.student_profile && (
                       <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">
                         Saved
                       </span>
                     )}
                   </p>
                   <p className="text-[11px] text-gray-400 truncate max-w-md">
                     {note ? note.split('\n').filter(Boolean).slice(0, 2).join(' • ') : 'Click "Open Notes" to view or edit details'}
                   </p>
                 </div>
               </div>

               <div className="flex items-center gap-2">
                 <button
                   type="button"
                   onClick={() => handleOpenNotes()}
                   className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer transition-all active:scale-95"
                 >
                   <Edit3 size={12} />
                   <span>Open Notes</span>
                 </button>
               </div>
             </div>
           ) : (
             <div>
               {/* Quick template toolbar with Close button */}
               <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
                 <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                   <FileText size={13} className="text-gray-400" />
                   <span>Call Notes & Student Details</span>
                 </div>

                 <div className="flex items-center gap-2 flex-wrap">
                   {/* 1. Insert Template Button */}
                   <button
                     type="button"
                     onClick={handleInsertTemplate}
                     className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 hover:text-blue-900 border border-blue-200 transition-all cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                     title="Insert Student Profile Template (Qualification, GPA, Intake, Budget, Sponsor, etc.)"
                   >
                     <Sparkles size={13} className="text-blue-600" />
                     <span>+ Student Details Template</span>
                   </button>

                   {/* 2. Save Details Button */}
                   <button
                     type="button"
                     onClick={handleSaveStudentDetails}
                     disabled={savingDetails || !note.trim()}
                     className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-xs cursor-pointer active:scale-95 ${
                       note.trim()
                         ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 font-bold'
                         : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                     }`}
                     title="Save student details permanently to the lead profile"
                   >
                     <Save size={13} />
                     <span>{savingDetails ? 'Saving...' : 'Save Details'}</span>
                   </button>

                   {/* Success feedback */}
                   {detailsSavedSuccess && (
                     <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 animate-fade-in">
                       <CheckCircle2 size={13} className="text-emerald-600" />
                       <span>Saved Permanently!</span>
                     </span>
                   )}

                   {/* Clear button */}
                   {note && (
                     <button
                       type="button"
                       onClick={() => {
                         if (confirm('Clear note content?')) {
                           setNote('')
                           isEditingNoteRef.current = true
                         }
                       }}
                       className="text-xs text-gray-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                       title="Clear note text"
                     >
                       Clear
                     </button>
                   )}

                   {/* 3. Close / Minimize Button */}
                   <button
                     type="button"
                     onClick={() => setIsNotesOpen(false)}
                     className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-all cursor-pointer shadow-2xs active:scale-95"
                     title="Close / Minimize Notes box"
                   >
                     <ChevronUp size={13} />
                     <span>Close</span>
                   </button>
                 </div>
               </div>

               <textarea 
                 ref={notesTextareaRef}
                 value={note}
                 onFocus={() => { isEditingNoteRef.current = true }}
                 onChange={e => {
                   isEditingNoteRef.current = true
                   setNote(e.target.value)
                 }}
                 placeholder="Click '+ Student Details Template' above or type notes about the call..." 
                 className={`w-full bg-white border border-gray-200 rounded-xl text-gray-900 px-4 py-3 text-sm focus:outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-400 transition-all shadow-sm leading-relaxed mb-4 ${
                   note.includes('Name:') ? 'min-h-[250px] font-mono text-xs resize-y' : 'min-h-[75px] resize-y'
                 }`}
               />
             </div>
           )}
           
           <div className="flex items-center gap-3 mb-4 pb-4 border-b border-gray-200 flex-wrap">
              <label className="text-sm font-semibold text-gray-700 whitespace-nowrap flex items-center gap-1.5">
                <Calendar size={15} className="text-gray-500" />
                <span>Next Follow-up:</span>
              </label>
              
              <input 
                type="datetime-local" 
                value={followUpDate}
                onFocus={() => { isEditingFollowUpRef.current = true }}
                onChange={e => {
                  isEditingFollowUpRef.current = true
                  setFollowUpDate(e.target.value)
                }}
                className="bg-white border border-gray-300 rounded-lg text-gray-900 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 shadow-2xs font-medium"
              />

              {/* Direct Save Follow-up button */}
              <button
                type="button"
                onClick={() => handleSaveFollowUp()}
                disabled={savingFollowUp || !followUpDate}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ${
                  followUpDate
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                }`}
                title="Save selected follow-up date and time"
              >
                <Check size={13} />
                <span>{savingFollowUp ? 'Saving...' : 'Save Follow-up'}</span>
              </button>

              {/* Clear button when date is selected or lead has follow-up */}
              {(lead?.next_follow_up || followUpDate) && (
                <button
                  type="button"
                  onClick={handleClearFollowUp}
                  disabled={savingFollowUp}
                  className="text-xs text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1.5 rounded-lg transition-colors font-semibold flex items-center gap-1 cursor-pointer shadow-2xs"
                  title="Remove follow-up date"
                >
                  <X size={12} />
                  <span>Clear</span>
                </button>
              )}

              {/* Success Badge */}
              {followUpSavedSuccess && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 size={13} className="text-emerald-600" />
                  <span>Saved!</span>
                </span>
              )}

              {/* Scheduled info badge */}
              {lead?.next_follow_up && !followUpSavedSuccess && (
                <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg font-medium flex items-center gap-1">
                  <span>Scheduled: {new Date(lead.next_follow_up).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                  })}</span>
                </span>
              )}
           </div>

           <div className="flex justify-between items-end">
              <div className="flex flex-col gap-2 w-full">
                 <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">Log Call Outcome</div>
                 <div className="flex gap-2 flex-wrap">
                    <button 
                      onClick={() => logCallOutcome('Connected')} 
                      disabled={savingAction} 
                      className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                        lead.last_call_outcome === 'Connected'
                          ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-200 shadow-md font-bold'
                          : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700'
                      }`}
                    >
                       <PhoneCall size={12} /> Connected
                    </button>
                    <button 
                      onClick={() => logCallOutcome('No Answer')} 
                      disabled={savingAction} 
                      className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                        lead.last_call_outcome === 'No Answer'
                          ? 'bg-red-600 text-white border-red-600 ring-2 ring-red-200 shadow-md font-bold'
                          : 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700'
                      }`}
                    >
                       <PhoneOff size={12} /> No Answer
                    </button>
                    <button 
                      onClick={() => logCallOutcome('Busy')} 
                      disabled={savingAction} 
                      className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                        lead.last_call_outcome === 'Busy'
                          ? 'bg-amber-600 text-white border-amber-600 ring-2 ring-amber-200 shadow-md font-bold'
                          : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700'
                      }`}
                    >
                       <XCircle size={12} /> Busy
                    </button>
                    <button 
                      onClick={() => logCallOutcome('Wrong Num')} 
                      disabled={savingAction} 
                      className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                        lead.last_call_outcome === 'Wrong Num' || lead.last_call_outcome === 'Wrong Number'
                          ? 'bg-gray-800 text-white border-gray-800 ring-2 ring-gray-200 shadow-md font-bold'
                          : 'bg-white hover:bg-gray-100 border-gray-200 text-gray-700'
                      }`}
                    >
                       <PhoneForwarded size={12} /> Wrong Num
                    </button>
                 </div>
              </div>

              <div className="pl-4 flex flex-col justify-end h-full">
                <button onClick={() => logActivity('note', note)} disabled={savingAction || !note.trim()} className="px-5 py-2.5 bg-black hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50 whitespace-nowrap shadow-sm">
                  {savingAction ? 'Saving...' : 'Save General Note'}
                </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}

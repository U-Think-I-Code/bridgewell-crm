'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Phone, MessageCircle, Trash2, Copy, ArrowLeft, Clock, History, FileText, CheckCircle, CheckCircle2, Check, UserPlus, PhoneOff, PhoneCall, PhoneForwarded, XCircle, Mail, X, ClipboardList, ArrowRight, Calendar, GraduationCap, Sparkles, Save, ChevronDown, ChevronUp, Edit3, AlertTriangle, Headphones, Send, AlertCircle, ExternalLink, Key, Lock, Settings2 } from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { notifyLeadAssigned, notifyHotLead, notifyLeadEnrolled } from '@/lib/notifications'
import { calculateAutoFollowUp, toLocalDatetimeString } from '@/lib/followupRules'
import { logAuditTrail } from '@/lib/auditLogger'
import { openCallHippoDialer, getCallHippoDialerUrl, CallHippoLine, resolveOutboundLine } from '@/lib/callhippo'
import { useCallHippoLine } from '@/lib/dialer'
import { formatCountryBadge, inferCountryFromPhone, resolveCountryName } from '@/lib/countryHelper'
import { getLeadServiceType } from '@/lib/leadTypeHelper'
import { canManageLeads, isCounselor, isTeamLeader, getAssignableCounselors, getAllowedOwnerIds } from '@/lib/teamHelper'

function getLeadCampaignDetails(lead: any): { key: string, label: string, value: string, type: 'yes' | 'no' | 'campus' | 'program' | 'text' }[] {
  if (!lead) return []
  const meta = (lead.metadata && typeof lead.metadata === 'object') ? lead.metadata : {}
  const answers: Record<string, any> = meta.campaign_answers || {}
  
  const results: { key: string, label: string, value: string, type: 'yes' | 'no' | 'campus' | 'program' | 'text' }[] = []
  const seenLabels = new Set<string>()

  const determineType = (v: string): 'yes' | 'no' | 'campus' | 'program' | 'text' => {
    const lower = v.toLowerCase()
    if (lower === 'yes') return 'yes'
    if (lower === 'no') return 'no'
    if (lower.includes('campus') || lower.includes('online') || lower.includes('both')) return 'campus'
    if (lower.includes('master') || lower.includes('doctorate') || lower.includes('bachelor')) return 'program'
    return 'text'
  }

  // 1. Process campaign_answers if available
  Object.entries(answers).forEach(([rawKey, val]) => {
    if (val === null || val === undefined || val === '') return
    const strVal = String(val).trim()
    const lowerKey = rawKey.toLowerCase()
    
    // Skip personal info that already has a primary card
    if (lowerKey === 'name' || lowerKey === 'full name' || lowerKey === 'email' || lowerKey === 'phone' || lowerKey === 'phone number' || lowerKey === 'contact') {
      return
    }

    results.push({
      key: rawKey,
      label: rawKey,
      value: strVal,
      type: determineType(strVal)
    })
    seenLabels.add(rawKey.toLowerCase())
  })

  // 2. Also check if campus_mode was set in metadata
  if (meta.campus_mode && !seenLabels.has('campus mode (online / offline)') && !seenLabels.has('online/offline')) {
    results.unshift({
      key: 'campus_mode',
      label: 'Campus Mode (Online / Offline)',
      value: String(meta.campus_mode),
      type: 'campus'
    })
    seenLabels.add('campus mode (online / offline)')
  }

  // 3. Fallback: check raw metadata keys if campaign_answers is empty
  if (results.length === 0 && Object.keys(meta).length > 0) {
    const internalKeys = new Set([
      'student_profile', 'last_call_duration', 'last_call_timestamp', 
      'imported_at', 'imported_file', 'address', 'qualification', 'gpa', 
      'preferred_country', 'intake', 'budget', 'sponsor', 'campaign_answers'
    ])
    
    Object.entries(meta).forEach(([k, v]) => {
      if (internalKeys.has(k) || typeof v === 'object' || v === null || v === undefined || v === '') return
      const cleanLabel = k.replace(/_/g, ' ').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      const strVal = String(v).trim()

      results.push({
        key: k,
        label: cleanLabel,
        value: strVal,
        type: determineType(strVal)
      })
    })
  }

  return results
}

function formatCallDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins === 0) return `${secs}s`
  if (secs === 0) return `${mins}m`
  return `${mins}m ${secs}s`
}

function extractCallDuration(text?: string): string {
  if (!text) return 'Logged'
  const match = text.match(/Duration:\s*([^\n(]+)/i)
  return match?.[1]?.trim() || 'Logged'
}

function extractRecordingUrl(text?: string): string | undefined {
  if (!text) return undefined
  const match = text.match(/Recording:\s*(https?:\/\/[^\s\n]+)/i)
  return match?.[1]?.trim()
}

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
  const [lineConfig] = useCallHippoLine()

  const [note, setNote] = useState('')
  const [activeCallTimer, setActiveCallTimer] = useState<number | null>(null)
  const callStartTimeRef = useRef<number | null>(null)
  const activeCallActIdRef = useRef<string | null>(null)
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
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [copiedEmailText, setCopiedEmailText] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSentSuccess, setEmailSentSuccess] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [counselorAppPass, setCounselorAppPass] = useState('')
  const [tempAppPass, setTempAppPass] = useState('')
  const [showPersonalSmtpConfig, setShowPersonalSmtpConfig] = useState(false)

  // Load counselor's personal App Password from local browser storage
  useEffect(() => {
    if (typeof window !== 'undefined' && currentUser?.id) {
      const stored = localStorage.getItem(`bridgewell_counselor_app_pass_${currentUser.id}`)
      if (stored) {
        setCounselorAppPass(stored)
        setTempAppPass(stored)
      }
    }
  }, [currentUser?.id])

  // Live timer tick for active call
  useEffect(() => {
    if (activeCallTimer === null) return
    const interval = setInterval(() => {
      if (callStartTimeRef.current) {
        setActiveCallTimer(Math.round((Date.now() - callStartTimeRef.current) / 1000))
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [activeCallTimer !== null])

  useEffect(() => {
    if (!id) return
    fetchLeadAndActivities()
    fetchTemplates()
    fetchStages()
    if (canManageLeads(currentUser)) fetchCounselors()

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
    const { data } = await supabase.from('users').select('id, name, email, role, languages, active').eq('active', true)
    const activeCounselors = (data || []).filter((u: any) => u.role === 'counselor')
    const assignable = getAssignableCounselors(currentUser, activeCounselors, true)
    setCounselors(assignable)
  }

  async function fetchLeadAndActivities() {
    const { data: leadData } = await supabase.from('leads').select('*, owner:owner_id(name)').eq('id', id).single()
    const { data: actsData } = await supabase.from('activities').select('*').eq('lead', id).order('time', { ascending: false })
    const { data: auditData } = await supabase.from('audit_logs').select('*').eq('lead_id', id).order('created_at', { ascending: false })

    const { data: allUsers } = await supabase.from('users').select('id, name, role, languages')
    const uMap: Record<string, any> = {}
    allUsers?.forEach(u => { uMap[u.id] = u })

    const enrichedAudit = (auditData || []).map(a => ({
      ...a,
      user_name: a.user_id && uMap[a.user_id] ? uMap[a.user_id].name : 'System Automated',
      user_role: a.user_id && uMap[a.user_id] ? uMap[a.user_id].role : 'system'
    }))

    // Access Control:
    // - Managers can view all leads (including unassigned).
    // - Team Leaders can ONLY view leads assigned to themselves or their team counselors. Cannot view unassigned leads.
    // - Counselors can only view their own assigned leads.
    if (isCounselor(currentUser) && (!leadData?.owner_id || leadData.owner_id !== currentUser.id)) {
      console.warn('[Security] Unauthorized lead access attempt blocked for counselor:', currentUser.id)
      setLead(null)
      setLoading(false)
      return
    }
    if (isTeamLeader(currentUser)) {
      if (!leadData?.owner_id) {
        console.warn('[Security] Unauthorized lead access: Team Leader cannot view unassigned leads:', currentUser.id)
        setLead(null)
        setLoading(false)
        return
      }
      const allowedOwners = getAllowedOwnerIds(currentUser, allUsers || [])
      if (allowedOwners && !allowedOwners.has(leadData.owner_id)) {
        console.warn('[Security] Unauthorized lead access attempt blocked for team leader outside team:', currentUser.id)
        setLead(null)
        setLoading(false)
        return
      }
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
      } else if (leadData?.metadata?.notes) {
        setNote(leadData.metadata.notes)
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
        notes: note,
      }

      if (parsed['Address']) updatedMetadata.address = parsed['Address']
      if (parsed['Qualification']) updatedMetadata.qualification = parsed['Qualification']
      if (parsed['GPA']) updatedMetadata.gpa = parsed['GPA']
      if (parsed['Work Experience']) updatedMetadata.work_experience = parsed['Work Experience']
      if (parsed['Preferred Country']) updatedMetadata.preferred_country = parsed['Preferred Country']
      if (parsed['Intake']) updatedMetadata.intake = parsed['Intake']
      if (parsed['Budget']) updatedMetadata.budget = parsed['Budget']
      if (parsed['Funds Sponsor']) {
        updatedMetadata.funds_sponsor = parsed['Funds Sponsor']
        updatedMetadata.sponsor = parsed['Funds Sponsor']
      } else if (parsed['Sponsor']) {
        updatedMetadata.funds_sponsor = parsed['Sponsor']
        updatedMetadata.sponsor = parsed['Sponsor']
      }
      if (parsed['Campus Mode']) updatedMetadata.campus_mode = parsed['Campus Mode']
      if (parsed['Admitted University']) updatedMetadata.admitted_university = parsed['Admitted University']
      if (parsed['I-20 Received']) updatedMetadata.i20_received = parsed['I-20 Received']
      if (parsed['SEVIS Fee Paid']) updatedMetadata.sevis_fee_paid = parsed['SEVIS Fee Paid']

      // 3. Build lead update payload (only columns existing on leads table)
      const updatePayload: any = {
        metadata: updatedMetadata,
      }

      if (parsed['Name']) updatePayload.name = parsed['Name']
      if (parsed['Email']) updatePayload.email = parsed['Email']
      if (parsed['Country']) updatePayload.country = parsed['Country']
      if (parsed['Course']) {
        updatePayload.course = parsed['Course']
        updatePayload.programme_level = parsed['Course']
      }
      if (parsed['Qualification']) updatePayload.highest_qualification = parsed['Qualification']
      if (parsed['Work Experience']) updatePayload.work_experience = parsed['Work Experience']
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
      }, 3000)
      fetchLeadAndActivities()
    } catch (err: any) {
      console.error('Error saving student details:', err)
      alert('Failed to save student details: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingDetails(false)
    }
  }

  const handleInsertTemplate = () => {
    const meta = (lead?.metadata && typeof lead.metadata === 'object') ? lead.metadata : {}
    const answers: Record<string, any> = meta.campaign_answers || {}

    // Find country
    const detectedCountry = lead?.country || inferCountryFromPhone(lead?.phone) || meta.country || ''

    // Find campus mode
    const campusMode = meta.campus_mode || answers['Campus Mode (Online / Offline)'] || answers['Online/Offline'] || ''

    // Find course / program
    const course = lead?.course || lead?.programme_level || answers['Program Interested In'] || answers['Program Interested in'] || ''

    // Find qualification
    const qualification = lead?.highest_qualification || meta.qualification || answers['Highest Qualification'] || answers['Qualification'] || ''

    // Find work experience
    const workExperience = lead?.work_experience || meta.work_experience || ''

    // Find key campaign answers like university, I-20, SEVIS
    const university = answers['Admitted US University'] || answers['Which Us University Have You Been Admitted To'] || meta['which_us_university_have_you_been_admitted_to?'] || meta.admitted_university || ''
    const i20 = answers['I-20 Received From US University?'] || answers['Have You Received Your I 20 From A Us University'] || meta['have_you_received_your_i-20_from_a_us_university?'] || meta.i20_received || ''
    const sevis = answers['SEVIS I-901 Fee Paid?'] || answers['Have You Paid Your Sevis I 901 Fee'] || meta['have_you_paid_your_sevis_i-901_fee?'] || meta.sevis_fee_paid || ''

    const lines = [
      `Name: ${lead?.name || ''}`,
      `Phone / WhatsApp: ${lead?.phone || ''}`,
      `Email: ${lead?.email || ''}`,
      `Address: ${meta.address || ''}`,
      `Country: ${detectedCountry}`,
      `Qualification: ${qualification}`,
      `GPA: ${meta.gpa || ''}`,
      `Work Experience: ${workExperience}`,
      `Course: ${course}`,
      `Campus Mode: ${campusMode}`,
      `Preferred Country: ${meta.preferred_country || detectedCountry}`,
      `Intake: ${meta.intake || ''}`,
      `Budget: ${lead?.budget_range || meta.budget || ''}`,
      `Funds Sponsor: ${meta.funds_sponsor || meta.sponsor || ''}`,
    ]

    // Append campaign-specific answers if available
    const extraAnswers: string[] = []
    if (university) extraAnswers.push(`Admitted University: ${university}`)
    if (i20) extraAnswers.push(`I-20 Received: ${i20}`)
    if (sevis) extraAnswers.push(`SEVIS Fee Paid: ${sevis}`)

    Object.entries(answers).forEach(([q, a]) => {
      if (!a) return
      const lower = q.toLowerCase()
      if (
        lower.includes('name') || lower.includes('phone') || lower.includes('email') ||
        lower.includes('course') || lower.includes('program') || lower.includes('campus') ||
        lower.includes('country') || lower.includes('university') || lower.includes('i-20') ||
        lower.includes('i20') || lower.includes('sevis') || lower.includes('qualification') ||
        lower.includes('work experience')
      ) return
      extraAnswers.push(`${q}: ${a}`)
    })

    if (extraAnswers.length > 0) {
      lines.push('')
      lines.push('--- Campaign Answers ---')
      lines.push(...extraAnswers)
    }

    const template = lines.join('\n')

    if (!note.trim()) {
      setNote(template)
    } else if (!note.includes('Name:') && !note.includes('Qualification:')) {
      setNote(note.trim() + '\n\n' + template)
    } else {
      if (confirm('Replace current note with pre-filled Campaign & Student Profile template?')) {
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
    
    const updatePayload: any = {}
    if (followUpDate) {
      updatePayload.next_follow_up = new Date(followUpDate).toISOString()
    }
    if (type === 'note' && text.trim()) {
      const currentMetadata = (lead?.metadata && typeof lead.metadata === 'object') ? lead.metadata : {}
      updatePayload.metadata = {
        ...currentMetadata,
        student_profile: text,
        notes: text
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      await supabase.from('leads').update(updatePayload).eq('id', id)
      setLead((prev: any) => ({
        ...prev,
        ...updatePayload
      }))
    }
    
    if (type === 'note') {
      isEditingNoteRef.current = false
      setDetailsSavedSuccess(true)
      setTimeout(() => setDetailsSavedSuccess(false), 3000)
    }

    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const handleStartCall = async (e?: React.MouseEvent, targetLine?: CallHippoLine) => {
    if (e) {
      if ('preventDefault' in e && typeof e.preventDefault === 'function') {
        e.preventDefault()
      }
    }
    if (!lead?.phone) return

    const now = Date.now()
    callStartTimeRef.current = now
    setActiveCallTimer(0)

    const selectedLine = targetLine || lineConfig.activeLine
    const resolvedLine = resolveOutboundLine(selectedLine, lead.country, lead.phone)
    const lineLabel = resolvedLine === 'usa' ? 'USA Line (+1)' : 'UK Line (+44)'

    const popup = openCallHippoDialer(lead.phone, e, { 
      name: lead.name, 
      leadId: id, 
      country: lead.country,
      line: resolvedLine
    })

    try {
      const { data: actData } = await supabase
        .from('activities')
        .insert([
          {
            lead: id,
            user_id: currentUser?.id || lead?.owner_id,
            type: 'call',
            outcome: 'Calling',
            text: `📞 Calling via CallHippo [${lineLabel}]... (Call in progress)`,
            time: new Date().toISOString()
          }
        ])
        .select()
        .single()

      if (actData?.id) {
        activeCallActIdRef.current = actData.id
      }
      fetchLeadAndActivities()
    } catch (err) {
      console.error('Error logging call initiation:', err)
    }

    if (popup) {
      const checkClosed = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkClosed)
            handleCallEnded()
          }
        } catch {
          clearInterval(checkClosed)
        }
      }, 1000)
    }
  }

  const handleCallEnded = async (explicitOutcome?: string) => {
    if (!callStartTimeRef.current) return
    const elapsedSecs = Math.max(1, Math.round((Date.now() - callStartTimeRef.current) / 1000))
    const formattedDuration = formatCallDuration(elapsedSecs)
    const outcome = explicitOutcome || 'No Answer'
    const actId = activeCallActIdRef.current

    callStartTimeRef.current = null
    activeCallActIdRef.current = null
    setActiveCallTimer(null)

    try {
      const lineLabel = lineConfig.activeLine === 'usa' ? 'USA Line (+1)' : 'UK Line (+44)'
      const newText = `📞 CallHippo Call [${lineLabel}] (${outcome})\n• Outcome: ${outcome}\n• Duration: ${formattedDuration} (${elapsedSecs}s)`

      if (actId) {
        await supabase
          .from('activities')
          .update({
            outcome,
            text: newText,
            time: new Date().toISOString()
          })
          .eq('id', actId)
      } else {
        await supabase.from('activities').insert([
          {
            lead: id,
            user_id: currentUser?.id || lead?.owner_id,
            type: 'call',
            outcome,
            text: newText,
            time: new Date().toISOString()
          }
        ])
      }

      const isUnanswered = ['No Answer', 'Busy', 'Ringing', 'Not Connected', 'Not connected'].includes(outcome)
      const newAttempts = isUnanswered ? (lead?.attempts || 0) + 1 : (lead?.attempts || 0)

      await supabase
        .from('leads')
        .update({
          last_call_outcome: outcome,
          attempts: newAttempts,
          metadata: {
            ...(lead?.metadata || {}),
            last_call_duration: formattedDuration,
            last_call_outcome: outcome,
            last_call_at: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      fetchLeadAndActivities()
    } catch (err) {
      console.error('Error ending call tracking:', err)
    }
  }

  const logCallOutcome = async (outcome: string) => {
    setSavingAction(true)
    const isUnanswered = ['No Answer', 'Busy', 'Not Connected', 'Not connected'].includes(outcome)
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

    const updateLeadData: any = { 
      attempts: newAttempts,
      last_call_outcome: outcome,
      next_follow_up: nextFollowUpIso,
    }

    // Auto-update stage to 'Not connected' or 'Connected' if lead is in initial stages
    if ((outcome === 'Not Connected' || outcome === 'Not connected') && (!lead.stage || lead.stage === 'New' || lead.stage === 'Attempted contact')) {
      updateLeadData.stage = 'Not connected'
    } else if (outcome === 'Connected' && (!lead.stage || lead.stage === 'New' || lead.stage === 'Attempted contact' || lead.stage === 'Not connected')) {
      updateLeadData.stage = 'Connected'
    }

    await supabase.from('leads').update(updateLeadData).eq('id', id)

    setLead((prev: any) => ({ ...prev, ...updateLeadData }))

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

    let junkReason = ''
    if (newStage === 'Junk/duplicate') {
      const isPrioritySet = lead.priority === 'Hot' || lead.priority === 'Warm' || lead.priority === 'Cold' || lead.priority === 'Callback' || lead.priority === 'Ringing'
      const confirmMsg = isPrioritySet
        ? `⚠️ Warning: This lead is currently marked as "${lead.priority}". Moving it to "Junk/duplicate" will reset its priority to Unset and clear follow-up reminders.\n\nAre you sure you want to move this lead to Junk?`
        : `Are you sure you want to mark this lead as Junk/duplicate?`

      if (!confirm(confirmMsg)) return

      const reasonInput = prompt('Reason for marking this lead as Junk/Duplicate? (Optional, e.g. Wrong Number, Fake, Duplicate, No Budget):')
      if (reasonInput === null) return
      junkReason = reasonInput.trim()
    }

    setSavingAction(true)

    const updatePayload: any = { stage: newStage }
    if (newStage === 'Enrolled') {
      updatePayload.next_follow_up = null
    } else if (newStage === 'Junk/duplicate') {
      updatePayload.priority = null // Auto-reset priority!
      updatePayload.next_follow_up = null // Clear reminders!
      if (junkReason) {
        updatePayload.metadata = {
          ...(lead.metadata || {}),
          junk_reason: junkReason,
          junk_marked_at: new Date().toISOString(),
          junk_marked_by: currentUser?.name || 'User'
        }
      }
    }

    const activityText = newStage === 'Junk/duplicate'
      ? `Moved to Junk/duplicate. Priority reset to Unset.${junkReason ? ` Reason: ${junkReason}` : ''}`
      : lead.stage === 'Junk/duplicate'
      ? `Revived from Junk/duplicate to ${newStage}`
      : `Changed stage to ${newStage}`

    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: newStage === 'Junk/duplicate' ? 'junk_marked' : 'stage change', 
        text: activityText, 
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
      summary: activityText
    })

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

    if (newStage === 'Junk/duplicate') {
      setFollowUpDate('')
      setLead((prev: any) => ({
        ...prev,
        stage: newStage,
        priority: null,
        next_follow_up: null,
        metadata: updatePayload.metadata || prev.metadata
      }))
    } else {
      setLead((prev: any) => ({
        ...prev,
        stage: newStage
      }))
    }

    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const assignLead = async (counselorId: string, counselorName: string) => {
    if (counselorId === lead.owner_id) return
    const reason = prompt(`Reason for assigning to ${counselorName}? (Optional)`)
    if (reason === null) return 
    
    setSavingAction(true)

    const isJunkRevival = lead.stage === 'Junk/duplicate'
    const newStage = isJunkRevival ? 'New' : lead.stage
    
    await supabase.from('assignments').insert([
      { lead_id: id, from_user: lead.owner_id, to_user: counselorId, assigned_by: currentUser.id, reason, time: new Date().toISOString() }
    ])

    const activityText = isJunkRevival
      ? `Lead revived from Junk/duplicate and assigned to ${counselorName}. Stage reset to New. ${reason ? `Reason: ${reason}` : ''}`
      : `Assigned to ${counselorName}. ${reason ? `Reason: ${reason}` : ''}`

    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: isJunkRevival ? 'lead_revived' : 'assignment', 
        text: activityText, 
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
      summary: activityText
    })

    const updatePayload: any = { owner_id: counselorId }
    if (isJunkRevival) {
      updatePayload.stage = 'New'
    }
    
    await supabase.from('leads').update(updatePayload).eq('id', id)
    
    // Auto-notify assigned counselor
    notifyLeadAssigned({
      recipientId: counselorId,
      leadId: id,
      leadName: lead.name,
      senderName: currentUser?.name || 'Manager',
    }).catch(console.error)

    setLead((prev: any) => ({
      ...prev,
      owner_id: counselorId,
      stage: newStage,
      owner: { name: counselorName }
    }))

    fetchLeadAndActivities()
    setSavingAction(false)
  }

  const changePriority = async (newPriority: string) => {
    const val = newPriority || null

    if (val && lead.stage === 'Junk/duplicate') {
      const shouldRevive = confirm(
        `This lead is currently in "Junk/duplicate" stage.\n\nSetting priority to "${val}" will automatically revive this lead back to "New" stage so it appears in the active calling pipeline.\n\nProceed and revive to New?`
      )
      if (!shouldRevive) return

      const priorityLabel = val === 'Hot' ? '🔥 Hot' : val === 'Warm' ? '☀️ Warm' : val === 'Cold' ? '❄️ Cold' : val === 'Callback' ? '📞 Callback' : val === 'Ringing' ? '🔔 Ringing' : val
      setSavingAction(true)
      await supabase.from('leads').update({ priority: val, stage: 'New' }).eq('id', id)
      await supabase.from('activities').insert([
        { 
          lead: id, 
          user_id: currentUser?.id || lead?.owner_id,
          type: 'lead_revived', 
          text: `Revived from Junk/duplicate to New and priority set to ${priorityLabel}`, 
          time: new Date().toISOString() 
        }
      ])
      setLead((prev: any) => ({ ...prev, priority: val, stage: 'New' }))
      fetchLeadAndActivities()
      setSavingAction(false)
      return
    }

    setSavingAction(true)
    const priorityLabel = val === 'Hot' ? '🔥 Hot' : val === 'Warm' ? '☀️ Warm' : val === 'Cold' ? '❄️ Cold' : val === 'Callback' ? '📞 Callback' : val === 'Ringing' ? '🔔 Ringing' : val
    await supabase.from('leads').update({ priority: val }).eq('id', id)
    await supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id,
        type: 'priority change', 
        text: `Priority updated to ${val ? priorityLabel : '⚪ Unset'}`, 
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

  const handleSelectTemplate = (templateId: string) => {
    if (templateId === 'custom') {
      setSelectedTemplate({ id: 'custom', name: 'Custom Message' })
      return
    }
    const found = templates.find(t => t.id === templateId)
    if (found) {
      setSelectedTemplate(found)
      setEmailSubject(found.subject || '')
      const cleanBody = (found.body || '')
        .replace(/\\n/g, '\n')
        .replace(/\[Name\]/g, lead?.name || 'Student')
        .replace(/\[Counselor\]/g, currentUser?.name || 'Counselor')
        .replace(/\[Course\]/g, lead?.course || 'Program')
      setEmailBody(cleanBody)
    }
  }

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      alert('Please enter a template name')
      return
    }
    if (!emailSubject.trim() || !emailBody.trim()) {
      alert('Please enter both subject and message body before saving template')
      return
    }

    setSavingTemplate(true)
    try {
      let bodyToSave = emailBody
      if (lead?.name) {
        bodyToSave = bodyToSave.split(lead.name).join('[Name]')
      }

      const { data, error } = await supabase.from('email_templates').insert([
        {
          name: newTemplateName.trim(),
          subject: emailSubject.trim(),
          body: bodyToSave
        }
      ]).select().single()

      if (error) throw error

      if (data) {
        setTemplates(prev => [...prev, data])
        setSelectedTemplate(data)
      }
      setShowSaveTemplateModal(false)
      setNewTemplateName('')
      alert(`Template "${newTemplateName}" saved successfully!`)
    } catch (err: any) {
      console.error('Error saving template:', err)
      alert('Failed to save template: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (['Introduction', 'Follow Up', 'Missing Documents'].includes(templateName)) {
      alert(`Default template "${templateName}" is a system template and cannot be deleted. You can edit its content or save your own custom template!`)
      return
    }
    if (!confirm(`Delete template "${templateName}"?`)) return
    try {
      const { error } = await supabase.from('email_templates').delete().eq('id', templateId)
      if (error) throw error
      setTemplates(prev => prev.filter(t => t.id !== templateId))
      if (selectedTemplate?.id === templateId) {
        setSelectedTemplate({ id: 'custom', name: 'Custom Message' })
      }
    } catch (err: any) {
      console.error('Error deleting template:', err)
      alert('Failed to delete template: ' + err.message)
    }
  }

  const handleCopyEmail = () => {
    const fullText = `Subject: ${emailSubject}\n\n${emailBody}`
    navigator.clipboard.writeText(fullText)
    setCopiedEmailText(true)
    setTimeout(() => setCopiedEmailText(false), 2000)
  }

  const handleSendEmail = async () => {
    if (!lead?.email) return
    if (!emailSubject.trim() || !emailBody.trim()) {
      alert('Please enter both email subject and body')
      return
    }

    setSendingEmail(true)
    setEmailError(null)
    setEmailSentSuccess(null)

    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: lead.email,
          subject: emailSubject,
          body: emailBody,
          leadId: id,
          senderName: currentUser?.name || 'Bridgewell Team',
          senderEmail: currentUser?.email,
          counselorSmtp: counselorAppPass ? {
            user: currentUser?.email,
            pass: counselorAppPass,
          } : undefined
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setEmailSentSuccess(`✅ Email sent directly to ${lead.email}!`)
        fetchLeadAndActivities()
        setTimeout(() => {
          setShowEmailModal(false)
          setEmailSentSuccess(null)
        }, 1800)
      } else {
        const errorMsg = data.message || data.error || 'Failed to send email'
        setEmailError(errorMsg)
      }
    } catch (err: any) {
      console.error('Error sending email:', err)
      setEmailError(err.message || 'Network error while attempting to send email.')
    } finally {
      setSendingEmail(false)
    }
  }

  const handleOpenWebGmail = () => {
    if (!lead?.email) return
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    window.open(gmailUrl, '_blank')

    // Also log to activities
    supabase.from('activities').insert([
      { 
        lead: id, 
        user_id: currentUser?.id || lead?.owner_id, 
        type: 'email', 
        text: `✉️ Opened email in Web Gmail: "${emailSubject}"\n• To: ${lead.email}`, 
        time: new Date().toISOString() 
      }
    ]).then(() => {
      fetchLeadAndActivities()
    })
  }

  const handleSaveCounselorPass = () => {
    const trimmed = tempAppPass.trim()
    setCounselorAppPass(trimmed)
    if (typeof window !== 'undefined' && currentUser?.id) {
      if (trimmed) {
        localStorage.setItem(`bridgewell_counselor_app_pass_${currentUser.id}`, trimmed)
      } else {
        localStorage.removeItem(`bridgewell_counselor_app_pass_${currentUser.id}`)
      }
    }
    setShowPersonalSmtpConfig(false)
  }

  if (loading) return <div className="p-8 h-full flex items-center justify-center bg-[#FDFDFD]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>
  if (!lead) return <div className="p-8 text-gray-900 bg-[#FDFDFD]">Lead not found.</div>

  return (
    <div className="flex h-full bg-[#FDFDFD]">
      {/* Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Mail size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">Send Email to Student</h3>
                  <p className="text-[11px] text-gray-500">Choose a template or write &amp; save custom message</p>
                </div>
              </div>
              <button 
                onClick={() => setShowEmailModal(false)} 
                className="text-gray-400 hover:text-gray-900 p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16}/>
              </button>
            </div>

            {!lead.email ? (
              <div className="p-10 text-center text-gray-500 text-sm">
                <Mail size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="font-semibold text-gray-700">No Email Address</p>
                <p className="text-xs text-gray-400 mt-1">This lead does not have an email address saved in their profile.</p>
              </div>
            ) : (
              <div className="p-6 space-y-4 overflow-y-auto flex-1">

                {/* Counselor Sending Identity Bar */}
                <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-white border border-blue-200/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white font-bold flex items-center justify-center shrink-0 text-xs shadow-xs">
                      {currentUser?.name?.[0] || 'C'}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-gray-900">{currentUser?.name || 'Counselor'}</span>
                        <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-1.5 py-0.5 rounded">
                          {counselorAppPass ? 'Personal Gmail Active' : 'Logged-in Account'}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-medium">
                        {currentUser?.email || 'No email associated'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <div className="text-right hidden sm:block">
                      <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block">Student Replies Go To</span>
                      <span className="font-bold text-blue-700 text-[11px]">{currentUser?.email || 'Your Inbox'}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowPersonalSmtpConfig(!showPersonalSmtpConfig)}
                      className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                      title="Configure personal App Password for direct CRM sending"
                    >
                      <Key size={11} className={counselorAppPass ? 'text-emerald-600' : 'text-gray-400'} />
                      <span>{counselorAppPass ? 'Personal Key Set' : 'My Gmail Pass'}</span>
                    </button>
                  </div>
                </div>

                {/* Optional Counselor Personal App Password Drawer */}
                {showPersonalSmtpConfig && (
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3.5 space-y-2 text-xs animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-amber-950 flex items-center gap-1.5">
                        <Key size={13} className="text-amber-600" />
                        <span>Use Your Personal Gmail App Password</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowPersonalSmtpConfig(false)}
                        className="text-amber-700 hover:text-amber-900 text-xs cursor-pointer"
                      >
                        ✕ Close
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Enter your 16-character Google App Password if you want the <strong>"Send Email from CRM"</strong> button to send directly from your personal Gmail (<code>{currentUser?.email}</code>). It is saved securely in your browser only.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="password"
                        value={tempAppPass}
                        onChange={e => setTempAppPass(e.target.value)}
                        placeholder="16-character app password (e.g. abcd efgh ijkl mnop)"
                        className="flex-1 bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-amber-200 font-mono"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCounselorPass}
                        className="px-3 py-1.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-xs cursor-pointer shrink-0"
                      >
                        Save Key
                      </button>
                      {counselorAppPass && (
                        <button
                          type="button"
                          onClick={() => {
                            setTempAppPass('')
                            setCounselorAppPass('')
                            if (typeof window !== 'undefined' && currentUser?.id) {
                              localStorage.removeItem(`bridgewell_counselor_app_pass_${currentUser.id}`)
                            }
                          }}
                          className="px-2 py-1.5 text-xs text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Template Selector & Action Bar */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                      Select Template or Write Custom
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowSaveTemplateModal(true)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 transition-colors cursor-pointer"
                      title="Save current message as a new reusable template"
                    >
                      <Save size={11} />
                      <span>+ Save as New Template</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <select 
                      value={selectedTemplate?.id || 'custom'}
                      onChange={e => handleSelectTemplate(e.target.value)}
                      className="flex-1 bg-white border border-gray-300 rounded-lg text-gray-900 px-3 py-2 text-xs font-medium outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all cursor-pointer shadow-2xs"
                    >
                      <option value="custom">✏️ Write Custom Email (Blank)</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>📄 {t.name} — {t.subject}</option>
                      ))}
                    </select>

                    {selectedTemplate && selectedTemplate.id !== 'custom' && !['Introduction', 'Follow Up', 'Missing Documents'].includes(selectedTemplate.name) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(selectedTemplate.id, selectedTemplate.name)}
                        className="text-gray-400 hover:text-rose-600 p-2 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                        title="Delete this custom template"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Save Template Drawer */}
                {showSaveTemplateModal && (
                  <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                        <Save size={13} />
                        <span>Save This Email as a New Template</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowSaveTemplateModal(false)}
                        className="text-blue-500 hover:text-blue-800 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={e => setNewTemplateName(e.target.value)}
                        placeholder="Template Name (e.g. Visa Guidance - Rahul)"
                        className="flex-1 bg-white border border-blue-300 rounded-lg px-3 py-1.5 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-blue-200"
                        onKeyDown={e => e.key === 'Enter' && handleSaveAsTemplate()}
                      />
                      <button
                        type="button"
                        onClick={handleSaveAsTemplate}
                        disabled={savingTemplate || !newTemplateName.trim()}
                        className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {savingTemplate ? 'Saving...' : 'Save Template'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Recipient & Subject */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <span className="font-semibold text-gray-500 shrink-0">To:</span>
                    <span className="font-bold text-gray-900 truncate">{lead.email}</span>
                    <span className="text-[10px] text-gray-400 font-medium ml-auto">({lead.name})</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={e => setEmailSubject(e.target.value)}
                      placeholder="Email Subject..."
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-xs font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all shadow-2xs"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-gray-700">
                        Email Body
                      </label>
                      {/* Variable Insertion Chips */}
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-gray-400 font-medium">Insert:</span>
                        <button
                          type="button"
                          onClick={() => setEmailBody(prev => prev + ` ${lead?.name || ''}`)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-mono cursor-pointer transition-colors"
                        >
                          + Student Name
                        </button>
                        <button
                          type="button"
                          onClick={() => setEmailBody(prev => prev + ` ${currentUser?.name || 'Counselor'}`)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded font-mono cursor-pointer transition-colors"
                        >
                          + My Name
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={emailBody}
                      onChange={e => setEmailBody(e.target.value)}
                      rows={8}
                      placeholder="Type your message here..."
                      className="w-full bg-white border border-gray-300 rounded-lg p-3 text-xs text-gray-900 outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all shadow-2xs leading-relaxed resize-y font-normal"
                    />
                  </div>
                </div>

                {/* Status Messages */}
                {emailSentSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-in fade-in duration-200">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <span className="font-bold">{emailSentSuccess}</span>
                  </div>
                )}

                {emailError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-2 animate-in fade-in duration-200">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-bold text-rose-950">Direct Send Issue</p>
                        <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">{emailError}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-rose-200 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[11px] text-rose-700 font-medium">Alternative: Send directly via Web Gmail:</span>
                      <button
                        type="button"
                        onClick={handleOpenWebGmail}
                        className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <ExternalLink size={12} />
                        <span>Open Web Gmail (1-Click)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Option 1: Web Gmail (1-Click, uses counselor's logged in Gmail) */}
                    <button
                      type="button"
                      onClick={handleOpenWebGmail}
                      disabled={!emailSubject.trim() && !emailBody.trim()}
                      className="flex-1 min-w-[200px] bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      title="Opens in your browser with your logged-in Gmail. Sent from your personal email address!"
                    >
                      <ExternalLink size={14} />
                      <span>Send via My Gmail (1-Click)</span>
                    </button>

                    {/* Option 2: Direct CRM Dispatch */}
                    <button 
                      type="button"
                      onClick={handleSendEmail} 
                      disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
                      className="flex-1 min-w-[200px] bg-black hover:bg-gray-800 text-white font-bold py-2.5 px-4 rounded-xl transition-all disabled:opacity-50 text-xs shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                      title="Dispatches directly in the background. Shows your name and student replies come to your email."
                    >
                      {sendingEmail ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Sending from CRM...</span>
                        </>
                      ) : (
                        <>
                          <Send size={14} />
                          <span>{counselorAppPass ? 'Direct Send (My Gmail)' : 'Send Direct from CRM'}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyEmail}
                      disabled={!emailSubject.trim() && !emailBody.trim()}
                      className="px-3 py-2.5 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
                      title="Copy email subject and body to clipboard"
                    >
                      {copiedEmailText ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                      <span>{copiedEmailText ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <p className="text-[11px] text-gray-500 text-center leading-relaxed">
                    💡 <strong>Counselor Tip:</strong> Click <strong>"Send via My Gmail"</strong> to send from your personal Gmail with zero setup, or click <strong>"Send Direct from CRM"</strong> for instant background sending with replies directed to your inbox.
                  </p>
                </div>

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
                {/* Service Track Badge */}
                {getLeadServiceType(lead) === 'visa_process' ? (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-indigo-50 text-indigo-700 border-indigo-200 flex items-center gap-1 shadow-2xs">
                    <span>🛂 Visa Process Lead</span>
                  </span>
                ) : (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 shadow-2xs">
                    <span>🎓 Study Abroad Lead</span>
                  </span>
                )}
              </div>
            </div>
            <p className="text-gray-400 text-xs flex items-center gap-1.5 font-normal mt-1.5 flex-wrap">
              <Clock size={12} /> Added {new Date(lead.created_at).toLocaleDateString()}
              {(lead.country || lead.phone) && formatCountryBadge(lead.country, lead.phone) && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded font-bold text-[10px] bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                  {formatCountryBadge(lead.country, lead.phone)} Ad
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

          {/* Junk / Duplicate Status Warning Banner */}
          {lead.stage === 'Junk/duplicate' && (
            <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-rose-500/10 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950 shadow-xs animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0 font-bold">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">🗑️ Junk / Duplicate Lead</span>
                    {lead.metadata?.junk_reason && (
                      <span className="text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                        Reason: {lead.metadata.junk_reason}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-amber-800 mt-0.5">
                    This lead is excluded from active calling pipelines. Reassigning or clicking &quot;Revive&quot; will reset it to &quot;New&quot;.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => changeStage('New')}
                className="px-3.5 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer w-fit"
              >
                ⚡ Revive to New
              </button>
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
                      : lead.priority === 'Callback'
                      ? 'border-purple-300 text-purple-700 bg-purple-50/70 focus:ring-2 focus:ring-purple-200'
                      : lead.priority === 'Ringing'
                      ? 'border-emerald-300 text-emerald-700 bg-emerald-50/70 focus:ring-2 focus:ring-emerald-200'
                      : 'border-gray-200 text-gray-800 bg-white hover:bg-gray-50'
                  }`}
                >
                  <option value="">⚪ Unset</option>
                  <option value="Hot">🔥 Hot</option>
                  <option value="Warm">☀️ Warm</option>
                  <option value="Cold">❄️ Cold</option>
                  <option value="Callback">📞 Callback</option>
                  <option value="Ringing">🔔 Ringing</option>
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
              {canManageLeads(currentUser) ? (
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

          {/* Active Call Live Duration & Outcome Controller */}
          {activeCallTimer !== null && (
            <div className="bg-gradient-to-br from-gray-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-3.5 shadow-xl border border-indigo-500/30 animate-in fade-in slide-in-from-top-2 duration-300 mb-3">
              {/* Header: Title + Duration + End Call */}
              <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-200 truncate flex items-center gap-1">
                    <Phone size={12} className="text-emerald-400" />
                    CallHippo Active Call
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                    {formatCallDuration(activeCallTimer)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCallEnded('Ringing')}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1 shrink-0 active:scale-95"
                  title="Hang up without answer (Mark as Ringing)"
                >
                  <PhoneOff size={11} className="shrink-0" />
                  <span>Hang Up (Ringing)</span>
                </button>
              </div>

              <p className="text-[10px] text-gray-300/90 mb-2.5">
                Call in progress... Select outcome to finish &amp; log call:
              </p>

              {/* 2x2 Outcome Grid - Spacious & Clean with Clear Hindi/English Labels */}
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleCallEnded('Connected')}
                  className="py-2.5 px-2 bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-98"
                  title="Call Connect Hui aur Student se Baat Hui"
                >
                  <PhoneCall size={13} className="text-emerald-400 shrink-0" />
                  <span className="truncate">Connected (Baat Hui)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCallEnded('Ringing')}
                  className="py-2.5 px-2 bg-amber-500/20 hover:bg-amber-500/35 border border-amber-400/40 text-amber-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-98"
                  title="Ghanti Baji par Student ne Pick Nahi Kiya"
                >
                  <span className="text-xs shrink-0">🔔</span>
                  <span className="truncate">Ringing (No Pick)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCallEnded('Callback')}
                  className="py-2.5 px-2 bg-blue-500/20 hover:bg-blue-500/35 border border-blue-400/40 text-blue-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-98"
                  title="Student ne Bola Baad Me Call Karein"
                >
                  <PhoneForwarded size={13} className="text-blue-400 shrink-0" />
                  <span className="truncate">Callback (Baad Me)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCallEnded('Busy')}
                  className="py-2.5 px-2 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/40 text-rose-200 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs hover:scale-[1.02] active:scale-98"
                  title="Phone Busy ya Switch Off Tha"
                >
                  <PhoneOff size={13} className="text-rose-400 shrink-0" />
                  <span className="truncate">Busy / Reject</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Action Buttons (UK Line vs USA Line vs WhatsApp) */}
          <div className="grid grid-cols-3 gap-2 pt-1">
             <button 
               type="button"
               onClick={(e) => handleStartCall(e, 'uk')}
               className="flex justify-center items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-2 rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95"
               title="Call via CallHippo using UK Number (+44)"
             >
                <Phone size={13} className="shrink-0" />
                <span className="truncate">🇬🇧 Call UK (+44)</span>
             </button>

             <button 
               type="button"
               onClick={(e) => handleStartCall(e, 'usa')}
               className="flex justify-center items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-2 rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer active:scale-95"
               title="Call via CallHippo using USA Number (+1)"
             >
                <Phone size={13} className="shrink-0" />
                <span className="truncate">🇺🇸 Call USA (+1)</span>
             </button>

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
               type="button"
               onClick={() => {
                 setShowEmailModal(true)
                 if (!emailSubject && !emailBody) {
                   if (templates.length > 0) {
                     handleSelectTemplate(templates[0].id)
                   } else {
                     setSelectedTemplate({ id: 'custom', name: 'Custom Message' })
                     setEmailSubject(`Information for ${lead?.name || 'Student'}`)
                     setEmailBody(`Hi ${lead?.name || 'Student'},\n\n`)
                   }
                 }
               }} 
               className="flex justify-center items-center gap-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-900 py-2.5 px-2 rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
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
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Service Track</span>
                   {getLeadServiceType(lead) === 'visa_process' ? (
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs">
                       🛂 Visa Process Track
                     </span>
                   ) : (
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs">
                       🎓 Study Abroad Track
                     </span>
                   )}
                </div>
                {(lead.country || lead.phone) && (
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                     <span className="text-gray-400 font-medium">Target Country / Location</span>
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                       {formatCountryBadge(lead.country, lead.phone)}
                     </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Programme</span>
                   <span className="text-gray-900 font-semibold">{lead.course || lead.programme_level || lead.metadata?.campaign_answers?.['Program Interested In'] || 'Not provided'}</span>
                </div>
                {(lead.metadata?.campus_mode || lead.metadata?.campaign_answers?.['Campus Mode (Online / Offline)']) && (
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                     <span className="text-gray-400 font-medium">Campus Mode</span>
                     <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                       {String(lead.metadata?.campus_mode || lead.metadata?.campaign_answers?.['Campus Mode (Online / Offline)']).toLowerCase().includes('campus') ? '🏛️ On Campus' :
                        String(lead.metadata?.campus_mode || lead.metadata?.campaign_answers?.['Campus Mode (Online / Offline)']).toLowerCase().includes('online') ? '💻 Online' :
                        '🌐 ' + String(lead.metadata?.campus_mode || lead.metadata?.campaign_answers?.['Campus Mode (Online / Offline)'])}
                     </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Source / Campaign</span>
                   <span className="text-gray-900 font-semibold">{lead.source}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Qualification</span>
                   <span className="text-gray-900 font-semibold">{lead.highest_qualification || lead.metadata?.qualification || 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                   <span className="text-gray-400 font-medium">Work Experience</span>
                   <span className="text-gray-900 font-semibold">{lead.work_experience || 'Not provided'}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-100 last:border-0">
                   <span className="text-gray-400 font-medium">Budget Range</span>
                   <span className="text-gray-900 font-semibold">{lead.budget_range || lead.metadata?.budget || 'Not provided'}</span>
                </div>
             </div>
          </section>

          {/* Campaign Form Questionnaire & Dynamic Excel Answers */}
          {(() => {
            const campaignDetails = getLeadCampaignDetails(lead)
            if (campaignDetails.length === 0) return null

            return (
              <section className="bg-white border border-blue-200/90 rounded-2xl p-5 shadow-xs relative overflow-hidden">
                 <div className="flex items-center justify-between mb-3">
                   <h3 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                     <Sparkles size={13} className="text-blue-600" />
                     <span>Campaign Form Details</span>
                   </h3>
                   {lead.source && (
                     <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 truncate max-w-[140px]">
                       {lead.source}
                     </span>
                   )}
                 </div>
                 <p className="text-[11px] text-gray-500 mb-3.5 leading-snug">
                   Student questionnaire responses from the ad campaign:
                 </p>
                 <div className="space-y-2.5 text-xs">
                    {campaignDetails.map((item) => (
                      <div key={item.key} className="bg-gray-50/80 border border-gray-200/80 rounded-xl p-3 flex flex-col gap-1.5">
                         <span className="text-gray-600 font-semibold text-[11px] leading-tight">
                           {item.label}
                         </span>
                         <div>
                           {item.type === 'yes' ? (
                             <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                               <Check size={12} className="stroke-[3]" /> Yes
                             </span>
                           ) : item.type === 'no' ? (
                             <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                               <X size={12} className="stroke-[3]" /> No
                             </span>
                           ) : item.type === 'campus' ? (
                             <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                               {item.value.toLowerCase().includes('campus') ? '🏛️ On Campus' :
                                item.value.toLowerCase().includes('online') ? '💻 Online' :
                                '🌐 ' + item.value}
                             </span>
                           ) : item.type === 'program' ? (
                             <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-900 border border-amber-200">
                               🎓 {item.value}
                             </span>
                           ) : (
                             <span className="text-gray-900 font-bold break-words">
                               {item.value}
                             </span>
                           )}
                         </div>
                      </div>
                    ))}
                 </div>
              </section>
            )
          })()}

          {/* Permanent Student Profile & Saved Counselor Notes Card */}
          {(lead?.metadata?.student_profile || lead?.metadata?.notes || lead?.metadata?.address || lead?.metadata?.gpa || lead?.metadata?.preferred_country || lead?.metadata?.intake || lead?.metadata?.sponsor) && (
            <section className="bg-white border border-emerald-300 rounded-2xl p-5 shadow-xs relative overflow-hidden animate-fade-in">
               <div className="flex items-center justify-between mb-3">
                 <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                   <CheckCircle2 size={13} className="text-emerald-600" />
                   <span>Saved Student Details &amp; Notes</span>
                 </h3>
                 <button
                   type="button"
                   onClick={() => handleOpenNotes(lead?.metadata?.student_profile || lead?.metadata?.notes)}
                   className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md flex items-center gap-1 transition-colors cursor-pointer shadow-2xs hover:shadow-xs"
                   title="Click to edit or add more details in the notes editor"
                 >
                   <Edit3 size={11} />
                   <span>Edit Notes</span>
                 </button>
               </div>

               <div className="space-y-2 text-xs">
                 {lead?.metadata?.address && (
                   <div className="flex justify-between items-start py-1 border-b border-gray-100 last:border-0 gap-2">
                     <span className="text-gray-400 font-medium shrink-0">Address</span>
                     <span className="text-gray-900 font-semibold text-right">{lead.metadata.address}</span>
                   </div>
                 )}
                 {lead?.metadata?.gpa && (
                   <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                     <span className="text-gray-400 font-medium">GPA / Academic Score</span>
                     <span className="text-gray-900 font-bold bg-gray-100 px-2 py-0.5 rounded text-xs">{lead.metadata.gpa}</span>
                   </div>
                 )}
                 {(lead?.work_experience || lead?.metadata?.work_experience) && (
                   <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                     <span className="text-gray-400 font-medium">Work Experience</span>
                     <span className="text-gray-900 font-semibold">{lead.work_experience || lead.metadata.work_experience}</span>
                   </div>
                 )}
                 {lead?.metadata?.preferred_country && (
                   <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                     <span className="text-gray-400 font-medium">Preferred Country</span>
                     <span className="text-gray-900 font-semibold">{lead.metadata.preferred_country}</span>
                   </div>
                 )}
                 {lead?.metadata?.intake && (
                   <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                     <span className="text-gray-400 font-medium">Target Intake</span>
                     <span className="text-blue-700 font-bold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">{lead.metadata.intake}</span>
                   </div>
                 )}
                 {(lead?.budget_range || lead?.metadata?.budget) && (
                   <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                     <span className="text-gray-400 font-medium">Budget</span>
                     <span className="text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs">{lead.budget_range || lead.metadata.budget}</span>
                   </div>
                 )}
                 {(lead?.metadata?.funds_sponsor || lead?.metadata?.sponsor) && (
                   <div className="flex justify-between items-center py-1 border-b border-gray-100 last:border-0">
                     <span className="text-gray-400 font-medium">Funds Sponsor</span>
                     <span className="text-purple-700 font-bold bg-purple-50 border border-purple-200 px-2 py-0.5 rounded text-xs">{lead.metadata.funds_sponsor || lead.metadata.sponsor}</span>
                   </div>
                 )}
               </div>

               {/* Full Saved Text */}
               {(lead?.metadata?.student_profile || lead?.metadata?.notes) && (
                 <div className="mt-3 pt-3 border-t border-gray-100">
                   <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                     <span>Saved Dossier / Note</span>
                     <span className="text-emerald-700 font-bold text-[10px] flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                       Saved Permanently
                     </span>
                   </div>
                   <div className="bg-gray-50/90 rounded-xl p-3 text-[11px] font-mono text-gray-800 whitespace-pre-wrap max-h-60 overflow-y-auto border border-gray-200/80 leading-relaxed shadow-2xs">
                     {lead?.metadata?.student_profile || lead?.metadata?.notes}
                   </div>
                 </div>
               )}
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
                      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                        <div className="text-sm font-semibold text-gray-900 capitalize flex items-center gap-2 flex-wrap">
                          <span>{act.type}</span>
                          {(act.type === 'note' || act.text?.includes('Student details saved')) && (
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                              Saved Note
                            </span>
                          )}
                          {act.type === 'call' && (
                            <>
                              {(act.outcome === 'Connected' || act.text?.includes('(Connected)') || act.text?.includes('Call Connected')) && (
                                <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Connected
                                </span>
                              )}
                              {(act.outcome === 'Calling' || act.outcome === 'In Progress' || act.text?.includes('Calling via')) && (
                                <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                                  Calling {activeCallTimer !== null ? `(${formatCallDuration(activeCallTimer)})` : '...'}
                                </span>
                              )}
                              {(act.outcome === 'Busy' || act.text?.includes('(Busy)')) && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                                  Busy
                                </span>
                              )}
                              {(act.outcome === 'No Answer' || act.text?.includes('(No Answer)')) && (
                                <span className="text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded-full">
                                  No Answer
                                </span>
                              )}
                              {act.text?.includes('Duration:') && (
                                <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <Clock size={10} className="text-gray-500" />
                                  {extractCallDuration(act.text)}
                                </span>
                              )}
                              {/* Fallback for historical 'Initiated phone call' card (as shown in user screenshot) */}
                              {act.text?.includes('Initiated phone call via JustCall') && !act.text?.includes('Duration:') && (
                                <>
                                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    {lead?.last_call_outcome || 'Connected'}
                                  </span>
                                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-700 border border-gray-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Clock size={10} className="text-gray-500" />
                                    {lead?.metadata?.last_call_duration || 'Duration Logged'}
                                  </span>
                                </>
                              )}
                            </>
                          )}
                        </div>
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
                      {extractRecordingUrl(act.text) && (
                        <div className="mb-2">
                          <a
                            href={extractRecordingUrl(act.text)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors shadow-2xs"
                          >
                            <span>🎙️ Play Call Recording</span>
                            <ArrowRight size={11} />
                          </a>
                        </div>
                      )}
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
                      onClick={() => logCallOutcome('Not Connected')} 
                      disabled={savingAction} 
                      className={`px-3 py-1.5 border rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs ${
                        lead.last_call_outcome === 'Not Connected' || lead.last_call_outcome === 'Not connected'
                          ? 'bg-orange-600 text-white border-orange-600 ring-2 ring-orange-200 shadow-md font-bold'
                          : 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700'
                      }`}
                    >
                       <PhoneOff size={12} /> Not Connected
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

import { supabase } from './supabase'

export type NotificationType =
  | 'announcement'
  | 'alert'
  | 'lead_assigned'
  | 'followup_due'
  | 'hot_lead'
  | 'conversion'
  | 'target'
  | 'system'

export type NotificationPriority = 'urgent' | 'high' | 'normal' | 'low'

export interface NotificationItem {
  id: string
  recipient_id: string | null
  sender_id: string | null
  sender_name: string | null
  title: string
  message: string
  type: NotificationType
  priority: NotificationPriority
  link?: string | null
  is_read: boolean
  created_at: string
}

export interface SendNotificationPayload {
  recipientId?: string | null // null = broadcast
  recipientIds?: string[] // array of specific user IDs
  senderId?: string | null
  senderName?: string | null
  title: string
  message: string
  type?: NotificationType
  priority?: NotificationPriority
  link?: string | null
}

let activeAlarmInterval: any = null
let activeAlarmCtx: AudioContext | null = null

/**
 * Start a continuous repeating digital alarm clock ring for due follow-ups.
 * Rings every 1.3 seconds until explicitly stopped.
 */
export function startContinuousAlarm(): () => void {
  stopContinuousAlarm()
  if (typeof window === 'undefined') return () => {}

  const playAlarmBurst = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContextClass) return

      if (!activeAlarmCtx || activeAlarmCtx.state === 'closed') {
        activeAlarmCtx = new AudioContextClass()
      }
      const ctx = activeAlarmCtx
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const now = ctx.currentTime
      const beeps = [987.77, 987.77, 987.77, 1174.66]
      beeps.forEach((freq, idx) => {
        const t = now + idx * 0.11
        playTone(ctx, freq, t, 0.075, 0.35, freq * 2)
      })
    } catch {
      // Audio context handling
    }
  }

  playAlarmBurst()
  activeAlarmInterval = setInterval(playAlarmBurst, 1300)

  return stopContinuousAlarm
}

/**
 * Stop any active continuous alarm immediately
 */
export function stopContinuousAlarm() {
  if (activeAlarmInterval) {
    clearInterval(activeAlarmInterval)
    activeAlarmInterval = null
  }
  if (activeAlarmCtx && activeAlarmCtx.state !== 'closed') {
    try {
      activeAlarmCtx.close().catch(() => {})
    } catch {}
    activeAlarmCtx = null
  }
}

/**
 * Play authentic WhatsApp-style incoming message chime using Web Audio API
 */
export function playNotificationSound(priority: NotificationPriority = 'normal') {
  if (typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextClass) return
    const ctx = new AudioContextClass()

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime

    if (priority === 'urgent') {
      // Urgent WhatsApp Double Ding
      playTone(ctx, 830.61, now, 0.08, 0.28)
      playTone(ctx, 1046.5, now + 0.07, 0.25, 0.35, 2093)
      playTone(ctx, 880, now + 0.32, 0.08, 0.28)
      playTone(ctx, 1174.66, now + 0.39, 0.28, 0.38, 2349.32)
    } else {
      // Classic WhatsApp Message Ding (G#5 Pop -> C6 Bell Ding with crystal harmonic)
      playTone(ctx, 830.61, now, 0.08, 0.3)
      playTone(ctx, 1046.5, now + 0.07, 0.35, 0.38, 2093)
    }
  } catch {
    // Ignore audio restrictions
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  volume: number,
  harmonicFreq?: number
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, startTime)
  gain.gain.setValueAtTime(0.001, startTime)
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(startTime)
  osc.stop(startTime + duration)

  if (harmonicFreq) {
    const oscH = ctx.createOscillator()
    const gainH = ctx.createGain()
    oscH.type = 'triangle'
    oscH.frequency.setValueAtTime(harmonicFreq, startTime)
    gainH.gain.setValueAtTime(0.001, startTime)
    gainH.gain.exponentialRampToValueAtTime(volume * 0.25, startTime + 0.015)
    gainH.gain.exponentialRampToValueAtTime(0.0001, startTime + (duration * 0.75))

    oscH.connect(gainH)
    gainH.connect(ctx.destination)
    oscH.start(startTime)
    oscH.stop(startTime + duration)
  }
}

/**
 * Send a notification to one or multiple users
 */
export async function sendInAppAlert(payload: SendNotificationPayload) {
  const {
    recipientId,
    recipientIds,
    senderId = null,
    senderName = 'Admin',
    title,
    message,
    type = 'announcement',
    priority = 'normal',
    link = null,
  } = payload

  // If specific list of recipients provided
  if (recipientIds && recipientIds.length > 0) {
    const rows = recipientIds.map(uid => ({
      recipient_id: uid,
      sender_id: senderId,
      sender_name: senderName,
      title,
      message,
      type,
      priority,
      link,
      is_read: false,
    }))
    const { data, error } = await supabase.from('notifications').insert(rows).select()
    if (error) console.error('Failed to send notifications:', error)
    return { data, error }
  }

  // Single recipient or broadcast
  const row = {
    recipient_id: recipientId || null,
    sender_id: senderId,
    sender_name: senderName,
    title,
    message,
    type,
    priority,
    link,
    is_read: false,
  }

  const { data, error } = await supabase.from('notifications').insert([row]).select()
  if (error) console.error('Failed to send notification:', error)
  return { data, error }
}

/**
 * Trigger an automated notification when a lead is assigned
 */
export async function notifyLeadAssigned({
  recipientId,
  leadId,
  leadName,
  senderName = 'System',
}: {
  recipientId: string
  leadId: string
  leadName: string
  senderName?: string
}) {
  if (!recipientId) return
  return sendInAppAlert({
    recipientId,
    senderName,
    title: '👤 New Lead Assigned',
    message: `Lead "${leadName}" has been assigned to you. Review details and begin follow-up.`,
    type: 'lead_assigned',
    priority: 'high',
    link: `/leads/${leadId}`,
  })
}

/**
 * Trigger an automated notification when a lead is marked Hot
 */
export async function notifyHotLead({
  recipientId,
  leadId,
  leadName,
}: {
  recipientId: string
  leadId: string
  leadName: string
}) {
  if (!recipientId) return
  return sendInAppAlert({
    recipientId,
    senderName: 'System Alert',
    title: '🔥 Hot Lead Alert',
    message: `Lead "${leadName}" was marked as HOT priority! Immediate call recommended.`,
    type: 'hot_lead',
    priority: 'urgent',
    link: `/leads/${leadId}`,
  })
}

/**
 * Trigger an automated notification when a lead enrolls
 */
export async function notifyLeadEnrolled({
  recipientIds,
  leadId,
  leadName,
  counselorName,
}: {
  recipientIds: string[]
  leadId: string
  leadName: string
  counselorName?: string
}) {
  return sendInAppAlert({
    recipientIds,
    senderName: 'Achievement',
    title: '🎉 Admission Enrolled!',
    message: `Congratulations! ${counselorName ? `${counselorName} converted ` : ''}"${leadName}" to Enrolled stage!`,
    type: 'conversion',
    priority: 'high',
    link: `/leads/${leadId}`,
  })
}

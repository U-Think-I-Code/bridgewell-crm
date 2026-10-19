import { supabase } from '@/lib/supabase'

export interface ActivityLogItem {
  id: string
  lead?: string | null
  user_id?: string | null
  type: string
  outcome?: string | null
  text?: string | null
  time: string
  lead_name?: string
  user_name?: string
  user_email?: string
}

export interface UserPresence {
  id: string
  name: string
  email: string
  role: string
  active?: boolean
  last_login_at?: string | null
  last_active_at?: string | null
  status?: 'online' | 'idle' | 'offline'
  today_calls?: number
  today_actions?: number
  today_active_seconds?: number
}

export interface UserSessionRecord {
  id: string
  user_id: string
  session_id: string
  login_at: string
  last_active_at: string
  logout_at?: string | null
  duration_seconds: number
  device_info?: string | null
  is_active: boolean
  user_name?: string
  user_email?: string
}

let heartbeatInterval: any = null
let idleTimer: any = null
let isUserIdle = false
let currentSessionId: string | null = null

// Initialize User Session & Heartbeat Presence
export function startUserActivityTracking(userId: string) {
  if (typeof window === 'undefined') return

  if (!currentSessionId) {
    currentSessionId = sessionStorage.getItem('bw_session_id')
    if (!currentSessionId) {
      currentSessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now()
      sessionStorage.setItem('bw_session_id', currentSessionId)
    }
  }

  const nowIso = new Date().toISOString()
  const userAgent = navigator.userAgent.substring(0, 150)

  // 1. Record / Update session in database
  const recordSession = async () => {
    try {
      // Check if session exists in user_sessions
      const { data: existing } = await supabase
        .from('user_sessions')
        .select('id, duration_seconds')
        .eq('session_id', currentSessionId)
        .eq('user_id', userId)
        .maybeSingle()

      if (!existing) {
        await supabase.from('user_sessions').insert([{
          user_id: userId,
          session_id: currentSessionId,
          login_at: nowIso,
          last_active_at: nowIso,
          duration_seconds: 0,
          device_info: userAgent,
          is_active: true
        }])

        // Also record a login activity in activities
        await supabase.from('activities').insert([{
          user_id: userId,
          type: 'login',
          text: 'User logged in and started session',
          time: nowIso
        }])
      }

      // Update user presence in users table
      await supabase.from('users').update({
        last_login_at: nowIso,
        last_active_at: nowIso,
        status: 'online'
      }).eq('id', userId)
    } catch (err) {
      console.warn('Activity tracker session init error:', err)
    }
  }

  recordSession()

  // 2. Idle detection (5 minutes without user input)
  const resetIdleTimer = () => {
    if (isUserIdle) {
      isUserIdle = false
      supabase.from('users').update({ status: 'online' }).eq('id', userId).then(() => {})
    }
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      isUserIdle = true
      supabase.from('users').update({ status: 'idle' }).eq('id', userId).then(() => {})
    }, 5 * 60 * 1000)
  }

  const userEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
  userEvents.forEach(evt => window.addEventListener(evt, resetIdleTimer, { passive: true }))
  resetIdleTimer()

  // 3. Heartbeat every 45 seconds
  if (heartbeatInterval) clearInterval(heartbeatInterval)
  heartbeatInterval = setInterval(async () => {
    try {
      const pingTime = new Date().toISOString()
      const newStatus = isUserIdle ? 'idle' : 'online'

      await supabase.from('users').update({
        last_active_at: pingTime,
        status: newStatus
      }).eq('id', userId)

      if (currentSessionId) {
        // Fetch current duration and bump by 45s
        const { data: sess } = await supabase
          .from('user_sessions')
          .select('duration_seconds')
          .eq('session_id', currentSessionId)
          .eq('user_id', userId)
          .maybeSingle()

        const currentSecs = (sess?.duration_seconds || 0) + 45
        await supabase
          .from('user_sessions')
          .update({
            last_active_at: pingTime,
            duration_seconds: currentSecs,
            is_active: true
          })
          .eq('session_id', currentSessionId)
          .eq('user_id', userId)
      }
    } catch {
      // ignore network blips
    }
  }, 45 * 1000)

  // 4. Cleanup on unload / close
  const handleUnload = () => {
    const endIso = new Date().toISOString()
    // Using beacon/fetch to mark status offline
    if (userId) {
      navigator.sendBeacon?.(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/users?id=eq.${userId}`,
        JSON.stringify({ status: 'offline', last_active_at: endIso })
      )
    }
  }

  window.addEventListener('beforeunload', handleUnload)

  return () => {
    if (heartbeatInterval) clearInterval(heartbeatInterval)
    if (idleTimer) clearTimeout(idleTimer)
    userEvents.forEach(evt => window.removeEventListener(evt, resetIdleTimer))
    window.removeEventListener('beforeunload', handleUnload)
  }
}

// Log a discrete user action
export async function logEmployeeActivity({
  userId,
  leadId,
  type,
  outcome,
  text
}: {
  userId: string
  leadId?: string | null
  type: string
  outcome?: string | null
  text: string
}) {
  try {
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase.from('activities').insert([{
      user_id: userId,
      lead: leadId || null,
      type,
      outcome: outcome || null,
      text,
      time: nowIso
    }]).select()

    // Also update users.last_active_at
    await supabase.from('users').update({
      last_active_at: nowIso,
      status: 'online'
    }).eq('id', userId)

    return { data, error }
  } catch (err) {
    console.error('Failed to log activity:', err)
    return { data: null, error: err }
  }
}

// End user session on explicit logout
export async function endUserSession(userId: string) {
  try {
    const nowIso = new Date().toISOString()
    const sessId = typeof window !== 'undefined' ? sessionStorage.getItem('bw_session_id') : null

    if (sessId) {
      await supabase.from('user_sessions').update({
        logout_at: nowIso,
        last_active_at: nowIso,
        is_active: false
      }).eq('session_id', sessId).eq('user_id', userId)
      sessionStorage.removeItem('bw_session_id')
    }

    await supabase.from('users').update({
      status: 'offline',
      last_active_at: nowIso
    }).eq('id', userId)

    await supabase.from('activities').insert([{
      user_id: userId,
      type: 'logout',
      text: 'User logged out of session',
      time: nowIso
    }])
  } catch (err) {
    console.warn('Error ending user session:', err)
  }
}

import { supabase } from '@/lib/supabase'
import { notifyCounselorLogin } from '@/lib/notifications'

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
export function startUserActivityTracking(
  userOrId: string | { id: string; name?: string; email?: string; role?: string }
) {
  if (typeof window === 'undefined') return

  const userId = typeof userOrId === 'string' ? userOrId : userOrId.id
  let userName = typeof userOrId === 'object' ? userOrId.name || '' : ''
  let userEmail = typeof userOrId === 'object' ? userOrId.email || '' : ''
  let userRole = typeof userOrId === 'object' ? userOrId.role || '' : ''

  if (!userId) return

  if (!currentSessionId) {
    currentSessionId = sessionStorage.getItem('bw_session_id')
    if (!currentSessionId) {
      currentSessionId = 'sess_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now()
      sessionStorage.setItem('bw_session_id', currentSessionId)
    }
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const todayDateStr = nowIso.split('T')[0]
  const userAgent = navigator.userAgent.substring(0, 150)

  // Format exact time for Indian Standard Time / display
  const formattedTime = now.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
  const formattedDate = now.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  // 1. Record / Update session in database
  const recordSession = async () => {
    try {
      // If user details were not passed, fetch them
      if (!userName || !userRole) {
        const { data: u } = await supabase
          .from('users')
          .select('name, email, role')
          .eq('id', userId)
          .maybeSingle()
        if (u) {
          userName = u.name || userName
          userEmail = u.email || userEmail
          userRole = u.role || userRole
        }
      }

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
      }

      // Check / record daily clock-in login activity for today
      const localTodayStr = new Date().toLocaleDateString('en-CA')
      const dailyClockInKey = `bw_clockin_${userId}_${localTodayStr}`
      const hasClockedInToday = sessionStorage.getItem(dailyClockInKey)

      if (!hasClockedInToday) {
        // Query to check if a login was already logged today in activities
        const startOfDay = new Date()
        startOfDay.setHours(0, 0, 0, 0)

        const { data: todayLoginAct } = await supabase
          .from('activities')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'login')
          .gte('time', startOfDay.toISOString())
          .limit(1)

        if (!todayLoginAct || todayLoginAct.length === 0) {
          await supabase.from('activities').insert([{
            user_id: userId,
            type: 'login',
            text: `${userName || 'Staff'} logged in at ${formattedTime} (${formattedDate})`,
            time: nowIso
          }])
          await supabase.from('users').update({
            last_login_at: nowIso
          }).eq('id', userId)
        }
        sessionStorage.setItem(dailyClockInKey, 'true')
      }

      // Daily login alert key in sessionStorage
      const alertKey = `bw_login_alert_${userId}_${todayDateStr}`
      const alreadyNotified = sessionStorage.getItem(alertKey)

      // If user is a counselor or non-manager and hasn't notified admin today in this session:
      if (userRole && userRole !== 'manager' && !alreadyNotified) {
        sessionStorage.setItem(alertKey, formattedTime)
        notifyCounselorLogin({
          counselorId: userId,
          counselorName: userName || 'Counselor',
          counselorEmail: userEmail || '',
          loginTime: formattedTime,
          loginDate: formattedDate,
        }).catch(err => {
          console.warn('Failed to dispatch counselor login alert to admin:', err)
        })
      }

      // Update user presence in users table
      try {
        await supabase.from('users').update({
          last_login_at: nowIso,
          last_active_at: nowIso,
          status: 'online'
        }).eq('id', userId)
      } catch {
        await supabase.from('users').update({
          last_active_at: nowIso,
          status: 'online'
        }).eq('id', userId)
      }
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

      // Check if day rolled over while tab was open
      const currentDay = new Date().toLocaleDateString('en-CA')
      const dailyKey = `bw_clockin_${userId}_${currentDay}`
      if (!sessionStorage.getItem(dailyKey)) {
        // Automatically clock in for the new day
        recordSession()
      }

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

    if (typeof window !== 'undefined') {
      const todayDateStr = nowIso.split('T')[0]
      sessionStorage.removeItem(`bw_login_alert_${userId}_${todayDateStr}`)
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

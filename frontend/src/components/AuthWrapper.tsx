'use client'
import { useState, useEffect, createContext, useContext } from 'react'
import { supabase } from '@/lib/supabase'
import { NotificationProvider } from '@/components/NotificationContext'
import NotificationDrawer from '@/components/NotificationDrawer'
import SendNotificationModal from '@/components/SendNotificationModal'
import NotificationToasts from '@/components/NotificationToasts'
import AutoReminderWatcher from '@/components/AutoReminderWatcher'
import { startUserActivityTracking, endUserSession } from '@/lib/activityTracker'

export const AuthContext = createContext<any>(null)
export const useAuth = () => useContext(AuthContext)

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Realtime subscription for logged-in user profile (role change, deactivation, name change)
  useEffect(() => {
    if (!profile?.id) return

    const channel = supabase
      .channel(`auth-user-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${profile.id}`
        },
        (payload: any) => {
          const updatedUser = payload.new
          if (updatedUser) {
            if (updatedUser.active === false) {
              supabase.auth.signOut()
              setUser(null)
              setProfile(null)
              setError('Your account has been deactivated. Please contact your administrator.')
            } else {
              setProfile((prev: any) => ({ ...prev, ...updatedUser }))
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  // Track session, heartbeats, and online presence
  useEffect(() => {
    if (!profile?.id) return
    const cleanup = startUserActivityTracking(profile)
    return () => {
      cleanup?.()
    }
  }, [profile?.id, profile?.name, profile?.email, profile?.role])

  const fetchProfile = async (authId: string) => {
    // Try to find user by auth_id first, then by email
    const { data: byAuthId } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single()

    if (byAuthId) {
      if (byAuthId.active === false) {
        await supabase.auth.signOut()
        setUser(null)
        setProfile(null)
        setError('Your account has been deactivated. Please contact your administrator.')
        setLoading(false)
        return
      }
      setProfile(byAuthId)
      setLoading(false)
      return
    }

    // Fallback: match by email
    const { data: session } = await supabase.auth.getSession()
    if (session?.session?.user?.email) {
      const { data: byEmail } = await supabase
        .from('users')
        .select('*')
        .eq('email', session.session.user.email)
        .single()

      if (byEmail) {
        if (byEmail.active === false) {
          await supabase.auth.signOut()
          setUser(null)
          setProfile(null)
          setError('Your account has been deactivated. Please contact your administrator.')
          setLoading(false)
          return
        }
        // Link auth_id for future sessions
        await supabase.from('users').update({ auth_id: authId }).eq('id', byEmail.id)
        setProfile(byEmail)
      }
    }
    setLoading(false)
  }

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('Invalid email or password. Please try again.')
    }
    setSubmitting(false)
  }

  const logout = async () => {
    if (profile?.id) {
      await endUserSession(profile.id)
    }
    await supabase.auth.signOut()
  }

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FDFDFD]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#FDFDFD] text-gray-900">
        <div className="bg-white border border-gray-200 p-10 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] max-w-md w-full animate-in zoom-in-95 duration-500">
          <div className="mb-8 text-center">
            <div className="w-10 h-10 bg-black rounded-xl mx-auto mb-4 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight mb-1">Bridgewell CRM</h2>
            <p className="text-gray-500 text-sm">Sign in to your account</p>
          </div>
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@bridgewell.com"
                className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 focus:ring-4 focus:ring-gray-100 focus:border-gray-400 outline-none transition-all text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white border border-gray-200 text-gray-900 rounded-lg px-4 py-2.5 focus:ring-4 focus:ring-gray-100 focus:border-gray-400 outline-none transition-all text-sm"
                required
              />
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-2.5">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-black hover:bg-gray-800 text-white py-2.5 rounded-lg text-sm font-medium transition-all mt-2 disabled:opacity-50"
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ user: profile, logout }}>
      <NotificationProvider>
        {children}
        <NotificationDrawer />
        <SendNotificationModal />
        <NotificationToasts />
        <AutoReminderWatcher />
      </NotificationProvider>
    </AuthContext.Provider>
  )
}

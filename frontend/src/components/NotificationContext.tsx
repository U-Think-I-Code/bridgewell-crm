'use client'
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import {
  NotificationItem,
  sendInAppAlert,
  SendNotificationPayload,
  playNotificationSound,
} from '@/lib/notifications'

export interface ToastItem {
  id: string
  notification: NotificationItem
}

interface NotificationContextType {
  notifications: NotificationItem[]
  unreadCount: number
  loading: boolean
  isDrawerOpen: boolean
  isSendModalOpen: boolean
  toasts: ToastItem[]
  soundEnabled: boolean
  setSoundEnabled: (enabled: boolean) => void
  openDrawer: () => void
  closeDrawer: () => void
  openSendModal: () => void
  closeSendModal: () => void
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  deleteNotification: (id: string) => Promise<void>
  clearAllNotifications: () => Promise<void>
  sendAlert: (payload: SendNotificationPayload) => Promise<any>
  dismissToast: (toastId: string) => void
  refreshNotifications: () => Promise<void>
  triggerTestToast: () => void
  testWhatsAppSound: () => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Fetch notifications for the logged-in user
  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }

    try {
      // Query notifications addressed to this user OR broadcast (recipient_id is null)
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .or(`recipient_id.eq.${user.id},recipient_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('Error fetching notifications:', error)
        return
      }

      const items = (data || []) as NotificationItem[]
      setNotifications(items)
      const unread = items.filter(n => !n.is_read).length
      setUnreadCount(unread)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  // Initial load and Realtime listener
  useEffect(() => {
    if (!user?.id) return

    fetchNotifications()

    // Realtime channel
    const channel = supabase
      .channel(`notifications-user-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
        },
        (payload: any) => {
          const newNotif = payload.new as NotificationItem

          // Check if relevant to this user
          if (newNotif.recipient_id === user.id || newNotif.recipient_id === null) {
            // Prepend to list
            setNotifications(prev => [newNotif, ...prev.filter(n => n.id !== newNotif.id)])
            setUnreadCount(prev => prev + 1)

            // Play notification sound
            if (soundEnabled) {
              playNotificationSound(newNotif.priority)
            }

            // Show floating in-app toast
            const toastId = `${newNotif.id}-${Date.now()}`
            setToasts(prev => [...prev, { id: toastId, notification: newNotif }])

            // Auto dismiss toast after 6 seconds
            setTimeout(() => {
              setToasts(prev => prev.filter(t => t.id !== toastId))
            }, 6000)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
        },
        (payload: any) => {
          const updated = payload.new as NotificationItem
          setNotifications(prev =>
            prev.map(n => (n.id === updated.id ? updated : n))
          )
          setUnreadCount(prev => {
            const nextList = notifications.map(n => (n.id === updated.id ? updated : n))
            return nextList.filter(n => !n.is_read).length
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
        },
        (payload: any) => {
          const deletedId = payload.old?.id
          if (deletedId) {
            setNotifications(prev => prev.filter(n => n.id !== deletedId))
            setUnreadCount(prev => prev > 0 ? prev - 1 : 0)
          }
        }
      )
      .subscribe()

    // 20s polling fallback for reliability
    const interval = setInterval(fetchNotifications, 20000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [user?.id, fetchNotifications, soundEnabled])

  // Mark single as read
  const markAsRead = async (id: string) => {
    // Optimistic update
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
    )
    setUnreadCount(prev => Math.max(0, prev - 1))

    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
  }

  // Mark all as read
  const markAllAsRead = async () => {
    if (!user?.id) return

    // Optimistic update
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .or(`recipient_id.eq.${user.id},recipient_id.is.null`)
      .eq('is_read', false)
  }

  // Delete notification
  const deleteNotification = async (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
    setUnreadCount(prev => {
      const target = notifications.find(n => n.id === id)
      return target && !target.is_read ? Math.max(0, prev - 1) : prev
    })

    await supabase.from('notifications').delete().eq('id', id)
  }

  // Clear all notifications for user
  const clearAllNotifications = async () => {
    if (!user?.id) return
    setNotifications([])
    setUnreadCount(0)

    await supabase
      .from('notifications')
      .delete()
      .or(`recipient_id.eq.${user.id},recipient_id.is.null`)
  }

  // Send in-app alert (accessible by managers)
  const sendAlert = async (payload: SendNotificationPayload) => {
    const result = await sendInAppAlert({
      ...payload,
      senderId: user?.id,
      senderName: user?.name || 'Manager',
    })
    await fetchNotifications()
    return result
  }

  const dismissToast = (toastId: string) => {
    setToasts(prev => prev.filter(t => t.id !== toastId))
  }

  const testWhatsAppSound = () => {
    playNotificationSound('normal')
  }

  const triggerTestToast = useCallback(() => {
    playNotificationSound('normal')
    const sampleNotif: NotificationItem = {
      id: `test-${Date.now()}`,
      recipient_id: user?.id || null,
      sender_id: null,
      sender_name: user?.name || 'Admin Manager',
      title: 'New Hot Lead Assigned: Rahul Sharma',
      message: 'Student inquired for MBA programme in Sydney, Australia. WhatsApp tone alert active!',
      type: 'lead_assigned',
      priority: 'high',
      link: '/leads',
      is_read: false,
      created_at: new Date().toISOString()
    }
    const toastId = `test-toast-${Date.now()}`
    setToasts(prev => [...prev, { id: toastId, notification: sampleNotif }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId))
    }, 6000)
  }, [user?.id, user?.name])

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        isDrawerOpen,
        isSendModalOpen,
        toasts,
        soundEnabled,
        setSoundEnabled,
        openDrawer: () => setIsDrawerOpen(true),
        closeDrawer: () => setIsDrawerOpen(false),
        openSendModal: () => setIsSendModalOpen(true),
        closeSendModal: () => setIsSendModalOpen(false),
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        sendAlert,
        dismissToast,
        refreshNotifications: fetchNotifications,
        triggerTestToast,
        testWhatsAppSound,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

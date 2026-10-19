'use client'
import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/components/NotificationContext'
import { useAuth } from '@/components/AuthWrapper'
import {
  Bell, X, CheckCheck, Trash2, Megaphone, Volume2, VolumeX,
  ExternalLink, Flame, Users, Calendar, Target, CheckCircle2,
  AlertCircle, Sparkles, Filter, ChevronRight
} from 'lucide-react'
import { NotificationItem, NotificationType } from '@/lib/notifications'

export default function NotificationDrawer() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    notifications,
    unreadCount,
    isDrawerOpen,
    closeDrawer,
    openSendModal,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    soundEnabled,
    setSoundEnabled,
  } = useNotifications()

  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'alerts' | 'leads'>('all')

  const filteredNotifications = useMemo(() => {
    switch (activeTab) {
      case 'unread':
        return notifications.filter(n => !n.is_read)
      case 'alerts':
        return notifications.filter(n =>
          n.type === 'alert' || n.type === 'announcement' || n.priority === 'urgent'
        )
      case 'leads':
        return notifications.filter(n =>
          n.type === 'lead_assigned' || n.type === 'hot_lead' || n.type === 'conversion'
        )
      default:
        return notifications
    }
  }, [notifications, activeTab])

  if (!isDrawerOpen) return null

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.is_read) {
      await markAsRead(notif.id)
    }
    if (notif.link) {
      closeDrawer()
      router.push(notif.link)
    }
  }

  const formatRelativeTime = (timestamp: string) => {
    const diffSec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
    if (diffSec < 60) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
    return new Date(timestamp).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  }

  const getIcon = (type: NotificationType, priority: string) => {
    if (priority === 'urgent') return <Flame size={15} className="text-rose-600" />
    switch (type) {
      case 'lead_assigned':
        return <Users size={15} className="text-emerald-600" />
      case 'hot_lead':
        return <Flame size={15} className="text-rose-600" />
      case 'conversion':
        return <CheckCircle2 size={15} className="text-blue-600" />
      case 'followup_due':
        return <Calendar size={15} className="text-amber-600" />
      case 'target':
        return <Target size={15} className="text-purple-600" />
      case 'alert':
        return <AlertCircle size={15} className="text-rose-600" />
      case 'announcement':
      default:
        return <Megaphone size={15} className="text-indigo-600" />
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        onClick={closeDrawer}
        className="absolute inset-0 bg-black/30 backdrop-blur-2xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-gray-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="p-5 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center">
                  <Bell size={14} />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">Notifications</h2>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                      {unreadCount} new
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Sound Toggle */}
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  title={soundEnabled ? 'Mute alert sounds' : 'Enable alert sounds'}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>

                {/* Close Button */}
                <button
                  onClick={closeDrawer}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex items-center justify-between gap-2 pt-1">
              {user?.role === 'manager' && (
                <button
                  onClick={() => {
                    closeDrawer()
                    openSendModal()
                  }}
                  className="px-3 py-1.5 bg-black hover:bg-gray-800 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <Megaphone size={12} />
                  <span>Send In-App Alert</span>
                </button>
              )}

              <div className="flex items-center gap-2 ml-auto">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1 font-medium transition-colors"
                  >
                    <CheckCheck size={13} />
                    <span>Mark all read</span>
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAllNotifications}
                    className="text-xs text-gray-400 hover:text-rose-600 flex items-center gap-1 font-medium transition-colors"
                  >
                    <Trash2 size={12} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex bg-gray-100 p-0.5 rounded-xl border border-gray-200 mt-3 text-xs">
              {(
                [
                  ['all', `All (${notifications.length})`],
                  ['unread', `Unread (${unreadCount})`],
                  ['alerts', '🚨 Alerts'],
                  ['leads', '👤 Leads'],
                ] as const
              ).map(([tabKey, tabLabel]) => (
                <button
                  key={tabKey}
                  onClick={() => setActiveTab(tabKey)}
                  className={`flex-1 py-1 rounded-lg font-medium transition-all text-center ${
                    activeTab === tabKey
                      ? 'bg-white text-gray-900 font-bold shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tabLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredNotifications.length === 0 ? (
              <div className="py-20 text-center flex flex-col items-center justify-center px-4">
                <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300 mb-3">
                  <Bell size={20} />
                </div>
                <p className="text-sm font-semibold text-gray-700">No notifications found</p>
                <p className="text-xs text-gray-400 mt-1">
                  {activeTab === 'unread'
                    ? 'You have caught up with all updates!'
                    : 'New alerts and updates will appear here in real time.'}
                </p>
              </div>
            ) : (
              filteredNotifications.map(notif => {
                const isUrgent = notif.priority === 'urgent'
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 transition-all cursor-pointer relative group flex items-start gap-3 ${
                      !notif.is_read
                        ? 'bg-blue-50/30 hover:bg-blue-50/60'
                        : 'bg-white hover:bg-gray-50/80'
                    }`}
                  >
                    {/* Unread indicator */}
                    {!notif.is_read && (
                      <span className="absolute left-1.5 top-5 w-1.5 h-1.5 rounded-full bg-blue-600" />
                    )}

                    {/* Icon container */}
                    <div
                      className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border ${
                        isUrgent
                          ? 'bg-rose-50 border-rose-200'
                          : notif.type === 'lead_assigned'
                          ? 'bg-emerald-50 border-emerald-200'
                          : notif.type === 'conversion'
                          ? 'bg-blue-50 border-blue-200'
                          : notif.type === 'followup_due'
                          ? 'bg-amber-50 border-amber-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      {getIcon(notif.type, notif.priority)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-xs font-bold text-gray-900 truncate">
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                          {formatRelativeTime(notif.created_at)}
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                        {notif.message}
                      </p>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {notif.sender_name && (
                          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            From: {notif.sender_name}
                          </span>
                        )}
                        {notif.priority === 'urgent' && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                            Urgent
                          </span>
                        )}
                        {notif.link && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 group-hover:underline">
                            Open <ExternalLink size={9} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions on hover */}
                    <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation()
                          deleteNotification(notif.id)
                        }}
                        title="Delete notification"
                        className="p-1 text-gray-400 hover:text-rose-600 hover:bg-gray-100 rounded transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3.5 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <button
              onClick={() => {
                closeDrawer()
                router.push('/notifications')
              }}
              className="text-xs font-semibold text-gray-900 hover:text-blue-600 flex items-center gap-1 transition-colors"
            >
              <span>View All Notification Center</span>
              <ChevronRight size={13} />
            </button>
            <span className="text-[10px] text-gray-400">Real-time sync active</span>
          </div>
        </div>
      </div>
    </div>
  )
}

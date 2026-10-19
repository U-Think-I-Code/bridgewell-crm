'use client'
import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/components/NotificationContext'
import { useAuth } from '@/components/AuthWrapper'
import {
  Bell, Megaphone, CheckCheck, Trash2, Search, Filter,
  ExternalLink, Flame, Users, Calendar, Target, CheckCircle2,
  AlertCircle, Volume2, VolumeX, Sparkles, Clock, RefreshCw, AlarmClock
} from 'lucide-react'
import { NotificationType, NotificationItem } from '@/lib/notifications'

export default function NotificationsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    notifications,
    unreadCount,
    loading,
    openSendModal,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
    soundEnabled,
    setSoundEnabled,
    refreshNotifications,
    triggerTestToast,
    testWhatsAppSound,
  } = useNotifications()

  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'alerts' | 'leads' | 'targets'>('all')
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await refreshNotifications()
    setTimeout(() => setRefreshing(false), 500)
  }

  const filteredList = useMemo(() => {
    let list = [...notifications]

    // Category filter
    if (activeFilter === 'unread') {
      list = list.filter(n => !n.is_read)
    } else if (activeFilter === 'alerts') {
      list = list.filter(n => n.type === 'alert' || n.type === 'announcement' || n.priority === 'urgent')
    } else if (activeFilter === 'leads') {
      list = list.filter(n => n.type === 'lead_assigned' || n.type === 'hot_lead' || n.type === 'conversion')
    } else if (activeFilter === 'targets') {
      list = list.filter(n => n.type === 'target' || n.type === 'followup_due')
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        (n.sender_name && n.sender_name.toLowerCase().includes(q))
      )
    }

    return list
  }, [notifications, activeFilter, searchQuery])

  const stats = useMemo(() => {
    return {
      total: notifications.length,
      unread: notifications.filter(n => !n.is_read).length,
      urgent: notifications.filter(n => n.priority === 'urgent').length,
      leads: notifications.filter(n => n.type === 'lead_assigned' || n.type === 'hot_lead').length,
    }
  }, [notifications])

  const getIcon = (type: NotificationType, priority: string) => {
    if (priority === 'urgent') return <Flame size={16} className="text-rose-600" />
    switch (type) {
      case 'lead_assigned':
        return <Users size={16} className="text-emerald-600" />
      case 'hot_lead':
        return <Flame size={16} className="text-rose-600" />
      case 'conversion':
        return <CheckCircle2 size={16} className="text-blue-600" />
      case 'followup_due':
        return <Calendar size={16} className="text-amber-600" />
      case 'target':
        return <Target size={16} className="text-purple-600" />
      case 'alert':
        return <AlertCircle size={16} className="text-rose-600" />
      case 'announcement':
      default:
        return <Megaphone size={16} className="text-indigo-600" />
    }
  }

  const formatRelativeTime = (timestamp: string) => {
    const diffSec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
    if (diffSec < 60) return 'Just now'
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} days ago`
    return new Date(timestamp).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFDFD]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto bg-[#FDFDFD] p-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Notifications & Alerts</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Realtime Sync
            </span>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Real-time broadcast alerts, calling targets, lead updates, and follow-up reminders.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Alert sounds active' : 'Alert sounds muted'}
            className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 text-xs font-medium"
          >
            {soundEnabled ? <Volume2 size={14} className="text-emerald-600" /> : <VolumeX size={14} className="text-gray-400" />}
            <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
          </button>

          {/* Test WhatsApp Sound Button */}
          <button
            id="test-sound-btn"
            onClick={testWhatsAppSound}
            title="Play WhatsApp tone chime"
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Volume2 size={14} className="text-emerald-600" />
            <span>Test Sound</span>
          </button>

          {/* Test Slide Toast Button */}
          <button
            id="test-slide-toast-btn"
            onClick={triggerTestToast}
            title="Simulate incoming notification sliding from right with sound"
            className="px-3 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Sparkles size={14} className="text-amber-500" />
            <span>Test Slide Toast</span>
          </button>

          {/* Test Follow-up Alarm Button */}
          <button
            id="test-followup-alarm-btn"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('trigger-test-followup-alarm', {
                  detail: {
                    id: 'test-alarm-lead',
                    name: 'PaulTekei',
                    phone: '+61451264780',
                    course: 'Master of Business Administration',
                    priority: 'Hot',
                    next_follow_up: new Date().toISOString(),
                    stage: 'Follow-up Due',
                  },
                })
              )
            }}
            title="Test continuous alarm loop (rings like an alarm until dismissed or Call Student clicked)"
            className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 rounded-xl transition-all shadow-2xs flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <AlarmClock size={14} className="text-rose-600 animate-bounce" />
            <span>Test Alarm Ring</span>
          </button>

          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
          </button>

          {/* Mark all as read */}
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs"
            >
              <CheckCheck size={14} />
              <span>Mark all read</span>
            </button>
          )}

          {/* Send Alert Button (Manager only) */}
          {user?.role === 'manager' && (
            <button
              onClick={openSendModal}
              className="px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Megaphone size={14} />
              <span>Send In-App Alert</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Total Alerts</span>
            <Bell size={14} className="text-gray-400" />
          </div>
          <span className="text-2xl font-bold text-gray-900">{stats.total}</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Unread</span>
            <AlertCircle size={14} className="text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-blue-600">{stats.unread}</span>
            <span className="text-[10px] text-gray-400">pending view</span>
          </div>
        </div>

        <div className="bg-white border border-rose-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-rose-700 font-medium">Urgent Alerts</span>
            <Flame size={14} className="text-rose-500" />
          </div>
          <span className="text-2xl font-bold text-rose-600">{stats.urgent}</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">Lead Assignments</span>
            <Users size={14} className="text-emerald-500" />
          </div>
          <span className="text-2xl font-bold text-gray-900">{stats.leads}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200 overflow-x-auto">
            {(
              [
                ['all', `All (${stats.total})`],
                ['unread', `Unread (${stats.unread})`],
                ['alerts', '🚨 Broadcast Alerts'],
                ['leads', '👤 Leads Updates'],
                ['targets', '🎯 Targets & Follow-ups'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
                  activeFilter === key
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative md:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-all"
            />
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-16 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300 mx-auto mb-3">
              <Bell size={22} />
            </div>
            <h3 className="text-sm font-semibold text-gray-800">No notifications found</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? 'No notifications match your search query.'
                : 'You are all caught up! When managers broadcast alerts or new leads are assigned, they will appear here.'}
            </p>
          </div>
        ) : (
          filteredList.map(notif => {
            const isUrgent = notif.priority === 'urgent'
            return (
              <div
                key={notif.id}
                className={`bg-white border rounded-2xl p-5 shadow-sm transition-all hover:shadow-md flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                  !notif.is_read
                    ? 'border-blue-200 ring-1 ring-blue-500/10 bg-blue-50/10'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 ${
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

                  {/* Body */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-bold text-gray-900">{notif.title}</h3>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                      )}
                      {notif.priority === 'urgent' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-100 text-rose-700 uppercase">
                          Urgent
                        </span>
                      )}
                      {notif.priority === 'high' && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 uppercase">
                          High
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-gray-600 leading-relaxed mb-3">
                      {notif.message}
                    </p>

                    <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {formatRelativeTime(notif.created_at)}
                      </span>
                      {notif.sender_name && (
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md text-[10px] font-medium">
                          Sent by: {notif.sender_name}
                        </span>
                      )}
                      {notif.link && (
                        <button
                          onClick={() => {
                            if (!notif.is_read) markAsRead(notif.id)
                            router.push(notif.link!)
                          }}
                          className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline"
                        >
                          Open Link <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="flex items-center gap-2 self-end sm:self-start shrink-0">
                  {!notif.is_read ? (
                    <button
                      onClick={() => markAsRead(notif.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:text-black bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <CheckCheck size={13} />
                      <span>Mark Read</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-400 font-medium px-2 py-1">Read</span>
                  )}

                  <button
                    onClick={() => deleteNotification(notif.id)}
                    title="Delete alert"
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

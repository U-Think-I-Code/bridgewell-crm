'use client'
import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNotifications } from '@/components/NotificationContext'
import { useAuth } from '@/components/AuthWrapper'
import {
  Bell, X, Send, Users, User, AlertTriangle, Megaphone,
  Target, Clock, Sparkles, CheckCircle2, Flame, ExternalLink
} from 'lucide-react'
import { NotificationType, NotificationPriority } from '@/lib/notifications'

interface CounselorOption {
  id: string
  name: string
  email: string
}

const PRESETS = [
  {
    title: '📞 Calling Drive Today at 3 PM',
    message: 'Team, calling drive starts at 3:00 PM sharp. Ensure all new and attempted leads are followed up.',
    type: 'target' as NotificationType,
    priority: 'high' as NotificationPriority,
    link: '/leads',
  },
  {
    title: '🔥 Immediate Focus on Hot Leads',
    message: 'High priority leads have arrived in the pipeline. Please make connected calls within 15 minutes.',
    type: 'hot_lead' as NotificationType,
    priority: 'urgent' as NotificationPriority,
    link: '/leads?priority=Hot',
  },
  {
    title: '⏰ Follow-up Clearance Alert',
    message: 'You have pending follow-up tasks due today. Please log outcomes in your My Day tab.',
    type: 'followup_due' as NotificationType,
    priority: 'high' as NotificationPriority,
    link: '/tasks',
  },
  {
    title: '🎯 Daily Target: 35 Connected Calls',
    message: 'Today target for all counselors is 35 connected calls. Check the leaderboard for live ranking!',
    type: 'target' as NotificationType,
    priority: 'normal' as NotificationPriority,
    link: '/analytics',
  },
  {
    title: '📢 Team Update & Briefing',
    message: 'New intake programs for UK & Canada universities have been added. Review details in course list.',
    type: 'announcement' as NotificationType,
    priority: 'normal' as NotificationPriority,
    link: '/leads',
  },
]

export default function SendNotificationModal() {
  const { isSendModalOpen, closeSendModal, sendAlert } = useNotifications()
  const { user } = useAuth()

  const [targetType, setTargetType] = useState<'all_counselors' | 'everyone' | 'single'>('all_counselors')
  const [selectedCounselorId, setSelectedCounselorId] = useState<string>('')
  const [counselors, setCounselors] = useState<CounselorOption[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState<NotificationType>('announcement')
  const [priority, setPriority] = useState<NotificationPriority>('normal')
  const [link, setLink] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  // Fetch counselors list for specific targeting
  useEffect(() => {
    async function fetchCounselors() {
      const { data } = await supabase
        .from('users')
        .select('id, name, email')
        .eq('active', true)
        .order('name', { ascending: true })

      if (data) {
        setCounselors(data)
        if (data.length > 0 && !selectedCounselorId) {
          setSelectedCounselorId(data[0].id)
        }
      }
    }
    if (isSendModalOpen) {
      fetchCounselors()
      setSuccess(false)
    }
  }, [isSendModalOpen])

  if (!isSendModalOpen) return null

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setTitle(preset.title)
    setMessage(preset.message)
    setType(preset.type)
    setPriority(preset.priority)
    setLink(preset.link)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !message.trim()) return

    setSubmitting(true)
    try {
      if (targetType === 'single') {
        if (!selectedCounselorId) return
        await sendAlert({
          recipientId: selectedCounselorId,
          title,
          message,
          type,
          priority,
          link: link.trim() || null,
        })
      } else if (targetType === 'all_counselors') {
        // Find all counselors
        const counselorIds = counselors
          .filter(c => c.id !== user?.id)
          .map(c => c.id)

        await sendAlert({
          recipientIds: counselorIds.length > 0 ? counselorIds : undefined,
          recipientId: counselorIds.length === 0 ? null : undefined,
          title,
          message,
          type,
          priority,
          link: link.trim() || null,
        })
      } else {
        // Everyone (broadcast: null recipient or all user ids)
        await sendAlert({
          recipientId: null,
          title,
          message,
          type,
          priority,
          link: link.trim() || null,
        })
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        closeSendModal()
        // Reset form
        setTitle('')
        setMessage('')
        setLink('')
      }, 1200)
    } catch (err) {
      console.error('Failed to send in-app alert:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-gray-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center">
              <Megaphone size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Send In-App Alert</h2>
              <p className="text-xs text-gray-500">Broadcast live alerts or assign specific instructions</p>
            </div>
          </div>
          <button
            onClick={closeSendModal}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {success ? (
            <div className="py-12 text-center flex flex-col items-center justify-center animate-in zoom-in-95">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-3">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold text-gray-900">Alert Sent Successfully!</h3>
              <p className="text-xs text-gray-500 mt-1">Recipients received the in-app notification in real time.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Presets */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-500" />
                  Quick Templates
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p, i) => (
                    <button
                      type="button"
                      key={i}
                      onClick={() => applyPreset(p)}
                      className="px-2.5 py-1 text-xs rounded-lg bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 transition-colors text-left truncate max-w-full font-medium"
                    >
                      {p.title}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Recipient Target</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetType('all_counselors')}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all text-center flex flex-col items-center gap-1 ${
                      targetType === 'all_counselors'
                        ? 'border-black bg-black text-white shadow-xs'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Users size={14} />
                    <span>All Counselors</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('everyone')}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all text-center flex flex-col items-center gap-1 ${
                      targetType === 'everyone'
                        ? 'border-black bg-black text-white shadow-xs'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Megaphone size={14} />
                    <span>Everyone</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetType('single')}
                    className={`px-3 py-2 text-xs font-medium rounded-xl border transition-all text-center flex flex-col items-center gap-1 ${
                      targetType === 'single'
                        ? 'border-black bg-black text-white shadow-xs'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <User size={14} />
                    <span>Specific Person</span>
                  </button>
                </div>

                {targetType === 'single' && (
                  <div className="mt-2.5">
                    <select
                      value={selectedCounselorId}
                      onChange={e => setSelectedCounselorId(e.target.value)}
                      className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                    >
                      {counselors.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.email})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Type & Priority */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Alert Type</label>
                  <select
                    value={type}
                    onChange={e => setType(e.target.value as NotificationType)}
                    className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                  >
                    <option value="announcement">📢 Announcement</option>
                    <option value="alert">🚨 Urgent Alert</option>
                    <option value="target">🎯 Daily Target / Goal</option>
                    <option value="followup_due">⏰ Follow-up Warning</option>
                    <option value="hot_lead">🔥 Hot Lead Focus</option>
                    <option value="system">💡 System Notice</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                  <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                    {(['normal', 'high', 'urgent'] as NotificationPriority[]).map(p => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`flex-1 py-1 text-xs font-medium rounded-lg capitalize transition-all ${
                          priority === p
                            ? p === 'urgent'
                              ? 'bg-rose-600 text-white shadow-xs font-bold'
                              : p === 'high'
                              ? 'bg-amber-500 text-white shadow-xs font-bold'
                              : 'bg-white text-gray-900 shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Calling drive starts in 30 mins"
                  className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                  required
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Message Content</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Write clear instructions or announcement details..."
                  rows={3}
                  className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl p-3 text-xs focus:ring-2 focus:ring-black outline-none resize-none"
                  required
                />
              </div>

              {/* Action Link (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center justify-between">
                  <span>Action Link (Optional)</span>
                  <span className="text-[10px] text-gray-400 font-normal">e.g. /leads or /tasks</span>
                </label>
                <input
                  type="text"
                  value={link}
                  onChange={e => setLink(e.target.value)}
                  placeholder="/leads?priority=Hot"
                  className="w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-black outline-none"
                />
              </div>

              {/* Live Preview Card */}
              {(title || message) && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3.5">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Live Alert Preview</div>
                  <div className={`p-3 rounded-lg border bg-white ${
                    priority === 'urgent' ? 'border-rose-300' : priority === 'high' ? 'border-amber-300' : 'border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-gray-900">{title || 'Alert Title'}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${
                          priority === 'urgent'
                            ? 'bg-rose-100 text-rose-700'
                            : priority === 'high'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {priority}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400">Just now</span>
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{message || 'Your message will appear here.'}</p>
                    {link && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 mt-2">
                        View link <ExternalLink size={10} />
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeSendModal}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !title.trim() || !message.trim()}
                  className="px-5 py-2 bg-black hover:bg-gray-800 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Send size={13} className={submitting ? 'animate-pulse' : ''} />
                  <span>{submitting ? 'Sending...' : 'Send Alert Now'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

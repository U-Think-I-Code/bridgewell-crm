'use client'
import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/components/NotificationContext'
import { 
  X, 
  Bell, 
  Flame, 
  ExternalLink, 
  MessageSquare, 
  ArrowUpRight,
  Sparkles,
  Users,
  Target,
  Megaphone
} from 'lucide-react'

export default function NotificationToasts() {
  const router = useRouter()
  const { toasts, dismissToast, markAsRead } = useNotifications()
  const [exitingIds, setExitingIds] = useState<Record<string, boolean>>({})

  const handleDismiss = (toastId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExitingIds(prev => ({ ...prev, [toastId]: true }))
    setTimeout(() => {
      dismissToast(toastId)
      setExitingIds(prev => {
        const next = { ...prev }
        delete next[toastId]
        return next
      })
    }, 300)
  }

  const handleOpen = (toastId: string, notif: any) => {
    markAsRead(notif.id)
    handleDismiss(toastId)
    if (notif.link) {
      router.push(notif.link)
    }
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-5 right-5 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => {
        const notif = toast.notification
        const isUrgent = notif.priority === 'urgent'
        const isExiting = exitingIds[toast.id]

        return (
          <div
            key={toast.id}
            onClick={() => handleOpen(toast.id, notif)}
            className={`pointer-events-auto bg-white/95 backdrop-blur-md border rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.14)] p-4 transition-all duration-300 cursor-pointer hover:shadow-2xl relative overflow-hidden group ${
              isExiting
                ? 'translate-x-full opacity-0'
                : 'animate-in slide-in-from-right duration-500 ease-out translate-x-0 opacity-100'
            } ${
              isUrgent
                ? 'border-rose-300 ring-2 ring-rose-500/20'
                : 'border-emerald-200/80 ring-2 ring-emerald-500/10'
            }`}
          >
            {/* Top accent line */}
            <div
              className={`absolute top-0 left-0 right-0 h-1 ${
                isUrgent
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                  : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-400'
              }`}
            />

            <div className="flex items-start gap-3">
              {/* WhatsApp-Style Glowing Icon Badge */}
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border mt-0.5 shadow-xs relative ${
                  isUrgent
                    ? 'bg-rose-50 border-rose-200 text-rose-600'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                }`}
              >
                {isUrgent ? (
                  <Flame size={18} className="animate-pulse" />
                ) : notif.type === 'lead_assigned' ? (
                  <Users size={18} />
                ) : notif.type === 'target' ? (
                  <Target size={18} />
                ) : (
                  <MessageSquare size={18} />
                )}

                {/* Pulsing presence dot */}
                <span
                  className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                    isUrgent ? 'bg-rose-500 animate-ping' : 'bg-emerald-500 animate-ping'
                  }`}
                />
              </div>

              {/* Message Details */}
              <div className="flex-1 min-w-0 pr-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                      {isUrgent ? 'Urgent Alert' : 'New Message'}
                    </span>
                    {notif.sender_name && (
                      <span className="text-[11px] font-semibold text-gray-700 truncate">
                        • {notif.sender_name}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">Just now</span>
                </div>

                <h4 className="text-xs font-bold text-gray-900 leading-snug line-clamp-1 mb-0.5">
                  {notif.title}
                </h4>

                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                  {notif.message}
                </p>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpen(toast.id, notif)
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50/80 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors border border-emerald-200/60"
                  >
                    <span>Open Details</span>
                    <ArrowUpRight size={11} />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDismiss(toast.id, e)}
                    className="text-[11px] font-medium text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors ml-auto"
                  >
                    Dismiss
                  </button>
                </div>
              </div>

              {/* Close 'X' Button */}
              <button
                type="button"
                onClick={(e) => handleDismiss(toast.id, e)}
                className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors shrink-0 -mt-1 -mr-1"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Auto dismiss countdown bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100 overflow-hidden">
              <div 
                className={`h-full ${
                  isUrgent ? 'bg-rose-500' : 'bg-emerald-500'
                } transition-all duration-[6000ms] ease-linear w-0 animate-[shrink_6s_linear_forwards]`}
                style={{
                  animation: 'shrink 6s linear forwards'
                }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

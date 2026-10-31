'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, LayoutDashboard, Users, Calendar, CalendarDays, Settings, LogOut, Search, UserCheck, BarChart3, Bell, Megaphone, ArrowLeftRight, AlarmClock, Clock, ClipboardList, GraduationCap, Phone } from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { useNotifications } from '@/components/NotificationContext'
import { canManageLeads, isManager } from '@/lib/teamHelper'
import { useCallHippoLine } from '@/lib/dialer'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { unreadCount, openDrawer, openSendModal } = useNotifications()
  const [lineConfig, updateLineConfig] = useCallHippoLine()
  const [showNumberModal, setShowNumberModal] = useState(false)
  const [tempUkNumber, setTempUkNumber] = useState('')
  const [tempUsaNumber, setTempUsaNumber] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const links = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Leads', href: '/leads', icon: Users },
    { name: 'Enrolled', href: '/enrolled', icon: GraduationCap },
    { name: 'Reminders', href: '/reminders', icon: AlarmClock },
    { name: 'Calendar', href: '/calendar', icon: CalendarDays },
    { name: 'My Day', href: '/tasks', icon: Calendar },
    { name: 'Notifications', href: '/notifications', icon: Bell, badge: unreadCount },
    { name: 'Activity Log', href: '/activity', icon: Clock, managerOnly: true },
    { name: 'Audit Trail', href: '/audit', icon: ClipboardList, managerOnly: true },
    { name: 'Reassignment', href: '/reassign', icon: ArrowLeftRight, leaderOrManager: true },
    { name: 'Analytics', href: '/analytics', icon: BarChart3, managerOnly: true },
    { name: 'Team & Attendance', href: '/team', icon: UserCheck, managerOnly: true },
    { name: 'Settings', href: '/settings', icon: Settings, managerOnly: true },
  ]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      router.push(`/leads?search=${encodeURIComponent(searchQuery)}`)
      setSearchQuery('')
    }
  }

  return (
    <aside className="w-64 bg-[#FDFDFD] flex flex-col border-r border-gray-200 relative z-20">
      <div className="p-5">
        <div className="flex items-center justify-between px-2 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black rounded flex items-center justify-center">
              <Activity className="text-white" size={14} />
            </div>
            <span className="font-semibold text-gray-900 tracking-tight">Bridgewell</span>
          </div>
          
          <button
            onClick={openDrawer}
            title="Open Notifications Drawer"
            className="relative p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <Bell size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-xs animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
        
        <form onSubmit={handleSearch} className="relative mb-4 px-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search leads..." 
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
          />
        </form>
      </div>
      
      <nav className="flex-1 px-3 space-y-1">
        {links.map((link) => {
          if ((link as any).managerOnly && !isManager(user)) return null
          if ((link as any).leaderOrManager && !canManageLeads(user)) return null
          
          const Icon = link.icon
          const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href))
          return (
            <Link key={link.name} href={link.href} className={`flex items-center justify-between px-3 py-2 rounded-md font-medium transition-all text-sm ${isActive ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}>
              <div className="flex items-center gap-3">
                <Icon size={16} className={isActive ? 'text-gray-900' : 'text-gray-400'} />
                <span>{link.name}</span>
              </div>
              {Boolean((link as any).badge && (link as any).badge > 0) && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-600">
                  {(link as any).badge > 9 ? '9+' : (link as any).badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Quick Send In-App Alert button for Managers */}
      {user?.role === 'manager' && (
        <div className="px-3 mb-2">
          <button
            onClick={openSendModal}
            className="w-full py-2 px-3 bg-white hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-semibold text-gray-800 transition-all flex items-center justify-center gap-2 shadow-2xs group"
          >
            <Megaphone size={14} className="text-rose-500 group-hover:scale-110 transition-transform" />
            <span>Send In-App Alert</span>
          </button>
        </div>
      )}
      {/* CallHippo Outbound Line Switcher (UK vs USA Line) */}
      <div className="px-3 mb-2">
        <div className="bg-white border border-gray-200 rounded-xl p-2.5 shadow-2xs">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              CallHippo Line
            </span>
            <button
              type="button"
              onClick={() => {
                setTempUkNumber(lineConfig.ukNumber || '')
                setTempUsaNumber(lineConfig.usaNumber || '')
                setShowNumberModal(true)
              }}
              className="text-[10px] text-gray-400 hover:text-emerald-700 transition-colors p-0.5 rounded cursor-pointer"
              title="Configure My Assigned UK & USA CallHippo Numbers"
            >
              <Settings size={12} />
            </button>
          </div>

          {/* 3-way Line Switcher */}
          <div className="grid grid-cols-3 gap-1 bg-gray-100/90 p-0.5 rounded-lg border border-gray-200/60 mb-2">
            <button
              type="button"
              onClick={() => updateLineConfig({ activeLine: 'uk' })}
              className={`py-1 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                lineConfig.activeLine === 'uk'
                  ? 'bg-white text-blue-700 shadow-2xs font-bold border border-blue-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Outgoing calls connect using UK Number (+44)"
            >
              <span>🇬🇧 UK</span>
            </button>
            <button
              type="button"
              onClick={() => updateLineConfig({ activeLine: 'usa' })}
              className={`py-1 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                lineConfig.activeLine === 'usa'
                  ? 'bg-white text-emerald-700 shadow-2xs font-bold border border-emerald-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Outgoing calls connect using USA Number (+1)"
            >
              <span>🇺🇸 USA</span>
            </button>
            <button
              type="button"
              onClick={() => updateLineConfig({ activeLine: 'auto' })}
              className={`py-1 px-1 rounded-md text-[10px] font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                lineConfig.activeLine === 'auto'
                  ? 'bg-white text-purple-700 shadow-2xs font-bold border border-purple-200'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Smart Auto: USA leads use USA line; UK/EU leads use UK line"
            >
              <span>⚡ Auto</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-gray-500 pt-1 border-t border-gray-100">
            <span className="font-medium truncate max-w-[130px]">
              {lineConfig.activeLine === 'uk' ? '🇬🇧 UK Line (+44)' : lineConfig.activeLine === 'usa' ? '🇺🇸 USA Line (+1)' : '⚡ Auto-match'}
            </span>
            <a
              href="https://dialer.callhippo.com/dial"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-700 font-semibold hover:underline shrink-0"
              title="Open CallHippo Web Dialer"
            >
              Dialer &rarr;
            </a>
          </div>
        </div>
      </div>

      {/* Configure Assigned CallHippo Numbers Modal */}
      {showNumberModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl border border-gray-100 animate-scale-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <Phone size={14} className="text-emerald-600" />
                <span>My CallHippo Numbers</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowNumberModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3 leading-relaxed">
              Agar CallHippo me aapke paas do alag numbers hain (UK and USA), to yahan save kar lijiye. Call lagane par wahi number se call jayegi.
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  🇬🇧 UK Virtual Number (e.g. +447123456789)
                </label>
                <input
                  type="text"
                  value={tempUkNumber}
                  onChange={(e) => setTempUkNumber(e.target.value)}
                  placeholder="+44..."
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">
                  🇺🇸 USA Virtual Number (e.g. +12025550123)
                </label>
                <input
                  type="text"
                  value={tempUsaNumber}
                  onChange={(e) => setTempUsaNumber(e.target.value)}
                  placeholder="+1..."
                  className="w-full text-xs px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 font-mono"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNumberModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  updateLineConfig({ ukNumber: tempUkNumber.trim(), usaNumber: tempUsaNumber.trim() })
                  setShowNumberModal(false)
                }}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs"
              >
                Save Numbers
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="p-3 mx-3 mt-auto mb-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
        {/* Avatar with initials */}
        <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-bold shrink-0 tracking-wide">
          {user?.name?.slice(0, 2).toUpperCase() || 'U'}
        </div>
        <div className="flex flex-col overflow-hidden flex-1 min-w-0">
          <span className="text-sm font-semibold text-gray-900 truncate leading-tight">{user?.name}</span>
          <span className="text-xs text-gray-400 capitalize leading-tight">{user?.role}</span>
        </div>
        <button onClick={logout} title="Sign out" className="text-gray-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50 shrink-0">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  )
}

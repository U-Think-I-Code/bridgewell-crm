'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, LayoutDashboard, Users, Calendar, CalendarDays, Settings, LogOut, Search, UserCheck, BarChart3, Bell, Megaphone, ArrowLeftRight, AlarmClock, Clock, ClipboardList, GraduationCap } from 'lucide-react'
import { useAuth } from '@/components/AuthWrapper'
import { useNotifications } from '@/components/NotificationContext'

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout } = useAuth()
  const { unreadCount, openDrawer, openSendModal } = useNotifications()
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
    { name: 'Reassignment', href: '/reassign', icon: ArrowLeftRight, managerOnly: true },
    { name: 'Analytics', href: '/analytics', icon: BarChart3, managerOnly: true },
    { name: 'Team', href: '/team', icon: UserCheck, managerOnly: true },
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
          if ((link as any).managerOnly && user?.role === 'counselor') return null
          
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

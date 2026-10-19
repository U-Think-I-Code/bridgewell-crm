'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthWrapper'
import Link from 'next/link'
import { 
  GraduationCap, Search, Phone, MessageCircle, Mail, ArrowRight, 
  Users, CheckCircle2, Award, BookOpen, Globe, Calendar, Download, RefreshCw, Sparkles 
} from 'lucide-react'
import { openJustCallDialer, getJustCallDialerUrl } from '@/lib/justcall'

interface EnrolledStudent {
  id: string
  name: string
  email: string
  phone: string
  stage: string
  course: string | null
  programme_level: string | null
  country: string | null
  source: string | null
  created_at: string
  owner_id: string | null
  owner?: { name: string } | null
  last_call_outcome: string | null
  priority: string | null
}

export default function EnrolledStudentsPage() {
  const { user } = useAuth()
  const [students, setStudents] = useState<EnrolledStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('ALL')

  useEffect(() => {
    fetchEnrolledStudents()

    // Realtime listener for newly enrolled students
    const channel = supabase
      .channel('enrolled-students-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchEnrolledStudents()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const fetchEnrolledStudents = async () => {
    setLoading(true)
    let query = supabase
      .from('leads')
      .select('*, owner:owner_id(name)')
      .eq('stage', 'Enrolled')
      .order('created_at', { ascending: false })

    if (user?.role === 'counselor') {
      query = query.eq('owner_id', user.id)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching enrolled students:', error)
    } else {
      setStudents(data || [])
    }
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchEnrolledStudents()
    setRefreshing(false)
  }

  // Countries list for filter
  const countries = Array.from(
    new Set(students.map(s => s.country).filter(Boolean) as string[])
  )

  // Filtered students
  const filteredStudents = students.filter(s => {
    if (selectedCountry !== 'ALL' && s.country !== selectedCountry) {
      return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const matchName = s.name?.toLowerCase().includes(q)
      const matchEmail = s.email?.toLowerCase().includes(q)
      const matchPhone = s.phone?.toLowerCase().includes(q)
      const matchCourse = s.course?.toLowerCase().includes(q)
      const matchOwner = s.owner?.name?.toLowerCase().includes(q)
      return matchName || matchEmail || matchPhone || matchCourse || matchOwner
    }
    return true
  })

  // Export enrolled students to CSV
  const exportToCSV = () => {
    if (filteredStudents.length === 0) return
    const headers = ['Student Name', 'Phone', 'Email', 'Course', 'Level', 'Country', 'Counselor', 'Source', 'Date Added']
    const rows = filteredStudents.map(s => [
      `"${s.name || ''}"`,
      `"${s.phone || ''}"`,
      `"${s.email || ''}"`,
      `"${s.course || ''}"`,
      `"${s.programme_level || ''}"`,
      `"${s.country || ''}"`,
      `"${s.owner?.name || 'Unassigned'}"`,
      `"${s.source || ''}"`,
      `"${new Date(s.created_at).toLocaleDateString()}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `Bridgewell_Enrolled_Students_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex flex-col h-full bg-[#FDFDFD]">
      {/* Top Header */}
      <header className="px-8 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white z-10 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
              <GraduationCap size={13} className="text-emerald-700" />
              <span>Admissions Archive</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Sync
            </span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span>Enrolled Students</span>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
              {filteredStudents.length} {filteredStudents.length === 1 ? 'student' : 'students'}
            </span>
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Students who completed admissions & enrollment (kept separate from active calling leads).
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/leads"
            className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-all shadow-2xs flex items-center gap-1.5"
          >
            <Users size={14} className="text-gray-500" />
            <span>Go to Active Leads</span>
          </Link>

          <button
            onClick={exportToCSV}
            disabled={filteredStudents.length === 0}
            className="px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700 rounded-xl text-xs font-semibold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
            title="Download CSV report of enrolled students"
          >
            <Download size={14} className="text-gray-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleRefresh}
            className="p-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-600 rounded-xl transition-all shadow-2xs cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-black' : ''} />
          </button>
        </div>
      </header>

      {/* Metrics Banner */}
      <div className="px-8 py-4 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-teal-500/10 border-b border-emerald-200/80 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/80 backdrop-blur-xs border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <GraduationCap size={20} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Total Enrolled</p>
              <p className="text-xl font-bold text-gray-900">{students.length} Students</p>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xs border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-teal-800 uppercase tracking-wider">Status</p>
              <p className="text-xl font-bold text-gray-900">100% Converted</p>
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-xs border border-emerald-200 rounded-xl p-3.5 flex items-center gap-3.5 shadow-2xs">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
              <Award size={18} />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-indigo-800 uppercase tracking-wider">Pipeline Separation</p>
              <p className="text-xs font-semibold text-indigo-950 mt-1">Excluded from Active Calls</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="px-8 py-3 bg-white border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by student name, course, counselor, phone..."
              className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black focus:bg-white text-gray-900"
            />
          </div>
        </div>

        {countries.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">Destination:</span>
            <select
              value={selectedCountry}
              onChange={e => setSelectedCountry(e.target.value)}
              className="bg-white border border-gray-200 text-gray-700 text-xs rounded-lg px-2.5 py-1.5 font-medium outline-none shadow-2xs"
            >
              <option value="ALL">All Countries</option>
              {countries.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto p-8">
        {loading ? (
          <div className="flex justify-center mt-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center max-w-lg mx-auto shadow-xs mt-8">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={28} />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">
              {searchQuery ? 'No matching enrolled students' : 'No Enrolled Students Yet'}
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-6">
              {searchQuery
                ? 'Try adjusting your search keyword or country filter.'
                : 'When a counselor marks a lead as "Enrolled" in their profile, the student will automatically move here and be removed from the active calling pipeline!'}
            </p>
            <Link
              href="/leads"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-black hover:bg-gray-800 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
            >
              <Users size={14} />
              <span>Go to Active Leads Pipeline</span>
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xs overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/80 border-b border-gray-200 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Student Name</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Course / Programme</th>
                  <th className="px-6 py-3.5">Destination</th>
                  <th className="px-6 py-3.5">Contact</th>
                  <th className="px-6 py-3.5">Counselor</th>
                  <th className="px-6 py-3.5">Enrolled On</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredStudents.map(student => (
                  <tr key={student.id} className="hover:bg-emerald-50/30 transition-colors group">
                    {/* Student Name */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <Link
                          href={`/leads/${student.id}`}
                          className="font-bold text-gray-900 hover:text-emerald-700 hover:underline flex items-center gap-1.5"
                        >
                          <span>{student.name}</span>
                        </Link>
                        {student.source && (
                          <span className="text-[11px] text-gray-400 font-normal mt-0.5">
                            via {student.source}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                        <span>🎓 Enrolled</span>
                      </span>
                    </td>

                    {/* Course */}
                    <td className="px-6 py-4 text-xs">
                      {student.course ? (
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800">{student.course}</span>
                          {student.programme_level && (
                            <span className="text-[11px] text-gray-500 font-medium">{student.programme_level}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Not Specified</span>
                      )}
                    </td>

                    {/* Destination Country */}
                    <td className="px-6 py-4 text-xs font-medium text-gray-700">
                      {student.country ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-100 text-gray-800 text-xs font-medium">
                          <Globe size={11} className="text-gray-500" />
                          <span>{student.country}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Contact details */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-800">{student.phone}</span>
                          <a
                            href={getJustCallDialerUrl(student.phone)}
                            onClick={(e) => openJustCallDialer(student.phone, e)}
                            className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 rounded transition-colors cursor-pointer"
                            title="Call via JustCall"
                          >
                            <Phone size={12} />
                          </a>
                          <a
                            href={`https://wa.me/${student.phone.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded transition-colors"
                            title="Chat on WhatsApp"
                          >
                            <MessageCircle size={12} />
                          </a>
                        </div>
                        {student.email && (
                          <span className="text-[11px] text-gray-400 truncate max-w-[180px]">
                            {student.email}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Counselor */}
                    <td className="px-6 py-4">
                      {student.owner?.name ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                          <span>{student.owner.name}</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Unassigned</span>
                      )}
                    </td>

                    {/* Enrolled On */}
                    <td className="px-6 py-4 text-xs text-gray-500 font-medium">
                      {new Date(student.created_at).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>

                    {/* View Details Button */}
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/leads/${student.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-emerald-600 hover:text-white text-gray-700 border border-gray-200 hover:border-emerald-600 rounded-lg text-xs font-semibold transition-all shadow-2xs group/btn"
                      >
                        <span>View</span>
                        <ArrowRight size={12} className="group-hover/btn:translate-x-0.5 transition-transform" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

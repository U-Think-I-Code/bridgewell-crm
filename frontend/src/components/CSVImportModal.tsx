'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  X, Upload, CheckCircle2, Users, Shuffle, Check, 
  AlertCircle, FileSpreadsheet, UserCheck, ChevronDown, ChevronUp,
  Sparkles, Layers, Eye
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { resolveCountryName, inferCountryFromPhone } from '@/lib/countryHelper'

interface Counselor {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

// Convert column header to clean human-readable title
function cleanHeaderTitle(raw: string): string {
  if (!raw) return 'Field'
  const clean = raw.trim()
  const lower = clean.toLowerCase().replace(/[^a-z0-9]/g, '')
  
  if (lower.includes('i20') || lower.includes('i-20')) return 'I-20 Received From US University?'
  if (lower.includes('sevis')) return 'SEVIS I-901 Fee Paid?'
  if (lower.includes('whichusuniversity') || lower.includes('admitted')) return 'Admitted US University'
  if (lower.includes('onlineoffline') || lower === 'mode' || lower === 'campus') return 'Campus Mode (Online / Offline)'
  if (lower.includes('programinterestedin') || lower === 'programme' || lower === 'course') return 'Program Interested In'
  
  // Format underscores or dashes into Title Case
  return clean
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// Format values nicely and prevent CSV formula injection
function formatFieldValue(val: any): string {
  if (val === null || val === undefined) return ''
  let str = String(val).trim()
  
  // Security: prevent CSV formula injection (=, +, -, @)
  if (/^[=+\-@\t\r]/.test(str) && !/^\+?\d+$/.test(str)) {
    str = `'` + str
  }

  if (str.toLowerCase() === 'on_campus') return 'On Campus'
  if (str.toLowerCase() === 'both') return 'Both (Online & Campus)'
  if (str.toLowerCase() === 'online') return 'Online'
  if (str.toLowerCase() === 'yes') return 'Yes'
  if (str.toLowerCase() === 'no') return 'No'
  return str
}

export default function CSVImportModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  const [previewRows, setPreviewRows] = useState<string[][]>([])
  
  // Detected mappings (dbField -> headerIndex)
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({})
  
  // Counselors state
  const [counselors, setCounselors] = useState<Counselor[]>([])
  const [selectedCounselorIds, setSelectedCounselorIds] = useState<string[]>([])
  const [distributeEqually, setDistributeEqually] = useState(true)
  const [showCounselorList, setShowCounselorList] = useState(false)
  const [showMappingDetails, setShowMappingDetails] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [successData, setSuccessData] = useState<{
    total: number
    distributed: Record<string, number>
  } | null>(null)

  const CORE_FIELDS = [
    { db: 'name', label: 'Full Name', required: true },
    { db: 'phone', label: 'Phone Number', required: true },
    { db: 'email', label: 'Email Address', required: false },
    { db: 'course', label: 'Program / Course', required: false },
    { db: 'country', label: 'Country / Location', required: false },
    { db: 'campus_mode', label: 'Campus Mode (Online/Offline)', required: false },
    { db: 'highest_qualification', label: 'Highest Qualification', required: false },
    { db: 'source', label: 'Campaign / Source', required: false },
  ]

  useEffect(() => {
    fetchCounselors()
  }, [])

  const fetchCounselors = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role, active')
      .eq('active', true)
      .eq('role', 'counselor')
      .order('name', { ascending: true })

    if (data && data.length > 0) {
      setCounselors(data)
      setSelectedCounselorIds(data.map(c => c.id))
    } else {
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, name, email, role, active')
        .eq('active', true)
        .order('name', { ascending: true })
      
      const nonAdmins = (allUsers || []).filter(u => u.role !== 'manager')
      if (nonAdmins.length > 0) {
        setCounselors(nonAdmins)
        setSelectedCounselorIds(nonAdmins.map(c => c.id))
      }
    }
  }

  // Automatic smart matcher for headers
  const detectMappings = (headers: string[]): Record<string, number> => {
    const map: Record<string, number> = {}
    const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '')

    headers.forEach((h, idx) => {
      const norm = normalize(h)

      // Name
      if (map.name === undefined && (
        norm === 'name' || norm === 'fullname' || norm === 'studentname' || 
        norm === 'first_name' || norm === 'firstname' || norm === 'leadname' || 
        norm === 'clientname' || norm === 'applicantname'
      )) {
        map.name = idx
      }

      // Phone
      else if (map.phone === undefined && (
        norm === 'phone' || norm === 'phonenumber' || norm === 'contact' || 
        norm === 'contactnumber' || norm === 'mobile' || norm === 'mobilenumber' || 
        norm === 'whatsapp' || norm === 'telephone' || norm === 'cell'
      )) {
        map.phone = idx
      }

      // Email
      else if (map.email === undefined && (
        norm === 'email' || norm === 'emailaddress' || norm === 'mail' || norm === 'e-mail'
      )) {
        map.email = idx
      }

      // Course / Program
      else if (map.course === undefined && (
        norm.includes('programinterestedin') || norm === 'programme' || 
        norm === 'program' || norm === 'course' || norm === 'programmelevel' ||
        norm === 'degree' || norm.includes('courseinterested')
      )) {
        map.course = idx
      }

      // Country
      else if (map.country === undefined && (
        norm === 'country' || norm === 'targetcountry' || norm === 'preferredcountry' || 
        norm === 'location' || norm === 'nationality' || norm === 'countrycode'
      )) {
        map.country = idx
      }

      // Campus Mode (Online/Offline)
      else if (map.campus_mode === undefined && (
        norm.includes('onlineoffline') || norm === 'campus' || 
        norm === 'studymode' || norm === 'mode' || norm === 'attendance'
      )) {
        map.campus_mode = idx
      }

      // Qualification
      else if (map.highest_qualification === undefined && (
        norm === 'qualification' || norm === 'highestqualification' || 
        norm === 'education' || norm === 'degreelevel'
      )) {
        map.highest_qualification = idx
      }

      // Source / Campaign
      else if (map.source === undefined && (
        norm === 'source' || norm === 'leadsource' || norm === 'campaign' || 
        norm === 'campaignname' || norm === 'adname' || norm === 'formname'
      )) {
        map.source = idx
      }
    })

    return map
  }

  // File Upload Handler (Supports .xlsx, .xls, .csv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return
    setFile(uploadedFile)
    setLoading(true)

    try {
      const buffer = await uploadedFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const firstSheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[firstSheetName]

      // Convert to array of rows
      const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '',
        blankrows: false 
      })

      if (rawRows.length > 1) {
        // Headers are the first row, trimmed
        const headers = (rawRows[0] || []).map((h: any) => String(h || '').trim())
        // Data rows
        const dataRows = rawRows.slice(1).filter((r: any[]) => r.some((c: any) => String(c || '').trim() !== ''))
          .map(row => row.map(cell => String(cell || '').trim()))

        setFileHeaders(headers)
        setCsvRows(dataRows)
        setPreviewRows(dataRows.slice(0, 3))

        // Run smart detection
        const detected = detectMappings(headers)
        setColumnMapping(detected)
      } else {
        alert('File appears to be empty or missing data rows.')
        setFile(null)
      }
    } catch (err: any) {
      console.error('File parsing error:', err)
      alert('Failed to parse spreadsheet: ' + (err.message || 'Unknown error'))
      setFile(null)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleCounselor = (id: string) => {
    if (selectedCounselorIds.includes(id)) {
      if (selectedCounselorIds.length === 1) {
        alert('At least one counselor must be selected for distribution.')
        return
      }
      setSelectedCounselorIds(selectedCounselorIds.filter(cId => cId !== id))
    } else {
      setSelectedCounselorIds([...selectedCounselorIds, id])
    }
  }

  const handleSelectAllCounselors = () => {
    if (selectedCounselorIds.length === counselors.length) {
      setSelectedCounselorIds([counselors[0].id])
    } else {
      setSelectedCounselorIds(counselors.map(c => c.id))
    }
  }

  const handleStartImport = async () => {
    if (!csvRows.length) return
    setImporting(true)
    setImportProgress(0)

    try {
      const activeTargets = counselors.filter(c => selectedCounselorIds.includes(c.id))
      const shuffledTargets = [...activeTargets].sort(() => Math.random() - 0.5)

      const distributionStats: Record<string, number> = {}
      shuffledTargets.forEach(c => {
        distributionStats[c.id] = 0
      })

      const nameIdx = columnMapping.name
      const phoneIdx = columnMapping.phone

      if (nameIdx === undefined || phoneIdx === undefined) {
        alert('Please map at least Name and Phone columns before importing.')
        setImporting(false)
        return
      }

      // Build payload for all rows
      const payload = csvRows.map((row, idx) => {
        let rawName = row[nameIdx] || 'Lead'
        let rawPhone = row[phoneIdx] || ''

        // Clean phone: strip 'p:', whitespace, parentheses, dashes
        let cleanedPhone = rawPhone.replace(/^p:/i, '').replace(/[^\d+]/g, '')
        if (cleanedPhone && !cleanedPhone.startsWith('+')) {
          cleanedPhone = '+' + cleanedPhone
        }

        const rawEmail = columnMapping.email !== undefined ? row[columnMapping.email] : ''
        const rawCourse = columnMapping.course !== undefined ? row[columnMapping.course] : ''
        const rawCountry = columnMapping.country !== undefined ? row[columnMapping.country] : ''
        const rawCampus = columnMapping.campus_mode !== undefined ? row[columnMapping.campus_mode] : ''
        const rawQual = columnMapping.highest_qualification !== undefined ? row[columnMapping.highest_qualification] : ''
        const rawSource = columnMapping.source !== undefined ? row[columnMapping.source] : (file?.name ? `CSV: ${file.name}` : 'CSV Import')

        // Campaign form details dictionary
        const campaignAnswers: Record<string, string> = {}
        const rawMetadata: Record<string, any> = {}

        fileHeaders.forEach((header, colIndex) => {
          const val = row[colIndex]
          if (val) {
            const cleanTitle = cleanHeaderTitle(header)
            const cleanVal = formatFieldValue(val)
            campaignAnswers[cleanTitle] = cleanVal
            rawMetadata[header] = val
          }
        })

        const isVisaFile = (file?.name || '').toLowerCase().includes('visa') || 
                           String(rawSource || '').toLowerCase().includes('visa') ||
                           campaignAnswers['SEVIS I-901 Fee Paid?'] !== undefined ||
                           campaignAnswers['I-20 Received From US University?'] !== undefined
        const inferredServiceType = isVisaFile ? 'visa_process' : 'study_abroad'

        // Standard lead record
        const record: any = {
          name: rawName,
          phone: cleanedPhone,
          email: rawEmail || null,
          course: rawCourse ? formatFieldValue(rawCourse) : null,
          programme_level: rawCourse ? formatFieldValue(rawCourse) : null,
          country: rawCountry ? resolveCountryName(rawCountry) : (inferCountryFromPhone(cleanedPhone) || null),
          highest_qualification: rawQual || null,
          source: rawSource,
          stage: 'New',
          metadata: {
            ...rawMetadata,
            service_type: inferredServiceType,
            campaign_answers: campaignAnswers,
            campus_mode: rawCampus ? formatFieldValue(rawCampus) : null,
            imported_file: file?.name || 'Spreadsheet',
            imported_at: new Date().toISOString()
          },
          created_at: new Date().toISOString()
        }

        // Round-robin counselor distribution
        if (distributeEqually && shuffledTargets.length > 0) {
          const target = shuffledTargets[idx % shuffledTargets.length]
          record.owner_id = target.id
          distributionStats[target.id] = (distributionStats[target.id] || 0) + 1
        } else {
          record.owner_id = null
        }

        return record
      })

      // Insert in batches of 100
      const batchSize = 100
      const insertedLeads: any[] = []

      for (let i = 0; i < payload.length; i += batchSize) {
        const batch = payload.slice(i, i + batchSize)
        const { data: insertedBatch, error } = await supabase
          .from('leads')
          .insert(batch)
          .select('id, owner_id')

        if (error) {
          throw new Error('Supabase insert failed: ' + error.message)
        }
        if (insertedBatch) {
          insertedLeads.push(...insertedBatch)
        }
        setImportProgress(Math.round(((i + batch.length) / payload.length) * 100))
      }

      // Log bulk assignment activities
      if (insertedLeads.length > 0 && distributeEqually && shuffledTargets.length > 0) {
        const counselorMap: Record<string, string> = {}
        counselors.forEach(c => { counselorMap[c.id] = c.name })

        const activities = insertedLeads
          .filter(l => l.owner_id)
          .map(l => ({
            lead: l.id,
            user_id: l.owner_id,
            type: 'assignment',
            text: `Assigned to ${counselorMap[l.owner_id] || 'Counselor'} via auto-distribution on Excel/CSV upload`,
            time: new Date().toISOString()
          }))

        for (let i = 0; i < activities.length; i += batchSize) {
          await supabase.from('activities').insert(activities.slice(i, i + batchSize))
        }
      }

      setSuccessData({
        total: payload.length,
        distributed: distributionStats
      })

    } catch (err: any) {
      alert('Error during lead import: ' + (err.message || 'Unknown error'))
    } finally {
      setImporting(false)
    }
  }

  const activeSelectedCounselors = counselors.filter(c => selectedCounselorIds.includes(c.id))

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">Import Leads from Excel / CSV</h3>
              <p className="text-xs text-gray-500">Auto-detects campaign headings &amp; distributes leads to counselors</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-900 transition-colors p-1.5 hover:bg-gray-100 rounded-lg cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        {successData !== null ? (
          /* Success Screen */
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 overflow-y-auto">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-100 animate-in zoom-in-75 shadow-xs">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                {successData.total} Leads Imported Successfully!
              </h2>
              <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
                {distributeEqually && activeSelectedCounselors.length > 0
                  ? `All leads with their complete campaign details have been divided equally among your ${activeSelectedCounselors.length} counselors.`
                  : 'All leads and campaign questions have been saved to your pipeline.'}
              </p>
            </div>

            {/* Distribution Breakdown */}
            {distributeEqually && activeSelectedCounselors.length > 0 && (
              <div className="w-full bg-gray-50 border border-gray-200 rounded-2xl p-4 text-left">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Users size={14} className="text-gray-500" />
                  <span>Counselor Distribution Breakdown</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {activeSelectedCounselors.map(c => {
                    const count = successData.distributed[c.id] || 0
                    return (
                      <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-2.5 flex items-center justify-between text-xs shadow-2xs">
                        <span className="font-semibold text-gray-900 truncate mr-2">{c.name}</span>
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">
                          {count} leads
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                onSuccess()
                onClose()
              }}
              className="w-full bg-black hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-sm cursor-pointer"
            >
              Done &amp; View Leads
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            
            {/* Step 1: File Upload */}
            {!file ? (
              <div className="border-2 border-dashed border-gray-300 hover:border-black rounded-2xl p-10 text-center hover:bg-gray-50/50 transition-all relative cursor-pointer group">
                <input 
                  type="file" 
                  accept=".csv, .xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                  onChange={handleFileUpload} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                />
                <div className="w-14 h-14 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-black group-hover:text-white transition-all shadow-xs">
                  <Upload size={24} />
                </div>
                <h4 className="text-sm font-bold text-gray-900 mb-1">Click or drag your Excel (.xlsx / .xls) or CSV here</h4>
                <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
                  Supports any sheet from Facebook Ads, Google Ads, or custom campaigns with columns like <em>Program Interested In</em>, <em>Online/Offline</em>, <em>I-20 status</em>, <em>Contact</em>, etc.
                </p>
                <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <Sparkles size={12} />
                  <span>All campaign headings &amp; questions are saved automatically</span>
                </div>
              </div>
            ) : (
              /* File Loaded View */
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                      <FileSpreadsheet size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-gray-900">{file.name}</h4>
                      <p className="text-xs text-gray-500">
                        <strong>{csvRows.length}</strong> leads ready • <strong>{fileHeaders.length}</strong> sheet columns
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null)
                      setCsvRows([])
                      setFileHeaders([])
                      setPreviewRows([])
                    }}
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold cursor-pointer px-2.5 py-1 rounded-lg hover:bg-rose-50"
                  >
                    Change File
                  </button>
                </div>

                {/* Auto-detected Column Mapping Card */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-blue-600" />
                      <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                        Auto-Detected Column Mapping
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowMappingDetails(!showMappingDetails)}
                      className="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showMappingDetails ? 'Hide Mapping' : 'Customize Mapping'}</span>
                      {showMappingDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-800 border border-gray-200 font-medium">
                      👤 Name: <strong>{columnMapping.name !== undefined ? fileHeaders[columnMapping.name] : 'Not mapped'}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                      📞 Phone: <strong>{columnMapping.phone !== undefined ? fileHeaders[columnMapping.phone] : 'Not mapped'}</strong>
                    </span>
                    {columnMapping.course !== undefined && (
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                        🎓 Program: <strong>{fileHeaders[columnMapping.course]}</strong>
                      </span>
                    )}
                    {columnMapping.country !== undefined && (
                      <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200 font-medium">
                        🌍 Country: <strong>{fileHeaders[columnMapping.country]}</strong>
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                      📋 {fileHeaders.length} Details Preserved in Profile
                    </span>
                  </div>

                  {/* Detailed Mapping Dropdowns */}
                  {showMappingDetails && (
                    <div className="pt-3 border-t border-gray-100 grid grid-cols-2 gap-3 text-xs animate-fade-in">
                      {CORE_FIELDS.map(f => (
                        <div key={f.db}>
                          <label className="block text-[11px] font-bold text-gray-600 mb-1">
                            {f.label} {f.required && <span className="text-rose-500">*</span>}
                          </label>
                          <select
                            value={columnMapping[f.db] !== undefined ? columnMapping[f.db] : ''}
                            onChange={(e) => {
                              const rawVal = e.target.value
                              setColumnMapping(prev => {
                                const next = { ...prev }
                                if (rawVal === '') {
                                  delete next[f.db]
                                } else {
                                  next[f.db] = Number(rawVal)
                                }
                                return next
                              })
                            }}
                            className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-black"
                          >
                            <option value="">-- Do Not Map --</option>
                            {fileHeaders.map((h, i) => (
                              <option key={i} value={i}>{h}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sample Data Preview Table */}
                  {previewRows.length > 0 && (
                    <div className="mt-2 border border-gray-100 rounded-xl overflow-hidden">
                      <div className="bg-gray-50/80 px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1.5">
                        <Eye size={12} />
                        <span>Sheet Preview (First {previewRows.length} rows)</span>
                      </div>
                      <div className="overflow-x-auto max-h-36">
                        <table className="w-full text-[11px] text-left">
                          <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
                            <tr>
                              {fileHeaders.map((h, i) => (
                                <th key={i} className="px-3 py-1.5 whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 font-mono text-[10px]">
                            {previewRows.map((r, rIdx) => (
                              <tr key={rIdx} className="hover:bg-gray-50/50">
                                {fileHeaders.map((_, cIdx) => (
                                  <td key={cIdx} className="px-3 py-1.5 whitespace-nowrap max-w-[150px] truncate">
                                    {r[cIdx] || '—'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 2: Auto-Distribution to Counselors */}
                <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                        <Shuffle size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900">Equal Round-Robin Distribution</h4>
                        <p className="text-[11px] text-gray-500">
                          Automatically divide leads equally among selected counselors
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer mt-1">
                      <input 
                        type="checkbox" 
                        checked={distributeEqually} 
                        onChange={e => setDistributeEqually(e.target.checked)} 
                        className="sr-only peer" 
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-black"></div>
                    </label>
                  </div>

                  {distributeEqually && (
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-gray-600">
                          Distribute among ({activeSelectedCounselors.length} of {counselors.length} Counselors)
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowCounselorList(!showCounselorList)}
                          className="text-[11px] text-blue-600 hover:underline font-semibold cursor-pointer"
                        >
                          {showCounselorList ? 'Done' : 'Select Counselors'}
                        </button>
                      </div>

                      {showCounselorList && (
                        <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-50 rounded-xl border border-gray-200 animate-fade-in">
                          {counselors.map(c => (
                            <label key={c.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer text-xs">
                              <input
                                type="checkbox"
                                checked={selectedCounselorIds.includes(c.id)}
                                onChange={() => handleToggleCounselor(c.id)}
                                className="rounded text-black focus:ring-black"
                              />
                              <span className="font-semibold text-gray-800 truncate">{c.name}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      <div className="bg-purple-50/70 border border-purple-100 rounded-xl p-2.5 text-xs text-purple-900 flex items-center justify-between">
                        <span>Distribution Preview:</span>
                        <strong className="font-mono">
                          ~{activeSelectedCounselors.length > 0 ? Math.floor(csvRows.length / activeSelectedCounselors.length) : 0} leads / counselor
                        </strong>
                      </div>
                    </div>
                  )}
                </div>

                {/* Import Action Button */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleStartImport}
                    disabled={importing || !csvRows.length || columnMapping.name === undefined || columnMapping.phone === undefined}
                    className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3 px-4 rounded-xl transition-all disabled:opacity-50 text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    {importing ? (
                      <>
                        <Sparkles size={14} className="animate-spin" />
                        <span>Importing {csvRows.length} Leads ({importProgress}%)...</span>
                      </>
                    ) : (
                      <>
                        <Upload size={14} />
                        <span>Start Importing {csvRows.length} Leads</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

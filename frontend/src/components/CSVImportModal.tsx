'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { 
  X, Upload, CheckCircle2, Users, Shuffle, Check, 
  AlertCircle, FileSpreadsheet, UserCheck, ChevronDown, ChevronUp
} from 'lucide-react'

interface Counselor {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

export default function CSVImportModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [fileHeaders, setFileHeaders] = useState<string[]>([])
  
  // Counselors state
  const [counselors, setCounselors] = useState<Counselor[]>([])
  const [selectedCounselorIds, setSelectedCounselorIds] = useState<string[]>([])
  const [distributeEqually, setDistributeEqually] = useState(true)
  const [showCounselorList, setShowCounselorList] = useState(false)
  
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [successData, setSuccessData] = useState<{
    total: number
    distributed: Record<string, number>
  } | null>(null)

  const REQUIRED_FIELDS = [
    { db: 'name', label: 'Full Name' },
    { db: 'phone', label: 'Phone Number' },
  ]
  
  const OPTIONAL_FIELDS = [
    { db: 'email', label: 'Email Address' },
    { db: 'source', label: 'Source (e.g. Meta, Website)' },
    { db: 'programme_level', label: 'Programme Level' },
    { db: 'highest_qualification', label: 'Highest Qualification' },
    { db: 'work_experience', label: 'Work Experience' },
    { db: 'budget_range', label: 'Budget Range' },
  ]

  useEffect(() => {
    fetchCounselors()
  }, [])

  const fetchCounselors = async () => {
    // Fetch active counselors
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
      // If no counselor found, check if there are other users (excluding admin or including everyone)
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

  // RFC-4180 compliant CSV parser
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]

      if (char === '"' && inQuotes && nextChar === '"') {
        cell += '"'
        i++
      } else if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        row.push(cell.trim())
        cell = ''
      } else if ((char === '\r' || char === '\n') && !inQuotes) {
        if (char === '\r' && nextChar === '\n') {
          i++
        }
        row.push(cell.trim())
        if (row.some(c => c !== '')) {
          lines.push(row)
        }
        row = []
        cell = ''
      } else {
        cell += char
      }
    }
    if (cell !== '' || row.length > 0) {
      row.push(cell.trim())
      if (row.some(c => c !== '')) {
        lines.push(row)
      }
    }
    return lines
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0]
    if (!uploadedFile) return
    setFile(uploadedFile)
    setLoading(true)

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string
        const parsed = parseCSV(text)

        if (parsed.length > 1) {
          setFileHeaders(parsed[0])
          setCsvRows(parsed.slice(1))
        } else {
          alert('CSV file appears to be empty or missing data rows.')
          setFile(null)
        }
      } catch (err: any) {
        alert('Failed to parse CSV file: ' + err.message)
        setFile(null)
      } finally {
        setLoading(false)
      }
    }
    reader.readAsText(uploadedFile)
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
      // Keep first only
      setSelectedCounselorIds([counselors[0].id])
    } else {
      setSelectedCounselorIds(counselors.map(c => c.id))
    }
  }

  const handleStartImport = async () => {
    if (!csvRows.length) return
    setImporting(true)

    try {
      // Build auto-mapping
      const autoMap: Record<string, number> = {}
      const allFields = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS]
      const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '')

      allFields.forEach(field => {
        const dbNorm = normalize(field.db)
        const labelNorm = normalize(field.label)

        let matchIndex = fileHeaders.findIndex(h => {
          const hNorm = normalize(h)
          return hNorm === dbNorm || hNorm === labelNorm
        })

        if (matchIndex === -1) {
          matchIndex = fileHeaders.findIndex(h => {
            const hNorm = normalize(h)
            if (field.db === 'name' && (hNorm === 'fullname' || hNorm === 'studentname' || hNorm === 'first_name' || hNorm === 'clientname')) return true
            if (field.db === 'phone' && (hNorm === 'phonenumber' || hNorm === 'contact' || hNorm === 'mobile' || hNorm === 'whatsapp')) return true
            if (field.db === 'email' && (hNorm === 'emailaddress' || hNorm === 'mail')) return true
            if (field.db === 'programme_level' && (hNorm === 'programme' || hNorm === 'program' || hNorm === 'level' || hNorm === 'course')) return true
            if (field.db === 'highest_qualification' && (hNorm === 'qualification' || hNorm === 'education' || hNorm === 'degree')) return true
            if (field.db === 'work_experience' && (hNorm === 'experience' || hNorm === 'workexp' || hNorm === 'work')) return true
            if (field.db === 'budget_range' && (hNorm === 'budget' || hNorm === 'finance' || hNorm === 'funds')) return true
            if (field.db === 'source' && (hNorm === 'leadsource' || hNorm === 'campaign' || hNorm === 'origin')) return true
            return false
          })
        }
        if (matchIndex !== -1) autoMap[field.db] = matchIndex
      })

      // Counselors for distribution
      const activeTargets = counselors.filter(c => selectedCounselorIds.includes(c.id))
      // Randomize the starting order for even distribution
      const shuffledTargets = [...activeTargets].sort(() => Math.random() - 0.5)

      const distributionStats: Record<string, number> = {}
      shuffledTargets.forEach(c => {
        distributionStats[c.id] = 0
      })

      const payload = csvRows.map((row, idx) => {
        const record: any = { 
          stage: 'New', 
          metadata: {},
          created_at: new Date().toISOString()
        }

        Object.keys(autoMap).forEach(dbField => {
          const colIndex = autoMap[dbField]
          if (colIndex !== -1 && row[colIndex]) {
            let val = row[colIndex]
            if (dbField === 'phone' && val.startsWith('p:')) val = val.substring(2)
            record[dbField] = val
          }
        })

        // Unmapped headers go to metadata
        fileHeaders.forEach((header, index) => {
          if (!Object.values(autoMap).includes(index) && row[index]) {
            record.metadata[header] = row[index]
          }
        })

        // Round-Robin Distribution
        if (distributeEqually && shuffledTargets.length > 0) {
          const target = shuffledTargets[idx % shuffledTargets.length]
          record.owner_id = target.id
          distributionStats[target.id] = (distributionStats[target.id] || 0) + 1
        } else {
          record.owner_id = null
        }

        return record
      })

      // Insert leads in batches of 100 to avoid payload limits
      const batchSize = 100
      const insertedLeadRecords: any[] = []

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
          insertedLeadRecords.push(...insertedBatch)
        }
      }

      // Bulk create activity logs for assigned leads
      if (insertedLeadRecords.length > 0 && distributeEqually && shuffledTargets.length > 0) {
        const counselorNameMap: Record<string, string> = {}
        counselors.forEach(c => { counselorNameMap[c.id] = c.name })

        const activityPayload = insertedLeadRecords
          .filter(l => l.owner_id)
          .map(l => ({
            lead: l.id,
            type: 'assignment',
            text: `Assigned to ${counselorNameMap[l.owner_id] || 'Counselor'} via auto-distribution on CSV upload`,
            time: new Date().toISOString()
          }))

        if (activityPayload.length > 0) {
          // insert activities in batches of 100
          for (let i = 0; i < activityPayload.length; i += batchSize) {
            await supabase.from('activities').insert(activityPayload.slice(i, i + batchSize))
          }
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
  const leadsPerCounselor = activeSelectedCounselors.length > 0 && csvRows.length > 0
    ? Math.floor(csvRows.length / activeSelectedCounselors.length)
    : 0
  const remainderLeads = activeSelectedCounselors.length > 0 && csvRows.length > 0
    ? csvRows.length % activeSelectedCounselors.length
    : 0

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-black text-white flex items-center justify-center">
              <FileSpreadsheet size={16} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Import Leads from CSV</h3>
              <p className="text-xs text-gray-500">Upload spreadsheet and auto-distribute leads to team</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-900 transition-colors p-1.5 hover:bg-gray-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        {successData !== null ? (
          /* Success Screen */
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 overflow-y-auto">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center border border-emerald-100 animate-in zoom-in-75">
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">
                {successData.total} Leads Imported Successfully!
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {distributeEqually && activeSelectedCounselors.length > 0
                  ? `All leads have been automatically divided among your ${activeSelectedCounselors.length} team members.`
                  : 'All leads have been added to the unassigned pipeline.'}
              </p>
            </div>

            {/* Distribution Breakdown */}
            {distributeEqually && activeSelectedCounselors.length > 0 && (
              <div className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-left">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                  <Users size={14} className="text-gray-500" />
                  <span>Lead Distribution Breakdown</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {activeSelectedCounselors.map(c => {
                    const count = successData.distributed[c.id] || 0
                    return (
                      <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-2.5 flex items-center justify-between text-xs">
                        <span className="font-medium text-gray-900 truncate mr-2">{c.name}</span>
                        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold">
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
              className="w-full bg-black hover:bg-gray-800 text-white py-3 rounded-xl text-sm font-medium transition-all shadow-sm"
            >
              Done & View Leads
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-6 overflow-y-auto">
            {/* Step 1: File Upload */}
            {!file ? (
              <div className="border-2 border-dashed border-gray-300 hover:border-gray-400 rounded-2xl p-10 text-center hover:bg-gray-50/50 transition-all relative cursor-pointer group">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileUpload} 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
                />
                <div className="w-12 h-12 bg-gray-100 text-gray-500 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:bg-black group-hover:text-white transition-all">
                  <Upload size={22} />
                </div>
                <h4 className="text-sm font-semibold text-gray-900 mb-1">Click or drag a CSV file here</h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  Supports standard CSV exports with headers like Name, Phone, Email, Source, Programme, etc.
                </p>
              </div>
            ) : (
              /* File Selected Info */
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <FileSpreadsheet size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">{file.name}</h4>
                    <p className="text-xs text-gray-500">
                      <strong>{csvRows.length}</strong> leads detected • {fileHeaders.length} columns
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null)
                    setCsvRows([])
                    setFileHeaders([])
                  }}
                  className="text-xs text-red-600 hover:underline font-medium"
                >
                  Change File
                </button>
              </div>
            )}

            {/* Step 2: Auto-Distribution Settings */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 border border-purple-100">
                    <Shuffle size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900">Auto-Distribute to Team</h4>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Automatically divide leads equally among counselors (Round Robin)
                    </p>
                  </div>
                </div>

                {/* Switch Toggle */}
                <button
                  type="button"
                  onClick={() => setDistributeEqually(!distributeEqually)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    distributeEqually ? 'bg-black' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      distributeEqually ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {distributeEqually && (
                <div className="pt-3 border-t border-gray-100 space-y-3">
                  {counselors.length === 0 ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-start gap-2">
                      <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                      <div>
                        <strong className="font-semibold">No active counselors found.</strong>
                        <p className="mt-0.5">
                          Please add counselors in the <strong>Team</strong> section first, or imported leads will remain Unassigned.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Live Calculation Preview Banner */}
                      {csvRows.length > 0 && activeSelectedCounselors.length > 0 && (
                        <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl text-xs text-purple-950 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <UserCheck size={16} className="text-purple-600 shrink-0" />
                            <span>
                              <strong>{csvRows.length} leads</strong> ÷ <strong>{activeSelectedCounselors.length} counselors</strong> =
                              <span className="font-bold text-purple-900 ml-1">
                                ~{leadsPerCounselor} leads each
                                {remainderLeads > 0 && ` (+1 for ${remainderLeads} members)`}
                              </span>
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Counselors Selection Dropdown / Drawer */}
                      <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users size={14} className="text-gray-500" />
                            <span className="text-xs font-semibold text-gray-800">
                              Selected Counselors ({activeSelectedCounselors.length} of {counselors.length})
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={handleSelectAllCounselors}
                              className="text-[11px] text-gray-600 hover:text-black font-medium underline"
                            >
                              {selectedCounselorIds.length === counselors.length ? 'Select Only 1' : 'Select All'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowCounselorList(!showCounselorList)}
                              className="text-gray-400 hover:text-gray-600"
                            >
                              {showCounselorList ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </div>
                        </div>

                        {/* Counselor Checkbox List */}
                        {showCounselorList && (
                          <div className="mt-3 pt-3 border-t border-gray-200 space-y-1.5 max-h-40 overflow-y-auto">
                            {counselors.map(c => {
                              const isChecked = selectedCounselorIds.includes(c.id)
                              return (
                                <label
                                  key={c.id}
                                  className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors text-xs"
                                >
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleCounselor(c.id)}
                                      className="rounded border-gray-300 text-black focus:ring-black h-4 w-4"
                                    />
                                    <span className="font-medium text-gray-900">{c.name}</span>
                                    <span className="text-[11px] text-gray-400">({c.email})</span>
                                  </div>
                                  {csvRows.length > 0 && isChecked && (
                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                                      ~{leadsPerCounselor} leads
                                    </span>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!file || csvRows.length === 0 || importing || loading}
                onClick={handleStartImport}
                className="inline-flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-6 py-2.5 rounded-xl text-xs font-medium transition-all shadow-sm disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    <span>Importing & Distributing...</span>
                  </>
                ) : (
                  <>
                    <Upload size={14} />
                    <span>
                      {distributeEqually && activeSelectedCounselors.length > 0
                        ? `Import & Distribute ${csvRows.length ? `(${csvRows.length} Leads)` : ''}`
                        : `Import Leads ${csvRows.length ? `(${csvRows.length})` : ''}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

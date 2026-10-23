'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'
import { normalizePhone } from '@/lib/phoneHelper'

export default function AddLeadModal({ onClose, onSuccess }: { onClose: () => void, onSuccess: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [source, setSource] = useState('Website')
  const [programmeLevel, setProgrammeLevel] = useState('Bachelor')
  const [highestQualification, setHighestQualification] = useState('')
  const [workExperience, setWorkExperience] = useState('')
  const [budgetRange, setBudgetRange] = useState('')
  const [serviceType, setServiceType] = useState<'study_abroad' | 'visa_process'>('study_abroad')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    // Normalized Duplicate Check
    const corePhone = normalizePhone(phone)
    const cleanEmail = email ? email.trim().toLowerCase() : ''
    
    let existingQuery = supabase
      .from('leads')
      .select('id, name, phone, email, stage, metadata')

    if (corePhone.length >= 7 && cleanEmail) {
      existingQuery = existingQuery.or(`phone.ilike.%${corePhone}%,email.ilike.${cleanEmail}`)
    } else if (corePhone.length >= 7) {
      existingQuery = existingQuery.ilike('phone', `%${corePhone}%`)
    } else if (cleanEmail) {
      existingQuery = existingQuery.ilike('email', cleanEmail)
    }

    const { data: existing } = await existingQuery.limit(1)
    
    if (existing && existing.length > 0) {
      const match = existing[0]
      const isJunk = match.stage === 'Junk/duplicate'

      if (isJunk) {
        await supabase
          .from('leads')
          .update({ stage: 'New', priority: 'Hot' })
          .eq('id', match.id)
      }

      // Add to existing lead timeline instead of creating twice
      await supabase.from('activities').insert([{
        lead: match.id,
        type: isJunk ? 'lead_revived' : 'duplicate_merged',
        text: isJunk
          ? `Lead revived from Junk to New due to manual enquiry via ${source}. Course: ${programmeLevel}`
          : `Duplicate enquiry received via ${source}. Course: ${programmeLevel}. Profile details auto-merged.`,
        time: new Date().toISOString()
      }])

      alert(`Lead already exists (${match.name || match.phone})!\n\n${isJunk ? 'Lead was in Junk and has been REVIVED to active "New" stage.' : 'Details added to their existing timeline without creating a duplicate.'}`)
      setLoading(false)
      onClose()
      return
    }

    const { error } = await supabase.from('leads').insert([
      { 
        name, phone, email, source, programme_level: programmeLevel, 
        highest_qualification: highestQualification, work_experience: workExperience, budget_range: budgetRange,
        stage: 'New',
        metadata: {
          service_type: serviceType
        }
      }
    ])

    setLoading(false)
    if (error) {
      alert('Error creating lead: ' + error.message)
    } else {
      onSuccess()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/50">
          <h3 className="text-lg font-semibold text-gray-900">Add New Lead</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition-colors p-1 hover:bg-gray-100 rounded-md"><X size={20}/></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-8 overflow-y-auto">
          {/* Service Stream Track Selector */}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Service Track *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setServiceType('study_abroad')}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  serviceType === 'study_abroad'
                    ? 'bg-blue-50 border-blue-500 text-blue-700 ring-2 ring-blue-200 font-bold shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>🎓 Study Abroad (Admissions)</span>
              </button>
              <button
                type="button"
                onClick={() => setServiceType('visa_process')}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  serviceType === 'visa_process'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 ring-2 ring-indigo-200 font-bold shadow-xs'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <span>🛂 Visa Process (F-1 / SEVIS)</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Contact Details</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name *</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm" placeholder="John Doe" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Phone Number *</label>
                <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm" placeholder="+1234567890" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm" placeholder="john@example.com" />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-gray-100">
             <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Background & Interest</h4>
             <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Programme Level</label>
                <select value={programmeLevel} onChange={e => setProgrammeLevel(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm outline-none">
                  <option>Bachelor</option>
                  <option>Master</option>
                  <option>Doctorate</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Source</label>
                <select value={source} onChange={e => setSource(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm outline-none">
                  <option>Meta Ad</option>
                  <option>Website</option>
                  <option>Referral</option>
                  <option>Walk-in</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Highest Qualification</label>
                <input type="text" value={highestQualification} onChange={e => setHighestQualification(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm" placeholder="e.g. High School, BSc" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Work Experience (Years)</label>
                <input type="text" value={workExperience} onChange={e => setWorkExperience(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm" placeholder="e.g. 2 years" />
              </div>
            </div>
            <div>
               <label className="block text-sm font-medium text-gray-700 mb-1.5">Budget Range</label>
               <input type="text" value={budgetRange} onChange={e => setBudgetRange(e.target.value)} className="w-full px-4 py-2.5 bg-white border border-gray-200 text-gray-900 rounded-lg focus:outline-none focus:ring-4 focus:ring-gray-100 focus:border-gray-400 transition-all text-sm" placeholder="e.g. $10k - $20k" />
            </div>
          </div>
          
          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors border border-transparent">Cancel</button>
            <button type="submit" disabled={loading} className="px-6 py-2.5 text-sm font-medium text-white bg-black hover:bg-gray-800 rounded-lg shadow-sm transition-all disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

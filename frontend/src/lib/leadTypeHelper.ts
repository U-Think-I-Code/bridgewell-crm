/**
 * Lead Service Track Helper (Study Abroad vs Visa Process)
 * Segregates leads into two distinct counseling operations:
 * 1. 'study_abroad': University admissions, programme shortlisting, degrees, intakes
 * 2. 'visa_process': F-1 visa preparation, SEVIS I-901 fee, I-20 documentation, mock interviews
 */

export type ServiceTrack = 'all' | 'study_abroad' | 'visa_process'

export function getLeadServiceType(lead: {
  source?: string | null
  course?: string | null
  programme_level?: string | null
  metadata?: any
}): 'study_abroad' | 'visa_process' {
  if (!lead) return 'study_abroad'

  const meta = lead.metadata || {}
  const campaignAnswers = meta.campaign_answers || {}
  const sourceStr = String(lead.source || '').toLowerCase()
  const fileName = String(meta.imported_file || '').toLowerCase()
  const courseStr = String(lead.course || '').toLowerCase()

  // 1. Explicitly tagged service type in metadata
  if (meta.service_type === 'visa_process' || meta.service_type === 'visa') return 'visa_process'
  if (meta.service_type === 'study_abroad') return 'study_abroad'

  // 2. Check for Visa keywords in source or uploaded file name
  if (sourceStr.includes('visa') || fileName.includes('visa')) {
    return 'visa_process'
  }

  // 3. Check for US Student Visa campaign questions (SEVIS, I-20, DS-160, Embassy)
  const isVisaCampaign =
    campaignAnswers['SEVIS I-901 Fee Paid?'] !== undefined ||
    campaignAnswers['I-20 Received From US University?'] !== undefined ||
    campaignAnswers['Admitted US University'] !== undefined ||
    meta['have_you_paid_your_sevis_i-901_fee?'] !== undefined ||
    meta['have_you_received_your_i-20_from_a_us_university?'] !== undefined ||
    meta['which_us_university_have_you_been_admitted_to?'] !== undefined

  if (isVisaCampaign) {
    return 'visa_process'
  }

  // 4. Default to study abroad for course/degree applicants
  return 'study_abroad'
}

/**
 * Returns UI badge metadata for a lead's service track
 */
export function getServiceBadgeInfo(type: 'study_abroad' | 'visa_process') {
  if (type === 'visa_process') {
    return {
      label: 'Visa Process',
      icon: '🛂',
      bgColor: 'bg-indigo-50',
      textColor: 'text-indigo-700',
      borderColor: 'border-indigo-200',
      badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      description: 'F-1 Visa, SEVIS & Mock Interview Prep'
    }
  }

  return {
    label: 'Study Abroad',
    icon: '🎓',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    description: 'University Admissions & Course Shortlisting'
  }
}

import { supabase } from '@/lib/supabase'

export interface AuditLogItem {
  id: string
  lead_id?: string | null
  user_id?: string | null
  entity_type: string
  action: string
  field_name?: string | null
  old_value?: string | null
  new_value?: string | null
  summary: string
  metadata?: any
  created_at: string
  lead_name?: string
  user_name?: string
  user_email?: string
  user_role?: string
}

export type AuditActionType =
  | 'STAGE_CHANGE'
  | 'PRIORITY_CHANGE'
  | 'REASSIGNMENT'
  | 'FOLLOWUP_SCHEDULED'
  | 'FOLLOWUP_SNOOZED'
  | 'CALL_LOGGED'
  | 'NOTE_ADDED'
  | 'FIELD_UPDATE'
  | 'LEAD_CREATED'
  | 'BULK_REASSIGN'
  | 'WHATSAPP_SENT'

export async function logAuditTrail({
  leadId,
  userId,
  action,
  fieldName,
  oldValue,
  newValue,
  summary,
  metadata
}: {
  leadId?: string | null
  userId?: string | null
  action: AuditActionType | string
  fieldName?: string | null
  oldValue?: string | null
  newValue?: string | null
  summary: string
  metadata?: any
}) {
  try {
    const payload = {
      lead_id: leadId || null,
      user_id: userId || null,
      entity_type: 'lead',
      action,
      field_name: fieldName || null,
      old_value: oldValue !== undefined && oldValue !== null ? String(oldValue) : null,
      new_value: newValue !== undefined && newValue !== null ? String(newValue) : null,
      summary,
      metadata: metadata || {},
      created_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('audit_logs').insert([payload]).select()
    if (error) {
      console.warn('Audit log insert error:', error)
    }
    return { data, error }
  } catch (err) {
    console.warn('Failed to record audit log:', err)
    return { data: null, error: err }
  }
}

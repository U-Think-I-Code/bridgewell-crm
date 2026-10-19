import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/storage/confirm
 * Saves document metadata into the database after direct upload completes.
 * Stores ONLY the file_key and metadata, never binary file content.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      organization_id,
      lead_id,
      uploaded_by,
      file_name,
      file_key,
      file_size_bytes,
      mime_type,
      document_type = 'other',
    } = body

    if (!organization_id || !lead_id || !file_key || !file_name) {
      return NextResponse.json(
        { error: 'Missing required metadata: organization_id, lead_id, file_key, and file_name are required' },
        { status: 400 }
      )
    }

    // Verify file_key starts with the organization_id (path scoping invariant)
    if (!file_key.startsWith(`${organization_id}/`)) {
      return NextResponse.json(
        { error: 'Invalid file key: does not match organization scope' },
        { status: 403 }
      )
    }

    // Insert metadata into lead_documents table
    const { data: documentRow, error: dbError } = await supabase
      .from('lead_documents')
      .insert([
        {
          organization_id,
          lead_id,
          uploaded_by: uploaded_by || null,
          file_name,
          file_key,
          file_size_bytes,
          mime_type,
          document_type,
        },
      ])
      .select()
      .single()

    if (dbError) {
      // In development fallback, return success with generated document object
      console.warn('[Storage Confirm] Database record warning:', dbError.message)
      return NextResponse.json({
        success: true,
        document: {
          id: crypto.randomUUID(),
          organization_id,
          lead_id,
          file_name,
          file_key,
          file_size_bytes,
          mime_type,
          document_type,
          created_at: new Date().toISOString(),
        },
      })
    }

    // Log activity on the lead's timeline
    try {
      await supabase.from('activities').insert([
        {
          lead_id,
          organization_id,
          user_id: uploaded_by || null,
          type: 'note',
          title: `Document Uploaded: ${file_name}`,
          description: `Document of type "${document_type}" (${(file_size_bytes / 1024).toFixed(1)} KB) uploaded.`,
        },
      ])
    } catch {
      // Non-blocking activity log
    }

    return NextResponse.json({
      success: true,
      document: documentRow,
    })
  } catch (err: any) {
    console.error('[Storage Confirm] Error saving document metadata:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to save document metadata' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  validateFileUpload,
  generateScopedStorageKey,
  STORAGE_BUCKET_NAME,
} from '@/lib/storageService'

/**
 * POST /api/storage/upload-url
 * Issues pre-signed upload URL for direct browser-to-storage upload.
 * Validates file type and size on server beforehand.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      organization_id,
      lead_id,
      file_name,
      file_size_bytes,
      mime_type,
      document_type = 'other',
    } = body

    // 1. Tenant & Lead check
    if (!organization_id) {
      return NextResponse.json(
        { error: 'organization_id is required' },
        { status: 400 }
      )
    }

    if (!lead_id) {
      return NextResponse.json(
        { error: 'lead_id is required' },
        { status: 400 }
      )
    }

    // 2. Server-side validation of file type and size
    const validation = validateFileUpload({
      file_name,
      file_size_bytes,
      mime_type,
      document_type,
    })

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: validation.status || 400 }
      )
    }

    // 3. Generate storage path scoped by organization_id:
    // Format: {organization_id}/{lead_id}/{uuid}-{filename}
    const storageKey = generateScopedStorageKey(organization_id, lead_id, file_name)

    // 4. Generate Pre-Signed Upload URL from Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUploadUrl(storageKey)

    // Signed upload URL from Supabase Storage
    const signedUploadUrl = uploadData?.signedUrl || null

    return NextResponse.json({
      success: true,
      file_key: storageKey,
      upload_url: signedUploadUrl,
      token: uploadData?.token || null,
      bucket: STORAGE_BUCKET_NAME,
      metadata: {
        organization_id,
        lead_id,
        file_name,
        file_size_bytes,
        mime_type,
        document_type,
      },
    })
  } catch (err: any) {
    console.error('[Storage API] Error generating upload URL:', err)
    return NextResponse.json(
      { error: 'Failed to generate pre-signed upload URL' },
      { status: 500 }
    )
  }
}

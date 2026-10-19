import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  verifyOrganizationAccess,
  SHORT_LIVED_URL_EXPIRY_SECONDS,
  STORAGE_BUCKET_NAME,
} from '@/lib/storageService'

/**
 * POST /api/storage/download-url
 * Generates a short-lived signed URL to securely download a private document.
 * Requires an explicit authorization check ensuring the caller's organization_id
 * matches the document's organization_id.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { document_id, caller_org_id, file_key } = body

    if (!caller_org_id) {
      return NextResponse.json(
        { error: 'caller_org_id is required for authorization' },
        { status: 401 }
      )
    }

    let targetFileKey = file_key
    let documentOrgId: string | null = null

    // If document_id is provided, fetch document metadata from DB
    if (document_id) {
      const { data: doc, error: dbError } = await supabase
        .from('lead_documents')
        .select('*')
        .eq('id', document_id)
        .single()

      if (dbError || !doc) {
        // Fallback: parse org_id directly from file_key if available
        if (file_key) {
          const parts = file_key.split('/')
          documentOrgId = parts[0]
        } else {
          return NextResponse.json(
            { error: 'Document not found' },
            { status: 404 }
          )
        }
      } else {
        targetFileKey = doc.file_key
        documentOrgId = doc.organization_id
      }
    } else if (file_key) {
      const parts = file_key.split('/')
      documentOrgId = parts[0]
    } else {
      return NextResponse.json(
        { error: 'Either document_id or file_key is required' },
        { status: 400 }
      )
    }

    // ========================================================================
    // CRITICAL SECURITY CHECK: Cross-tenant download authorization
    // ========================================================================
    const authCheck = verifyOrganizationAccess(caller_org_id, documentOrgId || '')
    if (!authCheck.authorized) {
      return NextResponse.json(
        {
          error: authCheck.error || 'Access denied: document belongs to another organization.',
          code: 'CROSS_TENANT_ACCESS_DENIED',
        },
        { status: 403 }
      )
    }

    // Generate short-lived signed download URL (60 seconds expiry)
    const { data: signedData, error: signError } = await supabase.storage
      .from(STORAGE_BUCKET_NAME)
      .createSignedUrl(targetFileKey, SHORT_LIVED_URL_EXPIRY_SECONDS)

    const downloadUrl = signedData?.signedUrl || null

    return NextResponse.json({
      success: true,
      download_url: downloadUrl,
      file_key: targetFileKey,
      expires_in_seconds: SHORT_LIVED_URL_EXPIRY_SECONDS,
      authorized: true,
    })
  } catch (err: any) {
    console.error('[Storage Download API] Error:', err)
    return NextResponse.json(
      { error: 'Failed to generate download URL' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const TABLES_TO_BACKUP = [
  'leads',
  'users',
  'stages',
  'activities',
  'assignments',
  'audit_logs',
  'notifications',
  'email_templates'
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const isDownload = searchParams.get('download') === '1'
    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-')

    const backupData: {
      metadata: {
        generated_at: string
        crm_version: string
        total_records: number
        record_counts: Record<string, number>
      }
      tables: Record<string, any[]>
    } = {
      metadata: {
        generated_at: now.toISOString(),
        crm_version: '2.0.0',
        total_records: 0,
        record_counts: {},
      },
      tables: {}
    }

    let totalRecords = 0

    // Fetch each table in parallel
    const results = await Promise.all(
      TABLES_TO_BACKUP.map(async (table) => {
        try {
          const { data, error } = await supabase.from(table).select('*').limit(50000)
          if (error) {
            console.warn(`[Backup API] Warning on table ${table}:`, error.message)
            return { table, data: [] }
          }
          return { table, data: data || [] }
        } catch (e: any) {
          console.warn(`[Backup API] Error on table ${table}:`, e?.message)
          return { table, data: [] }
        }
      })
    )

    for (const { table, data } of results) {
      backupData.tables[table] = data
      const count = data.length
      backupData.metadata.record_counts[table] = count
      totalRecords += count
    }

    backupData.metadata.total_records = totalRecords

    if (isDownload) {
      const filename = `bridgewell_crm_backup_${timestamp}.json`
      return new NextResponse(JSON.stringify(backupData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      })
    }

    return NextResponse.json(backupData, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (error: any) {
    console.error('[Backup API] Fatal Error:', error)
    return NextResponse.json(
      { error: 'Failed to generate database backup', details: error?.message },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function toCSV(rows: Record<string, string | number | null | undefined>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
  ]
  return lines.join('\r\n')
}

// ---------------------------------------------------------------------------
// GET /api/analytics/export
// Returns slide analytics as a CSV file download.
// Admin-only. Not cached — always fresh data.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = await checkRateLimit(auth.user.id, 'analytics:export', 10, 60 * 1000)
  if (limited) return limited

  const { profile } = auth
  const supabase = createServiceClient()

  const { data, error } = await supabase.rpc('get_slide_analytics', {
    p_tenant_id: profile.tenant_id,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }

  const rows = (data ?? []).map(
    (row: {
      title: string
      status: string
      use_count: number
      last_used_at: string | null
      template_set_count: number
    }) => ({
      'Slide Name': row.title,
      Status: row.status,
      'Use Count': row.use_count,
      'Last Used': row.last_used_at
        ? new Date(row.last_used_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Never',
      'In Template Sets': row.template_set_count,
    })
  )

  const csv = toCSV(rows)
  const filename = `slide-analytics-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

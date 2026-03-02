import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// GET /api/invoices
// Returns invoices for the current tenant, sorted newest first. Admin only.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Rate limit: 30 reads per minute
  const limited = await checkRateLimit(
    auth.user.id,
    'invoices:list',
    30,
    60 * 1000
  )
  if (limited) return limited

  const supabase = createServiceClient()

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('tenant_id', auth.profile.tenant_id)
    .order('invoice_date', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to fetch invoices' },
      { status: 500 }
    )
  }

  return NextResponse.json({ invoices: invoices ?? [] }, { status: 200 })
}

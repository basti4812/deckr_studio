import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// PATCH /api/tenant/billing
// Saves billing contact fields on the tenant. Admin only.
// ---------------------------------------------------------------------------

// Strip HTML tags from strings
const safeString = (maxLen: number) =>
  z
    .string()
    .max(maxLen)
    .transform((s) => s.trim().replace(/<[^>]*>/g, ''))
    .optional()

const BillingContactSchema = z.object({
  billing_company_name: safeString(255),
  billing_address_street: safeString(500),
  billing_address_city: safeString(255),
  billing_address_postal_code: safeString(20),
  billing_address_country: safeString(100),
  billing_vat_id: safeString(50),
})

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Rate limit: 10 updates per 5 minutes
  const limited = await checkRateLimit(auth.user.id, 'tenant:billing', 10, 5 * 60 * 1000)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = BillingContactSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const updates = parsed.data
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .update(updates)
    .eq('id', auth.profile.tenant_id)
    .select()
    .single()

  if (error || !tenant) {
    return NextResponse.json({ error: 'Failed to update billing contact' }, { status: 500 })
  }

  return NextResponse.json({ tenant }, { status: 200 })
}

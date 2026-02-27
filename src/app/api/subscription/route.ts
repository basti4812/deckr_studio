import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/subscription
// Returns the current tenant's subscription and seat usage.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getUserProfile(user.id)
  if (!profile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
  }

  const supabaseAdmin = createServiceClient()

  // Fetch subscription
  const { data: subscription, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (subError || !subscription) {
    return NextResponse.json(
      { error: 'Subscription not found' },
      { status: 404 }
    )
  }

  // Fetch current seat usage (active users in tenant)
  const { count: seatCount, error: countError } = await supabaseAdmin
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)

  if (countError) {
    return NextResponse.json(
      { error: 'Failed to fetch seat usage' },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      subscription,
      seatUsage: {
        used: seatCount ?? 0,
        licensed: subscription.licensed_seats,
      },
    },
    { status: 200 }
  )
}

// ---------------------------------------------------------------------------
// PATCH /api/subscription
// Admin-only. Updates subscription fields.
// Intended for webhook-driven status updates and manual admin overrides.
// ---------------------------------------------------------------------------

const UpdateSubscriptionSchema = z.object({
  status: z.enum(['trialing', 'active', 'past_due', 'cancelled']).optional(),
  pricing_tier: z.string().max(100).nullable().optional(),
  licensed_seats: z.number().int().min(1).nullable().optional(),
  billing_cycle: z.enum(['monthly', 'annual']).nullable().optional(),
  trial_ends_at: z.string().datetime().nullable().optional(),
  next_renewal_date: z.string().datetime().nullable().optional(),
  payment_provider_customer_id: z.string().max(255).nullable().optional(),
  payment_provider_price_id: z.string().max(255).nullable().optional(),
})

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getUserProfile(user.id)
  if (!profile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
  }

  if (profile.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden: admin access required' },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = UpdateSubscriptionSchema.safeParse(body)
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

  const supabaseAdmin = createServiceClient()

  const { data: subscription, error } = await supabaseAdmin
    .from('subscriptions')
    .update(updates)
    .eq('tenant_id', profile.tenant_id)
    .select()
    .single()

  if (error || !subscription) {
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    )
  }

  return NextResponse.json({ subscription }, { status: 200 })
}

import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret } from '@/lib/webhook-auth'
import { createServiceClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'

// ---------------------------------------------------------------------------
// POST /api/webhooks/payment-failed
//
// Stub endpoint — ready for Stripe (or other provider) integration.
//
// TODO: When connecting a real payment provider:
//   1. Replace verifyWebhookSecret with Stripe HMAC signature verification
//   2. Derive tenant_id from the verified Stripe event object
//      (e.g. event.data.object.metadata.tenant_id), NOT from the request body
//   3. Set subscriptions.status = 'past_due'
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // SEC-14: Verify webhook secret BEFORE parsing body
  const authError = verifyWebhookSecret(request)
  if (authError) return authError

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  console.log('[webhook] payment-failed received', JSON.stringify(body))

  // SEC-16: Validate tenant_id exists in the database before acting on it
  // TODO: When Stripe is connected, derive tenant_id from verified Stripe event, not body
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : null
  if (tenantId) {
    const supabase = createServiceClient()

    // Verify the tenant actually exists before sending notifications
    const { data: tenant } = await supabase.from('tenants').select('id').eq('id', tenantId).single()

    if (!tenant) {
      return NextResponse.json({ error: 'Invalid tenant_id' }, { status: 400 })
    }

    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('is_active', true)
      .limit(50)

    if (admins && admins.length > 0) {
      await createNotifications(
        admins.map((a) => ({
          tenantId,
          userId: a.id,
          type: 'payment_failed' as const,
          message: 'Payment failed — please update your payment method',
          resourceType: 'billing' as const,
        }))
      ).catch(() => {})
    }
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

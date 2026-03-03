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
//   1. Verify the webhook signature
//   2. Set subscriptions.status = 'past_due'
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const authError = verifyWebhookSecret(request)
  if (authError) return authError

  console.log('[webhook] payment-failed received', JSON.stringify(body))

  // Notify all admins in the affected tenant
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : null
  if (tenantId) {
    const supabase = createServiceClient()
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
        })),
      ).catch(() => {})
    }
  }

  return NextResponse.json({ received: true }, { status: 200 })
}

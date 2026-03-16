import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret } from '@/lib/webhook-auth'

// ---------------------------------------------------------------------------
// POST /api/webhooks/subscription-updated
//
// Stub endpoint — ready for Stripe (or other provider) integration.
//
// TODO: When connecting a real payment provider:
//   1. Verify the webhook signature
//   2. Parse new status, pricing_tier, licensed_seats, next_renewal_date
//   3. Update subscriptions table and auth user app_metadata
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // SEC-14: Verify webhook secret BEFORE parsing body
  const authError = verifyWebhookSecret(request)
  if (authError) return authError

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }

  // TODO: Replace verifyWebhookSecret with provider HMAC signature verification and DB update
  console.log('[webhook] subscription-updated received', JSON.stringify(body))

  return NextResponse.json({ received: true }, { status: 200 })
}

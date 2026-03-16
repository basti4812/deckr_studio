import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSecret } from '@/lib/webhook-auth'

// ---------------------------------------------------------------------------
// POST /api/webhooks/subscription-created
//
// Stub endpoint — ready for Stripe (or other provider) integration.
//
// TODO: When connecting a real payment provider:
//   1. Verify the webhook signature using the provider's secret
//      (e.g. stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET))
//   2. Parse the event payload to extract tenant/customer identifiers
//   3. Update the subscriptions table via the service role client
//   4. Update auth user app_metadata with new subscription status
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

  // TODO: Replace verifyWebhookSecret with provider HMAC signature verification
  // TODO: When Stripe is connected, add replay protection via timestamp validation
  console.log('[webhook] subscription-created received', JSON.stringify(body))

  return NextResponse.json({ received: true }, { status: 200 })
}

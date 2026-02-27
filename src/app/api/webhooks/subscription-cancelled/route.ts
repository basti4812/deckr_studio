import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// POST /api/webhooks/subscription-cancelled
//
// Stub endpoint — ready for Stripe (or other provider) integration.
//
// TODO: When connecting a real payment provider:
//   1. Verify the webhook signature
//   2. Set subscriptions.status = 'cancelled'
//   3. Update auth user app_metadata
//   4. Trigger cancellation notification to tenant admin (PROJ-14)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = null
  }

  // TODO: Replace with real signature verification and DB update
  console.log('[webhook] subscription-cancelled received', JSON.stringify(body))

  return NextResponse.json({ received: true }, { status: 200 })
}

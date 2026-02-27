import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

/**
 * Verifies that the incoming webhook request carries the expected shared secret
 * in the `X-Webhook-Secret` header.
 *
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * When a real payment provider (e.g. Stripe) is connected, replace this with
 * proper HMAC signature verification:
 *   stripe.webhooks.constructEvent(rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET)
 *
 * Returns a 401 NextResponse if verification fails, otherwise null.
 */
export function verifyWebhookSecret(request: NextRequest): NextResponse | null {
  const secret = process.env.WEBHOOK_SECRET
  if (!secret) {
    // If env var is not set, block all webhook calls in production
    console.error('[webhook] WEBHOOK_SECRET env var is not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const provided = request.headers.get('x-webhook-secret')
  if (!provided) {
    return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 })
  }

  try {
    const secretBuf = Buffer.from(secret)
    const providedBuf = Buffer.from(provided)
    if (secretBuf.length !== providedBuf.length || !timingSafeEqual(secretBuf, providedBuf)) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  return null
}

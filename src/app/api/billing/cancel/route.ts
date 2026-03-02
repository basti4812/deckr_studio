import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// POST /api/billing/cancel
// Placeholder cancel handler. Logs intent, returns success message.
// Actual cancellation logic will be added in PROJ-11 (Stripe integration).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // Rate limit: 3 cancel requests per hour
  const limited = await checkRateLimit(
    auth.user.id,
    'billing:cancel',
    3,
    60 * 60 * 1000
  )
  if (limited) return limited

  console.log('[billing/cancel] Cancellation requested')

  return NextResponse.json(
    {
      message:
        'Cancellation requested — our team will be in touch shortly.',
    },
    { status: 200 }
  )
}

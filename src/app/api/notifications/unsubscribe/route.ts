import { NextRequest, NextResponse } from 'next/server'
import { verifyUnsubscribeToken, MANDATORY_EMAIL_TYPES, NotificationEmailType } from '@/lib/email'
import { checkIpRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/notifications/unsubscribe?token=xxx
// One-click unsubscribe from email footer links — no login required
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  // Public endpoint — IP-based rate limiting (10 per minute)
  const limited = await checkIpRateLimit(request, 'notifications:unsubscribe', 10, 60 * 1000)
  if (limited) return limited

  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const parsed = verifyUnsubscribeToken(token)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid or expired unsubscribe link' }, { status: 400 })
  }

  const { userId, type } = parsed

  // Cannot unsubscribe from mandatory types
  if (MANDATORY_EMAIL_TYPES.includes(type as NotificationEmailType)) {
    return NextResponse.json(
      {
        message:
          'This notification type cannot be disabled as it contains critical account information.',
      },
      { status: 200 }
    )
  }

  const supabase = createServiceClient()

  // Check user still exists
  const { data: user } = await supabase
    .from('users')
    .select('id, notification_preferences, is_active')
    .eq('id', userId)
    .single()

  if (!user) {
    return NextResponse.json(
      { message: 'You are no longer a member of this account.' },
      { status: 200 }
    )
  }

  // Merge the opt-out into existing preferences
  const merged = {
    ...(user.notification_preferences ?? {}),
    [type]: false,
  }

  await supabase.from('users').update({ notification_preferences: merged }).eq('id', userId)

  return NextResponse.json({
    message: `You have been unsubscribed from "${type.replace(/_/g, ' ')}" email notifications. You can re-enable this in your profile settings.`,
  })
}

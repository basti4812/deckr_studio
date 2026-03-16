import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// PATCH /api/notifications/[id] — mark a single notification as read
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await checkRateLimit(user.id, 'notifications:read', 30, 60 * 1000)
  if (limited) return limited

  const { id } = await params
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Invalid notification ID' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('tenant_id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

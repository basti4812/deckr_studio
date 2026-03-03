import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/notifications — list caller's notifications (paginated)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await checkRateLimit(user.id, 'notifications:list', 30, 60 * 1000)
  if (limited) return limited

  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor') // ISO timestamp for pagination
  const limitParam = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 50)

  const supabase = createServiceClient()

  let query = supabase
    .from('notifications')
    .select('id, type, message, resource_type, resource_id, is_read, created_at')
    .eq('user_id', user.id)
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })
    .limit(limitParam + 1) // fetch one extra to detect hasMore

  if (cursor) {
    query = query.lt('created_at', cursor)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = data ?? []
  const hasMore = items.length > limitParam
  const notifications = hasMore ? items.slice(0, limitParam) : items
  const nextCursor = hasMore ? notifications[notifications.length - 1].created_at : null

  // Also return unread count for the badge
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('tenant_id', profile.tenant_id)
    .eq('is_read', false)

  return NextResponse.json({
    notifications,
    unreadCount: count ?? 0,
    nextCursor,
    hasMore,
  })
}

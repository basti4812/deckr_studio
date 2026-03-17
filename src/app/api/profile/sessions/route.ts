import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/profile/sessions — list the current user's active sessions
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = await checkRateLimit(auth.user.id, 'sessions-list', 20, 60_000)
  if (limited) return limited

  const supabase = createServiceClient()

  const { data: sessions, error } = await supabase
    .from('user_sessions')
    .select('id, device_info, ip_address, last_active_at, created_at')
    .eq('user_id', auth.user.id)
    .order('last_active_at', { ascending: false })
    .limit(20)

  if (error) {
    return NextResponse.json({ error: 'Failed to load sessions' }, { status: 500 })
  }

  return NextResponse.json({ sessions })
}

// ---------------------------------------------------------------------------
// DELETE /api/profile/sessions — revoke all other sessions
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = await checkRateLimit(auth.user.id, 'sessions-revoke', 5, 60_000)
  if (limited) return limited

  // Get the current session ID from the request header
  const currentSessionId = request.headers.get('x-session-id')

  const supabase = createServiceClient()

  // Delete all sessions for this user except the current one
  let query = supabase.from('user_sessions').delete().eq('user_id', auth.user.id)

  if (currentSessionId) {
    query = query.neq('id', currentSessionId)
  }

  const { error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to revoke sessions' }, { status: 500 })
  }

  // Sign out all other sessions via Supabase Admin API
  const adminClient = createServiceClient()
  await adminClient.auth.admin.signOut(auth.user.id, 'others')

  return NextResponse.json({ success: true })
}

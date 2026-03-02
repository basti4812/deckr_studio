import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// GET /api/team/search?q=... — search active users within the same tenant
// Returns matching users by display_name or email (case-insensitive).
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'team-search', 30, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const query = request.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json({ users: [] })
  }

  // Sanitize: limit to 50 chars, escape ILIKE wildcards
  const safeQuery = query
    .slice(0, 50)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')

  const supabase = createServiceClient()

  // Search by display_name or email (case-insensitive ILIKE)
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, email')
    .eq('tenant_id', profile.tenant_id)
    .eq('is_active', true)
    .neq('id', user.id) // exclude the caller
    .or(`display_name.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`)
    .order('display_name', { ascending: true })
    .limit(10)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    users: (data ?? []).map((u) => ({
      id: u.id,
      display_name: u.display_name ?? u.email,
      email: u.email,
    })),
  })
}

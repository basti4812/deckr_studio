import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// GET /api/projects/archived — list archived projects owned by the caller
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limited = await checkRateLimit(user.id, 'projects-archived', 30, 60_000)
  if (limited) return limited

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', user.id)
    .eq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data ?? [] })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// GET /api/projects/shared — list projects shared with the current user
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'projects-shared', 30, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const supabase = createServiceClient()

  // Get share records for this user, then fetch the associated projects
  const { data: shareRecords, error: sharesError } = await supabase
    .from('project_shares')
    .select('project_id, permission')
    .eq('user_id', auth.user.id)

  if (sharesError) return NextResponse.json({ error: sharesError.message }, { status: 500 })
  if (!shareRecords || shareRecords.length === 0) {
    return NextResponse.json({ projects: [] })
  }

  const projectIds = shareRecords.map((s) => s.project_id)

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .in('id', projectIds)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (projectsError) return NextResponse.json({ error: projectsError.message }, { status: 500 })

  // Attach userPermission to each project
  const permissionMap = new Map(shareRecords.map((s) => [s.project_id, s.permission]))
  const enriched = (projects ?? []).map((p) => ({
    ...p,
    userPermission: permissionMap.get(p.id) ?? 'view',
  }))

  return NextResponse.json({ projects: enriched })
}

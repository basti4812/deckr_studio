import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/comments/counts — comment counts per slide
// Returns { counts: { [slide_id]: number } }
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'comments:counts', 60, 60_000)
  if (limited) return limited

  const { id: projectId } = await params
  const supabase = createServiceClient()

  // SEC: Verify project access with tenant_id filter
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (project.owner_id !== auth.user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Count non-deleted comments grouped by slide_id
  const { data: comments, error } = await supabase
    .from('comments')
    .select('slide_id')
    .eq('project_id', projectId)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const c of comments ?? []) {
    counts[c.slide_id] = (counts[c.slide_id] ?? 0) + 1
  }

  return NextResponse.json({ counts })
}

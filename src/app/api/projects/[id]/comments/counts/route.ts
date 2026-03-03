import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/comments/counts — comment counts per slide
// Returns { counts: { [slide_id]: number } }
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'comments:counts', 60, 60_000)
  if (limited) return limited

  const { id: projectId } = await params
  const supabase = createServiceClient()

  // Verify project access (owner or shared user)
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (project.owner_id !== user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
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

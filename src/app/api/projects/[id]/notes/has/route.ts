import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/notes/has — which slides the user has notes on
// Returns { slides: { [slide_id]: true } }
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'notes:has', 60, 60_000)
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

  // Fetch slide_ids where user has a non-empty note
  const { data: notes, error } = await supabase
    .from('slide_notes')
    .select('slide_id')
    .eq('project_id', projectId)
    .eq('user_id', auth.user.id)
    .neq('body', '')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const slides: Record<string, boolean> = {}
  for (const n of notes ?? []) {
    slides[n.slide_id] = true
  }

  return NextResponse.json({ slides })
}

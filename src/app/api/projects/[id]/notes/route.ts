import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// Verify project access — user must be owner or in project_shares
// ---------------------------------------------------------------------------

async function verifyProjectAccess(projectId: string, userId: string): Promise<boolean> {
  const supabase = createServiceClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .single()

  if (!project) return false
  if (project.owner_id === userId) return true

  const { data: share } = await supabase
    .from('project_shares')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  return !!share
}

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/notes?slide_id=xxx — fetch user's note for a slide
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'notes:get', 60, 60_000)
  if (limited) return limited

  const { id: projectId } = await params
  const slideId = request.nextUrl.searchParams.get('slide_id')
  if (!slideId || !z.string().uuid().safeParse(slideId).success) {
    return NextResponse.json({ error: 'Valid slide_id is required' }, { status: 400 })
  }

  const hasAccess = await verifyProjectAccess(projectId, user.id)
  if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data: note, error } = await supabase
    .from('slide_notes')
    .select('body, updated_at')
    .eq('project_id', projectId)
    .eq('slide_id', slideId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note: note ?? null })
}

// ---------------------------------------------------------------------------
// PUT /api/projects/[id]/notes — upsert a note
// ---------------------------------------------------------------------------

const UpsertNoteSchema = z.object({
  slide_id: z.string().uuid(),
  slide_instance_index: z.number().int().min(0).default(0),
  body: z.string().max(2000),
})

export async function PUT(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'notes:upsert', 60, 60_000)
  if (limited) return limited

  const { id: projectId } = await params

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = UpsertNoteSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { slide_id, slide_instance_index, body } = parsed.data

  const hasAccess = await verifyProjectAccess(projectId, user.id)
  if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data: note, error } = await supabase
    .from('slide_notes')
    .upsert(
      {
        project_id: projectId,
        slide_id,
        slide_instance_index,
        user_id: user.id,
        body,
      },
      { onConflict: 'project_id,slide_id,user_id' }
    )
    .select('body, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note })
}

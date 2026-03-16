import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// Verify project access — user must be owner or in project_shares
// ---------------------------------------------------------------------------

async function verifyProjectAccess(
  projectId: string,
  userId: string
): Promise<{
  project: { id: string; owner_id: string; tenant_id: string; name: string; status: string }
} | null> {
  const supabase = createServiceClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id, name, status')
    .eq('id', projectId)
    .single()

  if (!project) return null

  if (project.owner_id === userId) return { project }

  const { data: share } = await supabase
    .from('project_shares')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!share) return null
  return { project }
}

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/comments?slide_id=xxx
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'comments:list', 60, 60_000)
  if (limited) return limited

  const { id } = await params
  const slideId = request.nextUrl.searchParams.get('slide_id')
  if (!slideId || !z.string().uuid().safeParse(slideId).success) {
    return NextResponse.json({ error: 'Valid slide_id is required' }, { status: 400 })
  }

  const access = await verifyProjectAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data: comments, error } = await supabase
    .from('comments')
    .select(
      'id, project_id, slide_id, slide_instance_index, parent_comment_id, author_id, body, created_at, deleted_at'
    )
    .eq('project_id', id)
    .eq('slide_id', slideId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch author info for all unique author IDs
  const authorIds = [...new Set((comments ?? []).map((c) => c.author_id))]
  const { data: authors } =
    authorIds.length > 0
      ? await supabase
          .from('users')
          .select('id, display_name, avatar_url, is_active')
          .in('id', authorIds)
      : { data: [] }

  const authorMap = new Map((authors ?? []).map((a) => [a.id, a]))

  const enriched = (comments ?? []).map((c) => {
    const author = authorMap.get(c.author_id)
    return {
      ...c,
      author_name:
        author?.is_active !== false ? (author?.display_name ?? 'Unknown') : 'Former member',
      author_avatar: author?.is_active !== false ? (author?.avatar_url ?? null) : null,
    }
  })

  return NextResponse.json({ comments: enriched })
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/comments — create a comment or reply
// ---------------------------------------------------------------------------

const CreateCommentSchema = z.object({
  slide_id: z.string().uuid(),
  slide_instance_index: z.number().int().min(0).default(0),
  parent_comment_id: z.string().uuid().nullable().optional(),
  body: z.string().min(1).max(2000),
})

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'comments:create', 30, 60_000)
  if (limited) return limited

  const { id } = await params

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CreateCommentSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { slide_id, slide_instance_index, parent_comment_id, body } = parsed.data

  const access = await verifyProjectAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Archived projects cannot receive new comments
  if (access.project.status === 'archived') {
    return NextResponse.json({ error: 'Cannot comment on an archived project' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // If replying, verify parent exists and is a top-level comment
  if (parent_comment_id) {
    const { data: parent } = await supabase
      .from('comments')
      .select('id, parent_comment_id')
      .eq('id', parent_comment_id)
      .eq('project_id', id)
      .single()

    if (!parent) {
      return NextResponse.json({ error: 'Parent comment not found' }, { status: 404 })
    }
    if (parent.parent_comment_id) {
      return NextResponse.json(
        { error: 'Cannot reply to a reply — only one level of nesting' },
        { status: 400 }
      )
    }
  }

  const { data: comment, error } = await supabase
    .from('comments')
    .insert({
      project_id: id,
      slide_id,
      slide_instance_index,
      parent_comment_id: parent_comment_id ?? null,
      author_id: user.id,
      body: body.trim(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify all other project participants (fire-and-forget)
  notifyCommentAdded(access.project, user.id, slide_id, body).catch(() => {})

  return NextResponse.json({ comment }, { status: 201 })
}

// ---------------------------------------------------------------------------
// Notify project participants about a new comment
// ---------------------------------------------------------------------------

async function notifyCommentAdded(
  project: { id: string; owner_id: string; tenant_id: string; name: string },
  commenterId: string,
  slideId: string,
  body: string
): Promise<void> {
  const supabase = createServiceClient()

  // Get all participants: owner + shared users
  const { data: shares } = await supabase
    .from('project_shares')
    .select('user_id')
    .eq('project_id', project.id)

  const allParticipants = [project.owner_id, ...(shares ?? []).map((s) => s.user_id)]
  const recipients = [...new Set(allParticipants)].filter((uid) => uid !== commenterId)

  if (recipients.length === 0) return

  // Get commenter name and slide title
  const [{ data: commenterProfile }, { data: slide }] = await Promise.all([
    supabase.from('users').select('display_name').eq('id', commenterId).single(),
    supabase.from('slides').select('title').eq('id', slideId).single(),
  ])

  const commenterName = commenterProfile?.display_name ?? 'Someone'
  const slideTitle = slide?.title ?? 'a slide'
  const preview = body.length > 60 ? body.slice(0, 60) + '…' : body

  await createNotifications(
    recipients.map((userId) => ({
      tenantId: project.tenant_id,
      userId,
      type: 'comment_added' as const,
      message: `${commenterName} commented on "${slideTitle}" in "${project.name}": "${preview}"`,
      resourceType: 'project' as const,
      resourceId: project.id,
    }))
  )
}

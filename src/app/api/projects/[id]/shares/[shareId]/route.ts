import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string; shareId: string }>

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id]/shares/[shareId] — update permission (owner only)
// ---------------------------------------------------------------------------

const UpdateSchema = z.object({
  permission: z.enum(['view', 'edit']),
})

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-shares-update', 30, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id, shareId } = await params
  let body: unknown = {}
  try { body = await request.json() } catch { /* ok */ }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Update the share
  const { data: share, error } = await supabase
    .from('project_shares')
    .update({ permission: parsed.data.permission })
    .eq('id', shareId)
    .eq('project_id', id)
    .select()
    .single()

  if (error || !share) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

  return NextResponse.json({ share })
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/shares/[shareId] — remove share (owner or shared user)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-shares-delete', 20, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id, shareId } = await params
  const supabase = createServiceClient()

  // First, check the share record
  const { data: share } = await supabase
    .from('project_shares')
    .select('id, user_id, project_id')
    .eq('id', shareId)
    .eq('project_id', id)
    .single()

  if (!share) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

  // Allow if: caller is the project owner OR caller is the shared user (leaving)
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', id)
    .single()

  const isOwner = project?.owner_id === user.id
  const isSharedUser = share.user_id === user.id

  if (!isOwner && !isSharedUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('project_shares')
    .delete()
    .eq('id', shareId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

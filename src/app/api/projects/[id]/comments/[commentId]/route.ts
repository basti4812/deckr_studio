import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string; commentId: string }>

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/comments/[commentId] — soft-delete a comment
// Own comment, admin, or project owner can delete.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'comments:delete', 30, 60_000)
  if (limited) return limited

  const { id: projectId, commentId } = await params
  const supabase = createServiceClient()

  // Fetch comment + project in parallel (SEC: tenant_id filter)
  const [{ data: comment }, { data: project }] = await Promise.all([
    supabase
      .from('comments')
      .select('id, author_id, project_id, deleted_at')
      .eq('id', commentId)
      .eq('project_id', projectId)
      .single(),
    supabase
      .from('projects')
      .select('id, owner_id, tenant_id')
      .eq('id', projectId)
      .eq('tenant_id', auth.profile.tenant_id)
      .single(),
  ])

  if (!comment || !project) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  if (comment.deleted_at) {
    return NextResponse.json({ error: 'Comment already deleted' }, { status: 400 })
  }

  // Permission: own comment, project owner, or tenant admin
  const isAuthor = comment.author_id === auth.user.id
  const isProjectOwner = project.owner_id === auth.user.id

  if (!isAuthor && !isProjectOwner) {
    const isAdmin = auth.profile.role === 'admin'
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Soft-delete
  const { error } = await supabase
    .from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string; commentId: string }>

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/comments/[commentId] — soft-delete a comment
// Own comment, admin, or project owner can delete.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'comments:delete', 30, 60_000)
  if (limited) return limited

  const { id: projectId, commentId } = await params
  const supabase = createServiceClient()

  // Fetch comment + project in parallel
  const [{ data: comment }, { data: project }] = await Promise.all([
    supabase
      .from('comments')
      .select('id, author_id, project_id, deleted_at')
      .eq('id', commentId)
      .eq('project_id', projectId)
      .single(),
    supabase.from('projects').select('id, owner_id, tenant_id').eq('id', projectId).single(),
  ])

  if (!comment || !project) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
  }

  if (comment.deleted_at) {
    return NextResponse.json({ error: 'Comment already deleted' }, { status: 400 })
  }

  // Permission: own comment, project owner, or tenant admin
  const isAuthor = comment.author_id === user.id
  const isProjectOwner = project.owner_id === user.id

  if (!isAuthor && !isProjectOwner) {
    const profile = await getUserProfile(user.id)
    const isAdmin = profile?.role === 'admin' && profile?.tenant_id === project.tenant_id
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

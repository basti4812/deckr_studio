import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string; linkId: string }>

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/share-links/[linkId] — revoke a share link
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'share-links-delete', 20, 60_000)
  if (limited) return limited

  const { id, linkId } = await params
  const supabase = createServiceClient()

  // Verify the share link exists and belongs to this project
  const { data: link } = await supabase
    .from('share_links')
    .select('id, project_id')
    .eq('id', linkId)
    .eq('project_id', id)
    .single()

  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify ownership or edit permission
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (project.owner_id !== user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (share?.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from('share_links')
    .delete()
    .eq('id', linkId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

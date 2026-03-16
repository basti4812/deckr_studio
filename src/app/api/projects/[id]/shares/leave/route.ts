import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/shares/leave — leave a shared project (shared user)
// Looks up the share record by project_id + current user, then deletes it.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-shares-leave', 10, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceClient()

  // Find the share record for this user + project
  const { data: share } = await supabase
    .from('project_shares')
    .select('id')
    .eq('project_id', id)
    .eq('user_id', user.id)
    .single()

  if (!share) return NextResponse.json({ error: 'Share not found' }, { status: 404 })

  const { error } = await supabase.from('project_shares').delete().eq('id', share.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

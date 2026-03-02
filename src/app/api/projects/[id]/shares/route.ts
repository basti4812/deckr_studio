import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/shares — list all shares for a project (owner only)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-shares-list', 30, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceClient()

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get shares with user info
  const { data: shares, error } = await supabase
    .from('project_shares')
    .select('id, user_id, permission, created_at, users!project_shares_user_id_fkey(display_name, email)')
    .eq('project_id', id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Flatten the user join
  const result = (shares ?? []).map((s) => {
    const userInfo = s.users as unknown as { display_name: string | null; email: string } | null
    return {
      id: s.id,
      user_id: s.user_id,
      display_name: userInfo?.display_name ?? 'Unknown',
      email: userInfo?.email ?? '',
      permission: s.permission,
      created_at: s.created_at,
    }
  })

  return NextResponse.json({ shares: result })
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/shares — add a new share (owner only)
// ---------------------------------------------------------------------------

const AddShareSchema = z.object({
  user_id: z.string().uuid(),
  permission: z.enum(['view', 'edit']),
})

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-shares-create', 30, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  let body: unknown = {}
  try { body = await request.json() } catch { /* ok */ }

  const parsed = AddShareSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const { user_id: targetUserId, permission } = parsed.data
  const supabase = createServiceClient()

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Cannot share with yourself
  if (targetUserId === user.id) {
    return NextResponse.json({ error: 'You already own this project' }, { status: 400 })
  }

  // Verify target user is in the same tenant and active
  const { data: targetProfile } = await supabase
    .from('users')
    .select('id, tenant_id, is_active')
    .eq('id', targetUserId)
    .single()

  if (!targetProfile || targetProfile.tenant_id !== project.tenant_id) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  if (!targetProfile.is_active) {
    return NextResponse.json({ error: 'User is not active' }, { status: 400 })
  }

  // Create share record
  const { data: share, error } = await supabase
    .from('project_shares')
    .insert({
      project_id: id,
      user_id: targetUserId,
      permission,
      shared_by: user.id,
    })
    .select()
    .single()

  if (error) {
    // Unique constraint violation = already shared
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This user already has access to this project' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // TODO: When PROJ-13 (notifications) is built, trigger a sharing notification here

  return NextResponse.json({ share }, { status: 201 })
}

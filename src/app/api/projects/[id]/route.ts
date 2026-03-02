import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

const SlideOrderSchema = z.array(
  z.object({ id: z.string().min(1), slide_id: z.string().min(1) })
).max(500)

const TextEditsSchema = z
  .record(z.string(), z.record(z.string(), z.string().max(10_000)))
  .refine((val) => JSON.stringify(val).length <= 500_000, {
    message: 'text_edits exceeds 500 KB limit',
  })

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-get', 60, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceClient()

  // Try to fetch the project
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Determine permission level
  if (data.owner_id === user.id) {
    // Fetch owner display name
    const { data: ownerProfile } = await supabase
      .from('users')
      .select('display_name')
      .eq('id', user.id)
      .single()
    return NextResponse.json({
      project: {
        ...data,
        userPermission: 'owner',
        owner_name: ownerProfile?.display_name ?? 'Owner',
      },
    })
  }

  // Check for share record
  const { data: share } = await supabase
    .from('project_shares')
    .select('permission')
    .eq('project_id', id)
    .eq('user_id', user.id)
    .single()

  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Fetch owner display name for shared users
  const { data: ownerProfile } = await supabase
    .from('users')
    .select('display_name')
    .eq('id', data.owner_id)
    .single()

  return NextResponse.json({
    project: {
      ...data,
      userPermission: share.permission,
      owner_name: ownerProfile?.display_name ?? 'Owner',
    },
  })
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id] — update name, slide_order, text_edits, or status
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-patch', 60, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  let body: { name?: string; slide_order?: unknown[]; text_edits?: unknown; status?: string } = {}
  try { body = await request.json() } catch { /* ok */ }

  const supabase = createServiceClient()

  // Check access: owner can do everything, admin can do owner-level actions on
  // any project in their tenant, shared user with 'edit' can update content
  const { data: existing } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const isOwner = existing.owner_id === user.id
  const isAdmin = profile.role === 'admin' && profile.tenant_id === existing.tenant_id

  if (!isOwner && !isAdmin) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .single()

    if (!share || share.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    // Only the owner or admin can rename
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Only the owner can rename projects' }, { status: 403 })
    const name = body.name.trim()
    if (!name || name.length > 120) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    updates.name = name
  }
  if (body.slide_order !== undefined) {
    const parsed = SlideOrderSchema.safeParse(body.slide_order)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid slide_order' }, { status: 400 })
    updates.slide_order = parsed.data
  }
  if (body.text_edits !== undefined) {
    const parsed = TextEditsSchema.safeParse(body.text_edits)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid text_edits' }, { status: 400 })
    updates.text_edits = parsed.data
  }
  if (body.status !== undefined) {
    if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Only the owner can archive or restore projects' }, { status: 403 })
    const parsed = z.enum(['active', 'archived']).safeParse(body.status)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    updates.status = parsed.data
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-delete', 10, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id')
    .eq('id', id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Owner or admin in same tenant can delete
  const isOwner = existing.owner_id === user.id
  if (!isOwner) {
    const profile = await getUserProfile(user.id)
    if (!profile || !profile.is_active || profile.role !== 'admin' || profile.tenant_id !== existing.tenant_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

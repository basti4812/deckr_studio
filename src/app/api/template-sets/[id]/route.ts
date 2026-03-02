import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// PATCH /api/template-sets/[id] — update metadata
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'template-sets:update', 60, 60 * 1000)
  if (limited) return limited

  const { id } = await params

  let body: { name?: string; description?: string; category?: string; cover_image_url?: string | null } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('template_sets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (name.length > 100) return NextResponse.json({ error: 'Name max 100 characters' }, { status: 400 })
    updates.name = name
  }
  if (body.description !== undefined) {
    const description = body.description?.trim() || null
    if (description && description.length > 500) {
      return NextResponse.json({ error: 'Description max 500 characters' }, { status: 400 })
    }
    updates.description = description
  }
  if (body.category !== undefined) {
    const category = body.category?.trim() || null
    if (category && category.length > 50) {
      return NextResponse.json({ error: 'Category max 50 characters' }, { status: 400 })
    }
    updates.category = category
  }
  if (body.cover_image_url !== undefined) {
    updates.cover_image_url = body.cover_image_url
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('template_sets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templateSet: data })
}

// ---------------------------------------------------------------------------
// DELETE /api/template-sets/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited2 = await checkRateLimit(auth.user.id, 'template-sets:delete', 20, 60 * 1000)
  if (limited2) return limited2

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('template_sets')
    .select('id, cover_image_url')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  const { error } = await supabase.from('template_sets').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort: remove cover image from storage
  if (existing.cover_image_url) {
    const dir = `${auth.profile.tenant_id}/${id}`
    const { data: files } = await supabase.storage.from('template-sets').list(dir)
    if (files && files.length > 0) {
      await supabase.storage.from('template-sets').remove(files.map((f) => `${dir}/${f.name}`))
    }
  }

  return NextResponse.json({ success: true })
}

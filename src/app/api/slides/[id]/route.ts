import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// PATCH /api/slides/[id] — update title, status, editable_fields, pptx_url
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  let body: {
    title?: string
    status?: string
    pptx_url?: string
    thumbnail_url?: string
    editable_fields?: unknown[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { title, status, pptx_url, thumbnail_url, editable_fields } = body

  if (status !== undefined) {
    const validStatuses = ['standard', 'mandatory', 'deprecated']
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
  }

  const supabase = createServiceClient()

  // Verify the slide belongs to this admin's tenant
  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select('id, tenant_id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title.trim()
  if (status !== undefined) updates.status = status
  if (pptx_url !== undefined) updates.pptx_url = pptx_url
  if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url
  if (editable_fields !== undefined) updates.editable_fields = editable_fields

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('slides')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ slide: data })
}

// ---------------------------------------------------------------------------
// DELETE /api/slides/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params
  const supabase = createServiceClient()

  // Verify the slide belongs to this admin's tenant
  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select('id, tenant_id, pptx_url')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  // Check if any project references this slide
  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', auth.profile.tenant_id)
    .contains('slide_order', [{ slide_id: id }])

  if (projectCount && projectCount > 0) {
    return NextResponse.json(
      { error: `Slide is used in ${projectCount} project${projectCount !== 1 ? 's' : ''}. Remove it from all projects before deleting.` },
      { status: 409 }
    )
  }

  // Delete the DB record
  const { error } = await supabase.from('slides').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort: remove storage file
  if (existing.pptx_url) {
    const storagePath = `${auth.profile.tenant_id}/${id}/original.pptx`
    await supabase.storage.from('slides').remove([storagePath])
  }

  return NextResponse.json({ success: true })
}

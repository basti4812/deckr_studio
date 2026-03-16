import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string; slideId: string }>

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]/personal-slides/[slideId]
// Deletes the DB record and removes the file from storage.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'personal-slides:delete', 30, 60_000)
  if (limited) return limited

  const { id: projectId, slideId } = await params
  const supabase = createServiceClient()

  // SEC: Verify project access with tenant_id filter (owner or editor)
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, slide_order')
    .eq('id', projectId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let canEdit = project.owner_id === auth.user.id
  if (!canEdit) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', projectId)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    canEdit = share?.permission === 'edit'
  }

  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch the personal slide record
  const { data: slide } = await supabase
    .from('project_personal_slides')
    .select('id, pptx_storage_path')
    .eq('id', slideId)
    .eq('project_id', projectId)
    .single()

  if (!slide) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Delete from storage
  if (slide.pptx_storage_path) {
    await supabase.storage.from('personal-slides').remove([slide.pptx_storage_path])
  }

  // Delete DB record
  const { error } = await supabase.from('project_personal_slides').delete().eq('id', slideId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Clean up slide_order — remove references to the deleted personal slide
  const slideOrder = Array.isArray(project.slide_order) ? project.slide_order : []
  interface TrayItem {
    id: string
    slide_id: string
    is_personal?: boolean
    personal_slide_id?: string
  }
  const filtered = (slideOrder as TrayItem[]).filter(
    (item) => !(item.is_personal && item.personal_slide_id === slideId)
  )
  if (filtered.length !== slideOrder.length) {
    await supabase.from('projects').update({ slide_order: filtered }).eq('id', projectId)
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/duplicate
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-duplicate', 10, 60_000)
  if (limited) return limited

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 })
  }

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const supabase = createServiceClient()

  // Fetch the original project
  const { data: original, error: fetchError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !original) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Tenant isolation: project must belong to the same tenant as the user
  if (original.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Check access: user must own OR have a share record
  if (original.owner_id !== user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('id')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!share) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  }

  // Build duplicate name — "Copy of [name]" truncated to 120 chars
  const prefix = 'Copy of '
  const maxNameLength = 120
  let duplicateName = prefix + original.name
  if (duplicateName.length > maxNameLength) {
    duplicateName = duplicateName.slice(0, maxNameLength)
  }

  // Insert the duplicate (single transaction)
  const { data: duplicate, error: insertError } = await supabase
    .from('projects')
    .insert({
      name: duplicateName,
      owner_id: user.id,
      tenant_id: profile.tenant_id,
      slide_order: original.slide_order ?? [],
      text_edits: original.text_edits ?? {},
      status: 'active',
    })
    .select()
    .single()

  if (insertError || !duplicate) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Failed to duplicate project' },
      { status: 500 },
    )
  }

  // Copy personal slides (PROJ-32) — create new records for the duplicate project
  interface TrayItem { id: string; slide_id: string; is_personal?: boolean; personal_slide_id?: string }
  const slideOrder: TrayItem[] = Array.isArray(original.slide_order) ? original.slide_order : []
  const personalItems = slideOrder.filter((t: TrayItem) => t.is_personal && t.personal_slide_id)

  if (personalItems.length > 0) {
    const personalSlideIds = [...new Set(personalItems.map((t: TrayItem) => t.personal_slide_id!))]

    const { data: originalPersonalSlides } = await supabase
      .from('project_personal_slides')
      .select('id, user_id, title, filename, pptx_storage_path, file_size_bytes')
      .in('id', personalSlideIds)
      .eq('project_id', id)

    if (originalPersonalSlides && originalPersonalSlides.length > 0) {
      // Create new records for the duplicate project and build ID mapping
      const idMap = new Map<string, string>() // old ID → new ID

      const newRecords = originalPersonalSlides.map((ps) => {
        const newId = crypto.randomUUID()
        idMap.set(ps.id, newId)
        return {
          id: newId,
          project_id: duplicate.id,
          user_id: ps.user_id,
          title: ps.title,
          filename: ps.filename,
          pptx_storage_path: ps.pptx_storage_path, // shared file reference
          file_size_bytes: ps.file_size_bytes,
        }
      })

      await supabase.from('project_personal_slides').insert(newRecords)

      // Update the duplicate's slide_order to reference the new personal slide IDs
      const updatedSlideOrder = slideOrder.map((item: TrayItem) => {
        if (item.is_personal && item.personal_slide_id && idMap.has(item.personal_slide_id)) {
          return { ...item, id: crypto.randomUUID(), personal_slide_id: idMap.get(item.personal_slide_id)! }
        }
        return { ...item, id: crypto.randomUUID() }
      })

      await supabase
        .from('projects')
        .update({ slide_order: updatedSlideOrder })
        .eq('id', duplicate.id)

      duplicate.slide_order = updatedSlideOrder
    }
  }

  return NextResponse.json({ project: duplicate }, { status: 201 })
}

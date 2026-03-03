import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string; versionId: string }>

interface TrayItem {
  id: string
  slide_id: string
  is_personal?: boolean
  personal_slide_id?: string
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/versions/[versionId]/restore
// Restores a version snapshot, preserving personal slides.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'versions-restore', 5, 60_000)
  if (limited) return limited

  const { id, versionId } = await params
  const supabase = createServiceClient()

  // Load project + verify access
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id, slide_order')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active || profile.tenant_id !== project.tenant_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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

  // Load the version snapshot
  const { data: version } = await supabase
    .from('project_versions')
    .select('id, project_id, slide_order_snapshot, text_edits_snapshot')
    .eq('id', versionId)
    .eq('project_id', id)
    .single()

  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

  // Preserve personal slides: find personal entries in current slide_order
  // that are not in the snapshot, and append them
  const currentItems: TrayItem[] = Array.isArray(project.slide_order) ? project.slide_order : []
  const snapshotItems: TrayItem[] = Array.isArray(version.slide_order_snapshot)
    ? version.slide_order_snapshot
    : []

  const snapshotPersonalIds = new Set(
    snapshotItems
      .filter((t: TrayItem) => t.is_personal && t.personal_slide_id)
      .map((t: TrayItem) => t.personal_slide_id)
  )

  const personalToPreserve = currentItems.filter(
    (t) => t.is_personal && t.personal_slide_id && !snapshotPersonalIds.has(t.personal_slide_id)
  )

  const mergedSlideOrder = [...snapshotItems, ...personalToPreserve]

  // Update the project
  const { error: updateError } = await supabase
    .from('projects')
    .update({
      slide_order: mergedSlideOrder,
      text_edits: version.text_edits_snapshot ?? {},
    })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

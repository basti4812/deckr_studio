import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { isAllowedStorageUrl } from '@/lib/url-validation'
import { renderSlidePreview, hasActualEdits, type EditableField } from '@/lib/slide-renderer'

const RequestSchema = z.object({
  slideId: z.string().uuid(),
  projectId: z.string().uuid(),
  instanceId: z.string(),
  edits: z.record(z.string(), z.string()),
})

/**
 * POST /api/slides/render-preview
 *
 * Renders a preview thumbnail for a slide with text edits applied.
 * Uses the shared renderSlidePreview function (full PPTX → ConvertAPI → pick page).
 */
export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'slides:render-preview', 10, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (!process.env.CONVERTAPI_SECRET) {
    return NextResponse.json({ error: 'CONVERTAPI_SECRET not configured' }, { status: 500 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { slideId, projectId, instanceId, edits } = parsed.data
  const supabase = createServiceClient()

  // Verify slide belongs to user's tenant
  const { data: slide, error: slideErr } = await supabase
    .from('slides')
    .select('id, pptx_url, page_index, page_count, tenant_id, editable_fields')
    .eq('id', slideId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (slideErr || !slide) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  if (!slide.pptx_url) {
    return NextResponse.json({ error: 'Slide has no PPTX file' }, { status: 422 })
  }

  // Verify project belongs to user's tenant
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const fields = Array.isArray(slide.editable_fields)
    ? (slide.editable_fields as EditableField[])
    : []

  if (!hasActualEdits(fields, edits)) {
    // No actual edits — return original thumbnail
    const { data: original } = await supabase
      .from('slides')
      .select('thumbnail_url')
      .eq('id', slideId)
      .single()
    return NextResponse.json({ previewUrl: original?.thumbnail_url ?? null })
  }

  // SEC-9: Validate pptx_url points to Supabase storage (prevent SSRF)
  if (!isAllowedStorageUrl(slide.pptx_url)) {
    return NextResponse.json({ error: 'Invalid slide URL' }, { status: 422 })
  }

  try {
    const previewUrl = await renderSlidePreview({
      projectId,
      instanceId,
      tenantId: auth.profile.tenant_id,
      pptxUrl: slide.pptx_url,
      pageIndex: slide.page_index ?? 0,
      pageCount: slide.page_count ?? 1,
      editableFields: fields,
      edits,
    })

    return NextResponse.json({ previewUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[render-preview] Error:', msg)
    return NextResponse.json({ error: 'Preview rendering failed' }, { status: 500 })
  }
}

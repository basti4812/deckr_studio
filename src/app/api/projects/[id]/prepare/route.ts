import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

export const maxDuration = 60
import { isAllowedStorageUrl } from '@/lib/url-validation'
import {
  renderSlidePreview,
  hasActualEdits,
  hashEdits,
  type EditableField,
} from '@/lib/slide-renderer'

const RequestSchema = z.object({
  format: z.enum(['presentation', 'share', 'pdf']),
})

type Params = Promise<{ id: string }>

interface RenderedPreviewEntry {
  url: string
  hash: string
}

/**
 * POST /api/projects/[id]/prepare
 *
 * Batch-renders all slides that have text edits applied.
 * For each tray item with edits: PPTX → text injection → ConvertAPI PNG → Storage.
 * Skips slides without edits or with unchanged edits (hash match).
 * Stores results in projects.rendered_previews for use by presentation,
 * share links, and PDF export.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  console.log('[prepare] ▶ Request received')
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'project:prepare', 5, 300_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  // Early check: ConvertAPI secret must be configured
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

  const { id } = await params
  const supabase = createServiceClient()

  // Load project (owner or shared-edit)
  console.log('[prepare] Loading project', id)
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id, slide_order, text_edits, rendered_previews')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (projErr || !project) {
    console.log('[prepare] Project not found:', projErr?.message)
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Permission check: owner, admin, or shared-edit
  const isOwner = project.owner_id === auth.user.id
  const isAdmin = auth.profile.role === 'admin'
  if (!isOwner && !isAdmin) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', auth.user.id)
      .single()

    if (!share || share.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const slideOrder = (project.slide_order ?? []) as { id: string; slide_id: string }[]
  const textEdits = (project.text_edits ?? {}) as Record<string, Record<string, string>>
  const existingPreviews = (project.rendered_previews ?? {}) as Record<string, RenderedPreviewEntry>

  console.log(
    '[prepare] Tray items:',
    slideOrder.length,
    '| Text edits keys:',
    Object.keys(textEdits).length
  )

  if (slideOrder.length === 0) {
    return NextResponse.json({ previews: {}, rendered: 0, skipped: 0 })
  }

  // Load all slides referenced in the tray
  const slideIds = [...new Set(slideOrder.map((s) => s.slide_id))]
  const { data: slides, error: slidesErr } = await supabase
    .from('slides')
    .select('id, pptx_url, page_index, page_count, editable_fields, thumbnail_url')
    .in('id', slideIds)
    .eq('tenant_id', auth.profile.tenant_id)

  if (slidesErr) {
    return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 })
  }

  const slideMap = new Map(slides!.map((s) => [s.id, s]))
  console.log('[prepare] Loaded', slides!.length, 'slides from DB')

  // Determine which instances need rendering
  interface RenderJob {
    instanceId: string
    slideId: string
    edits: Record<string, string>
    fields: EditableField[]
    pptxUrl: string
    pageIndex: number
    pageCount: number
  }

  const jobs: RenderJob[] = []
  const previews: Record<string, string> = {}
  let skipped = 0

  for (const item of slideOrder) {
    const slide = slideMap.get(item.slide_id)
    if (!slide) {
      console.log('[prepare] Slide not found:', item.slide_id)
      continue
    }

    const instanceEdits = textEdits[item.id] ?? {}
    const fields = Array.isArray(slide.editable_fields)
      ? (slide.editable_fields as EditableField[])
      : []

    // No edits → use original thumbnail
    if (!hasActualEdits(fields, instanceEdits)) {
      skipped++
      continue
    }

    // Check hash for cache hit
    const editHash = hashEdits(instanceEdits)
    const existing = existingPreviews[item.id]
    if (existing && existing.hash === editHash && existing.url) {
      previews[item.id] = existing.url
      skipped++
      continue
    }

    if (!slide.pptx_url) {
      console.log('[prepare] No pptx_url for slide:', item.slide_id)
      skipped++
      continue
    }

    // Validate PPTX URL (prevent SSRF)
    if (!isAllowedStorageUrl(slide.pptx_url)) {
      console.log('[prepare] URL rejected by SSRF check:', slide.pptx_url.slice(0, 80))
      skipped++
      continue
    }

    jobs.push({
      instanceId: item.id,
      slideId: item.slide_id,
      edits: instanceEdits,
      fields,
      pptxUrl: slide.pptx_url,
      pageIndex: slide.page_index ?? 0,
      pageCount: slide.page_count ?? 1,
    })
  }

  console.log('[prepare] Jobs to render:', jobs.length, '| Already skipped:', skipped)

  // Render in parallel with concurrency limit of 3
  const CONCURRENCY = 3
  let rendered = 0
  const errors: string[] = []

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const batch = jobs.slice(i, i + CONCURRENCY)
    console.log(
      `[prepare] Rendering batch ${Math.floor(i / CONCURRENCY) + 1} (${batch.length} jobs)`
    )
    const batchStart = Date.now()

    const results = await Promise.allSettled(
      batch.map(async (job) => {
        console.log(`[prepare]   → Rendering ${job.instanceId} (slide ${job.slideId})`)
        const url = await renderSlidePreview({
          projectId: id,
          instanceId: job.instanceId,
          tenantId: auth.profile.tenant_id,
          pptxUrl: job.pptxUrl,
          pageIndex: job.pageIndex,
          pageCount: job.pageCount,
          editableFields: job.fields,
          edits: job.edits,
        })
        console.log(`[prepare]   ✓ Rendered ${job.instanceId}`)
        return { instanceId: job.instanceId, url, hash: hashEdits(job.edits) }
      })
    )

    console.log(`[prepare] Batch done in ${Date.now() - batchStart}ms`)

    for (const result of results) {
      if (result.status === 'fulfilled') {
        previews[result.value.instanceId] = result.value.url
        rendered++
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : 'Unknown error'
        console.error('[prepare] Render failed:', msg)
        errors.push(msg)
      }
    }
  }

  console.log('[prepare] All rendering done. Rendered:', rendered, '| Errors:', errors.length)

  // Build updated rendered_previews (merge with existing, update rendered ones)
  const updatedPreviews: Record<string, RenderedPreviewEntry> = { ...existingPreviews }
  for (const [instanceId, url] of Object.entries(previews)) {
    const instanceEdits = textEdits[instanceId] ?? {}
    updatedPreviews[instanceId] = { url, hash: hashEdits(instanceEdits) }
  }

  // Remove entries for instances no longer in slide_order
  const activeInstanceIds = new Set(slideOrder.map((s) => s.id))
  for (const key of Object.keys(updatedPreviews)) {
    if (!activeInstanceIds.has(key)) {
      delete updatedPreviews[key]
    }
  }

  // Persist to database
  const { error: updateErr } = await supabase
    .from('projects')
    .update({ rendered_previews: updatedPreviews })
    .eq('id', id)

  if (updateErr) {
    console.error('[prepare] Failed to save rendered_previews:', updateErr.message)
    return NextResponse.json({ error: 'Failed to save previews' }, { status: 500 })
  }

  console.log('[prepare] ✓ Complete. Rendered:', rendered, '| Skipped:', skipped)

  return NextResponse.json({
    previews,
    rendered,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  })
}

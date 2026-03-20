import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-log'
import { onProjectExported } from '@/lib/crm-hooks'
import { isAllowedStorageUrl } from '@/lib/url-validation'
import {
  applyTextEdits as sharedApplyTextEdits,
  extractSinglePage,
  type EditableField,
} from '@/lib/slide-renderer'
import JSZip from 'jszip'

type Params = Promise<{ id: string }>

interface TrayItem {
  id: string
  slide_id: string
  is_personal?: boolean
  personal_slide_id?: string
}

interface SlideRecord {
  id: string
  title: string
  pptx_url: string | null
  page_index: number | null
  page_count: number | null
  editable_fields: EditableField[]
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/export — assemble + download .pptx
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'project-export-pptx', 10, 300_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { id } = await params
  const supabase = createServiceClient()

  // Load project
  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, name, owner_id, tenant_id, slide_order, text_edits, crm_customer_name, crm_company_name, crm_deal_id'
    )
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Verify access: owner or shared user with 'edit' permission
  if (project.owner_id !== auth.user.id) {
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

  const trayItems: TrayItem[] = Array.isArray(project.slide_order) ? project.slide_order : []
  if (trayItems.length === 0) {
    return NextResponse.json({ error: 'Add slides to export' }, { status: 400 })
  }

  const textEdits: Record<string, Record<string, string>> = project.text_edits &&
  typeof project.text_edits === 'object'
    ? (project.text_edits as Record<string, Record<string, string>>)
    : {}

  // Load all referenced library slides in one query (scoped to tenant)
  const libraryItems = trayItems.filter((t) => !t.is_personal)
  const slideIds = [...new Set(libraryItems.map((t) => t.slide_id).filter(Boolean))]
  const slideMap = new Map<string, SlideRecord>()

  if (slideIds.length > 0) {
    const { data: slidesData, error: slidesError } = await supabase
      .from('slides')
      .select('id, title, pptx_url, page_index, page_count, editable_fields')
      .in('id', slideIds)
      .eq('tenant_id', auth.profile.tenant_id)

    if (slidesError || !slidesData) {
      return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 })
    }
    for (const s of slidesData) slideMap.set(s.id, s as SlideRecord)
  }

  // Load personal slides referenced in this project (PROJ-32)
  const personalItems = trayItems.filter((t) => t.is_personal && t.personal_slide_id)
  const personalSlideIds = [...new Set(personalItems.map((t) => t.personal_slide_id!))]
  const personalSlideMap = new Map<
    string,
    { id: string; title: string; pptx_storage_path: string }
  >()

  if (personalSlideIds.length > 0) {
    const { data: psData } = await supabase
      .from('project_personal_slides')
      .select('id, title, pptx_storage_path')
      .in('id', personalSlideIds)
      .eq('project_id', id)

    if (psData) {
      for (const ps of psData) personalSlideMap.set(ps.id, ps)
    }
  }

  // Download and process each slide in tray order
  // Cache PPTX downloads by URL to avoid re-downloading the same multi-page file
  const pptxCache = new Map<string, ArrayBuffer>()
  const processedBuffers: Uint8Array[] = []

  for (const item of trayItems) {
    // Personal slide: download from personal-slides bucket, no text edits
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlideMap.get(item.personal_slide_id)
      if (!ps) {
        return NextResponse.json({ error: `Personal slide not found` }, { status: 422 })
      }

      const { data: fileData, error: storageError } = await supabase.storage
        .from('personal-slides')
        .download(ps.pptx_storage_path)

      if (storageError || !fileData) {
        return NextResponse.json(
          { error: `Could not download personal slide "${ps.title}". Please try again.` },
          { status: 502 }
        )
      }

      const buffer = await fileData.arrayBuffer()
      processedBuffers.push(new Uint8Array(buffer))
      continue
    }

    // Library slide — skip if deleted or missing PPTX
    const slide = slideMap.get(item.slide_id)
    if (!slide || !slide.pptx_url) {
      continue
    }

    // SEC-9: Validate pptx_url points to Supabase storage (prevent SSRF)
    if (!isAllowedStorageUrl(slide.pptx_url)) {
      continue
    }

    // Download PPTX from signed URL (with caching for multi-page files)
    let fullBuffer = pptxCache.get(slide.pptx_url)
    if (!fullBuffer) {
      const downloadRes = await fetch(slide.pptx_url)
      if (!downloadRes.ok) {
        return NextResponse.json(
          { error: `Could not download "${slide.title}". Please try again.` },
          { status: 502 }
        )
      }
      fullBuffer = await downloadRes.arrayBuffer()
      pptxCache.set(slide.pptx_url, fullBuffer)
    }

    // Extract single page from multi-page PPTX if needed
    const pageIndex = slide.page_index ?? 0
    const pageCount = slide.page_count ?? 1
    let slideBuffer: ArrayBuffer

    if (pageCount > 1) {
      slideBuffer = await extractSinglePage(fullBuffer, pageIndex)
    } else {
      slideBuffer = fullBuffer
    }

    const fields = Array.isArray(slide.editable_fields) ? slide.editable_fields : []
    const instanceEdits = textEdits[item.id] ?? {}

    const processed = await applyTextEdits(slideBuffer, fields, instanceEdits)
    processedBuffers.push(processed)
  }

  if (processedBuffers.length === 0) {
    return NextResponse.json(
      { error: 'No downloadable slides found. Some slides may have been deleted.' },
      { status: 400 }
    )
  }

  // Debug mode: analyze PPTX structure instead of returning binary
  const isAnalyze = request.nextUrl.searchParams.get('analyze') === '1'

  // Merge all processed slides into one .pptx
  let mergedBuffer: Uint8Array
  try {
    mergedBuffer = await mergePptxFiles(processedBuffers)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error'
    console.error('[export] mergePptxFiles failed:', detail)
    return NextResponse.json(
      { error: `Failed to assemble presentation: ${detail}` },
      { status: 500 }
    )
  }

  if (isAnalyze) {
    // Analyze input buffers + merged output
    const inputAnalyses = await Promise.all(
      processedBuffers.map((buf, i) => analyzePptxStructure(buf, `input[${i}]`))
    )
    const mergedAnalysis = await analyzePptxStructure(mergedBuffer, 'merged')
    return NextResponse.json({
      inputCount: processedBuffers.length,
      inputs: inputAnalyses,
      merged: mergedAnalysis,
    })
  }

  // Enforce 200 MB limit
  if (mergedBuffer.length > 200 * 1024 * 1024) {
    return NextResponse.json(
      { error: 'Presentation exceeds 200 MB. Remove some slides and try again.' },
      { status: 413 }
    )
  }

  // Auto-snapshot (fire-and-forget — PROJ-38)
  const autoLabel = `Export — ${new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`
  supabase
    .from('project_versions')
    .insert({
      project_id: id,
      label: autoLabel,
      slide_order_snapshot: project.slide_order ?? [],
      text_edits_snapshot: project.text_edits ?? {},
      is_auto: true,
    })
    .then(
      () => {},
      (err: unknown) => {
        console.error('[export] auto-snapshot failed', err)
      }
    )

  logActivity({
    tenantId: auth.profile.tenant_id,
    actorId: auth.user.id,
    eventType: 'project.exported',
    resourceType: 'project',
    resourceId: id,
    resourceName: project.name as string,
  })

  // CRM_INTEGRATION: notify CRM about export (fire-and-forget)
  onProjectExported({
    id: project.id,
    name: project.name as string,
    tenant_id: project.tenant_id,
    crm_customer_name: project.crm_customer_name,
    crm_company_name: project.crm_company_name,
    crm_deal_id: project.crm_deal_id,
  }).catch((err) => console.error('[crm-hooks] onProjectExported failed:', err))

  const safeName = (project.name as string)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  const filename = `${safeName || 'presentation'}.pptx`

  return new NextResponse(Buffer.from(mergedBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(mergedBuffer.length),
    },
  })
}

// ---------------------------------------------------------------------------
// Text replacement
// Replaces each field's placeholder token in the slide XML with the
// user-entered value. Placeholder tokens are embedded by admins in the .pptx
// (e.g. "{{COMPANY_NAME}}") matching the editable_fields[n].placeholder value.
// ---------------------------------------------------------------------------

async function applyTextEdits(
  buffer: ArrayBuffer,
  fields: EditableField[],
  instanceEdits: Record<string, string>
): Promise<Uint8Array> {
  const hasEdits = fields.some((f) => instanceEdits[f.id]?.trim())
  if (!hasEdits) return new Uint8Array(buffer)

  return sharedApplyTextEdits(buffer, fields, instanceEdits)
}

// ---------------------------------------------------------------------------
// PPTX merge — multi-master approach via pptx-merger module
//
// Combines multiple single-slide PPTX files into one multi-slide PPTX.
// Preserves all slide masters, layouts, and themes from every source.
// Each input buffer is first cleaned (orphaned notesMasters, comments, etc.
// removed) and then merged pairwise using the pptx-merger module.
// ---------------------------------------------------------------------------

import { mergePptx } from '@/lib/pptx-merger'
import { cleanSingleSlidePptx } from '@/lib/pptx-merger/cleanup-single-slide'

async function mergePptxFiles(buffers: Uint8Array[]): Promise<Uint8Array> {
  if (buffers.length === 0) throw new Error('No slides to merge')
  if (buffers.length === 1) {
    // Still clean orphans for single-slide exports
    return cleanSingleSlidePptx(buffers[0])
  }

  console.log(`[merge] Starting multi-master merge of ${buffers.length} slides`)

  // Clean each buffer (remove orphaned notesMasters, comments, etc.)
  const cleanedBuffers = await Promise.all(buffers.map((buf) => cleanSingleSlidePptx(buf)))

  console.log(`[merge] Cleaned ${cleanedBuffers.length} buffers, starting pairwise merge`)

  // Sequential fold: merge left to right
  let result: Buffer = cleanedBuffers[0]
  for (let i = 1; i < cleanedBuffers.length; i++) {
    console.log(`[merge] Merging slide ${i + 1}/${cleanedBuffers.length}`)
    result = await mergePptx(result, cleanedBuffers[i])
  }

  console.log(`[merge] Merge complete: ${result.length} bytes`)
  return new Uint8Array(result)
}

// ---------------------------------------------------------------------------
// Helpers used by analyzePptxStructure (debug mode)
// ---------------------------------------------------------------------------

const REL_SLIDE_LAYOUT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'

function parseRels(xml: string): { id: string; type: string; target: string }[] {
  const rels: { id: string; type: string; target: string }[] = []
  for (const m of xml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const el = m[0]
    const id = el.match(/\bId="([^"]+)"/)?.[1]
    const type = el.match(/\bType="([^"]+)"/)?.[1]
    const target = el.match(/\bTarget="([^"]+)"/)?.[1]
    if (id && type && target) rels.push({ id, type, target })
  }
  return rels
}

function findRel(rels: { id: string; type: string; target: string }[], type: string) {
  return rels.find((r) => r.type === type)
}

function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir.split('/')
  for (const p of relativePath.split('/')) {
    if (p === '..') parts.pop()
    else if (p !== '.') parts.push(p)
  }
  return parts.join('/')
}

// ---------------------------------------------------------------------------
// PPTX structure analyzer — for debugging merge issues
// ---------------------------------------------------------------------------

interface SlideAnalysis {
  path: string
  relsPath: string | null
  layoutTarget: string | null
  layoutResolved: string | null
  layoutExists: boolean
  relCount: number
  brokenRels: string[]
  hasSchemeClr: boolean
  hasThemeFont: boolean
  hasPlaceholderRef: boolean
  xmlLength: number
}

interface PptxAnalysis {
  label: string
  totalFiles: number
  slides: SlideAnalysis[]
  layouts: string[]
  masters: string[]
  themes: string[]
  presentationSlideIds: { id: string; rid: string }[]
  presentationMasterIds: { id: string; rid: string }[]
  presentationRels: { id: string; type: string; target: string }[]
  contentTypeOverrides: { partName: string; contentType: string }[]
  issues: string[]
}

async function analyzePptxStructure(buffer: Uint8Array, label: string): Promise<PptxAnalysis> {
  const zip = await JSZip.loadAsync(buffer)
  const allFiles = Object.keys(zip.files).sort()
  const issues: string[] = []

  // Parse Content Types
  const ctFile = zip.file('[Content_Types].xml')
  const ctXml = ctFile ? await ctFile.async('string') : ''
  const overrides: { partName: string; contentType: string }[] = []
  for (const m of ctXml.matchAll(/<Override\b[^>]*\/>/g)) {
    const pn = m[0].match(/PartName="([^"]+)"/)?.[1]
    const ct = m[0].match(/ContentType="([^"]+)"/)?.[1]
    if (pn && ct) overrides.push({ partName: pn, contentType: ct })
  }

  // Parse presentation.xml
  const presFile = zip.file('ppt/presentation.xml')
  const presXml = presFile ? await presFile.async('string') : ''
  const slideIds: { id: string; rid: string }[] = []
  for (const m of presXml.matchAll(/<p:sldId\b[^>]*/g)) {
    const el = m[0]
    const id = el.match(/\bid="(\d+)"/)?.[1] ?? '?'
    const rid = el.match(/r:id="([^"]+)"/)?.[1] ?? '?'
    slideIds.push({ id, rid })
  }
  const masterIds: { id: string; rid: string }[] = []
  for (const m of presXml.matchAll(/<p:sldMasterId\b[^>]*/g)) {
    const el = m[0]
    const id = el.match(/\bid="(\d+)"/)?.[1] ?? '?'
    const rid = el.match(/r:id="([^"]+)"/)?.[1] ?? '?'
    masterIds.push({ id, rid })
  }

  // Parse presentation.xml.rels
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels')
  const presRelsXml = presRelsFile ? await presRelsFile.async('string') : ''
  const presRels = parseRels(presRelsXml)

  // Analyze slides
  const slideFiles = allFiles
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)/)?.[1] ?? '0')
      const nb = parseInt(b.match(/slide(\d+)/)?.[1] ?? '0')
      return na - nb
    })

  const layouts = allFiles.filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))
  const masters = allFiles.filter((f) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f))
  const themes = allFiles.filter((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f))

  const slides: SlideAnalysis[] = []
  for (const slidePath of slideFiles) {
    const slideXml = await zip.file(slidePath)!.async('string')
    const slideName = slidePath.split('/').pop()!
    const relsPath = `ppt/slides/_rels/${slideName}.rels`
    const relsFile = zip.file(relsPath)
    let layoutTarget: string | null = null
    let layoutResolved: string | null = null
    let layoutExists = false
    let relCount = 0
    const brokenRels: string[] = []

    if (relsFile) {
      const relsXml = await relsFile.async('string')
      const rels = parseRels(relsXml)
      relCount = rels.length
      const layoutRel = findRel(rels, REL_SLIDE_LAYOUT)
      if (layoutRel) {
        layoutTarget = layoutRel.target
        layoutResolved = resolveRelativePath('ppt/slides', layoutRel.target)
        layoutExists = !!zip.file(layoutResolved)
        if (!layoutExists) issues.push(`${slidePath}: layout ${layoutResolved} not found in ZIP`)
      } else {
        issues.push(`${slidePath}: no slideLayout relationship found`)
      }

      // Check for broken rels
      for (const rel of rels) {
        if (/TargetMode\s*=\s*"External"/.test(JSON.stringify(rel))) continue
        const resolved = resolveRelativePath('ppt/slides', rel.target)
        if (!zip.file(resolved)) {
          brokenRels.push(`${rel.id} → ${rel.target} (${resolved})`)
        }
      }
    } else {
      issues.push(`${slidePath}: missing rels file ${relsPath}`)
    }

    slides.push({
      path: slidePath,
      relsPath: relsFile ? relsPath : null,
      layoutTarget,
      layoutResolved,
      layoutExists,
      relCount,
      brokenRels,
      hasSchemeClr: /<a:schemeClr\b/.test(slideXml),
      hasThemeFont: /typeface="\+m[jn]-/.test(slideXml),
      hasPlaceholderRef: /<p:ph\b/.test(slideXml),
      xmlLength: slideXml.length,
    })
  }

  // Cross-check: every slideId in presentation.xml should have a matching rel
  for (const sid of slideIds) {
    const rel = presRels.find((r) => r.id === sid.rid)
    if (!rel) {
      issues.push(`presentation.xml sldId r:id="${sid.rid}" has no matching relationship`)
    } else {
      const slidePath = `ppt/${rel.target}`
      if (!zip.file(slidePath)) {
        issues.push(
          `presentation.xml.rels ${sid.rid} → ${rel.target} but file ${slidePath} not in ZIP`
        )
      }
    }
  }

  // Cross-check: every slide file should be in Content_Types
  for (const sf of slideFiles) {
    const partName = `/${sf}`
    if (!overrides.some((o) => o.partName === partName)) {
      issues.push(`${sf} not in [Content_Types].xml`)
    }
  }

  // Check for duplicate IDs
  const idSet = new Set<string>()
  for (const sid of slideIds) {
    if (idSet.has(sid.id)) issues.push(`Duplicate slide id="${sid.id}" in presentation.xml`)
    idSet.add(sid.id)
  }
  const ridSet = new Set<string>()
  for (const rel of presRels) {
    if (ridSet.has(rel.id)) issues.push(`Duplicate rId="${rel.id}" in presentation.xml.rels`)
    ridSet.add(rel.id)
  }

  return {
    label,
    totalFiles: allFiles.length,
    slides,
    layouts,
    masters,
    themes,
    presentationSlideIds: slideIds,
    presentationMasterIds: masterIds,
    presentationRels: presRels.map((r) => ({
      id: r.id,
      type: r.type.split('/').pop()!,
      target: r.target,
    })),
    contentTypeOverrides: overrides.filter(
      (o) =>
        o.partName.includes('/slides/') ||
        o.partName.includes('/slideLayouts/') ||
        o.partName.includes('/slideMasters/') ||
        o.partName.includes('/theme/')
    ),
    issues,
  }
}

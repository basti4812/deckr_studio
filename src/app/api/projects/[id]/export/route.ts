import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-log'
import { onProjectExported } from '@/lib/crm-hooks'
import JSZip from 'jszip'

type Params = Promise<{ id: string }>

interface TrayItem {
  id: string
  slide_id: string
  is_personal?: boolean
  personal_slide_id?: string
}

interface EditableField {
  id: string
  label: string
  placeholder: string
  required: boolean
}

interface SlideRecord {
  id: string
  title: string
  pptx_url: string | null
  editable_fields: EditableField[]
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/export — assemble + download .pptx
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-export-pptx', 10, 300_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await params
  const supabase = createServiceClient()

  // Load project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id, tenant_id, slide_order, text_edits, crm_customer_name, crm_company_name, crm_deal_id')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Verify access: owner or shared user with 'edit' permission
  if (project.owner_id !== user.id) {
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

  const trayItems: TrayItem[] = Array.isArray(project.slide_order) ? project.slide_order : []
  if (trayItems.length === 0) {
    return NextResponse.json({ error: 'Add slides to export' }, { status: 400 })
  }

  const textEdits: Record<string, Record<string, string>> =
    project.text_edits && typeof project.text_edits === 'object'
      ? (project.text_edits as Record<string, Record<string, string>>)
      : {}

  // Load all referenced library slides in one query (scoped to tenant)
  const libraryItems = trayItems.filter((t) => !t.is_personal)
  const slideIds = [...new Set(libraryItems.map((t) => t.slide_id).filter(Boolean))]
  const slideMap = new Map<string, SlideRecord>()

  if (slideIds.length > 0) {
    const { data: slidesData, error: slidesError } = await supabase
      .from('slides')
      .select('id, title, pptx_url, editable_fields')
      .in('id', slideIds)
      .eq('tenant_id', profile.tenant_id)

    if (slidesError || !slidesData) {
      return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 })
    }
    for (const s of slidesData) slideMap.set(s.id, s as SlideRecord)
  }

  // Load personal slides referenced in this project (PROJ-32)
  const personalItems = trayItems.filter((t) => t.is_personal && t.personal_slide_id)
  const personalSlideIds = [...new Set(personalItems.map((t) => t.personal_slide_id!))]
  const personalSlideMap = new Map<string, { id: string; title: string; pptx_storage_path: string }>()

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
  const processedBuffers: Uint8Array[] = []

  for (const item of trayItems) {
    // Personal slide: download from personal-slides bucket, no text edits
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlideMap.get(item.personal_slide_id)
      if (!ps) {
        return NextResponse.json(
          { error: `Personal slide not found` },
          { status: 422 }
        )
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

    // Library slide
    const slide = slideMap.get(item.slide_id)
    if (!slide) {
      return NextResponse.json(
        { error: `Slide "${item.slide_id}" not found` },
        { status: 422 }
      )
    }
    if (!slide.pptx_url) {
      return NextResponse.json(
        { error: `Slide "${slide.title}" has no PPTX file attached` },
        { status: 422 }
      )
    }

    // Download from Supabase Storage
    const storagePath = `${profile.tenant_id}/${slide.id}/original.pptx`
    const { data: fileData, error: storageError } = await supabase.storage
      .from('slides')
      .download(storagePath)

    if (storageError || !fileData) {
      return NextResponse.json(
        { error: `Could not download "${slide.title}". Please try again.` },
        { status: 502 }
      )
    }

    const buffer = await fileData.arrayBuffer()
    const fields = Array.isArray(slide.editable_fields) ? slide.editable_fields : []
    const instanceEdits = textEdits[item.id] ?? {}

    const processed = await applyTextEdits(buffer, fields, instanceEdits)
    processedBuffers.push(processed)
  }

  // Merge all processed slides into one .pptx
  let mergedBuffer: Uint8Array
  try {
    mergedBuffer = await mergePptxFiles(processedBuffers)
  } catch {
    return NextResponse.json(
      { error: 'Failed to assemble presentation. Please try again.' },
      { status: 500 }
    )
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
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
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
    .then(() => {}, (err: unknown) => { console.error('[export] auto-snapshot failed', err) })

  logActivity({
    tenantId: profile.tenant_id,
    actorId: user.id,
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
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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

  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f)
  )

  for (const slideFile of slideFiles) {
    let xml = await zip.file(slideFile)!.async('string')

    for (const field of fields) {
      const value = instanceEdits[field.id]
      if (!value || !field.placeholder) continue
      const escapedValue = escapeXml(value)
      // Pass 1: simple single-run replacement
      xml = xml.replace(new RegExp(escapeRegex(field.placeholder), 'g'), escapedValue)
      // Pass 2: cross-run normalization for placeholders split across multiple XML runs
      xml = normalizeCrossRunPlaceholder(xml, field.placeholder, escapedValue)
    }

    zip.file(slideFile, xml)
  }

  return zip.generateAsync({ type: 'uint8array' })
}

// ---------------------------------------------------------------------------
// PPTX merge
// Combines multiple single-slide PPTX files into one multi-slide PPTX.
// Uses the first slide's structure (masters, layouts, themes) as the base.
// Subsequent slides are appended; their media files are deduplicated.
// ---------------------------------------------------------------------------

async function mergePptxFiles(buffers: Uint8Array[]): Promise<Uint8Array> {
  if (buffers.length === 0) throw new Error('No slides to merge')
  if (buffers.length === 1) return buffers[0]

  const baseZip = await JSZip.loadAsync(buffers[0])

  let presentationXml = await baseZip.file('ppt/presentation.xml')!.async('string')
  let presentationRels = await baseZip.file('ppt/_rels/presentation.xml.rels')!.async('string')
  let contentTypes = await baseZip.file('[Content_Types].xml')!.async('string')

  let slideCount = 1
  let maxRid = getMaxRid(presentationRels)
  let maxSlideId = getMaxSlideId(presentationXml)

  // Track existing media file paths to avoid collisions
  const existingMedia = new Set(
    Object.keys(baseZip.files).filter((f) => f.startsWith('ppt/media/'))
  )

  for (let i = 1; i < buffers.length; i++) {
    const srcZip = await JSZip.loadAsync(buffers[i])
    slideCount++
    maxRid++
    maxSlideId++

    // Copy slide XML
    const slideFile = srcZip.file('ppt/slides/slide1.xml')
    if (!slideFile) throw new Error(`Slide ${i + 1} is missing its XML`)
    const slideXml = await slideFile.async('string')
    baseZip.file(`ppt/slides/slide${slideCount}.xml`, slideXml)

    // Copy slide rels, remapping media references to avoid collisions
    const srcRelsFile = srcZip.file('ppt/slides/_rels/slide1.xml.rels')
    if (srcRelsFile) {
      let slideRels = await srcRelsFile.async('string')

      const srcMediaFiles = Object.keys(srcZip.files).filter((f) =>
        f.startsWith('ppt/media/')
      )
      for (const srcMediaPath of srcMediaFiles) {
        const srcFileName = srcMediaPath.replace('ppt/media/', '')
        const ext = srcFileName.split('.').pop() ?? 'bin'

        // Generate a unique name in the base ZIP
        let counter = existingMedia.size + 1
        let newMediaPath = `ppt/media/deckr${counter}.${ext}`
        while (existingMedia.has(newMediaPath)) {
          counter++
          newMediaPath = `ppt/media/deckr${counter}.${ext}`
        }
        existingMedia.add(newMediaPath)

        const mediaData = await srcZip.file(srcMediaPath)!.async('uint8array')
        baseZip.file(newMediaPath, mediaData)

        const newMediaFileName = newMediaPath.replace('ppt/media/', '')
        slideRels = slideRels.replace(
          new RegExp(`\\.\\.\/media\/${escapeRegex(srcFileName)}`, 'g'),
          `../media/${newMediaFileName}`
        )
      }

      baseZip.file(`ppt/slides/_rels/slide${slideCount}.xml.rels`, slideRels)
    }

    // Add slide relationship to presentation.xml.rels
    const slideRelType =
      'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
    const newRel = `<Relationship Id="rId${maxRid}" Type="${slideRelType}" Target="slides/slide${slideCount}.xml"/>`
    presentationRels = presentationRels.replace(
      '</Relationships>',
      `  ${newRel}\n</Relationships>`
    )

    // Add slide to sldIdLst in presentation.xml
    const newSldId = `<p:sldId id="${maxSlideId}" r:id="rId${maxRid}"/>`
    presentationXml = presentationXml.replace(
      '</p:sldIdLst>',
      `  ${newSldId}\n    </p:sldIdLst>`
    )

    // Register slide in [Content_Types].xml
    const slideContentType =
      'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
    const newOverride = `<Override PartName="/ppt/slides/slide${slideCount}.xml" ContentType="${slideContentType}"/>`
    contentTypes = contentTypes.replace('</Types>', `  ${newOverride}\n</Types>`)
  }

  baseZip.file('ppt/presentation.xml', presentationXml)
  baseZip.file('ppt/_rels/presentation.xml.rels', presentationRels)
  baseZip.file('[Content_Types].xml', contentTypes)

  return baseZip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMaxRid(relsXml: string): number {
  let max = 0
  for (const match of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, parseInt(match[1], 10))
  }
  return max
}

function getMaxSlideId(presentationXml: string): number {
  let max = 255
  for (const match of presentationXml.matchAll(/<p:sldId[^>]+id="(\d+)"/g)) {
    max = Math.max(max, parseInt(match[1], 10))
  }
  return max
}

/**
 * Handles placeholders that PowerPoint has split across multiple XML text runs
 * within the same paragraph (e.g. {{COMP was typed in one run, ANY_NAME}} in another).
 * Finds paragraphs where the concatenated run text contains the placeholder,
 * then rebuilds the paragraph as a single run with the placeholder replaced.
 * Preserves paragraph properties and the first run's character properties.
 */
function normalizeCrossRunPlaceholder(
  xml: string,
  placeholder: string,
  escapedValue: string
): string {
  return xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraph) => {
    // Collect all text run contents in this paragraph
    const runPattern = /<a:r\b[^>]*>[\s\S]*?<a:t[^>]*>([\s\S]*?)<\/a:t>[\s\S]*?<\/a:r>/g
    const runs: string[] = []
    let m
    while ((m = runPattern.exec(paragraph)) !== null) runs.push(m[1])
    if (runs.length < 2) return paragraph // single-run case already handled by Pass 1

    const combined = runs.join('')
    if (!combined.includes(placeholder)) return paragraph

    // Rebuild the paragraph with a single merged run
    const newText = combined.replace(new RegExp(escapeRegex(placeholder), 'g'), escapedValue)
    const pOpen = (paragraph.match(/^(<a:p\b[^>]*>)/) || ['', '<a:p>'])[1]
    const pPr = (paragraph.match(/<a:pPr[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/) || [''])[0]
    const rPr = (paragraph.match(/<a:r\b[^>]*>[\s\S]*?(<a:rPr[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>))/) || ['', ''])[1]
    const newRun = rPr
      ? `<a:r>${rPr}<a:t>${newText}</a:t></a:r>`
      : `<a:r><a:t>${newText}</a:t></a:r>`
    return pPr ? `${pOpen}${pPr}${newRun}</a:p>` : `${pOpen}${newRun}</a:p>`
  })
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

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
// PPTX merge — full OOXML-aware merge with slide master/layout/theme handling
//
// Combines multiple single-slide PPTX files into one multi-slide PPTX.
// Each source buffer may originate from a different PowerPoint file with its
// own slide masters, layouts, and themes.  The merge copies all referenced
// structures into the output ZIP, remapping every relationship so that
// PowerPoint can open the result without a repair dialog.
// ---------------------------------------------------------------------------

/** Relationship types used in OOXML */
const REL_SLIDE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
const REL_SLIDE_LAYOUT =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout'
const REL_SLIDE_MASTER =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster'
const REL_THEME = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme'

/** Content types */
const CT_SLIDE = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml'
const CT_LAYOUT = 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml'
const CT_MASTER = 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml'
const CT_THEME = 'application/vnd.openxmlformats-officedocument.drawingml.theme+xml'

/** Parse all Relationship elements from a .rels XML string */
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

/** Find the first relationship of a given type */
function findRel(rels: { id: string; type: string; target: string }[], type: string) {
  return rels.find((r) => r.type === type)
}

/** Get max rId number in a rels XML */
function getMaxRid(relsXml: string): number {
  let max = 0
  for (const match of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, parseInt(match[1], 10))
  }
  return max
}

/** Get max slide ID in presentation.xml */
function getMaxSlideId(xml: string): number {
  let max = 255
  for (const match of xml.matchAll(/<p:sldId[^>]+id="(\d+)"/g)) {
    max = Math.max(max, parseInt(match[1], 10))
  }
  return max
}

/** Get max sldMasterId in presentation.xml */
function getMaxMasterId(xml: string): number {
  let max = 2147483647 // start high to avoid collisions
  for (const match of xml.matchAll(/<p:sldMasterId[^>]+id="(\d+)"/g)) {
    max = Math.max(max, parseInt(match[1], 10))
  }
  return max
}

/** Copy a file from src to dest ZIP, returning the data (or null if missing) */
async function copyFile(
  src: JSZip,
  dest: JSZip,
  srcPath: string,
  destPath: string
): Promise<Uint8Array | null> {
  const file = src.file(srcPath)
  if (!file) return null
  const data = await file.async('uint8array')
  dest.file(destPath, data)
  return data
}

/** Copy all media files referenced in a rels string, remapping paths.
 *  Returns the updated rels string with remapped media references. */
async function copyAndRemapMedia(
  srcZip: JSZip,
  destZip: JSZip,
  relsXml: string,
  srcDir: string,
  existingMedia: Set<string>,
  mediaCounter: { value: number }
): Promise<string> {
  let result = relsXml
  const rels = parseRels(relsXml)

  for (const rel of rels) {
    // Skip non-media relationships (layouts, masters, themes, etc.)
    if (rel.type === REL_SLIDE_LAYOUT || rel.type === REL_SLIDE_MASTER || rel.type === REL_THEME) {
      continue
    }

    // Resolve relative target to absolute path
    const resolvedPath = resolveRelativePath(srcDir, rel.target)
    if (!resolvedPath.startsWith('ppt/media/') && !resolvedPath.startsWith('ppt/embeddings/')) {
      continue
    }

    const srcFile = srcZip.file(resolvedPath)
    if (!srcFile) continue

    const ext = resolvedPath.split('.').pop() ?? 'bin'
    let newPath: string
    do {
      mediaCounter.value++
      newPath = `ppt/media/onslide${mediaCounter.value}.${ext}`
    } while (existingMedia.has(newPath))
    existingMedia.add(newPath)

    const data = await srcFile.async('uint8array')
    destZip.file(newPath, data)

    // Remap target in rels — compute new relative path from srcDir
    const newRelTarget = computeRelativePath(srcDir, newPath)
    result = result.replace(
      new RegExp(`Target="${escapeRegex(rel.target)}"`, 'g'),
      `Target="${newRelTarget}"`
    )
  }

  return result
}

/** Resolve a relative path like "../media/image1.png" from a base dir like "ppt/slides" */
function resolveRelativePath(baseDir: string, relativePath: string): string {
  const parts = baseDir.split('/')
  const relParts = relativePath.split('/')
  for (const p of relParts) {
    if (p === '..') parts.pop()
    else if (p !== '.') parts.push(p)
  }
  return parts.join('/')
}

/** Compute a relative path from baseDir to targetPath */
function computeRelativePath(baseDir: string, targetPath: string): string {
  const baseParts = baseDir.split('/')
  const targetParts = targetPath.split('/')
  let common = 0
  while (
    common < baseParts.length &&
    common < targetParts.length &&
    baseParts[common] === targetParts[common]
  ) {
    common++
  }
  const ups = baseParts.length - common
  const remaining = targetParts.slice(common)
  return [...Array(ups).fill('..'), ...remaining].join('/')
}

/** Add a Relationship element to a rels XML string */
function addRelToXml(relsXml: string, id: string, type: string, target: string): string {
  const newRel = `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`
  return relsXml.replace('</Relationships>', `${newRel}\n</Relationships>`)
}

/** Add an Override element to [Content_Types].xml */
function addContentType(contentTypes: string, partName: string, contentType: string): string {
  // Avoid duplicates
  if (contentTypes.includes(`PartName="${partName}"`)) return contentTypes
  const override = `<Override PartName="${partName}" ContentType="${contentType}"/>`
  return contentTypes.replace('</Types>', `${override}\n</Types>`)
}

/** Replace a relationship target in a rels XML string */
function remapRelTarget(relsXml: string, relId: string, newTarget: string): string {
  return relsXml.replace(
    new RegExp(`(<Relationship[^>]*Id="${escapeRegex(relId)}"[^>]*Target=")([^"]+)(")`),
    `$1${newTarget}$3`
  )
}

/**
 * A "structure fingerprint" identifies a unique source PPTX's layout/master/theme
 * combination so we can reuse already-copied structures for slides from the same source.
 */
interface CopiedStructure {
  /** Map from original layout path → new layout path in the output */
  layoutMap: Map<string, string>
  /** Map from original master path → new master path */
  masterMap: Map<string, string>
  /** Map from original theme path → new theme path */
  themeMap: Map<string, string>
}

async function mergePptxFiles(buffers: Uint8Array[]): Promise<Uint8Array> {
  if (buffers.length === 0) throw new Error('No slides to merge')
  if (buffers.length === 1) return buffers[0]

  // ── Step 1: Initialize base ZIP from first slide ──────────────────────
  const baseZip = await JSZip.loadAsync(buffers[0])

  let presentationXml = await baseZip.file('ppt/presentation.xml')!.async('string')
  let presentationRels = await baseZip.file('ppt/_rels/presentation.xml.rels')!.async('string')
  let contentTypes = await baseZip.file('[Content_Types].xml')!.async('string')

  let slideCount = 1
  let presRidCounter = getMaxRid(presentationRels)
  let slideIdCounter = getMaxSlideId(presentationXml)
  let masterIdCounter = getMaxMasterId(presentationXml)

  // Track existing file paths to avoid collisions
  const existingMedia = new Set(
    Object.keys(baseZip.files).filter((f) => f.startsWith('ppt/media/'))
  )
  const mediaCounter = { value: existingMedia.size }

  // Count existing structures in base
  let layoutCounter = Object.keys(baseZip.files).filter((f) =>
    /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f)
  ).length
  let masterCounter = Object.keys(baseZip.files).filter((f) =>
    /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f)
  ).length
  let themeCounter = Object.keys(baseZip.files).filter((f) =>
    /^ppt\/theme\/theme\d+\.xml$/.test(f)
  ).length

  // ── Step 2: Fingerprint cache for deduplication ───────────────────────
  // Key = fingerprint of the source's master+layout+theme structure
  // We build the fingerprint from the set of master XML file paths in the source
  const structureCache = new Map<string, CopiedStructure>()

  /** Build a fingerprint for a source ZIP's slide structure */
  async function getFingerprint(srcZip: JSZip): Promise<string> {
    const masterFiles = Object.keys(srcZip.files)
      .filter((f) => /^ppt\/slideMasters\/slideMaster\d+\.xml$/.test(f))
      .sort()
    const parts: string[] = []
    for (const mf of masterFiles) {
      const content = await srcZip.file(mf)!.async('string')
      // Use a simple hash of first 500 chars + filename for identification
      parts.push(`${mf}:${simpleHash(content.slice(0, 500))}`)
    }
    const themeFiles = Object.keys(srcZip.files)
      .filter((f) => /^ppt\/theme\/theme\d+\.xml$/.test(f))
      .sort()
    for (const tf of themeFiles) {
      const content = await srcZip.file(tf)!.async('string')
      parts.push(`${tf}:${simpleHash(content.slice(0, 500))}`)
    }
    return parts.join('|')
  }

  // ── Step 3: Process each subsequent slide ─────────────────────────────
  for (let i = 1; i < buffers.length; i++) {
    const srcZip = await JSZip.loadAsync(buffers[i])
    slideCount++
    slideIdCounter++

    // ─ 3a: Copy slide XML ─
    const slideFile = srcZip.file('ppt/slides/slide1.xml')
    if (!slideFile) throw new Error(`Slide ${i + 1} is missing ppt/slides/slide1.xml`)
    const slideXml = await slideFile.async('string')
    const newSlidePath = `ppt/slides/slide${slideCount}.xml`
    baseZip.file(newSlidePath, slideXml)

    // ─ 3b: Read slide rels ─
    const srcSlideRelsFile = srcZip.file('ppt/slides/_rels/slide1.xml.rels')
    let slideRels = srcSlideRelsFile ? await srcSlideRelsFile.async('string') : null

    // ─ 3c: Check fingerprint and copy structure if needed ─
    const fingerprint = await getFingerprint(srcZip)
    let structure = structureCache.get(fingerprint)

    if (!structure) {
      // This is a new source structure — copy its layouts, masters, themes
      structure = {
        layoutMap: new Map(),
        masterMap: new Map(),
        themeMap: new Map(),
      }

      // Find all slide layouts in the source
      const srcLayoutFiles = Object.keys(srcZip.files).filter((f) =>
        /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f)
      )

      for (const srcLayoutPath of srcLayoutFiles) {
        layoutCounter++
        const newLayoutPath = `ppt/slideLayouts/slideLayout${layoutCounter}.xml`
        const newLayoutName = `slideLayout${layoutCounter}.xml`
        structure.layoutMap.set(srcLayoutPath, newLayoutPath)

        // Copy layout XML
        await copyFile(srcZip, baseZip, srcLayoutPath, newLayoutPath)

        // Copy layout rels (with media remapping)
        const srcLayoutRelsPath =
          srcLayoutPath.replace('ppt/slideLayouts/', 'ppt/slideLayouts/_rels/') + '.rels'
        const srcLayoutRelsFile = srcZip.file(srcLayoutRelsPath)

        if (srcLayoutRelsFile) {
          let layoutRels = await srcLayoutRelsFile.async('string')

          // Remap media in layout rels
          layoutRels = await copyAndRemapMedia(
            srcZip,
            baseZip,
            layoutRels,
            'ppt/slideLayouts',
            existingMedia,
            mediaCounter
          )

          // Find and remap slideMaster reference in layout rels
          const layoutRelsParsed = parseRels(layoutRels)
          const masterRel = findRel(layoutRelsParsed, REL_SLIDE_MASTER)
          if (masterRel) {
            const srcMasterPath = resolveRelativePath('ppt/slideLayouts', masterRel.target)

            if (!structure.masterMap.has(srcMasterPath)) {
              // Copy this master
              masterCounter++
              const newMasterPath = `ppt/slideMasters/slideMaster${masterCounter}.xml`
              structure.masterMap.set(srcMasterPath, newMasterPath)

              await copyFile(srcZip, baseZip, srcMasterPath, newMasterPath)

              // Copy master rels
              const srcMasterRelsPath =
                srcMasterPath.replace('ppt/slideMasters/', 'ppt/slideMasters/_rels/') + '.rels'
              const srcMasterRelsFile = srcZip.file(srcMasterRelsPath)

              if (srcMasterRelsFile) {
                let masterRels = await srcMasterRelsFile.async('string')

                // Remap media in master rels
                masterRels = await copyAndRemapMedia(
                  srcZip,
                  baseZip,
                  masterRels,
                  'ppt/slideMasters',
                  existingMedia,
                  mediaCounter
                )

                // Find and remap theme reference
                const masterRelsParsed = parseRels(masterRels)
                const themeRel = findRel(masterRelsParsed, REL_THEME)
                if (themeRel) {
                  const srcThemePath = resolveRelativePath('ppt/slideMasters', themeRel.target)

                  if (!structure.themeMap.has(srcThemePath)) {
                    themeCounter++
                    const newThemePath = `ppt/theme/theme${themeCounter}.xml`
                    structure.themeMap.set(srcThemePath, newThemePath)

                    await copyFile(srcZip, baseZip, srcThemePath, newThemePath)

                    // Copy theme rels if they exist
                    const srcThemeRelsPath =
                      srcThemePath.replace('ppt/theme/', 'ppt/theme/_rels/') + '.rels'
                    const srcThemeRelsFile = srcZip.file(srcThemeRelsPath)
                    if (srcThemeRelsFile) {
                      let themeRels = await srcThemeRelsFile.async('string')
                      themeRels = await copyAndRemapMedia(
                        srcZip,
                        baseZip,
                        themeRels,
                        'ppt/theme',
                        existingMedia,
                        mediaCounter
                      )
                      const newThemeRelsPath =
                        newThemePath.replace('ppt/theme/', 'ppt/theme/_rels/') + '.rels'
                      baseZip.file(newThemeRelsPath, themeRels)
                    }

                    // Register theme in content types
                    contentTypes = addContentType(contentTypes, `/${newThemePath}`, CT_THEME)
                  }

                  // Remap theme target in master rels
                  const newThemePath = structure.themeMap.get(srcThemePath)!
                  const newThemeTarget = computeRelativePath('ppt/slideMasters', newThemePath)
                  masterRels = remapRelTarget(masterRels, themeRel.id, newThemeTarget)
                }

                // Remap slideLayout references in master rels to their new paths
                const masterLayoutRels = masterRelsParsed.filter((r) => r.type === REL_SLIDE_LAYOUT)
                for (const lr of masterLayoutRels) {
                  const srcLPath = resolveRelativePath('ppt/slideMasters', lr.target)
                  const newLPath = structure.layoutMap.get(srcLPath)
                  if (newLPath) {
                    const newTarget = computeRelativePath('ppt/slideMasters', newLPath)
                    masterRels = remapRelTarget(masterRels, lr.id, newTarget)
                  }
                }

                const newMasterRelsPath =
                  newMasterPath.replace('ppt/slideMasters/', 'ppt/slideMasters/_rels/') + '.rels'
                baseZip.file(newMasterRelsPath, masterRels)
              }

              // Register master in content types
              contentTypes = addContentType(contentTypes, `/${newMasterPath}`, CT_MASTER)

              // Add master to presentation.xml.rels
              presRidCounter++
              const masterRelId = `rId${presRidCounter}`
              presentationRels = addRelToXml(
                presentationRels,
                masterRelId,
                REL_SLIDE_MASTER,
                newMasterPath.replace('ppt/', '')
              )

              // Add master to sldMasterIdLst in presentation.xml
              masterIdCounter++
              const masterIdEntry = `<p:sldMasterId id="${masterIdCounter}" r:id="${masterRelId}"/>`
              if (presentationXml.includes('</p:sldMasterIdLst>')) {
                presentationXml = presentationXml.replace(
                  '</p:sldMasterIdLst>',
                  `${masterIdEntry}\n</p:sldMasterIdLst>`
                )
              }
            }

            // Remap master target in layout rels
            const newMasterPath = structure.masterMap.get(srcMasterPath)!
            const newMasterTarget = computeRelativePath('ppt/slideLayouts', newMasterPath)
            layoutRels = remapRelTarget(layoutRels, masterRel.id, newMasterTarget)
          }

          const newLayoutRelsPath = `ppt/slideLayouts/_rels/${newLayoutName}.rels`
          baseZip.file(newLayoutRelsPath, layoutRels)
        }

        // Register layout in content types
        contentTypes = addContentType(contentTypes, `/${newLayoutPath}`, CT_LAYOUT)
      }

      structureCache.set(fingerprint, structure)
    }

    // ─ 3d: Remap slide rels ─
    if (slideRels) {
      // Remap media references
      slideRels = await copyAndRemapMedia(
        srcZip,
        baseZip,
        slideRels,
        'ppt/slides',
        existingMedia,
        mediaCounter
      )

      // Remap slideLayout reference to the new layout path
      const slideRelsParsed = parseRels(slideRels)
      const layoutRel = findRel(slideRelsParsed, REL_SLIDE_LAYOUT)
      if (layoutRel) {
        const srcLayoutPath = resolveRelativePath('ppt/slides', layoutRel.target)
        const newLayoutPath = structure.layoutMap.get(srcLayoutPath)
        if (newLayoutPath) {
          const newTarget = computeRelativePath('ppt/slides', newLayoutPath)
          slideRels = remapRelTarget(slideRels, layoutRel.id, newTarget)
        }
      }

      baseZip.file(`ppt/slides/_rels/slide${slideCount}.xml.rels`, slideRels)
    }

    // ─ 3e: Add slide to presentation ─
    presRidCounter++
    const slideRelId = `rId${presRidCounter}`
    presentationRels = addRelToXml(
      presentationRels,
      slideRelId,
      REL_SLIDE,
      `slides/slide${slideCount}.xml`
    )

    const newSldId = `<p:sldId id="${slideIdCounter}" r:id="${slideRelId}"/>`
    presentationXml = presentationXml.replace('</p:sldIdLst>', `${newSldId}\n</p:sldIdLst>`)

    contentTypes = addContentType(contentTypes, `/ppt/slides/slide${slideCount}.xml`, CT_SLIDE)
  }

  // ── Step 4: Write updated XML files and generate output ───────────────
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

function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash.toString(36)
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

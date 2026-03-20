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
// PPTX merge — theme-flattening approach
//
// Combines multiple single-slide PPTX files into one multi-slide PPTX.
// Slides from the same source as the base keep their original references.
// Slides from different sources get "flattened": all theme-dependent
// references (scheme colors, theme fonts) are resolved to hardcoded values
// in the slide XML, and the slide is pointed to the base blank layout.
// This avoids the multi-master merge complexity that causes PowerPoint
// repair issues and layout corruption.
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

// ── Theme Flattening ────────────────────────────────────────────────────
// Instead of copying multiple slide masters/layouts/themes (which causes
// PowerPoint repair issues), we "flatten" slides from non-base sources:
// resolve all theme-dependent references (colors, fonts) directly into
// the slide XML so they become master-independent.
// ─────────────────────────────────────────────────────────────────────────

/** Standard OOXML scheme color names */
const SCHEME_COLOR_NAMES = [
  'dk1',
  'lt1',
  'dk2',
  'lt2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
] as const

/**
 * Parse a theme XML and extract the 12 scheme colors as name → hex RGB.
 * Handles both srgbClr and sysClr (system colors like dk1/lt1).
 */
function parseThemeColors(themeXml: string): Map<string, string> {
  const colorMap = new Map<string, string>()
  for (const name of SCHEME_COLOR_NAMES) {
    const pattern = new RegExp(`<a:${name}>([\\s\\S]*?)<\\/a:${name}>`)
    const match = themeXml.match(pattern)
    if (!match) continue
    const inner = match[1]
    const srgb = inner.match(/<a:srgbClr\s+val="([A-Fa-f0-9]{6})"/)
    if (srgb) {
      colorMap.set(name, srgb[1].toUpperCase())
      continue
    }
    const sys = inner.match(/<a:sysClr[^>]*lastClr="([A-Fa-f0-9]{6})"/)
    if (sys) {
      colorMap.set(name, sys[1].toUpperCase())
      continue
    }
    const sysVal = inner.match(/<a:sysClr\s+val="(\w+)"/)
    if (sysVal) {
      const defaults: Record<string, string> = { windowText: '000000', window: 'FFFFFF' }
      colorMap.set(name, defaults[sysVal[1]] ?? '000000')
    }
  }
  return colorMap
}

/** Parse theme font families (major = heading, minor = body). */
function parseThemeFonts(themeXml: string): Record<string, string> {
  const fonts: Record<string, string> = {}
  const get = (section: string, script: string, key: string) => {
    const sec = themeXml.match(new RegExp(`<a:${section}Font>[\\s\\S]*?<\\/a:${section}Font>`))
    if (!sec) return
    const tf = sec[0].match(new RegExp(`<a:${script}\\s+typeface="([^"]*)"`))
    if (tf) fonts[key] = tf[1]
  }
  get('major', 'latin', '+mj-lt')
  get('minor', 'latin', '+mn-lt')
  get('major', 'ea', '+mj-ea')
  get('minor', 'ea', '+mn-ea')
  get('major', 'cs', '+mj-cs')
  get('minor', 'cs', '+mn-cs')
  return fonts
}

/**
 * Replace all <a:schemeClr> references in XML with <a:srgbClr>.
 * Child modifiers (lumMod, tint, shade, alpha, etc.) are preserved —
 * they are valid children of both schemeClr and srgbClr.
 */
function flattenSchemeColors(xml: string, colorMap: Map<string, string>): string {
  // Self-closing: <a:schemeClr val="accent1"/>
  let result = xml.replace(/<a:schemeClr\s+val="([^"]+)"\s*\/>/g, (full, name: string) => {
    const hex = colorMap.get(name)
    return hex ? `<a:srgbClr val="${hex}"/>` : full
  })
  // With children: <a:schemeClr val="accent1">…</a:schemeClr>
  result = result.replace(
    /<a:schemeClr\s+val="([^"]+)">([\s\S]*?)<\/a:schemeClr>/g,
    (full, name: string, children: string) => {
      const hex = colorMap.get(name)
      return hex ? `<a:srgbClr val="${hex}">${children}</a:srgbClr>` : full
    }
  )
  return result
}

/** Replace theme font references (+mj-lt, +mn-lt, etc.) with actual names. */
function flattenThemeFonts(xml: string, fonts: Record<string, string>): string {
  let result = xml
  for (const [ref, actual] of Object.entries(fonts)) {
    if (!actual) continue
    result = result.replace(new RegExp(`typeface="\\${ref}"`, 'g'), `typeface="${actual}"`)
  }
  return result
}

/**
 * Extract background from source layout/master and inject into slide XML.
 * Only adds if the slide doesn't already have one.
 * Skips image-based backgrounds (blipFill) since they reference external rels.
 */
function bakeInBackground(slideXml: string, layoutXml: string, masterXml: string): string {
  if (/<p:bg\b/.test(slideXml)) return slideXml
  let bg: string | null = null
  const lm = layoutXml.match(/<p:bg\b[\s\S]*?<\/p:bg>/)
  if (lm) bg = lm[0]
  else {
    const mm = masterXml.match(/<p:bg\b[\s\S]*?<\/p:bg>/)
    if (mm) bg = mm[0]
  }
  if (!bg || /<a:blip\b/.test(bg)) return slideXml
  return slideXml.replace(/<p:cSld\b([^>]*)>/, (m) => `${m}${bg}`)
}

/** Remove placeholder references so shapes don't inherit from the base layout. */
function stripPlaceholderRefs(slideXml: string): string {
  return slideXml.replace(/<p:ph\b[^>]*\/>/g, '').replace(/<p:ph\b[^>]*>[\s\S]*?<\/p:ph>/g, '')
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

/** Replace a relationship target in a rels XML string (handles any attribute order) */
function remapRelTarget(relsXml: string, relId: string, newTarget: string): string {
  const pattern = new RegExp(`<Relationship\\b[^>]*\\bId="${escapeRegex(relId)}"[^>]*/>`)
  return relsXml.replace(pattern, (match) =>
    match.replace(/\bTarget="[^"]*"/, `Target="${newTarget}"`)
  )
}

/** Remove relationships pointing to files that don't exist in the output ZIP.
 *  Keeps external rels (hyperlinks) and rels whose targets exist. */
function stripBrokenFileRefs(relsXml: string, zip: JSZip): string {
  return relsXml.replace(/<Relationship\b[^>]*\/>\s*/g, (match) => {
    // Keep external relationships (hyperlinks, action URLs)
    if (/TargetMode\s*=\s*"External"/.test(match)) return match
    const target = match.match(/\bTarget="([^"]+)"/)?.[1]
    if (!target) return match
    const resolvedPath = resolveRelativePath('ppt/slides', target)
    if (zip.file(resolvedPath)) return match
    // File doesn't exist in output — strip this relationship
    return ''
  })
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

  const existingMedia = new Set(
    Object.keys(baseZip.files).filter((f) => f.startsWith('ppt/media/'))
  )
  const mediaCounter = { value: existingMedia.size }

  // ── Step 2: Build layout content hash map for compatibility check ─────
  // A slide is "compatible" if its referenced layout exists in the base
  // with identical content. Otherwise it needs flattening.
  const baseLayoutFiles = Object.keys(baseZip.files)
    .filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))
    .sort()
  const baseLayoutHashes = new Map<string, string>()
  let baseBlankLayoutPath = baseLayoutFiles[0] ?? 'ppt/slideLayouts/slideLayout1.xml'
  for (const lf of baseLayoutFiles) {
    const content = await baseZip.file(lf)!.async('string')
    baseLayoutHashes.set(lf, simpleHash(content))
    if (/type="blank"/.test(content)) baseBlankLayoutPath = lf
  }

  // ── Step 3: Process each subsequent slide ─────────────────────────────
  for (let i = 1; i < buffers.length; i++) {
    const srcZip = await JSZip.loadAsync(buffers[i])
    slideCount++
    slideIdCounter++

    const slideFile = srcZip.file('ppt/slides/slide1.xml')
    if (!slideFile) throw new Error(`Slide ${i + 1} is missing ppt/slides/slide1.xml`)
    let slideXml = await slideFile.async('string')

    const srcSlideRelsFile = srcZip.file('ppt/slides/_rels/slide1.xml.rels')
    let slideRels = srcSlideRelsFile ? await srcSlideRelsFile.async('string') : null

    // Check if the slide's layout exists in the base with identical content
    let needsFlatten = true
    if (slideRels) {
      const rels = parseRels(slideRels)
      const layoutRel = findRel(rels, REL_SLIDE_LAYOUT)
      if (layoutRel) {
        const layoutPath = resolveRelativePath('ppt/slides', layoutRel.target)
        const srcLayoutFile = srcZip.file(layoutPath)
        if (srcLayoutFile && baseLayoutHashes.has(layoutPath)) {
          const srcContent = await srcLayoutFile.async('string')
          needsFlatten = simpleHash(srcContent) !== baseLayoutHashes.get(layoutPath)
        }
      }
    }

    if (needsFlatten) {
      // ── FLATTEN: resolve theme references into slide XML ──────────────
      const srcThemeFile = Object.keys(srcZip.files).find((f) =>
        /^ppt\/theme\/theme\d+\.xml$/.test(f)
      )
      const srcThemeXml = srcThemeFile ? await srcZip.file(srcThemeFile)!.async('string') : ''
      const srcColors = parseThemeColors(srcThemeXml)
      const srcFonts = parseThemeFonts(srcThemeXml)

      slideXml = flattenSchemeColors(slideXml, srcColors)
      slideXml = flattenThemeFonts(slideXml, srcFonts)
      slideXml = stripPlaceholderRefs(slideXml)

      // Bake in background from source layout/master
      if (slideRels) {
        const srcSlideRelsParsed = parseRels(slideRels)
        const layoutRel = findRel(srcSlideRelsParsed, REL_SLIDE_LAYOUT)
        if (layoutRel) {
          const layoutPath = resolveRelativePath('ppt/slides', layoutRel.target)
          const layoutFile = srcZip.file(layoutPath)
          let srcLayoutXml = ''
          let srcMasterXml = ''
          if (layoutFile) {
            srcLayoutXml = await layoutFile.async('string')
            srcLayoutXml = flattenSchemeColors(srcLayoutXml, srcColors)
            const layoutName = layoutPath.split('/').pop()!
            const layoutRelsFile = srcZip.file(`ppt/slideLayouts/_rels/${layoutName}.rels`)
            if (layoutRelsFile) {
              const lRels = parseRels(await layoutRelsFile.async('string'))
              const masterRel = findRel(lRels, REL_SLIDE_MASTER)
              if (masterRel) {
                const masterPath = resolveRelativePath('ppt/slideLayouts', masterRel.target)
                const masterFile = srcZip.file(masterPath)
                if (masterFile) {
                  srcMasterXml = await masterFile.async('string')
                  srcMasterXml = flattenSchemeColors(srcMasterXml, srcColors)
                }
              }
            }
          }
          slideXml = bakeInBackground(slideXml, srcLayoutXml, srcMasterXml)

          // Point slide to base blank layout instead of its original
          const newTarget = computeRelativePath('ppt/slides', baseBlankLayoutPath)
          slideRels = remapRelTarget(slideRels, layoutRel.id, newTarget)
        }
      }
    }

    // Write slide XML
    const newSlidePath = `ppt/slides/slide${slideCount}.xml`
    baseZip.file(newSlidePath, slideXml)

    // Copy media, strip broken refs, write slide rels
    if (slideRels) {
      slideRels = await copyAndRemapMedia(
        srcZip,
        baseZip,
        slideRels,
        'ppt/slides',
        existingMedia,
        mediaCounter
      )
      // Remove relationships to files that don't exist in the output
      // (e.g. notesSlides, comments, vmlDrawings from different sources)
      slideRels = stripBrokenFileRefs(slideRels, baseZip)
      baseZip.file(`ppt/slides/_rels/slide${slideCount}.xml.rels`, slideRels)
    }

    // Add slide to presentation
    presRidCounter++
    const slideRelId = `rId${presRidCounter}`
    presentationRels = addRelToXml(
      presentationRels,
      slideRelId,
      REL_SLIDE,
      `slides/slide${slideCount}.xml`
    )
    presentationXml = presentationXml.replace(
      '</p:sldIdLst>',
      `<p:sldId id="${slideIdCounter}" r:id="${slideRelId}"/>\n</p:sldIdLst>`
    )
    contentTypes = addContentType(contentTypes, `/ppt/slides/slide${slideCount}.xml`, CT_SLIDE)
  }

  // ── Step 4: Write updated files and generate output ───────────────────
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

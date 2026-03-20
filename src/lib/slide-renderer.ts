import JSZip from 'jszip'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EditableField {
  id: string
  label: string
  placeholder: string
  required: boolean
}

export interface RenderSlideParams {
  projectId: string
  instanceId: string
  tenantId: string
  pptxUrl: string
  pageIndex: number
  pageCount: number
  editableFields: EditableField[]
  edits: Record<string, string>
}

// ---------------------------------------------------------------------------
// Main: render a single slide with text edits → PNG → Supabase Storage URL
// ---------------------------------------------------------------------------

export async function renderSlidePreview(params: RenderSlideParams): Promise<string> {
  const { projectId, instanceId, tenantId, pptxUrl, pageIndex, pageCount, editableFields, edits } =
    params

  const secret = process.env.CONVERTAPI_SECRET
  if (!secret) throw new Error('CONVERTAPI_SECRET not configured')

  // Download PPTX (30s timeout)
  console.log(`[slide-renderer] Downloading PPTX for ${instanceId}...`)
  const downloadRes = await fetch(pptxUrl, { signal: AbortSignal.timeout(30_000) })
  if (!downloadRes.ok) throw new Error(`Failed to download PPTX (${downloadRes.status})`)
  const buffer = await downloadRes.arrayBuffer()
  console.log(`[slide-renderer] Downloaded ${(buffer.byteLength / 1024).toFixed(0)}KB PPTX`)

  // Apply text edits to the FULL PPTX (placeholders only exist on their target slide)
  const edited = await applyTextEdits(buffer, editableFields, edits)
  console.log(`[slide-renderer] Text edits applied, ${(edited.byteLength / 1024).toFixed(0)}KB`)

  // Convert FULL PPTX to PNG via ConvertAPI (renders all pages, we pick the right one)
  const pptxBase64 = Buffer.from(edited).toString('base64')
  console.log(
    `[slide-renderer] Calling ConvertAPI (${(pptxBase64.length / 1024).toFixed(0)}KB base64, will pick page ${pageIndex})...`
  )
  const convertStart = Date.now()

  const convertRes = await fetch('https://v2.convertapi.com/convert/pptx/to/png', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      Parameters: [
        { Name: 'File', FileValue: { Name: 'slide.pptx', Data: pptxBase64 } },
        { Name: 'ImageHeight', Value: '1080' },
        { Name: 'ImageWidth', Value: '1920' },
      ],
    }),
    signal: AbortSignal.timeout(120_000), // 120s timeout — full deck takes longer
  })

  console.log(
    `[slide-renderer] ConvertAPI responded in ${Date.now() - convertStart}ms — status ${convertRes.status}`
  )

  if (!convertRes.ok) {
    const errText = await convertRes.text()
    console.error('[slide-renderer] ConvertAPI error:', convertRes.status, errText.slice(0, 500))
    throw new Error(`Thumbnail rendering failed (${convertRes.status})`)
  }

  const convertData = (await convertRes.json()) as {
    Files: { FileName: string; FileData: string }[]
  }

  // Log all returned file names to verify ordering
  console.log(
    `[slide-renderer] ConvertAPI returned ${convertData.Files.length} files:`,
    convertData.Files.map((f, i) => `[${i}] ${f.FileName}`).join(', ')
  )

  // Pick the correct page from the rendered output (same approach as generate-thumbnails)
  const pageFile = convertData.Files[pageIndex]
  if (!pageFile) {
    console.error(
      `[slide-renderer] Page ${pageIndex} not found, got ${convertData.Files.length} pages`
    )
    throw new Error(
      `Page ${pageIndex} not found in conversion result (${convertData.Files.length} pages)`
    )
  }
  console.log(
    `[slide-renderer] Picking page ${pageIndex}: "${pageFile.FileName}" (${(pageFile.FileData.length / 1024).toFixed(0)}KB base64)`
  )

  // Upload preview PNG to storage
  const supabase = createServiceClient()
  const pngBuffer = Buffer.from(pageFile.FileData, 'base64')
  const storagePath = `${tenantId}/previews/${projectId}/${instanceId}.png`
  console.log(
    `[slide-renderer] Uploading ${(pngBuffer.length / 1024).toFixed(0)}KB PNG to ${storagePath}`
  )

  const { error: uploadErr } = await supabase.storage
    .from('slide-thumbnails')
    .upload(storagePath, pngBuffer, {
      contentType: 'image/png',
      upsert: true,
    })

  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`)

  const { data: publicUrlData } = supabase.storage
    .from('slide-thumbnails')
    .getPublicUrl(storagePath)

  console.log(`[slide-renderer] ✓ Done for ${instanceId}`)
  return `${publicUrlData.publicUrl}?t=${Date.now()}`
}

// ---------------------------------------------------------------------------
// Check if a set of edits has any actual content
// ---------------------------------------------------------------------------

export function hasActualEdits(fields: EditableField[], edits: Record<string, string>): boolean {
  return fields.some((f) => edits[f.id]?.trim())
}

// ---------------------------------------------------------------------------
// Simple hash of edits for cache comparison
// ---------------------------------------------------------------------------

export function hashEdits(edits: Record<string, string>): string {
  const sorted = Object.entries(edits)
    .filter(([, v]) => v?.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|')
  // Simple hash — good enough for cache busting
  let hash = 0
  for (let i = 0; i < sorted.length; i++) {
    const char = sorted.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(36)
}

// ---------------------------------------------------------------------------
// PPTX helpers
// ---------------------------------------------------------------------------

export async function applyTextEdits(
  buffer: ArrayBuffer,
  fields: { id: string; placeholder: string }[],
  edits: Record<string, string>
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))

  for (const slideFile of slideFiles) {
    let xml = await zip.file(slideFile)!.async('string')

    for (const field of fields) {
      const value = edits[field.id]
      if (!value || !field.placeholder) continue
      const escapedValue = escapeXml(value)
      xml = replacePlaceholderInParagraphs(xml, field.placeholder, escapedValue)
    }

    zip.file(slideFile, xml)
  }

  return zip.generateAsync({ type: 'uint8array' })
}

export async function extractSinglePage(
  buffer: ArrayBuffer,
  pageIndex: number
): Promise<ArrayBuffer> {
  const srcZip = await JSZip.loadAsync(buffer)

  const presRelsFile = srcZip.file('ppt/_rels/presentation.xml.rels')
  if (!presRelsFile) throw new Error('Missing presentation.xml.rels')
  const presRelsXml = await presRelsFile.async('string')

  // Parse relationships (order-independent attribute matching)
  const ridToTarget = new Map<string, string>()
  for (const m of presRelsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const el = m[0]
    const idMatch = el.match(/\bId="([^"]+)"/)
    const targetMatch = el.match(/\bTarget="([^"]+)"/)
    if (idMatch && targetMatch) {
      ridToTarget.set(idMatch[1], targetMatch[1])
    }
  }

  const presFile = srcZip.file('ppt/presentation.xml')
  if (!presFile) throw new Error('Missing presentation.xml')
  const presXml = await presFile.async('string')

  // Parse slide order from sldIdLst (order-independent attribute matching)
  const orderedSlideTargets: string[] = []
  for (const m of presXml.matchAll(/<p:sldId\b[^>]*(?:\/>|>[^<]*<\/p:sldId>)/g)) {
    const el = m[0]
    const ridMatch = el.match(/r:id="([^"]+)"/)
    if (ridMatch) {
      const target = ridToTarget.get(ridMatch[1])
      if (target) orderedSlideTargets.push(target)
    }
  }

  console.log(
    `[extractSinglePage] Found ${orderedSlideTargets.length} slides:`,
    orderedSlideTargets
  )

  if (pageIndex >= orderedSlideTargets.length) {
    throw new Error(`Page ${pageIndex} out of range (${orderedSlideTargets.length} slides)`)
  }

  const targetSlide = orderedSlideTargets[pageIndex]
  console.log(`[extractSinglePage] Extracting page ${pageIndex} → ${targetSlide}`)
  const targetSlidePath = `ppt/${targetSlide}`
  const targetSlideFileName = targetSlide.replace('slides/', '')

  const slideFile = srcZip.file(targetSlidePath)
  if (!slideFile) throw new Error(`Slide file ${targetSlidePath} not found`)

  const outZip = await JSZip.loadAsync(buffer)

  const allSlideXmls = Object.keys(outZip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f)
  )
  const allSlideRels = Object.keys(outZip.files).filter((f) =>
    /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(f)
  )
  for (const f of [...allSlideXmls, ...allSlideRels]) outZip.remove(f)

  const slideContent = await slideFile.async('uint8array')
  outZip.file('ppt/slides/slide1.xml', slideContent)

  const relsFile = srcZip.file(`ppt/slides/_rels/${targetSlideFileName}.rels`)
  if (relsFile) {
    const relsContent = await relsFile.async('uint8array')
    outZip.file('ppt/slides/_rels/slide1.xml.rels', relsContent)
  }

  // Remove all slide relationships, then add one for slide1.xml using a SAFE rId
  // (Bug fix: hardcoded rId2 could collide with an existing non-slide relationship)
  let newPresRels = presRelsXml.replace(/<Relationship[^>]*Type="[^"]*\/slide"[^>]*\/>\s*/g, '')
  let maxRid = 0
  for (const m of newPresRels.matchAll(/Id="rId(\d+)"/g)) {
    maxRid = Math.max(maxRid, parseInt(m[1], 10))
  }
  const slideRid = `rId${maxRid + 1}`
  const slideRelType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
  newPresRels = newPresRels.replace(
    '</Relationships>',
    `<Relationship Id="${slideRid}" Type="${slideRelType}" Target="slides/slide1.xml"/>\n</Relationships>`
  )
  outZip.file('ppt/_rels/presentation.xml.rels', newPresRels)

  const newPresXml = presXml.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
    `<p:sldIdLst><p:sldId id="256" r:id="${slideRid}"/></p:sldIdLst>`
  )
  outZip.file('ppt/presentation.xml', newPresXml)

  let contentTypes = await outZip.file('[Content_Types].xml')!.async('string')
  contentTypes = contentTypes.replace(
    /<Override[^>]*PartName="\/ppt\/slides\/slide\d+\.xml"[^>]*\/>\s*/g,
    ''
  )
  contentTypes = contentTypes.replace(
    '</Types>',
    `<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>\n</Types>`
  )
  outZip.file('[Content_Types].xml', contentTypes)

  const result = await outZip.generateAsync({ type: 'uint8array' })
  return result.buffer as ArrayBuffer
}

/**
 * Replace placeholder text within PPTX paragraphs.
 * Handles both single-run and multi-run (cross-run split) cases.
 *
 * When the placeholder covers >= 80% of the paragraph text, replaces the
 * ENTIRE paragraph content. This handles slightly truncated placeholders
 * (e.g., admin placeholder "erklär" vs actual PPTX text "erklärt").
 *
 * When the placeholder is a small substring (<80%), does a targeted
 * substring replacement to preserve surrounding text.
 */
function replacePlaceholderInParagraphs(
  xml: string,
  placeholder: string,
  escapedValue: string
): string {
  return xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraph) => {
    const runPattern = /<a:r\b[^>]*>[\s\S]*?<a:t[^>]*>([\s\S]*?)<\/a:t>[\s\S]*?<\/a:r>/g
    const runs: string[] = []
    let m
    while ((m = runPattern.exec(paragraph)) !== null) runs.push(m[1])
    if (runs.length === 0) return paragraph

    const combined = runs.join('')
    const trimmed = combined.trim()
    if (!trimmed.includes(placeholder)) return paragraph

    // If placeholder covers most of the text, replace everything.
    // This handles slightly truncated placeholders (missing last chars).
    const coverage = placeholder.length / trimmed.length
    const newText =
      coverage >= 0.8
        ? escapedValue
        : combined.replace(new RegExp(escapeRegex(placeholder), 'g'), escapedValue)

    const pOpen = (paragraph.match(/^(<a:p\b[^>]*>)/) || ['', '<a:p>'])[1]
    const pPr = (paragraph.match(/<a:pPr[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/) || [''])[0]
    const rPr = (paragraph.match(/<a:r\b[^>]*>[\s\S]*?(<a:rPr[^>]*(?:\/>|>[\s\S]*?<\/a:rPr>))/) || [
      '',
      '',
    ])[1]
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

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import JSZip from 'jszip'

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
 * Downloads the PPTX, applies text replacements, converts to PNG
 * via ConvertAPI, stores in Supabase Storage, and returns the URL.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'slides:render-preview', 10, 60_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const secret = process.env.CONVERTAPI_SECRET
  if (!secret) {
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
    .eq('tenant_id', profile.tenant_id)
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
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const fields = Array.isArray(slide.editable_fields) ? slide.editable_fields as { id: string; label: string; placeholder: string; required: boolean }[] : []
  const hasEdits = fields.some((f) => edits[f.id]?.trim())
  if (!hasEdits) {
    // No actual edits — return original thumbnail
    const { data: original } = await supabase
      .from('slides')
      .select('thumbnail_url')
      .eq('id', slideId)
      .single()
    return NextResponse.json({ previewUrl: original?.thumbnail_url ?? null })
  }

  try {
    // Download PPTX
    const downloadRes = await fetch(slide.pptx_url)
    if (!downloadRes.ok) {
      return NextResponse.json({ error: 'Failed to download PPTX' }, { status: 502 })
    }
    let buffer = await downloadRes.arrayBuffer()

    // Extract single page if multi-page
    const pageIndex = slide.page_index ?? 0
    const pageCount = slide.page_count ?? 1
    if (pageCount > 1) {
      buffer = await extractSinglePage(buffer, pageIndex)
    }

    // Apply text edits
    const edited = await applyTextEdits(buffer, fields, edits)

    // Convert to PNG via ConvertAPI
    // Upload the edited PPTX as base64
    const pptxBase64 = Buffer.from(edited).toString('base64')

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
    })

    if (!convertRes.ok) {
      const errText = await convertRes.text()
      console.error('[render-preview] ConvertAPI error:', convertRes.status, errText.slice(0, 500))
      return NextResponse.json({ error: 'Thumbnail rendering failed' }, { status: 502 })
    }

    const convertData = await convertRes.json() as {
      Files: { FileName: string; FileData: string }[]
    }

    const pageFile = convertData.Files[0]
    if (!pageFile) {
      return NextResponse.json({ error: 'No PNG output from conversion' }, { status: 502 })
    }

    // Upload preview PNG to storage
    const pngBuffer = Buffer.from(pageFile.FileData, 'base64')
    const storagePath = `${profile.tenant_id}/previews/${projectId}/${instanceId}.png`

    const { error: uploadErr } = await supabase.storage
      .from('slide-thumbnails')
      .upload(storagePath, pngBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })
    }

    const { data: publicUrlData } = supabase.storage
      .from('slide-thumbnails')
      .getPublicUrl(storagePath)

    // Append cache-buster to force browser refresh
    const previewUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`

    return NextResponse.json({ previewUrl })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[render-preview] Error:', msg)
    return NextResponse.json({ error: 'Preview rendering failed' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PPTX helpers (duplicated from export route to avoid import complexity)
// ---------------------------------------------------------------------------

async function applyTextEdits(
  buffer: ArrayBuffer,
  fields: { id: string; placeholder: string }[],
  edits: Record<string, string>
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files).filter((f) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(f)
  )

  for (const slideFile of slideFiles) {
    let xml = await zip.file(slideFile)!.async('string')

    for (const field of fields) {
      const value = edits[field.id]
      if (!value || !field.placeholder) continue
      const escapedValue = escapeXml(value)
      xml = xml.replace(new RegExp(escapeRegex(field.placeholder), 'g'), escapedValue)
      xml = normalizeCrossRunPlaceholder(xml, field.placeholder, escapedValue)
    }

    zip.file(slideFile, xml)
  }

  return zip.generateAsync({ type: 'uint8array' })
}

async function extractSinglePage(buffer: ArrayBuffer, pageIndex: number): Promise<ArrayBuffer> {
  const srcZip = await JSZip.loadAsync(buffer)

  const presRelsFile = srcZip.file('ppt/_rels/presentation.xml.rels')
  if (!presRelsFile) throw new Error('Missing presentation.xml.rels')
  const presRelsXml = await presRelsFile.async('string')

  const ridToTarget = new Map<string, string>()
  for (const m of presRelsXml.matchAll(/<Relationship[^>]+Id="(rId\d+)"[^>]+Target="([^"]+)"[^>]*\/>/g)) {
    ridToTarget.set(m[1], m[2])
  }

  const presFile = srcZip.file('ppt/presentation.xml')
  if (!presFile) throw new Error('Missing presentation.xml')
  const presXml = await presFile.async('string')

  const orderedSlideTargets: string[] = []
  for (const m of presXml.matchAll(/<p:sldId[^>]+r:id="(rId\d+)"[^>]*\/>/g)) {
    const target = ridToTarget.get(m[1])
    if (target) orderedSlideTargets.push(target)
  }

  if (pageIndex >= orderedSlideTargets.length) {
    throw new Error(`Page ${pageIndex} out of range (${orderedSlideTargets.length} slides)`)
  }

  const targetSlide = orderedSlideTargets[pageIndex]
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

  let newPresXml = presXml.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/,
    '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'
  )
  outZip.file('ppt/presentation.xml', newPresXml)

  let newPresRels = presRelsXml.replace(
    /<Relationship[^>]*Type="[^"]*\/slide"[^>]*\/>\s*/g,
    ''
  )
  const slideRelType = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide'
  newPresRels = newPresRels.replace(
    '</Relationships>',
    `<Relationship Id="rId2" Type="${slideRelType}" Target="slides/slide1.xml"/>\n</Relationships>`
  )
  outZip.file('ppt/_rels/presentation.xml.rels', newPresRels)

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

function normalizeCrossRunPlaceholder(xml: string, placeholder: string, escapedValue: string): string {
  return xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraph) => {
    const runPattern = /<a:r\b[^>]*>[\s\S]*?<a:t[^>]*>([\s\S]*?)<\/a:t>[\s\S]*?<\/a:r>/g
    const runs: string[] = []
    let m
    while ((m = runPattern.exec(paragraph)) !== null) runs.push(m[1])
    if (runs.length < 2) return paragraph

    const combined = runs.join('')
    if (!combined.includes(placeholder)) return paragraph

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
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

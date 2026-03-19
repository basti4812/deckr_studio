import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { isAllowedStorageUrl } from '@/lib/url-validation'

const RequestSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1).max(100),
})

/** ConvertAPI timeout: 60 seconds per PPTX conversion */
const CONVERTAPI_TIMEOUT_MS = 60_000

/**
 * POST /api/slides/generate-thumbnails
 *
 * Generates PNG thumbnails for slides using ConvertAPI.
 * Accepts an array of slide IDs, fetches their PPTX files,
 * converts each page to PNG, stores in Supabase Storage,
 * and updates the slide records with thumbnail URLs.
 *
 * Tracks status per slide: pending → generating → done/failed
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'slides:generate-thumbnails', 5, 60_000)
  if (limited) return limited

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

  const supabase = createServiceClient()

  // Fetch slides that need thumbnails
  const { data: slides, error: fetchErr } = await supabase
    .from('slides')
    .select('id, pptx_url, page_index, tenant_id, title')
    .in('id', parsed.data.slideIds)
    .eq('tenant_id', auth.profile.tenant_id)

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!slides || slides.length === 0) {
    return NextResponse.json({ error: 'No slides found' }, { status: 404 })
  }

  // Mark all slides as 'generating' before we start
  const allIds = slides.map((s) => s.id)
  await supabase
    .from('slides')
    .update({ thumbnail_status: 'generating', thumbnail_error: null })
    .in('id', allIds)

  // Group slides by pptx_url to avoid converting the same file multiple times
  const pptxGroups = new Map<string, typeof slides>()
  for (const slide of slides) {
    if (!slide.pptx_url) continue
    const existing = pptxGroups.get(slide.pptx_url) ?? []
    existing.push(slide)
    pptxGroups.set(slide.pptx_url, existing)
  }

  const results: { slideId: string; thumbnailUrl: string | null; error?: string }[] = []

  /** Mark a slide as failed in DB */
  async function markFailed(slideId: string, error: string) {
    await supabase
      .from('slides')
      .update({ thumbnail_status: 'failed', thumbnail_error: error })
      .eq('id', slideId)
  }

  for (const [pptxUrl, groupSlides] of pptxGroups) {
    // SEC-7: Validate pptx_url points to Supabase storage (prevent SSRF)
    if (!isAllowedStorageUrl(pptxUrl)) {
      for (const slide of groupSlides) {
        const err = 'Invalid slide URL'
        await markFailed(slide.id, err)
        results.push({ slideId: slide.id, thumbnailUrl: null, error: err })
      }
      continue
    }

    try {
      // Call ConvertAPI: PPTX → PNG (all pages) with timeout
      const convertRes = await fetch('https://v2.convertapi.com/convert/pptx/to/png', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          Parameters: [
            { Name: 'File', FileValue: { Url: pptxUrl } },
            { Name: 'ImageHeight', Value: '1080' },
            { Name: 'ImageWidth', Value: '1920' },
          ],
        }),
        signal: AbortSignal.timeout(CONVERTAPI_TIMEOUT_MS),
      })

      if (!convertRes.ok) {
        const errText = await convertRes.text()
        console.error(
          '[generate-thumbnails] ConvertAPI error:',
          convertRes.status,
          errText.slice(0, 500)
        )
        const errorMsg = `ConvertAPI error (${convertRes.status})`
        for (const slide of groupSlides) {
          await markFailed(slide.id, errorMsg)
          results.push({ slideId: slide.id, thumbnailUrl: null, error: errorMsg })
        }
        continue
      }

      const convertData = (await convertRes.json()) as {
        Files: { FileName: string; FileData: string }[]
      }

      // Each file in the response is a page PNG (0-indexed)
      for (const slide of groupSlides) {
        const pageFile = convertData.Files[slide.page_index ?? 0]
        if (!pageFile) {
          const err = `Page ${slide.page_index} not found in conversion result (${convertData.Files.length} pages returned)`
          await markFailed(slide.id, err)
          results.push({ slideId: slide.id, thumbnailUrl: null, error: err })
          continue
        }

        // Decode base64 PNG data
        const pngBuffer = Buffer.from(pageFile.FileData, 'base64')

        // Upload to Supabase Storage
        const storagePath = `${slide.tenant_id}/${slide.id}.png`
        const { error: uploadErr } = await supabase.storage
          .from('slide-thumbnails')
          .upload(storagePath, pngBuffer, {
            contentType: 'image/png',
            upsert: true,
          })

        if (uploadErr) {
          const err = `Storage upload failed: ${uploadErr.message}`
          await markFailed(slide.id, err)
          results.push({ slideId: slide.id, thumbnailUrl: null, error: err })
          continue
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('slide-thumbnails')
          .getPublicUrl(storagePath)

        const thumbnailUrl = publicUrlData.publicUrl

        // Update slide record with thumbnail URL + done status
        const { error: updateErr } = await supabase
          .from('slides')
          .update({
            thumbnail_url: thumbnailUrl,
            thumbnail_status: 'done',
            thumbnail_error: null,
          })
          .eq('id', slide.id)

        if (updateErr) {
          const err = `DB update failed: ${updateErr.message}`
          await markFailed(slide.id, err)
          results.push({ slideId: slide.id, thumbnailUrl: null, error: err })
        } else {
          results.push({ slideId: slide.id, thumbnailUrl })
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === 'TimeoutError'
            ? 'ConvertAPI timeout (60s) — file may be too large'
            : err.message
          : 'Unknown error'
      for (const slide of groupSlides) {
        await markFailed(slide.id, msg)
        results.push({ slideId: slide.id, thumbnailUrl: null, error: msg })
      }
    }
  }

  const succeeded = results.filter((r) => r.thumbnailUrl).length
  const failed = results.filter((r) => !r.thumbnailUrl).length

  return NextResponse.json({ results, succeeded, failed })
}

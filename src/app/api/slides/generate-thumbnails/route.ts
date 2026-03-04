import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

const RequestSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1).max(100),
})

/**
 * POST /api/slides/generate-thumbnails
 *
 * Generates PNG thumbnails for slides using ConvertAPI.
 * Accepts an array of slide IDs, fetches their PPTX files,
 * converts each page to PNG, stores in Supabase Storage,
 * and updates the slide records with thumbnail URLs.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'slides:generate-thumbnails', 5, 60_000)
  if (limited) return limited

  const secret = process.env.CONVERTAPI_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CONVERTAPI_SECRET not configured' },
      { status: 500 }
    )
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

  // Group slides by pptx_url to avoid converting the same file multiple times
  const pptxGroups = new Map<string, typeof slides>()
  for (const slide of slides) {
    if (!slide.pptx_url) continue
    const existing = pptxGroups.get(slide.pptx_url) ?? []
    existing.push(slide)
    pptxGroups.set(slide.pptx_url, existing)
  }

  const results: { slideId: string; thumbnailUrl: string | null; error?: string }[] = []

  for (const [pptxUrl, groupSlides] of pptxGroups) {
    try {
      // Call ConvertAPI: PPTX → PNG (all pages)
      const convertRes = await fetch(
        'https://v2.convertapi.com/convert/pptx/to/png',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${secret}`,
          },
          body: JSON.stringify({
            Parameters: [
              { Name: 'File', FileValue: { Url: pptxUrl } },
              { Name: 'ImageHeight', Value: '540' },
              { Name: 'ImageWidth', Value: '960' },
            ],
          }),
        }
      )

      if (!convertRes.ok) {
        const errText = await convertRes.text()
        console.error('[generate-thumbnails] ConvertAPI error:', convertRes.status, errText.slice(0, 500))
        for (const slide of groupSlides) {
          results.push({ slideId: slide.id, thumbnailUrl: null, error: 'Thumbnail generation failed' })
        }
        continue
      }

      const convertData = await convertRes.json() as {
        Files: { FileName: string; FileData: string }[]
      }

      // Each file in the response is a page PNG (0-indexed)
      for (const slide of groupSlides) {
        const pageFile = convertData.Files[slide.page_index ?? 0]
        if (!pageFile) {
          results.push({ slideId: slide.id, thumbnailUrl: null, error: `Page ${slide.page_index} not found in conversion result` })
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
          results.push({ slideId: slide.id, thumbnailUrl: null, error: `Storage upload failed: ${uploadErr.message}` })
          continue
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('slide-thumbnails')
          .getPublicUrl(storagePath)

        const thumbnailUrl = publicUrlData.publicUrl

        // Update slide record with thumbnail URL
        const { error: updateErr } = await supabase
          .from('slides')
          .update({ thumbnail_url: thumbnailUrl })
          .eq('id', slide.id)

        if (updateErr) {
          results.push({ slideId: slide.id, thumbnailUrl: null, error: `DB update failed: ${updateErr.message}` })
        } else {
          results.push({ slideId: slide.id, thumbnailUrl })
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      for (const slide of groupSlides) {
        results.push({ slideId: slide.id, thumbnailUrl: null, error: msg })
      }
    }
  }

  const succeeded = results.filter((r) => r.thumbnailUrl).length
  const failed = results.filter((r) => !r.thumbnailUrl).length

  return NextResponse.json({ results, succeeded, failed })
}

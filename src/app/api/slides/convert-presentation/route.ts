import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import JSZip from 'jszip'
import { getVisibleSlideIndices } from '@/lib/pptx-utils'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

const RequestSchema = z.object({
  sourceUrl: z.string().url(),
  sourceFormat: z.enum(['ppt', 'key', 'odp']),
  tenantId: z.string().uuid(),
  fileId: z.string().uuid(),
})

/**
 * POST /api/slides/convert-presentation
 *
 * Converts a non-PPTX presentation file to PPTX via ConvertAPI,
 * stores the result in Supabase Storage, and returns a signed URL + page count.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'slides:convert-presentation', 5, 60_000)
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

  const { sourceUrl, sourceFormat, tenantId, fileId } = parsed.data

  // Verify tenant matches
  if (tenantId !== auth.profile.tenant_id) {
    return NextResponse.json({ error: 'Tenant mismatch' }, { status: 403 })
  }

  // BUG-27: Validate sourceUrl points to our own Supabase storage (prevent SSRF)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl || !sourceUrl.startsWith(`${supabaseUrl}/storage/v1/`)) {
    return NextResponse.json({ error: 'Invalid source URL' }, { status: 400 })
  }

  try {
    // Convert to PPTX via ConvertAPI
    const convertRes = await fetch(`https://v2.convertapi.com/convert/${sourceFormat}/to/pptx`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        Parameters: [{ Name: 'File', FileValue: { Url: sourceUrl } }],
      }),
    })

    if (!convertRes.ok) {
      const errText = await convertRes.text()
      console.error(
        '[convert-presentation] ConvertAPI error:',
        convertRes.status,
        errText.slice(0, 500)
      )
      return NextResponse.json(
        { error: `Conversion failed for .${sourceFormat} file. This format may not be supported.` },
        { status: 422 }
      )
    }

    const convertData = (await convertRes.json()) as {
      Files: { FileName: string; FileData: string }[]
    }

    if (!convertData.Files?.[0]?.FileData) {
      return NextResponse.json({ error: 'Conversion returned no data' }, { status: 422 })
    }

    // Decode the PPTX from base64
    const pptxBuffer = Buffer.from(convertData.Files[0].FileData, 'base64')

    // Upload converted PPTX to Supabase Storage
    const supabase = createServiceClient()
    const storagePath = `${tenantId}/${fileId}/original.pptx`

    const { error: uploadErr } = await supabase.storage
      .from('slides')
      .upload(storagePath, pptxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadErr.message}` },
        { status: 500 }
      )
    }

    // Create signed URL for the PPTX
    const { data: urlData, error: signedUrlError } = await supabase.storage
      .from('slides')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1-year

    if (signedUrlError || !urlData?.signedUrl) {
      return NextResponse.json({ error: 'Failed to create signed URL' }, { status: 500 })
    }

    // Count visible pages in the converted PPTX (skip hidden slides)
    const zip = await JSZip.loadAsync(pptxBuffer)
    const visibleIndices = await getVisibleSlideIndices(zip)

    return NextResponse.json({
      pptxUrl: urlData.signedUrl,
      pageCount: visibleIndices.length,
    })
  } catch (err) {
    console.error('[convert-presentation] Error:', err)
    return NextResponse.json(
      { error: 'Conversion failed. Please try again or use a different file format.' },
      { status: 500 }
    )
  }
}

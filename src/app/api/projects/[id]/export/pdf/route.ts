import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

interface TrayItem {
  id: string
  slide_id: string
}

interface SlideRecord {
  id: string
  title: string
  thumbnail_url: string | null
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/export/pdf — generate PDF from slide thumbnails
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Params }
) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await params
  const supabase = createServiceClient()

  // Load project + verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slide_order')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const trayItems: TrayItem[] = Array.isArray(project.slide_order) ? project.slide_order : []
  if (trayItems.length === 0) {
    return NextResponse.json({ error: 'Add slides to export' }, { status: 400 })
  }

  // Load all referenced slides in one query (scoped to tenant)
  const slideIds = [...new Set(trayItems.map((t) => t.slide_id))]
  const { data: slidesData, error: slidesError } = await supabase
    .from('slides')
    .select('id, title, thumbnail_url')
    .in('id', slideIds)
    .eq('tenant_id', profile.tenant_id)

  if (slidesError || !slidesData) {
    return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 })
  }

  const slideMap = new Map<string, SlideRecord>(slidesData.map((s) => [s.id, s as SlideRecord]))

  // Build PDF — one 1280×720 page per tray item (16:9)
  const PAGE_W = 1280
  const PAGE_H = 720

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const item of trayItems) {
    const slide = slideMap.get(item.slide_id)
    if (!slide) {
      return NextResponse.json(
        { error: `Slide "${item.slide_id}" not found` },
        { status: 422 }
      )
    }

    const page = pdfDoc.addPage([PAGE_W, PAGE_H])
    let imageEmbedded = false

    if (slide.thumbnail_url) {
      try {
        const res = await fetch(slide.thumbnail_url)
        if (res.ok) {
          const imageBytes = new Uint8Array(await res.arrayBuffer())
          const contentType = res.headers.get('content-type') ?? ''
          const image = contentType.includes('png')
            ? await pdfDoc.embedPng(imageBytes)
            : await pdfDoc.embedJpg(imageBytes)
          page.drawImage(image, { x: 0, y: 0, width: PAGE_W, height: PAGE_H })
          imageEmbedded = true
        }
      } catch {
        // Fall through to title-only page
      }
    }

    if (!imageEmbedded) {
      // Gray background + slide title centered
      page.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_W,
        height: PAGE_H,
        color: rgb(0.95, 0.95, 0.95),
      })
      const fontSize = 36
      const textWidth = font.widthOfTextAtSize(slide.title, fontSize)
      page.drawText(slide.title, {
        x: (PAGE_W - textWidth) / 2,
        y: PAGE_H / 2 - fontSize / 2,
        size: fontSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })
    }
  }

  const pdfBytes = await pdfDoc.save()

  const safeName = (project.name as string)
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
  const filename = `${safeName || 'presentation'}.pdf`

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBytes.byteLength),
    },
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { createServiceClient } from '@/lib/supabase'
import { checkIpRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ token: string }>

interface TrayItem {
  id: string
  slide_id: string
  is_personal?: boolean
  personal_slide_id?: string
}

interface SlideRecord {
  id: string
  title: string
  thumbnail_url: string | null
}

// ---------------------------------------------------------------------------
// POST /api/view/[token]/pdf — public PDF download for share link viewers
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const limited = await checkIpRateLimit(request, 'view-pdf', 5, 300_000)
  if (limited) return limited

  const { token } = await params
  const supabase = createServiceClient()

  // Validate share link token
  const { data: link } = await supabase
    .from('share_links')
    .select('id, project_id, tenant_id, expires_at')
    .eq('token', token)
    .single()

  if (!link) return NextResponse.json({ error: 'Invalid link' }, { status: 404 })

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 })
  }

  // Load project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slide_order')
    .eq('id', link.project_id)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const trayItems: TrayItem[] = Array.isArray(project.slide_order) ? project.slide_order : []
  if (trayItems.length === 0) {
    return NextResponse.json({ error: 'No slides to export' }, { status: 400 })
  }

  // Load library slides (scoped to tenant)
  const libraryItems = trayItems.filter((t) => !t.is_personal)
  const slideIds = [...new Set(libraryItems.map((t) => t.slide_id).filter(Boolean))]
  const slideMap = new Map<string, SlideRecord>()

  if (slideIds.length > 0) {
    const { data: slidesData, error: slidesError } = await supabase
      .from('slides')
      .select('id, title, thumbnail_url')
      .in('id', slideIds)
      .eq('tenant_id', link.tenant_id)

    if (slidesError || !slidesData) {
      return NextResponse.json({ error: 'Failed to load slides' }, { status: 500 })
    }
    for (const s of slidesData) slideMap.set(s.id, s as SlideRecord)
  }

  // Load personal slides
  const personalItems = trayItems.filter((t) => t.is_personal && t.personal_slide_id)
  const personalSlideIds = [...new Set(personalItems.map((t) => t.personal_slide_id!))]
  const personalSlideMap = new Map<string, { id: string; title: string }>()

  if (personalSlideIds.length > 0) {
    const { data: psData } = await supabase
      .from('project_personal_slides')
      .select('id, title')
      .in('id', personalSlideIds)
      .eq('project_id', link.project_id)

    if (psData) {
      for (const ps of psData) personalSlideMap.set(ps.id, ps)
    }
  }

  // Build PDF — 1280×720 (16:9) per slide
  const PAGE_W = 1280
  const PAGE_H = 720

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const item of trayItems) {
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlideMap.get(item.personal_slide_id)
      if (!ps) {
        return NextResponse.json({ error: 'Personal slide not found' }, { status: 422 })
      }
      const page = pdfDoc.addPage([PAGE_W, PAGE_H])
      page.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_W,
        height: PAGE_H,
        color: rgb(0.95, 0.95, 0.95),
      })
      const fontSize = 36
      const textWidth = font.widthOfTextAtSize(ps.title, fontSize)
      page.drawText(ps.title, {
        x: (PAGE_W - textWidth) / 2,
        y: PAGE_H / 2 - fontSize / 2,
        size: fontSize,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })
      continue
    }

    const slide = slideMap.get(item.slide_id)
    if (!slide) {
      return NextResponse.json({ error: `Slide not found` }, { status: 422 })
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

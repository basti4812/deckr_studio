import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

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
  thumbnail_url: string | null
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/export/pdf — generate PDF from slide thumbnails
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'project-export-pdf', 10, 300_000)
  if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { id } = await params
  const supabase = createServiceClient()

  // Load project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id, slide_order, text_edits, rendered_previews')
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

  // Load all referenced library slides in one query (scoped to tenant)
  const libraryItems = trayItems.filter((t) => !t.is_personal)
  const slideIds = [...new Set(libraryItems.map((t) => t.slide_id).filter(Boolean))]
  const slideMap = new Map<string, SlideRecord>()

  if (slideIds.length > 0) {
    const { data: slidesData, error: slidesError } = await supabase
      .from('slides')
      .select('id, title, thumbnail_url')
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
  const personalSlideMap = new Map<string, { id: string; title: string }>()

  if (personalSlideIds.length > 0) {
    const { data: psData } = await supabase
      .from('project_personal_slides')
      .select('id, title')
      .in('id', personalSlideIds)
      .eq('project_id', id)

    if (psData) {
      for (const ps of psData) personalSlideMap.set(ps.id, ps)
    }
  }

  // Parse rendered_previews for text-injected thumbnails
  const renderedPreviews = (project.rendered_previews ?? {}) as Record<
    string,
    { url: string; hash: string } | string
  >

  // Build PDF — one 1280×720 page per tray item (16:9)
  const PAGE_W = 1280
  const PAGE_H = 720

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  for (const item of trayItems) {
    // Personal slide: title-only page (no thumbnail in V1)
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlideMap.get(item.personal_slide_id)
      if (!ps) {
        return NextResponse.json({ error: `Personal slide not found` }, { status: 422 })
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

    // Library slide
    const slide = slideMap.get(item.slide_id)
    if (!slide) {
      return NextResponse.json({ error: `Slide "${item.slide_id}" not found` }, { status: 422 })
    }

    const page = pdfDoc.addPage([PAGE_W, PAGE_H])
    let imageEmbedded = false

    // Prefer rendered preview (text edits applied) over original thumbnail
    const preview = renderedPreviews[item.id]
    const imageUrl = (typeof preview === 'string' ? preview : preview?.url) ?? slide.thumbnail_url

    if (imageUrl) {
      try {
        const res = await fetch(imageUrl)
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
        console.error('[export-pdf] auto-snapshot failed', err)
      }
    )

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

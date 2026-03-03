import crypto from 'crypto'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase'
import { ViewerSlideshow, type ViewerSlide } from '@/components/view/viewer-slideshow'
import { ViewerError } from '@/components/view/viewer-error'

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
// /view/[token] — public viewer page (Server Component, no auth)
// ---------------------------------------------------------------------------

export default async function ViewPage({ params }: { params: Params }) {
  const { token } = await params
  const supabase = createServiceClient()

  // 1. Look up share link
  const { data: link } = await supabase
    .from('share_links')
    .select('id, project_id, tenant_id, expires_at, view_count')
    .eq('token', token)
    .single()

  if (!link) return <ViewerError type="not-found" />

  // 2. Check expiry
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return <ViewerError type="expired" />
  }

  // 3. Load project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, slide_order')
    .eq('id', link.project_id)
    .single()

  if (!project) return <ViewerError type="not-found" />

  // 4. Load tenant branding
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, logo_url, primary_color')
    .eq('id', link.tenant_id)
    .single()

  // 5. Build slide data
  const trayItems: TrayItem[] = Array.isArray(project.slide_order) ? project.slide_order : []

  if (trayItems.length === 0) {
    return <ViewerError type="no-slides" />
  }

  // Load library slides
  const libraryItems = trayItems.filter((t) => !t.is_personal)
  const slideIds = [...new Set(libraryItems.map((t) => t.slide_id).filter(Boolean))]
  const slideMap = new Map<string, SlideRecord>()

  if (slideIds.length > 0) {
    const { data: slidesData } = await supabase
      .from('slides')
      .select('id, title, thumbnail_url')
      .in('id', slideIds)
      .eq('tenant_id', link.tenant_id)

    if (slidesData) {
      for (const s of slidesData) slideMap.set(s.id, s as SlideRecord)
    }
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

  // Build ordered slides array
  const slides: ViewerSlide[] = []
  for (const item of trayItems) {
    if (item.is_personal && item.personal_slide_id) {
      const ps = personalSlideMap.get(item.personal_slide_id)
      if (ps) slides.push({ thumbnail_url: null, title: ps.title })
      continue
    }
    const slide = slideMap.get(item.slide_id)
    if (slide) slides.push({ thumbnail_url: slide.thumbnail_url, title: slide.title })
  }

  if (slides.length === 0) {
    return <ViewerError type="slides-unavailable" />
  }

  // 6. Record access (fire-and-forget)
  // The DB trigger on share_link_accesses automatically increments share_links.view_count.
  const reqHeaders = await headers()
  const visitorIp =
    reqHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    reqHeaders.get('x-real-ip') ??
    'unknown'
  const dailySalt = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const ipHash = crypto
    .createHash('sha256')
    .update(`${visitorIp}:${dailySalt}`)
    .digest('hex')

  supabase
    .from('share_link_accesses')
    .insert({ share_link_id: link.id, ip_hash: ipHash })
    .then(() => {}, (err: unknown) => { console.error('[view] access insert failed', err) })

  // 7. Render viewer
  return (
    <ViewerSlideshow
      slides={slides}
      projectName={project.name}
      tenantName={tenant?.name ?? ''}
      tenantLogoUrl={tenant?.logo_url ?? null}
      tenantPrimaryColor={tenant?.primary_color ?? '#2B4EFF'}
      shareToken={token}
    />
  )
}

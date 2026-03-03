import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile, requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

// ---------------------------------------------------------------------------
// GET /api/template-sets — list all for tenant with slide count + first thumbnail
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()

  const { data: sets, error } = await supabase
    .from('template_sets')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // For each set, fetch slide count + first slide thumbnail
  const setIds = (sets ?? []).map((s) => s.id)
  let memberships: { template_set_id: string; slide_id: string; position: number }[] = []

  if (setIds.length > 0) {
    const { data: mem } = await supabase
      .from('template_set_slides')
      .select('template_set_id, slide_id, position')
      .in('template_set_id', setIds)
      .order('position', { ascending: true })
    memberships = mem ?? []
  }

  // Verify which slides actually exist (filter orphaned memberships)
  const allSlideIds = [...new Set(memberships.map((m) => m.slide_id))]
  const existingSlideIds = new Set<string>()
  let slideThumbMap: Map<string, string | null> = new Map()

  if (allSlideIds.length > 0) {
    const { data: slides } = await supabase
      .from('slides')
      .select('id, thumbnail_url')
      .in('id', allSlideIds)
    for (const s of slides ?? []) {
      existingSlideIds.add(s.id)
      slideThumbMap.set(s.id, s.thumbnail_url)
    }
  }

  // Only count memberships for slides that still exist
  const validMemberships = memberships.filter((m) => existingSlideIds.has(m.slide_id))

  const templateSets = (sets ?? []).map((s) => {
    const setMemberships = validMemberships.filter((m) => m.template_set_id === s.id)
    const firstSlide = setMemberships[0]
    return {
      ...s,
      slide_count: setMemberships.length,
      first_slide_thumbnail: firstSlide ? (slideThumbMap.get(firstSlide.slide_id) ?? null) : null,
    }
  })

  return NextResponse.json({ templateSets })
}

// ---------------------------------------------------------------------------
// POST /api/template-sets — create new template set
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'template-sets:create', 30, 60 * 1000)
  if (limited) return limited

  let body: { name?: string; description?: string; category?: string } = {}
  try { body = await request.json() } catch { /* ok */ }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ error: 'Name max 100 characters' }, { status: 400 })

  const description = body.description?.trim() || null
  if (description && description.length > 500) {
    return NextResponse.json({ error: 'Description max 500 characters' }, { status: 400 })
  }

  const category = body.category?.trim() || null
  if (category && category.length > 50) {
    return NextResponse.json({ error: 'Category max 50 characters' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('template_sets')
    .insert({ tenant_id: auth.profile.tenant_id, name, description, category })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logActivity({
    tenantId: auth.profile.tenant_id,
    actorId: auth.user.id,
    eventType: 'template_set.created',
    resourceType: 'template_set',
    resourceId: data.id,
    resourceName: data.name,
  })

  return NextResponse.json({ templateSet: data }, { status: 201 })
}

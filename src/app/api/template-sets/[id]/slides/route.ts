import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile, requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/template-sets/[id]/slides — ordered slide list with full slide data
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const supabase = createServiceClient()

  // Verify set belongs to this tenant
  const { data: set } = await supabase
    .from('template_sets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (!set) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  const { data: memberships, error: mErr } = await supabase
    .from('template_set_slides')
    .select('id, slide_id, position')
    .eq('template_set_id', id)
    .order('position', { ascending: true })

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ slides: [] })
  }

  const { data: slides, error: sErr } = await supabase
    .from('slides')
    .select('*')
    .in('id', memberships.map((m) => m.slide_id))

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })

  const slideMap = new Map((slides ?? []).map((s) => [s.id, s]))
  const ordered = memberships
    .map((m) => ({ ...m, slide: slideMap.get(m.slide_id) ?? null }))
    .filter((m) => m.slide !== null)

  return NextResponse.json({ slides: ordered })
}

// ---------------------------------------------------------------------------
// POST /api/template-sets/[id]/slides — add slide to set
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'template-sets:slides', 60, 60 * 1000)
  if (limited) return limited

  const { id } = await params

  let body: { slideId?: string } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.slideId) return NextResponse.json({ error: 'slideId is required' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify set belongs to admin's tenant
  const { data: set } = await supabase
    .from('template_sets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!set) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  // Verify slide belongs to tenant
  const { data: slide } = await supabase
    .from('slides')
    .select('id')
    .eq('id', body.slideId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!slide) return NextResponse.json({ error: 'Slide not found' }, { status: 404 })

  // Get current max position
  const { count } = await supabase
    .from('template_set_slides')
    .select('*', { count: 'exact', head: true })
    .eq('template_set_id', id)

  const { data, error } = await supabase
    .from('template_set_slides')
    .insert({ template_set_id: id, slide_id: body.slideId, position: count ?? 0 })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slide already in template set' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ membership: data }, { status: 201 })
}

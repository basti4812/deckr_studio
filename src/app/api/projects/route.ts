import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/projects — list active projects owned by the caller, most recent first
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', user.id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ projects: data ?? [] })
}

// ---------------------------------------------------------------------------
// POST /api/projects — create a new project
// Body: { name, templateSetId? }
// Auto-populates slide_order with mandatory slides + template slides.
// ---------------------------------------------------------------------------

const CreateProjectSchema = z.object({
  name: z.string().min(1, 'name is required').max(120, 'name too long (max 120)'),
  templateSetId: z.string().uuid('templateSetId must be a valid UUID').optional(),
})

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await checkRateLimit(user.id, 'projects:create', 20, 60 * 1000)
  if (limited) return limited

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CreateProjectSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const name = parsed.data.name.trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supabase = createServiceClient()

  // Fetch mandatory slides to pre-populate tray
  const { data: mandatorySlides } = await supabase
    .from('slides')
    .select('id')
    .eq('tenant_id', profile.tenant_id)
    .eq('status', 'mandatory')

  const mandatoryIds = new Set((mandatorySlides ?? []).map((s) => s.id))

  // Build slide_order: mandatory slides first
  const slideOrder: { id: string; slide_id: string }[] = (mandatorySlides ?? []).map((s) => ({
    id: crypto.randomUUID(),
    slide_id: s.id,
  }))

  // If a template set is selected, append its slides (non-deprecated, non-duplicate)
  if (parsed.data.templateSetId) {
    // Verify template set belongs to tenant
    const { data: set } = await supabase
      .from('template_sets')
      .select('id')
      .eq('id', parsed.data.templateSetId)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (set) {
      // Fetch ordered memberships
      const { data: memberships } = await supabase
        .from('template_set_slides')
        .select('slide_id, position')
        .eq('template_set_id', set.id)
        .order('position', { ascending: true })

      if (memberships && memberships.length > 0) {
        // Fetch actual slide data to check status + existence
        const { data: slides } = await supabase
          .from('slides')
          .select('id, status')
          .in('id', memberships.map((m) => m.slide_id))
          .eq('tenant_id', profile.tenant_id)

        const slideMap = new Map((slides ?? []).map((s) => [s.id, s]))

        for (const m of memberships) {
          const slide = slideMap.get(m.slide_id)
          // Skip if: doesn't exist, deprecated, or already added as mandatory
          if (!slide || slide.status === 'deprecated' || mandatoryIds.has(m.slide_id)) continue
          slideOrder.push({ id: crypto.randomUUID(), slide_id: m.slide_id })
        }
      }
    }
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      tenant_id: profile.tenant_id,
      owner_id: user.id,
      name,
      slide_order: slideOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data }, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { onProjectCreated } from '@/lib/crm-hooks'

// ---------------------------------------------------------------------------
// GET /api/projects — list active projects owned by the caller, most recent first
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', auth.user.id)
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
  crmCustomerName: z.string().max(200).optional(),
  crmCompanyName: z.string().max(200).optional(),
  crmDealId: z.string().max(100).optional(),
})

export async function POST(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'projects:create', 20, 60 * 1000)
  if (limited) return limited

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
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
    .eq('tenant_id', auth.profile.tenant_id)
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
      .eq('tenant_id', auth.profile.tenant_id)
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
          .in(
            'id',
            memberships.map((m) => m.slide_id)
          )
          .eq('tenant_id', auth.profile.tenant_id)

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
      tenant_id: auth.profile.tenant_id,
      owner_id: auth.user.id,
      name,
      slide_order: slideOrder,
      template_set_id: parsed.data.templateSetId ?? null,
      crm_customer_name: parsed.data.crmCustomerName ?? null,
      crm_company_name: parsed.data.crmCompanyName ?? null,
      crm_deal_id: parsed.data.crmDealId ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // CRM_INTEGRATION: notify CRM about new project (fire-and-forget)
  onProjectCreated({
    id: data.id,
    name: data.name,
    tenant_id: data.tenant_id,
    crm_customer_name: data.crm_customer_name,
    crm_company_name: data.crm_company_name,
    crm_deal_id: data.crm_deal_id,
  }).catch((err) => console.error('[crm-hooks] onProjectCreated failed:', err))

  return NextResponse.json({ project: data }, { status: 201 })
}

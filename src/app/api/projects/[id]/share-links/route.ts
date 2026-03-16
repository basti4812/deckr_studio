import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'
import { logActivity } from '@/lib/activity-log'
import { onShareLinkGenerated } from '@/lib/crm-hooks'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/share-links — list all share links for a project
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'share-links-list', 30, 60_000)
  if (limited) return limited

  const { id } = await params
  const supabase = createServiceClient()

  // Verify ownership or edit permission
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (project.owner_id !== auth.user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (share?.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const { data: links, error } = await supabase
    .from('share_links')
    .select('id, token, expires_at, view_count, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const result = (links ?? []).map((l) => ({
    ...l,
    status: l.expires_at && new Date(l.expires_at) < now ? 'expired' : 'active',
  }))

  return NextResponse.json({ links: result })
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/share-links — create a new share link
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  expires_in: z.enum(['1d', '7d', '30d', 'never']).default('7d'),
})

const EXPIRY_MS: Record<string, number | null> = {
  '1d': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
  never: null,
}

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'share-links-create', 10, 60_000)
  if (limited) return limited

  const { id } = await params
  let body: unknown = {}
  try {
    body = await request.json()
  } catch {
    /* ok */
  }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify ownership or edit permission
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id, tenant_id, crm_customer_name, crm_company_name, crm_deal_id')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (auth.profile.tenant_id !== project.tenant_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (project.owner_id !== auth.user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (share?.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Generate token: 32 URL-safe characters (192 bits entropy)
  const token = crypto.randomBytes(24).toString('base64url')

  const expiryMs = EXPIRY_MS[parsed.data.expires_in]
  const expires_at = expiryMs ? new Date(Date.now() + expiryMs).toISOString() : null

  const { data: link, error } = await supabase
    .from('share_links')
    .insert({
      project_id: id,
      tenant_id: project.tenant_id,
      created_by: auth.user.id,
      token,
      expires_at,
    })
    .select('id, token, expires_at, view_count, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logActivity({
    tenantId: project.tenant_id,
    actorId: auth.user.id,
    eventType: 'share_link.created',
    resourceType: 'project',
    resourceId: id,
    resourceName: project.name ?? id,
  })

  // CRM_INTEGRATION: notify CRM about share link (fire-and-forget)
  onShareLinkGenerated(
    {
      id: project.id,
      name: project.name ?? id,
      tenant_id: project.tenant_id,
      crm_customer_name: project.crm_customer_name,
      crm_company_name: project.crm_company_name,
      crm_deal_id: project.crm_deal_id,
    },
    {
      id: link.id,
      token: link.token,
      project_id: id,
      expires_at: link.expires_at,
    }
  ).catch((err) => console.error('[crm-hooks] onShareLinkGenerated failed:', err))

  return NextResponse.json(
    {
      link: { ...link, status: 'active' as const },
    },
    { status: 201 }
  )
}

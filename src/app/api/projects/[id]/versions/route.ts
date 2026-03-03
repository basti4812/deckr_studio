import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/versions — list versions for a project
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'versions-list', 30, 60_000)
  if (limited) return limited

  const { id } = await params
  const supabase = createServiceClient()

  // Load project + verify access
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active || profile.tenant_id !== project.tenant_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (project.owner_id !== user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (share?.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Parse pagination
  const url = new URL(request.url)
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20))

  const { data: versions, error } = await supabase
    .from('project_versions')
    .select('id, project_id, label, is_auto, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ versions: versions ?? [] })
}

// ---------------------------------------------------------------------------
// POST /api/projects/[id]/versions — create a manual version snapshot
// ---------------------------------------------------------------------------

const CreateSchema = z.object({
  label: z.string().max(200).nullable().optional(),
})

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await checkRateLimit(user.id, 'versions-create', 10, 60_000)
  if (limited) return limited

  const { id } = await params
  let body: unknown = {}
  try { body = await request.json() } catch { /* ok */ }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const supabase = createServiceClient()

  // Load project + verify access
  const { data: project } = await supabase
    .from('projects')
    .select('id, owner_id, tenant_id, slide_order, text_edits')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active || profile.tenant_id !== project.tenant_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (project.owner_id !== user.id) {
    const { data: share } = await supabase
      .from('project_shares')
      .select('permission')
      .eq('project_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (share?.permission !== 'edit') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Generate default label if none provided
  const label = parsed.data.label?.trim() || `Unnamed version — ${new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })}`

  const { data: version, error } = await supabase
    .from('project_versions')
    .insert({
      project_id: id,
      label,
      slide_order_snapshot: project.slide_order ?? [],
      text_edits_snapshot: project.text_edits ?? {},
      is_auto: false,
    })
    .select('id, project_id, label, is_auto, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ version }, { status: 201 })
}

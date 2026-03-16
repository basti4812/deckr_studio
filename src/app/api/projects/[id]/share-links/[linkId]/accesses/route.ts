import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

type Params = Promise<{ id: string; linkId: string }>

// ---------------------------------------------------------------------------
// Query schema
// ---------------------------------------------------------------------------

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(20),
})

// ---------------------------------------------------------------------------
// GET /api/projects/[id]/share-links/[linkId]/accesses
// Returns the timestamped access list for a specific share link.
// Auth required: project owner or user with edit permission.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'share-link-accesses', 30, 60_000)
  if (limited) return limited

  const { id, linkId } = await params
  const supabase = createServiceClient()

  // Parse query parameters
  const url = new URL(request.url)
  const parsed = QuerySchema.safeParse({
    limit: url.searchParams.get('limit') ?? undefined,
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
  }
  const { limit } = parsed.data

  // Verify the share link belongs to this project
  const { data: link } = await supabase
    .from('share_links')
    .select('id, project_id, view_count')
    .eq('id', linkId)
    .eq('project_id', id)
    .single()

  if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Verify ownership or edit permission
  const { data: project } = await supabase
    .from('projects')
    .select('owner_id, tenant_id')
    .eq('id', id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Tenant isolation (defense-in-depth)
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

  // Fetch accesses (newest first)
  const { data: accesses, error } = await supabase
    .from('share_link_accesses')
    .select('id, accessed_at')
    .eq('share_link_id', linkId)
    .order('accessed_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get total count for "Show all" button
  const { count: totalCount } = await supabase
    .from('share_link_accesses')
    .select('id', { count: 'exact', head: true })
    .eq('share_link_id', linkId)

  return NextResponse.json({
    accesses: accesses ?? [],
    total: totalCount ?? 0,
  })
}

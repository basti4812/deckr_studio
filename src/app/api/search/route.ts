import { NextRequest, NextResponse } from 'next/server'
import { requireActiveUser } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/search?q=... — unified search across projects, slides, and team
// Returns up to 5 results per entity type. Rate-limited to 30 req/min.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const limited = await checkRateLimit(auth.user.id, 'search', 30, 60_000)
  if (limited) return limited

  const query = request.nextUrl.searchParams.get('q')?.trim()
  if (!query || query.length < 2) {
    return NextResponse.json({ projects: [], slides: [], users: [] })
  }

  // Sanitize: limit to 50 chars, escape ILIKE wildcards
  const safeQuery = query
    .slice(0, 50)
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')

  const tenantId = auth.profile.tenant_id
  const supabase = createServiceClient()

  // Run searches in parallel. Users search is split into two separate queries
  // to avoid PostgREST filter injection via .or() string interpolation.
  const [projectsResult, slidesResult, usersNameResult, usersEmailResult] = await Promise.all([
    // Search projects by name
    supabase
      .from('projects')
      .select('id, name, status')
      .eq('tenant_id', tenantId)
      .ilike('name', `%${safeQuery}%`)
      .order('updated_at', { ascending: false })
      .limit(5),

    // Search slides by title
    supabase
      .from('slides')
      .select('id, title, status, thumbnail_url')
      .eq('tenant_id', tenantId)
      .ilike('title', `%${safeQuery}%`)
      .order('created_at', { ascending: false })
      .limit(5),

    // Search team members by display_name
    supabase
      .from('users')
      .select('id, display_name, email')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .ilike('display_name', `%${safeQuery}%`)
      .order('display_name', { ascending: true })
      .limit(5),

    // Search team members by email
    supabase
      .from('users')
      .select('id, display_name, email')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .ilike('email', `%${safeQuery}%`)
      .order('display_name', { ascending: true })
      .limit(5),
  ])

  // Merge and deduplicate user results
  const usersMap = new Map<string, { id: string; display_name: string | null; email: string }>()
  for (const u of [...(usersNameResult.data ?? []), ...(usersEmailResult.data ?? [])]) {
    if (!usersMap.has(u.id)) usersMap.set(u.id, u)
  }
  const users = Array.from(usersMap.values()).slice(0, 5)

  return NextResponse.json({
    projects: projectsResult.data ?? [],
    slides: slidesResult.data ?? [],
    users,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/dashboard/stats
// Returns aggregated dashboard statistics for admins.
// Admin-only. Rate-limited to 30 requests per minute.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { profile } = auth

  const limited = await checkRateLimit(auth.user.id, 'dashboard:stats', 30, 60_000)
  if (limited) return limited

  try {
    const supabase = createServiceClient()
    const tenantId = profile.tenant_id
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
      slidesCount,
      projectsCount,
      exportsCount,
      teamCount,
      recentProjectsResult,
      recentActivityResult,
    ] = await Promise.all([
      // Total active slides
      supabase
        .from('slides')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .neq('status', 'deprecated'),

      // Total projects
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // Exports last 30 days
      supabase
        .from('activity_logs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('event_type', 'project.exported')
        .gte('created_at', thirtyDaysAgo),

      // Active team members
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),

      // Last 5 projects
      supabase
        .from('projects')
        .select('id, name, status, updated_at, created_at, created_by')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(5),

      // Last 5 activity log entries with actor info
      supabase
        .from('activity_logs')
        .select('id, event_type, resource_type, resource_name, created_at, actor:users!actor_id(display_name, avatar_url)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    return NextResponse.json({
      totalSlides: slidesCount.count ?? 0,
      totalProjects: projectsCount.count ?? 0,
      exportsLast30Days: exportsCount.count ?? 0,
      teamMembers: teamCount.count ?? 0,
      recentProjects: recentProjectsResult.data ?? [],
      recentActivity: recentActivityResult.data ?? [],
    })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}

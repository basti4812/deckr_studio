import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types returned by RPC functions
// ---------------------------------------------------------------------------

interface SlideAnalyticsRow {
  slide_id: string
  title: string
  thumbnail_url: string | null
  status: string
  use_count: number
  last_used_at: string | null
  template_set_count: number
}

interface TemplateAnalyticsRow {
  template_set_id: string
  name: string
  cover_image_url: string | null
  slide_count: number
  times_selected: number
  last_selected_at: string | null
}

// ---------------------------------------------------------------------------
// Cached data fetcher (1 hour per tenant)
// ---------------------------------------------------------------------------

function getAnalyticsData(tenantId: string) {
  return unstable_cache(
    async () => {
      const supabase = createServiceClient()
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

      const [slidesCount, projectsCount, exportsCount, slideAnalytics, templateAnalytics] =
        await Promise.all([
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

          // Slide usage via RPC
          supabase.rpc('get_slide_analytics', { p_tenant_id: tenantId }),

          // Template usage via RPC
          supabase.rpc('get_template_analytics', { p_tenant_id: tenantId }),
        ])

      return {
        summary: {
          totalSlides: slidesCount.count ?? 0,
          totalProjects: projectsCount.count ?? 0,
          exportsLast30Days: exportsCount.count ?? 0,
        },
        slides: (slideAnalytics.data ?? []) as SlideAnalyticsRow[],
        templateSets: (templateAnalytics.data ?? []) as TemplateAnalyticsRow[],
        errors: {
          slides: slideAnalytics.error?.message ?? null,
          templateSets: templateAnalytics.error?.message ?? null,
        },
      }
    },
    [`analytics-${tenantId}`],
    { revalidate: 3600, tags: ['analytics', `analytics-${tenantId}`] }
  )()
}

// ---------------------------------------------------------------------------
// GET /api/analytics
// Returns summary metrics + slide analytics + template analytics.
// Admin-only. Results cached 1 hour per tenant.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { profile } = auth

  const limited = await checkRateLimit(auth.user.id, 'analytics:get', 30, 60 * 1000)
  if (limited) return limited

  try {
    const data = await getAnalyticsData(profile.tenant_id)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 })
  }
}

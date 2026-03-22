import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/slides/[id]/impact
//
// Returns how many projects and users reference this slide.
// Used by the admin delete dialog to show impact before archiving.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  const rateLimited = await checkRateLimit(auth.user.id, 'slides:impact', 30, 60_000)
  if (rateLimited) return rateLimited

  const supabase = createServiceClient()

  // Verify slide belongs to tenant
  const { data: slide, error: slideErr } = await supabase
    .from('slides')
    .select('id, title')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (slideErr || !slide) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  // Find all projects that reference this slide
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, owner_id')
    .eq('tenant_id', auth.profile.tenant_id)
    .contains('slide_order', [{ slide_id: id }])
    .limit(500)

  if (!projects || projects.length === 0) {
    return NextResponse.json({
      slideTitle: slide.title,
      projectCount: 0,
      userCount: 0,
      projects: [],
    })
  }

  // Get unique owners and their display names
  const uniqueOwnerIds = [...new Set(projects.map((p) => p.owner_id))]
  const { data: owners } = await supabase
    .from('users')
    .select('id, display_name')
    .in('id', uniqueOwnerIds)

  const ownerMap = new Map((owners ?? []).map((o) => [o.id, o.display_name ?? 'User']))

  return NextResponse.json({
    slideTitle: slide.title,
    projectCount: projects.length,
    userCount: uniqueOwnerIds.length,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      ownerName: ownerMap.get(p.owner_id) ?? 'User',
    })),
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'
import { logActivity } from '@/lib/activity-log'

const BulkStatusSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1).max(100),
  status: z.enum(['standard', 'mandatory', 'deprecated']),
})

// ---------------------------------------------------------------------------
// PATCH /api/slides/bulk-status — update status for multiple slides at once
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateLimited = await checkRateLimit(auth.user.id, 'slides:bulk-status', 10, 60_000)
  if (rateLimited) return rateLimited

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BulkStatusSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { slideIds, status } = parsed.data
  const tenantId = auth.profile.tenant_id
  const supabase = createServiceClient()

  // Verify all slides belong to this tenant
  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select('id')
    .in('id', slideIds)
    .eq('tenant_id', tenantId)

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to verify slides' }, { status: 500 })
  }

  const validIds = (existing ?? []).map((s) => s.id)
  if (validIds.length === 0) {
    return NextResponse.json({ error: 'No matching slides found' }, { status: 404 })
  }

  // Update all valid slides
  const { error: updateError } = await supabase
    .from('slides')
    .update({ status })
    .in('id', validIds)
    .eq('tenant_id', tenantId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update slides' }, { status: 500 })
  }

  // Log activity for deprecated status changes and notify affected project owners
  if (status === 'deprecated') {
    for (const slideId of validIds) {
      logActivity({
        tenantId,
        actorId: auth.user.id,
        eventType: 'slide.deprecated',
        resourceType: 'slide',
        resourceId: slideId,
        resourceName: undefined,
      })
    }

    // Find projects referencing any of the deprecated slides (check first slide as sample)
    // Use .contains filter on slide_order JSONB for the first deprecated slide
    const { data: affectedProjects } = await supabase
      .from('projects')
      .select('id, owner_id, name')
      .eq('tenant_id', tenantId)
      .contains('slide_order', [{ slide_id: validIds[0] }])
      .limit(100)

    if (affectedProjects) {
      const relevantProjects = affectedProjects

      if (relevantProjects.length > 0) {
        const uniqueOwners = [...new Set(relevantProjects.map((p) => p.owner_id))]
        createNotifications(
          uniqueOwners.map((ownerId) => {
            const proj = relevantProjects.find((p) => p.owner_id === ownerId)!
            return {
              tenantId,
              userId: ownerId,
              type: 'slide_deprecated' as const,
              message: `${validIds.length} slide${validIds.length > 1 ? 's' : ''} in "${proj.name}" ${validIds.length > 1 ? 'have' : 'has'} been deprecated`,
              resourceType: 'project' as const,
              resourceId: proj.id,
            }
          })
        ).catch(() => {})
      }
    }
  }

  return NextResponse.json({ updated: validIds.length })
}

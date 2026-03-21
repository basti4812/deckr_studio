import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'
import { logActivity } from '@/lib/activity-log'
import { isAllowedStorageUrl } from '@/lib/url-validation'

const EditableFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  placeholder: z.string().max(500).default(''),
  required: z.boolean(),
})

const DetectedFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(100).default(''),
  placeholder: z.string().max(500).default(''),
  shapeName: z.string().default(''),
  phType: z.string().nullable().default(null),
  editable_state: z.enum(['locked', 'optional', 'required']),
})

const PatchSlideSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  status: z.enum(['standard', 'mandatory', 'deprecated']).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  pptx_url: z
    .string()
    .url()
    .refine(isAllowedStorageUrl, 'pptx_url must point to Supabase storage')
    .optional(),
  thumbnail_url: z.string().url().optional(),
  editable_fields: z.array(EditableFieldSchema).optional(),
  detected_fields: z.array(DetectedFieldSchema).optional(),
})

/** Derive employee-facing editable_fields from admin-managed detected_fields */
function deriveEditableFields(
  detectedFields: z.infer<typeof DetectedFieldSchema>[]
): z.infer<typeof EditableFieldSchema>[] {
  return detectedFields
    .filter((f) => f.editable_state !== 'locked')
    .map((f) => ({
      id: f.id,
      label: f.label,
      placeholder: f.placeholder,
      required: f.editable_state === 'required',
    }))
}

// ---------------------------------------------------------------------------
// PATCH /api/slides/[id] — update title, status, editable_fields, pptx_url
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  // Rate limit: 60 PATCH requests per minute per admin
  const rateLimited = await checkRateLimit(auth.user.id, 'slides:patch', 60, 60 * 1000)
  if (rateLimited) return rateLimited

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSlideSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { title, status, tags, pptx_url, thumbnail_url, editable_fields, detected_fields } =
    parsed.data

  const supabase = createServiceClient()

  // Verify the slide belongs to this admin's tenant
  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select('id, tenant_id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title.trim()
  if (status !== undefined) updates.status = status
  if (tags !== undefined) updates.tags = tags
  if (pptx_url !== undefined) {
    updates.pptx_url = pptx_url
    // Track when PPTX content specifically changes (separate from metadata updates)
    updates.pptx_updated_at = new Date().toISOString()
  }
  if (thumbnail_url !== undefined) updates.thumbnail_url = thumbnail_url
  if (detected_fields !== undefined) {
    updates.detected_fields = detected_fields
    // Auto-derive editable_fields from detected_fields
    updates.editable_fields = deriveEditableFields(detected_fields)
  } else if (editable_fields !== undefined) {
    // Backward compat: direct editable_fields update (without detected_fields)
    updates.editable_fields = editable_fields
  }

  const { data, error } = await supabase
    .from('slides')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // When the PPTX content changes, log activity + notify affected project owners
  if (pptx_url !== undefined) {
    logActivity({
      tenantId: auth.profile.tenant_id,
      actorId: auth.user.id,
      eventType: 'slide.uploaded',
      resourceType: 'slide',
      resourceId: data.id,
      resourceName: data.title,
      metadata: { update: true },
    })

    const { data: affectedProjects } = await supabase
      .from('projects')
      .select('id, owner_id, name')
      .eq('tenant_id', auth.profile.tenant_id)
      .contains('slide_order', [{ slide_id: id }])

    if (affectedProjects && affectedProjects.length > 0) {
      console.log(
        `[PROJ-17] Slide ${id} PPTX updated. Affects ${affectedProjects.length} active project(s):`,
        affectedProjects.map((p) => p.name)
      )
      // Notify each project owner about the slide update
      const uniqueOwners = [...new Set(affectedProjects.map((p) => p.owner_id))]
      createNotifications(
        uniqueOwners.map((ownerId) => {
          const projectNames = affectedProjects
            .filter((p) => p.owner_id === ownerId)
            .map((p) => p.name)
          return {
            tenantId: auth.profile.tenant_id,
            userId: ownerId,
            type: 'slide_updated' as const,
            message: `A slide in "${projectNames[0]}"${projectNames.length > 1 ? ` and ${projectNames.length - 1} other project${projectNames.length > 2 ? 's' : ''}` : ''} was updated by an admin`,
            resourceType: 'project' as const,
            resourceId: affectedProjects.find((p) => p.owner_id === ownerId)?.id,
          }
        })
      ).catch(() => {})
    }
  }

  // When status changes to deprecated, log activity + notify affected project owners
  if (status === 'deprecated') {
    logActivity({
      tenantId: auth.profile.tenant_id,
      actorId: auth.user.id,
      eventType: 'slide.deprecated',
      resourceType: 'slide',
      resourceId: data.id,
      resourceName: data.title,
    })

    const { data: affectedProjects } = await supabase
      .from('projects')
      .select('id, owner_id, name')
      .eq('tenant_id', auth.profile.tenant_id)
      .contains('slide_order', [{ slide_id: id }])

    if (affectedProjects && affectedProjects.length > 0) {
      const uniqueOwners = [...new Set(affectedProjects.map((p) => p.owner_id))]
      createNotifications(
        uniqueOwners.map((ownerId) => {
          const proj = affectedProjects.find((p) => p.owner_id === ownerId)!
          return {
            tenantId: auth.profile.tenant_id,
            userId: ownerId,
            type: 'slide_deprecated' as const,
            message: `A slide in "${proj.name}" has been deprecated`,
            resourceType: 'project' as const,
            resourceId: proj.id,
          }
        })
      ).catch(() => {})
    }
  }

  return NextResponse.json({ slide: data })
}

// ---------------------------------------------------------------------------
// DELETE /api/slides/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  // Rate limit: 30 DELETE requests per minute per admin
  const rateLimited = await checkRateLimit(auth.user.id, 'slides:delete', 30, 60 * 1000)
  if (rateLimited) return rateLimited

  const supabase = createServiceClient()

  // Verify the slide belongs to this admin's tenant
  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select('id, tenant_id, pptx_url')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  // Check if any project references this slide
  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', auth.profile.tenant_id)
    .contains('slide_order', [{ slide_id: id }])

  if (projectCount && projectCount > 0) {
    return NextResponse.json(
      {
        error: `Slide is used in ${projectCount} project${projectCount !== 1 ? 's' : ''}. Remove it from all projects before deleting.`,
      },
      { status: 409 }
    )
  }

  // Delete the DB record
  const { error } = await supabase.from('slides').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Best-effort: remove storage file
  if (existing.pptx_url) {
    const storagePath = `${auth.profile.tenant_id}/${id}/original.pptx`
    await supabase.storage.from('slides').remove([storagePath])
  }

  return NextResponse.json({ success: true })
}

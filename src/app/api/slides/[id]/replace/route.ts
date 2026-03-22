import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { createNotifications } from '@/lib/notifications'
import { logActivity } from '@/lib/activity-log'
import { isAllowedStorageUrl } from '@/lib/url-validation'

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DetectedFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(100).default(''),
  placeholder: z.string().max(500).default(''),
  shapeName: z.string().default(''),
  phType: z.string().nullable().default(null),
  editable_state: z.enum(['locked', 'optional', 'required']),
  bounds: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
})

const ReplaceSlideSchema = z.object({
  pptx_url: z.string().url().refine(isAllowedStorageUrl, 'pptx_url must point to Supabase storage'),
  thumbnail_url: z.string().url().optional(),
  detected_fields: z.array(DetectedFieldSchema),
  page_index: z.number().int().min(0),
  page_count: z.number().int().min(1),
  source_filename: z.string().max(255).optional().nullable(),
})

type DetectedField = z.infer<typeof DetectedFieldSchema>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface EditableField {
  id: string
  label: string
  placeholder: string
  required: boolean
  bounds?: { x: number; y: number; w: number; h: number }
}

/** Derive employee-facing editable_fields from admin-managed detected_fields */
function deriveEditableFields(detectedFields: DetectedField[]): EditableField[] {
  return detectedFields
    .filter((f) => f.editable_state !== 'locked')
    .map((f) => ({
      id: f.id,
      label: f.label,
      placeholder: f.placeholder,
      required: f.editable_state === 'required',
      ...(f.bounds ? { bounds: f.bounds } : {}),
    }))
}

/**
 * Merge old admin-configured fields into the new detected fields
 * by matching on shapeName. If a new field's shapeName matches an old field,
 * carry over the admin config (label, placeholder, editable_state).
 *
 * Returns:
 * - mergedFields: the new detected_fields with carried-over admin config
 * - fieldsChanged: true if any shapeName was added or removed
 * - removedFieldIds: IDs of old fields that no longer exist (for text_edits cleanup awareness)
 */
function mergeFieldsByShapeName(
  oldFields: DetectedField[],
  newFields: DetectedField[]
): {
  mergedFields: DetectedField[]
  fieldsChanged: boolean
  removedFieldIds: string[]
} {
  // Build a map of old fields by shapeName (only non-empty shapeNames)
  const oldByShape = new Map<string, DetectedField>()
  for (const f of oldFields) {
    if (f.shapeName) {
      oldByShape.set(f.shapeName, f)
    }
  }

  // Build a set of new shapeNames
  const newShapeNames = new Set(newFields.filter((f) => f.shapeName).map((f) => f.shapeName))

  // Determine which old fields were removed (shapeName no longer present)
  const removedFieldIds: string[] = []
  for (const oldField of oldFields) {
    if (oldField.shapeName && !newShapeNames.has(oldField.shapeName)) {
      removedFieldIds.push(oldField.id)
    }
  }

  // Determine which new fields were added (shapeName not in old)
  const addedShapeNames: string[] = []
  for (const newField of newFields) {
    if (newField.shapeName && !oldByShape.has(newField.shapeName)) {
      addedShapeNames.push(newField.shapeName)
    }
  }

  const fieldsChanged = removedFieldIds.length > 0 || addedShapeNames.length > 0

  // Merge: for each new field, carry over old config if shapeName matches
  const mergedFields = newFields.map((newField) => {
    if (!newField.shapeName) return newField

    const oldField = oldByShape.get(newField.shapeName)
    if (!oldField) return newField // new field, keep defaults (locked)

    // Carry over admin configuration from the old field
    return {
      ...newField,
      label: oldField.label,
      placeholder: oldField.placeholder,
      editable_state: oldField.editable_state,
    }
  })

  return { mergedFields, fieldsChanged, removedFieldIds }
}

// ---------------------------------------------------------------------------
// POST /api/slides/[id]/replace
//
// Replaces a slide's content (PPTX file, thumbnail, fields) while preserving
// the slide ID so all project references remain intact.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  // Rate limit: 10 replace requests per minute per admin
  const rateLimited = await checkRateLimit(auth.user.id, 'slides:replace', 10, 60 * 1000)
  if (rateLimited) return rateLimited

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ReplaceSlideSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { pptx_url, thumbnail_url, detected_fields, page_index, page_count, source_filename } =
    parsed.data

  const supabase = createServiceClient()

  // -----------------------------------------------------------------------
  // 1. Fetch the existing slide (verify ownership + get old fields)
  // -----------------------------------------------------------------------

  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select(
      'id, tenant_id, title, pptx_url, detected_fields, page_index, page_count, source_filename, archived_at'
    )
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  // -----------------------------------------------------------------------
  // 2. Validate page_index against new file's page_count
  // -----------------------------------------------------------------------

  if (page_index >= page_count) {
    return NextResponse.json(
      {
        error: `page_index ${page_index} is out of range for a file with ${page_count} page(s)`,
      },
      { status: 400 }
    )
  }

  // -----------------------------------------------------------------------
  // 3. ShapeName matching: merge old admin config into new fields
  // -----------------------------------------------------------------------

  const oldDetectedFields = Array.isArray(existing.detected_fields)
    ? (existing.detected_fields as DetectedField[])
    : []

  const { mergedFields, fieldsChanged } = mergeFieldsByShapeName(oldDetectedFields, detected_fields)

  // -----------------------------------------------------------------------
  // 4. PATCH the slide record (atomic update, preserves ID)
  // -----------------------------------------------------------------------

  const oldPptxUrl = existing.pptx_url

  const updates: Record<string, unknown> = {
    pptx_url,
    detected_fields: mergedFields,
    editable_fields: deriveEditableFields(mergedFields),
    page_index,
    page_count,
    source_filename: source_filename ?? null,
    pptx_updated_at: new Date().toISOString(),
  }

  if (thumbnail_url) {
    updates.thumbnail_url = thumbnail_url
  }

  // Clear archive status if the slide was archived (spec: replacement reactivates)
  if (existing.archived_at) {
    updates.archived_at = null
  }

  const { data: updatedSlide, error: updateError } = await supabase
    .from('slides')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // -----------------------------------------------------------------------
  // 5. Invalidate rendered_previews in affected projects
  // -----------------------------------------------------------------------

  const { data: affectedProjects } = await supabase
    .from('projects')
    .select('id, owner_id, name, rendered_previews, slide_order')
    .eq('tenant_id', auth.profile.tenant_id)
    .contains('slide_order', [{ slide_id: id }])
    .limit(500)

  if (affectedProjects && affectedProjects.length > 0) {
    // Invalidate rendered_previews for each tray instance of this slide
    for (const project of affectedProjects) {
      const renderedPreviews = (project.rendered_previews ?? {}) as Record<string, string | null>
      const slideOrder = (project.slide_order ?? []) as { id: string; slide_id: string }[]
      let changed = false

      for (const item of slideOrder) {
        if (item.slide_id === id && renderedPreviews[item.id] !== undefined) {
          renderedPreviews[item.id] = null
          changed = true
        }
      }

      if (changed) {
        await supabase
          .from('projects')
          .update({ rendered_previews: renderedPreviews })
          .eq('id', project.id)
      }
    }

    // -----------------------------------------------------------------------
    // 6. Notify affected employees if fields changed
    // -----------------------------------------------------------------------

    if (fieldsChanged) {
      const uniqueOwners = [...new Set(affectedProjects.map((p) => p.owner_id))]
      // Exclude the admin performing the replacement from notifications
      const ownersToNotify = uniqueOwners.filter((ownerId) => ownerId !== auth.user.id)

      if (ownersToNotify.length > 0) {
        createNotifications(
          ownersToNotify.map((ownerId) => ({
            tenantId: auth.profile.tenant_id,
            userId: ownerId,
            type: 'slide_replaced' as const,
            message: `Die Folie "${existing.title}" wurde aktualisiert. Bitte pruefe deine Eingaben vor dem naechsten Export.`,
            resourceType: 'slide' as const,
            resourceId: id,
          }))
        ).catch(() => {})
      }
    }

    console.log(
      `[PROJ-48] Slide ${id} replaced. Affects ${affectedProjects.length} project(s). Fields changed: ${fieldsChanged}`
    )
  }

  // -----------------------------------------------------------------------
  // 7. Delete old storage file (best-effort)
  // -----------------------------------------------------------------------

  if (oldPptxUrl && oldPptxUrl !== pptx_url) {
    const storagePath = `${auth.profile.tenant_id}/${id}/original.pptx`
    supabase.storage
      .from('slides')
      .remove([storagePath])
      .catch(() => {})
  }

  // -----------------------------------------------------------------------
  // 8. Log activity
  // -----------------------------------------------------------------------

  logActivity({
    tenantId: auth.profile.tenant_id,
    actorId: auth.user.id,
    eventType: 'slide.replaced',
    resourceType: 'slide',
    resourceId: id,
    resourceName: existing.title,
    metadata: {
      fieldsChanged,
      affectedProjectCount: affectedProjects?.length ?? 0,
      wasArchived: existing.archived_at !== null,
    },
  })

  // -----------------------------------------------------------------------
  // 9. Return result with summary
  // -----------------------------------------------------------------------

  return NextResponse.json({
    slide: updatedSlide,
    replacement: {
      fieldsChanged,
      affectedProjectCount: affectedProjects?.length ?? 0,
      wasReactivated: existing.archived_at !== null,
    },
  })
}

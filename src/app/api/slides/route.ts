import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser, requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'
import { isAllowedStorageUrl } from '@/lib/url-validation'

const EditableFieldSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(100),
  placeholder: z.string().max(500).default(''),
  required: z.boolean(),
})

const DetectedFieldSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().max(100).default(''),
    placeholder: z.string().max(500).default(''),
    shapeName: z.string().default(''),
    phType: z.string().nullable().default(null),
    editable_state: z.enum(['locked', 'optional', 'required']),
  })
  .refine((f) => f.editable_state === 'locked' || f.label.trim().length > 0, {
    message: 'Label is required for editable fields',
    path: ['label'],
  })

const CreateSlideSchema = z.object({
  title: z.string().min(1, 'title is required').max(255),
  status: z.enum(['standard', 'mandatory', 'deprecated']).default('standard'),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  pptx_url: z
    .string()
    .url()
    .refine(isAllowedStorageUrl, 'pptx_url must point to Supabase storage')
    .optional()
    .nullable(),
  thumbnail_url: z.string().url().optional().nullable(),
  editable_fields: z.array(EditableFieldSchema).default([]),
  detected_fields: z.array(DetectedFieldSchema).default([]),
  page_index: z.number().int().min(0).default(0),
  page_count: z.number().int().min(1).default(1),
  source_filename: z.string().max(255).optional().nullable(),
})

// ---------------------------------------------------------------------------
// GET /api/slides — list all slides for the caller's tenant (all auth users)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('slides')
    .select('*')
    .eq('tenant_id', auth.profile.tenant_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ slides: data })
}

// ---------------------------------------------------------------------------
// POST /api/slides — create a new slide record
// Body: { title, status?, pptx_url?, thumbnail_url?, editable_fields? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CreateSlideSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const {
    title,
    status,
    tags,
    pptx_url,
    thumbnail_url,
    editable_fields,
    detected_fields,
    page_index,
    page_count,
    source_filename,
  } = parsed.data

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('slides')
    .insert({
      tenant_id: auth.profile.tenant_id,
      title: title.trim(),
      status,
      tags,
      pptx_url: pptx_url ?? null,
      thumbnail_url: thumbnail_url ?? null,
      editable_fields,
      detected_fields,
      created_by: auth.user.id,
      page_index,
      page_count,
      source_filename: source_filename ?? null,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  logActivity({
    tenantId: auth.profile.tenant_id,
    actorId: auth.user.id,
    eventType: 'slide.uploaded',
    resourceType: 'slide',
    resourceId: data.id,
    resourceName: data.title,
  })

  return NextResponse.json({ slide: data }, { status: 201 })
}

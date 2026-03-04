import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile, requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { logActivity } from '@/lib/activity-log'

const CreateSlideSchema = z.object({
  title: z.string().min(1, 'title is required').max(255),
  status: z.enum(['standard', 'mandatory', 'deprecated']).default('standard'),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  pptx_url: z.string().url().optional().nullable(),
  thumbnail_url: z.string().url().optional().nullable(),
  editable_fields: z.array(z.unknown()).default([]),
  page_index: z.number().int().min(0).default(0),
  page_count: z.number().int().min(1).default(1),
})

// ---------------------------------------------------------------------------
// GET /api/slides — list all slides for the caller's tenant (all auth users)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('slides')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
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

  const { title, status, tags, pptx_url, thumbnail_url, editable_fields, page_index, page_count } = parsed.data

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
      created_by: auth.user.id,
      page_index,
      page_count,
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

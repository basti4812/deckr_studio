import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Layout data schema
// ---------------------------------------------------------------------------

const PersonalGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  position: z.number().int().min(0),
})

const SlideOverrideSchema = z.object({
  groupId: z.string(),
  position: z.number().int().min(0),
  annotation: z.string().max(100).optional(),
})

const LayoutDataSchema = z.object({
  personalGroups: z.array(PersonalGroupSchema).max(50).default([]),
  slideOverrides: z.record(z.string().uuid(), SlideOverrideSchema).default({}),
})

// ---------------------------------------------------------------------------
// GET /api/board/layout — fetch caller's personal layout
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_board_layouts')
    .select('layout_data, updated_at')
    .eq('user_id', user.id)
    .eq('tenant_id', profile.tenant_id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    layout: data?.layout_data ?? null,
    updatedAt: data?.updated_at ?? null,
  })
}

// ---------------------------------------------------------------------------
// PUT /api/board/layout — upsert caller's personal layout
// ---------------------------------------------------------------------------

export async function PUT(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await checkRateLimit(user.id, 'board:layout', 30, 60 * 1000)
  if (limited) return limited

  let raw: unknown
  try { raw = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = LayoutDataSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('user_board_layouts')
    .upsert(
      {
        user_id: user.id,
        tenant_id: profile.tenant_id,
        layout_data: parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,tenant_id' },
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ---------------------------------------------------------------------------
// DELETE /api/board/layout — reset to admin default
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await checkRateLimit(user.id, 'board:layout', 30, 60 * 1000)
  if (limited) return limited

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('user_board_layouts')
    .delete()
    .eq('user_id', user.id)
    .eq('tenant_id', profile.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

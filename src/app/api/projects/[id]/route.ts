import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

const SlideOrderSchema = z.array(
  z.object({ id: z.string().min(1), slide_id: z.string().min(1) })
).max(500)

const TextEditsSchema = z
  .record(z.string(), z.record(z.string(), z.string().max(10_000)))
  .refine((val) => JSON.stringify(val).length <= 500_000, {
    message: 'text_edits exceeds 500 KB limit',
  })

type Params = Promise<{ id: string }>

// ---------------------------------------------------------------------------
// GET /api/projects/[id]
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ project: data })
}

// ---------------------------------------------------------------------------
// PATCH /api/projects/[id] — update name, slide_order, or text_edits
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: { name?: string; slide_order?: unknown[]; text_edits?: unknown } = {}
  try { body = await request.json() } catch { /* ok */ }

  const supabase = createServiceClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name || name.length > 120) return NextResponse.json({ error: 'Invalid name' }, { status: 400 })
    updates.name = name
  }
  if (body.slide_order !== undefined) {
    const parsed = SlideOrderSchema.safeParse(body.slide_order)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid slide_order' }, { status: 400 })
    updates.slide_order = parsed.data
  }
  if (body.text_edits !== undefined) {
    const parsed = TextEditsSchema.safeParse(body.text_edits)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid text_edits' }, { status: 400 })
    updates.text_edits = parsed.data
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project: data })
}

// ---------------------------------------------------------------------------
// DELETE /api/projects/[id]
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

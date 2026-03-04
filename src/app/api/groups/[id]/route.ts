import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  let body: { name?: string; position?: number; x?: number; y?: number } = {}
  try { body = await request.json() } catch { /* ok */ }

  const supabase = createServiceClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('slide_groups')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.position !== undefined) updates.position = body.position
  if (body.x !== undefined) updates.x = body.x
  if (body.y !== undefined) updates.y = body.y
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await supabase.from('slide_groups').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data })
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const supabase = createServiceClient()

  const { data: existing } = await supabase
    .from('slide_groups')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Memberships cascade via FK ON DELETE CASCADE
  const { error } = await supabase.from('slide_groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

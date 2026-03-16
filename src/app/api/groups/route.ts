import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser, requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

const CreateGroupSchema = z.object({
  name: z.string().max(120).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createServiceClient()
  const { data: groups, error: gErr } = await supabase
    .from('slide_groups')
    .select('*')
    .eq('tenant_id', auth.profile.tenant_id)
    .order('position', { ascending: true })

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  const { data: memberships, error: mErr } = await supabase
    .from('slide_group_memberships')
    .select('id, slide_id, group_id, position, x, y')
    .in(
      'group_id',
      (groups ?? []).map((g) => g.id)
    )
    .order('position', { ascending: true })

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({ groups: groups ?? [], memberships: memberships ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    rawBody = {}
  }

  // SEC-8: Validate group name with Zod
  const parsed = CreateGroupSchema.safeParse(rawBody)
  const name = parsed.success ? parsed.data.name?.trim() || 'New Group' : 'New Group'

  const supabase = createServiceClient()

  // Position: after last group
  const { count } = await supabase
    .from('slide_groups')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', auth.profile.tenant_id)

  const { data, error } = await supabase
    .from('slide_groups')
    .insert({ tenant_id: auth.profile.tenant_id, name, position: count ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ group: data }, { status: 201 })
}

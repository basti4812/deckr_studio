import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser, getUserProfile, requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile) return NextResponse.json({ error: 'User profile not found' }, { status: 404 })

  const supabase = createServiceClient()
  const { data: groups, error: gErr } = await supabase
    .from('slide_groups')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('position', { ascending: true })

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })

  const { data: memberships, error: mErr } = await supabase
    .from('slide_group_memberships')
    .select('id, slide_id, group_id, position, x, y')
    .in('group_id', (groups ?? []).map((g) => g.id))
    .order('position', { ascending: true })

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  return NextResponse.json({ groups: groups ?? [], memberships: memberships ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { name?: string } = {}
  try { body = await request.json() } catch { /* empty body ok */ }

  const name = body.name?.trim() || 'New Group'

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

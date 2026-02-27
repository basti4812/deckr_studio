import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

// POST /api/groups/[id]/memberships — add a slide to this group (upsert)
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: groupId } = await params
  let body: { slideId?: string } = {}
  try { body = await request.json() } catch { /* ok */ }

  if (!body.slideId) return NextResponse.json({ error: 'slideId required' }, { status: 400 })

  const supabase = createServiceClient()

  // Verify group belongs to tenant
  const { data: group } = await supabase
    .from('slide_groups')
    .select('id')
    .eq('id', groupId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Count existing members for position
  const { count } = await supabase
    .from('slide_group_memberships')
    .select('*', { count: 'exact', head: true })
    .eq('group_id', groupId)

  // Upsert: ON CONFLICT (slide_id) UPDATE group_id and position
  const { data, error } = await supabase
    .from('slide_group_memberships')
    .upsert(
      { slide_id: body.slideId, group_id: groupId, position: count ?? 0 },
      { onConflict: 'slide_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ membership: data }, { status: 201 })
}

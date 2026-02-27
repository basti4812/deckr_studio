import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string }>

// POST /api/groups/[id]/memberships/reorder — bulk update slide order within group
// Body: { memberships: [{slideId: string, position: number}] }
export async function POST(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: groupId } = await params
  let body: { memberships?: { slideId: string; position: number }[] } = {}
  try { body = await request.json() } catch { /* ok */ }

  if (!Array.isArray(body.memberships)) {
    return NextResponse.json({ error: 'memberships array required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify group belongs to tenant
  const { data: group } = await supabase
    .from('slide_groups')
    .select('id')
    .eq('id', groupId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  await Promise.all(
    body.memberships.map(({ slideId, position }) =>
      supabase
        .from('slide_group_memberships')
        .update({ position })
        .eq('slide_id', slideId)
        .eq('group_id', groupId)
    )
  )

  return NextResponse.json({ success: true })
}

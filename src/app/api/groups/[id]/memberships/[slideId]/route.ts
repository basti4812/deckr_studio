import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

type Params = Promise<{ id: string; slideId: string }>

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id: groupId, slideId } = await params
  const supabase = createServiceClient()

  // Verify group belongs to tenant
  const { data: group } = await supabase
    .from('slide_groups')
    .select('id')
    .eq('id', groupId)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { error } = await supabase
    .from('slide_group_memberships')
    .delete()
    .eq('slide_id', slideId)
    .eq('group_id', groupId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

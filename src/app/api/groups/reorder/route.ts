import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

// POST /api/groups/reorder — bulk update group positions
// Body: { groups: [{id: string, position: number}] }
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { groups?: { id: string; position: number }[] } = {}
  try {
    body = await request.json()
  } catch {
    /* ok */
  }

  if (!Array.isArray(body.groups) || body.groups.length === 0) {
    return NextResponse.json({ error: 'groups array required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  await Promise.all(
    body.groups.map(({ id, position }) =>
      supabase
        .from('slide_groups')
        .update({ position })
        .eq('id', id)
        .eq('tenant_id', auth.profile.tenant_id)
    )
  )

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// POST /api/template-sets/[id]/slides/reorder — bulk update slide positions
// ---------------------------------------------------------------------------

const ReorderSchema = z.object({
  memberships: z
    .array(
      z.object({
        slideId: z.string().uuid(),
        position: z.number().int().min(0),
      })
    )
    .min(1)
    .max(200),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'template-sets:slides', 60, 60 * 1000)
  if (limited) return limited

  const { id } = await params

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ReorderSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid payload: ' + parsed.error.issues[0].message },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()

  // Verify set belongs to admin's tenant
  const { data: set } = await supabase
    .from('template_sets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!set) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  // Bulk update positions
  const updates = parsed.data.memberships.map(({ slideId, position }) =>
    supabase
      .from('template_set_slides')
      .update({ position })
      .eq('template_set_id', id)
      .eq('slide_id', slideId)
  )

  const results = await Promise.all(updates)
  const failed = results.find((r) => r.error)
  if (failed?.error) return NextResponse.json({ error: failed.error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

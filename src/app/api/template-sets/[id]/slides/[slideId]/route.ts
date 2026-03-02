import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// DELETE /api/template-sets/[id]/slides/[slideId] — remove slide from set
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slideId: string }> }
) {
  const auth = await requireAdmin(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const limited = await checkRateLimit(auth.user.id, 'template-sets:slides', 60, 60 * 1000)
  if (limited) return limited

  const { id, slideId } = await params
  const supabase = createServiceClient()

  // Verify set belongs to admin's tenant
  const { data: set } = await supabase
    .from('template_sets')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (!set) return NextResponse.json({ error: 'Template set not found' }, { status: 404 })

  const { error } = await supabase
    .from('template_set_slides')
    .delete()
    .eq('template_set_id', id)
    .eq('slide_id', slideId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

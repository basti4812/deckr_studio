import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /api/slides/[id]/field-usage
//
// Returns how many projects/users have filled each editable field for this slide.
// Used by the admin Edit Slide dialog to warn before locking a field that
// employees have already filled in.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await params

  const rateLimited = await checkRateLimit(auth.user.id, 'slides:field-usage', 30, 60_000)
  if (rateLimited) return rateLimited

  const supabase = createServiceClient()

  // Verify slide belongs to tenant
  const { data: slide, error: slideErr } = await supabase
    .from('slides')
    .select('id, editable_fields')
    .eq('id', id)
    .eq('tenant_id', auth.profile.tenant_id)
    .single()

  if (slideErr || !slide) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  // Find all projects in this tenant that reference this slide
  const { data: projects } = await supabase
    .from('projects')
    .select('id, owner_id, text_edits, slide_order')
    .eq('tenant_id', auth.profile.tenant_id)
    .contains('slide_order', [{ slide_id: id }])

  if (!projects || projects.length === 0) {
    return NextResponse.json({ fields: [] })
  }

  // For each editable field, count how many distinct users have non-empty values
  type FieldEntry = { id: string }
  const fields = Array.isArray(slide.editable_fields) ? (slide.editable_fields as FieldEntry[]) : []

  const fieldUsage = fields.map((field) => {
    const usersWithData = new Set<string>()
    let projectCount = 0

    for (const project of projects) {
      const textEdits = (project.text_edits ?? {}) as Record<string, Record<string, string>>
      const slideOrder = (project.slide_order ?? []) as { id: string; slide_id: string }[]

      // Find all tray instances of this slide in this project
      const instances = slideOrder.filter((item) => item.slide_id === id)
      let hasData = false

      for (const instance of instances) {
        const instanceEdits = textEdits[instance.id]
        if (instanceEdits && instanceEdits[field.id]?.trim()) {
          hasData = true
          usersWithData.add(project.owner_id)
        }
      }

      if (hasData) projectCount++
    }

    return {
      fieldId: field.id,
      projectCount,
      userCount: usersWithData.size,
    }
  })

  return NextResponse.json({ fields: fieldUsage })
}

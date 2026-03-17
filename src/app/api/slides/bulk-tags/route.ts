import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'

const BulkTagsSchema = z.object({
  slideIds: z.array(z.string().uuid()).min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(50)).min(1).max(20),
})

// ---------------------------------------------------------------------------
// POST /api/slides/bulk-tags — add tags to multiple slides at once
// Merges provided tags with existing tags (no duplicates).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const rateLimited = await checkRateLimit(auth.user.id, 'slides:bulk-tags', 10, 60_000)
  if (rateLimited) return rateLimited

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BulkTagsSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const { slideIds, tags: newTags } = parsed.data
  const tenantId = auth.profile.tenant_id
  const supabase = createServiceClient()

  // Fetch existing slides with their current tags
  const { data: existing, error: fetchError } = await supabase
    .from('slides')
    .select('id, tags')
    .in('id', slideIds)
    .eq('tenant_id', tenantId)

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch slides' }, { status: 500 })
  }

  if (!existing || existing.length === 0) {
    return NextResponse.json({ error: 'No matching slides found' }, { status: 404 })
  }

  // Merge tags for each slide (avoid duplicates, cap at 20)
  let updated = 0
  for (const slide of existing) {
    const currentTags: string[] = (slide.tags as string[]) ?? []
    const merged = [...new Set([...currentTags, ...newTags])].slice(0, 20)

    // Only update if tags actually changed
    if (merged.length !== currentTags.length || !merged.every((t) => currentTags.includes(t))) {
      const { error } = await supabase
        .from('slides')
        .update({ tags: merged })
        .eq('id', slide.id)
        .eq('tenant_id', tenantId)

      if (!error) updated++
    } else {
      updated++ // Count as success even if no change needed
    }
  }

  return NextResponse.json({ updated })
}

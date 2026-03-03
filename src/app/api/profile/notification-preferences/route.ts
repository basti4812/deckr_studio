import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser, getUserProfile } from '@/lib/auth-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase'
import { MANDATORY_EMAIL_TYPES } from '@/lib/email'

// ---------------------------------------------------------------------------
// PATCH /api/profile/notification-preferences — update email notification prefs
// ---------------------------------------------------------------------------

const PreferencesSchema = z.object({
  project_shared: z.boolean().optional(),
  team_member_joined: z.boolean().optional(),
  slide_deprecated: z.boolean().optional(),
  slide_updated: z.boolean().optional(),
  comment_added: z.boolean().optional(),
  // Mandatory types accepted in body but values are ignored (always true)
  payment_failed: z.boolean().optional(),
  trial_ending_7d: z.boolean().optional(),
  trial_ending_1d: z.boolean().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Provide at least one preference to update' },
)

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await getUserProfile(user.id)
  if (!profile || !profile.is_active) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limited = await checkRateLimit(user.id, 'profile:notification-prefs', 20, 60 * 1000)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { body = {} }

  const parsed = PreferencesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  // Force mandatory types to always be true
  const updates = { ...parsed.data }
  for (const mandatoryType of MANDATORY_EMAIL_TYPES) {
    updates[mandatoryType] = true
  }

  const supabase = createServiceClient()

  // Fetch current preferences to merge (JSONB partial update)
  const { data: current } = await supabase
    .from('users')
    .select('notification_preferences')
    .eq('id', user.id)
    .single()

  const merged = {
    ...(current?.notification_preferences ?? {}),
    ...updates,
  }

  const { error } = await supabase
    .from('users')
    .update({ notification_preferences: merged })
    .eq('id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ notification_preferences: merged })
}

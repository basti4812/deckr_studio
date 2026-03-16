import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireActiveUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

const PatchProfileSchema = z
  .object({
    display_name: z.string().min(1).max(80).optional(),
    preferred_language: z.enum(['de', 'en']).optional(),
  })
  .refine((d) => d.display_name !== undefined || d.preferred_language !== undefined, {
    message: 'Provide at least one field to update',
  })

// ---------------------------------------------------------------------------
// GET /api/profile — fetch current user profile including notification prefs
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, display_name, preferred_language, avatar_url, notification_preferences')
    .eq('id', auth.user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

// ---------------------------------------------------------------------------
// PATCH /api/profile — update display_name and/or preferred_language
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const auth = await requireActiveUser(request)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // 20 requests per 15 minutes
  const limited = await checkRateLimit(auth.user.id, 'profile:patch', 20, 15 * 60 * 1000)
  if (limited) return limited

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const parsed = PatchProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .update(parsed.data)
    .eq('id', auth.user.id)
    .select('id, display_name, preferred_language, avatar_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

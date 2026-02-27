import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// In-memory rate limiter — 20 requests per 15 minutes per user
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000

const attempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(userId: string): NextResponse | null {
  const now = Date.now()
  const record = attempts.get(userId)
  if (record && now < record.resetAt) {
    if (record.count >= RATE_LIMIT_MAX) {
      const retryAfterSec = Math.ceil((record.resetAt - now) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      )
    }
    record.count++
  } else {
    attempts.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
  }
  return null
}

const PatchProfileSchema = z.object({
  display_name: z.string().min(1).max(80).optional(),
  preferred_language: z.enum(['de', 'en']).optional(),
}).refine((d) => d.display_name !== undefined || d.preferred_language !== undefined, {
  message: 'Provide at least one field to update',
})

// ---------------------------------------------------------------------------
// PATCH /api/profile — update display_name and/or preferred_language
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = checkRateLimit(user.id)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { body = {} }

  const parsed = PatchProfileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('users')
    .update(parsed.data)
    .eq('id', user.id)
    .select('id, display_name, preferred_language, avatar_url')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ user: data })
}

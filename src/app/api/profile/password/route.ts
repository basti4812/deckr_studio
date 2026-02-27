import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedUser } from '@/lib/auth-helpers'
import { createServiceClient } from '@/lib/supabase'
import { checkRateLimit } from '@/lib/rate-limit'

const PasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
}).refine((d) => d.newPassword !== d.currentPassword, {
  message: 'New password must be different from current password',
  path: ['newPassword'],
})

// ---------------------------------------------------------------------------
// POST /api/profile/password — verify current password then update
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user || !user.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 5 attempts per 15 minutes
  const limited = await checkRateLimit(user.id, 'profile:password', 5, 15 * 60 * 1000)
  if (limited) return limited

  let body: unknown
  try { body = await request.json() } catch { body = {} }

  const parsed = PasswordSchema.safeParse(body)
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]
    return NextResponse.json({ error: firstError?.message ?? 'Invalid input', field: firstError?.path[0] }, { status: 400 })
  }

  const { currentPassword, newPassword } = parsed.data

  // Verify current password by attempting sign-in with anon client
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: signInError } = await anonClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (signInError) {
    return NextResponse.json({ error: 'Current password is incorrect', field: 'currentPassword' }, { status: 400 })
  }

  // Update via admin API
  const supabase = createServiceClient()
  const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

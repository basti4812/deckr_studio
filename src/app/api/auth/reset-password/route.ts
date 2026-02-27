import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const ResetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// Updates the user's password. Requires an active session
// (set by the auth callback after clicking the reset link).
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ResetPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { password } = parsed.data

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verify the user is authenticated (session was set via auth callback)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json(
      { error: 'Not authenticated. The reset link may have expired.' },
      { status: 401 }
    )
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return NextResponse.json(
      { error: error.message ?? 'Failed to update password' },
      { status: 400 }
    )
  }

  return NextResponse.json(
    { message: 'Password updated successfully' },
    { status: 200 }
  )
}

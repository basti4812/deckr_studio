import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// Sends a password reset email. Always returns 200 to avoid
// revealing whether an email exists in the system.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // Parse and validate body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ForgotPasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { email } = parsed.data

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  const response = NextResponse.json(
    {
      message:
        'If an account with that email exists, a password reset link has been sent.',
    },
    { status: 200 }
  )

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

  // Fire and forget — always return success regardless of outcome
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?redirect=/reset-password`,
  })

  return response
}

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// Signs out the user, clears session cookies, returns 200.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // SEC-10: Verify request originates from our own site (CSRF protection)
  const origin = request.headers.get('origin')
  const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL
  if (expectedOrigin && origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const response = NextResponse.json({ message: 'Logged out successfully' }, { status: 200 })

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

  await supabase.auth.signOut()

  return response
}

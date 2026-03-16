import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// GET /auth/callback
// Handles Supabase auth redirects (email confirmation, password reset).
// Exchanges the `code` query parameter for a session, then redirects
// based on the user's role.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const redirectTo = searchParams.get('redirect')

  if (!code) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'auth_error')
    return NextResponse.redirect(url)
  }

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

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'auth_error')
    return NextResponse.redirect(url)
  }

  // SEC-1: Validate redirect target is same-origin (prevent open redirect)
  if (redirectTo) {
    const url = new URL(redirectTo, origin)
    if (url.origin === origin) {
      return NextResponse.redirect(url)
    }
    // Ignore off-site redirects — fall through to role-based redirect
  }

  // Otherwise, determine redirect based on user role
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = new URL('/login', origin)
    url.searchParams.set('error', 'auth_error')
    return NextResponse.redirect(url)
  }

  // Try app_metadata first (set during registration)
  let role = user.app_metadata?.role

  // Fallback: query public.users table via service client
  if (!role) {
    try {
      const serviceClient = createServiceClient()
      const { data: userData } = await serviceClient
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      role = userData?.role
    } catch {
      // If the lookup fails, default to employee
    }
  }

  const redirectUrl = role === 'admin' ? '/dashboard' : '/home'
  const url = new URL(redirectUrl, origin)
  return NextResponse.redirect(url)
}

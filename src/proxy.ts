import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { isSubscriptionBlocked } from '@/lib/subscription-helpers'

// ---------------------------------------------------------------------------
// Route classification
// ---------------------------------------------------------------------------

// Public routes — no authentication required
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth/callback',
  '/impressum',
  '/privacy',
  '/terms',
  '/cookies',
  '/dpa',
  '/cancellation',
  '/demo',
  '/beta-access',
]

const PUBLIC_PREFIXES = ['/view/', '/api/']

// Auth routes — redirect to app if already logged in
const AUTH_ROUTES = ['/login', '/register']

// Admin-only route prefixes — require role === 'admin'
const ADMIN_PREFIXES = ['/admin', '/dashboard']

// Routes that are always accessible to authenticated users, even if subscription is blocked.
// Prevents redirect loops and ensures admins can always fix billing issues.
const SUBSCRIPTION_EXEMPT_PREFIXES = ['/admin/billing', '/subscription/', '/api/', '/auth/']

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.includes(pathname)
}

function isSubscriptionExempt(pathname: string): boolean {
  return SUBSCRIPTION_EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isAdminRoute(pathname: string): boolean {
  return ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  // ---------------------------------------------------------------------------
  // Beta access gate — if BETA_ACCESS_PASSWORD is set, require a cookie.
  // When not set (e.g. local dev), the gate is disabled.
  // ---------------------------------------------------------------------------
  const betaPassword = process.env.BETA_ACCESS_PASSWORD
  if (betaPassword) {
    const pathname = request.nextUrl.pathname
    const isBetaExempt =
      pathname === '/beta-access' ||
      pathname === '/api/beta-access' ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/api/webhooks/') ||
      pathname === '/favicon.ico' ||
      pathname.includes('.')

    if (!isBetaExempt) {
      const betaCookie = request.cookies.get('onslide_beta_access')
      if (betaCookie?.value !== 'granted') {
        const url = request.nextUrl.clone()
        url.pathname = '/beta-access'
        return NextResponse.redirect(url)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // CSRF protection — reject cross-origin mutating requests to API routes.
  // Bearer-token auth already mitigates CSRF (tokens aren't auto-sent by
  // the browser), but this adds defense-in-depth for cookie-based flows.
  // ---------------------------------------------------------------------------
  {
    const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
    const csrfPath = request.nextUrl.pathname
    const isMutatingApiCall = csrfPath.startsWith('/api/') && !SAFE_METHODS.has(request.method)
    const isCsrfExempt =
      csrfPath.startsWith('/api/webhooks/') ||
      csrfPath.startsWith('/api/view/') ||
      csrfPath === '/api/beta-access'

    if (isMutatingApiCall && !isCsrfExempt) {
      const origin = request.headers.get('origin')
      const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL
      if (expectedOrigin && origin && origin !== expectedOrigin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANT: Use getUser() not getSession() — validates token server-side every time
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Skip static files and next internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.includes('.')) {
    return supabaseResponse
  }

  // If user is logged in and trying to access auth routes, redirect to app
  if (user && isAuthRoute(pathname)) {
    const role = user.app_metadata?.role
    const redirectUrl = role === 'admin' ? '/dashboard' : '/home'
    const url = request.nextUrl.clone()
    url.pathname = redirectUrl
    return NextResponse.redirect(url)
  }

  // If user is NOT logged in and route is protected, redirect to login
  if (!user && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // If authenticated user tries to access an admin route without admin role,
  // redirect server-side (prevents the client-side admin layout flash)
  if (user && isAdminRoute(pathname)) {
    const role = user.app_metadata?.role ?? 'employee'
    if (role !== 'admin') {
      const url = request.nextUrl.clone()
      url.pathname = '/home'
      return NextResponse.redirect(url)
    }
  }

  // ---------------------------------------------------------------------------
  // Authenticated user checks (is_active, last_active_at, subscription)
  // ---------------------------------------------------------------------------
  if (user && !isPublicRoute(pathname)) {
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // BUG-5 fix: Check if user is deactivated (removed from team)
    const { data: userRecord } = await adminClient
      .from('users')
      .select('is_active')
      .eq('id', user.id)
      .single()

    if (userRecord?.is_active === false) {
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('reason', 'account-deactivated')
      return NextResponse.redirect(url)
    }

    // Fire-and-forget last_active_at update
    adminClient
      .from('users')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {
        // intentionally empty — best effort
      })

    // Subscription status check (non-exempt routes only)
    if (!isSubscriptionExempt(pathname)) {
      const tenantId = user.app_metadata?.tenant_id

      if (!tenantId) {
        const url = request.nextUrl.clone()
        url.pathname = '/subscription/blocked'
        url.searchParams.set('reason', 'no-tenant')
        return NextResponse.redirect(url)
      }

      const { data: subscription } = await adminClient
        .from('subscriptions')
        .select('status, trial_ends_at')
        .eq('tenant_id', tenantId)
        .single()

      if (isSubscriptionBlocked(subscription)) {
        const url = request.nextUrl.clone()
        url.pathname = '/subscription/blocked'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

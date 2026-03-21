import {
  createBrowserClient as createSSRBrowserClient,
  createServerClient as createSSRServerClient,
} from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Proxy URL for browser clients — routes through our own domain to avoid
// Safari ITP (Intelligent Tracking Prevention) blocking cross-origin requests.
// Only used on client side; server clients use the direct URL for performance.
const supabaseBrowserUrl =
  typeof window !== 'undefined' ? `${window.location.origin}/supabase-proxy` : supabaseUrl

// Extract the project ref from the original Supabase URL for consistent cookie naming.
// Without this, changing the URL would change the cookie name and break existing sessions.
const supabaseProjectRef = supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1] ?? 'supabase'

// ---------------------------------------------------------------------------
// Browser client (client components)
// Uses @supabase/ssr for automatic cookie-based session handling.
// Routes through /supabase-proxy/* to avoid Safari ITP issues.
// ---------------------------------------------------------------------------

export function createBrowserSupabaseClient() {
  return createSSRBrowserClient(supabaseBrowserUrl, supabaseAnonKey, {
    cookieOptions: {
      name: `sb-${supabaseProjectRef}-auth-token`,
    },
  })
}

/**
 * @deprecated Use `createBrowserSupabaseClient()` instead.
 * Kept temporarily for backward compatibility during migration.
 */
export const supabase = createBrowserSupabaseClient()

// ---------------------------------------------------------------------------
// Server client (server components, API routes, middleware)
// Uses @supabase/ssr with cookie read/write callbacks.
// ---------------------------------------------------------------------------

export function createServerSupabaseClient(cookieStore: {
  getAll: () => { name: string; value: string }[]
  setAll: (
    cookies: {
      name: string
      value: string
      options?: Record<string, unknown>
    }[]
  ) => void
}) {
  return createSSRServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(
        cookiesToSet: {
          name: string
          value: string
          options?: Record<string, unknown>
        }[]
      ) {
        cookieStore.setAll(cookiesToSet)
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Service client (admin operations, bypasses RLS)
// Uses @supabase/supabase-js directly (no SSR/cookies needed).
// ---------------------------------------------------------------------------

export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

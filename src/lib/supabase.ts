import {
  createBrowserClient as createSSRBrowserClient,
  createServerClient as createSSRServerClient,
} from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// ---------------------------------------------------------------------------
// Browser client (client components)
// Uses @supabase/ssr for automatic cookie-based session handling.
// ---------------------------------------------------------------------------

export function createBrowserSupabaseClient() {
  return createSSRBrowserClient(supabaseUrl, supabaseAnonKey)
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

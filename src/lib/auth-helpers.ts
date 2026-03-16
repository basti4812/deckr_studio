import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  id: string
  email?: string
}

export interface UserProfile {
  id: string
  tenant_id: string
  role: 'admin' | 'employee'
  display_name: string | null
  avatar_url: string | null
  preferred_language: string
  is_active: boolean
}

// ---------------------------------------------------------------------------
// getAuthenticatedUser
// Verifies the Bearer token from the Authorization header.
// Returns the Supabase Auth user or null if invalid/missing.
// ---------------------------------------------------------------------------

export async function getAuthenticatedUser(
  request: NextRequest
): Promise<AuthenticatedUser | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    }
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return { id: user.id, email: user.email }
}

// ---------------------------------------------------------------------------
// getUserProfile
// Fetches the user's row from public.users (uses service role, bypasses RLS).
// Returns null if the user has no profile row.
// ---------------------------------------------------------------------------

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabaseAdmin = createServiceClient()

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id, role, display_name, avatar_url, preferred_language, is_active')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return data as UserProfile
}

// ---------------------------------------------------------------------------
// requireActiveUser
// Convenience helper: authenticates the request AND verifies is_active.
// Returns { user, profile } on success, or { error, status } on failure.
// ---------------------------------------------------------------------------

export async function requireActiveUser(
  request: NextRequest
): Promise<
  | { user: AuthenticatedUser; profile: UserProfile; error?: never; status?: never }
  | { error: string; status: number; user?: never; profile?: never }
> {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }

  const profile = await getUserProfile(user.id)
  if (!profile) {
    return { error: 'User profile not found', status: 404 }
  }

  if (!profile.is_active) {
    return { error: 'Account has been deactivated', status: 403 }
  }

  return { user, profile }
}

// ---------------------------------------------------------------------------
// requireAdmin
// Convenience helper: authenticates the request AND verifies admin role.
// Returns { user, profile } on success, or { error, status } on failure.
// ---------------------------------------------------------------------------

export async function requireAdmin(
  request: NextRequest
): Promise<
  | { user: AuthenticatedUser; profile: UserProfile; error?: never; status?: never }
  | { error: string; status: number; user?: never; profile?: never }
> {
  const user = await getAuthenticatedUser(request)
  if (!user) {
    return { error: 'Unauthorized', status: 401 }
  }

  const profile = await getUserProfile(user.id)
  if (!profile) {
    return { error: 'User profile not found', status: 404 }
  }

  if (!profile.is_active) {
    return { error: 'Account has been deactivated', status: 403 }
  }

  if (profile.role !== 'admin') {
    return { error: 'Forbidden: admin access required', status: 403 }
  }

  return { user, profile }
}

-- PROJ-9: Team Management
-- Adds last_active_at and email columns to users table

-- =============================================================================
-- 1. Add last_active_at column (nullable, updated by middleware on each request)
-- =============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- =============================================================================
-- 2. Add email column (for team management display)
-- =============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index on email for lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);

-- Create index on tenant_id + is_active for seat counting queries
CREATE INDEX IF NOT EXISTS idx_users_tenant_active ON public.users (tenant_id, is_active);

-- =============================================================================
-- 3. RPC: Count confirmed active users (excludes pending invites from seat count)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.count_confirmed_active_users(p_tenant_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT count(*)
  FROM public.users u
  INNER JOIN auth.users au ON u.id = au.id
  WHERE u.tenant_id = p_tenant_id
    AND u.is_active = true
    AND au.email_confirmed_at IS NOT NULL;
$$;

-- =============================================================================
-- 4. RPC: Get team members with pending status (single query, no N+1)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_team_members(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  email text,
  role text,
  is_active boolean,
  avatar_url text,
  last_active_at timestamptz,
  created_at timestamptz,
  is_pending boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    u.id,
    u.display_name,
    COALESCE(u.email, au.email, 'Unknown') AS email,
    u.role,
    u.is_active,
    u.avatar_url,
    u.last_active_at,
    u.created_at,
    (au.email_confirmed_at IS NULL) AS is_pending
  FROM public.users u
  LEFT JOIN auth.users au ON u.id = au.id
  WHERE u.tenant_id = p_tenant_id
    AND u.is_active = true
  ORDER BY
    (au.email_confirmed_at IS NULL) DESC,
    u.created_at DESC;
$$;

-- =============================================================================
-- 5. RPC: Atomically remove user and transfer projects
-- =============================================================================
CREATE OR REPLACE FUNCTION public.remove_user_and_transfer_projects(
  p_target_user_id uuid,
  p_admin_user_id uuid,
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.users
  SET is_active = false
  WHERE id = p_target_user_id
    AND tenant_id = p_tenant_id;

  UPDATE public.projects
  SET user_id = p_admin_user_id
  WHERE user_id = p_target_user_id
    AND tenant_id = p_tenant_id;
END;
$$;

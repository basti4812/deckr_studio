-- PROJ-1: Multi-tenancy & Tenant Data Model
-- Creates tenants and users tables with RLS policies

-- =============================================================================
-- 1. TENANTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2B4EFF',
  default_language TEXT NOT NULL DEFAULT 'de' CHECK (default_language IN ('de', 'en')),
  sso_provider TEXT,
  sso_client_id TEXT,
  sso_tenant_id TEXT,
  sso_domain TEXT,
  crm_provider TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenants
CREATE POLICY "tenants_select_own"
  ON public.tenants
  FOR SELECT
  USING (
    id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

CREATE POLICY "tenants_update_own_admin"
  ON public.tenants
  FOR UPDATE
  USING (
    id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No INSERT/DELETE policies for tenants via RLS -- only service role can create/delete tenants

-- =============================================================================
-- 2. USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  display_name TEXT,
  avatar_url TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'de' CHECK (preferred_language IN ('de', 'en')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users

-- Users can see other users in their own tenant
CREATE POLICY "users_select_same_tenant"
  ON public.users
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Users can only update their own row
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT/DELETE policies -- only service role can create/delete users

-- =============================================================================
-- 3. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_tenants_created_at ON public.tenants(created_at);

-- =============================================================================
-- 4. STORAGE BUCKETS
-- =============================================================================
-- Create storage buckets (these are idempotent via INSERT ... ON CONFLICT)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('logos', 'logos', false),
  ('slides', 'slides', false),
  ('avatars', 'avatars', false),
  ('personal-slides', 'personal-slides', false),
  ('template-sets', 'template-sets', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies: tenant isolation
-- Each bucket gets SELECT and INSERT policies scoped to tenant

-- logos bucket
CREATE POLICY "logos_select_own_tenant"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "logos_insert_own_tenant"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "logos_update_own_tenant"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "logos_delete_own_tenant"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

-- slides bucket
CREATE POLICY "slides_select_own_tenant"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "slides_insert_own_tenant"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "slides_update_own_tenant"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "slides_delete_own_tenant"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

-- avatars bucket
CREATE POLICY "avatars_select_own_tenant"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "avatars_insert_own_tenant"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "avatars_update_own_tenant"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "avatars_delete_own_tenant"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

-- personal-slides bucket
CREATE POLICY "personal_slides_select_own_tenant"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'personal-slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "personal_slides_insert_own_tenant"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'personal-slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "personal_slides_update_own_tenant"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'personal-slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "personal_slides_delete_own_tenant"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'personal-slides'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

-- template-sets bucket
CREATE POLICY "template_sets_select_own_tenant"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'template-sets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "template_sets_insert_own_tenant"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'template-sets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "template_sets_update_own_tenant"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'template-sets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY "template_sets_delete_own_tenant"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'template-sets'
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text FROM public.users WHERE id = auth.uid()
    )
  );

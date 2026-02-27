-- PROJ-4: Subscription Data Model & Access Control
-- NOTE: Table, trigger, and SELECT policy were created manually before this migration.
-- This file documents the complete intended schema.

-- =============================================================================
-- 1. SUBSCRIPTIONS TABLE (already exists in DB)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'cancelled')),
  pricing_tier TEXT,
  licensed_seats INTEGER,
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  trial_ends_at TIMESTAMPTZ,
  next_renewal_date TIMESTAMPTZ,
  payment_provider_customer_id TEXT,
  payment_provider_price_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_tenant_id_unique UNIQUE (tenant_id)
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. RLS POLICIES
-- =============================================================================

-- Users can read their own tenant's subscription
CREATE POLICY "subscriptions_select_own_tenant"
  ON public.subscriptions
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
  );

-- Only admins can update their own tenant's subscription
CREATE POLICY "subscriptions_update_own_tenant_admin"
  ON public.subscriptions
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- No INSERT/DELETE via RLS — service role only

-- =============================================================================
-- 3. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- =============================================================================
-- 4. AUTO-UPDATE updated_at TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER subscriptions_set_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

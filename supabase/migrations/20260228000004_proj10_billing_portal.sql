-- PROJ-10: Billing Portal
-- Adds price_per_user_cents to subscriptions, billing contact fields to tenants,
-- and creates the invoices table for future Stripe integration.

-- 1. Add price_per_user_cents to subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS price_per_user_cents INTEGER;

-- 2. Add billing contact columns to tenants
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS billing_company_name TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_street TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_city TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_postal_code TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_country TEXT,
  ADD COLUMN IF NOT EXISTS billing_vat_id TEXT;

-- 3. Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'eur',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'failed')),
  invoice_date DATE NOT NULL,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for tenant lookups sorted by date
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_date
  ON public.invoices(tenant_id, invoice_date DESC);

-- 4. Enable RLS on invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Admin can read own tenant's invoices
CREATE POLICY "Admins can read own tenant invoices"
  ON public.invoices
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'admin'
        AND u.is_active = true
    )
  );

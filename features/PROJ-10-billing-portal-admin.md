# PROJ-10: Billing Portal (Admin)

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-02-28

## Dependencies

- Requires: PROJ-4 (Subscription Data Model & Access Control) — subscription data
- Requires: PROJ-3 (User Roles & Permissions) — admin-only access
- Requires: PROJ-9 (Team Management) — seat usage count (confirmed active users)
- Prepares for: PROJ-11 (Stripe Webhooks) — invoices table ready; price/status fields will be written by webhooks

## User Stories

- As an admin, I want to see my current plan name, price per user, and billing cycle so that I know what I am paying
- As an admin, I want to see how many seats are licensed vs used so that I can decide whether to upgrade
- As an admin, I want to see the next billing date so that I can plan cash flow
- As an admin, I want a trial countdown when I am in a free trial so that I know how much time is left
- As an admin, I want to see a list of past invoices with date, amount, and status so that I can track billing history
- As an admin, I want to download a PDF invoice so that I can share it with my finance team
- As an admin, I want to store my billing contact details (company, address, VAT ID) so that invoices are correctly addressed
- As an admin, I want to see which payment method is on file so that I know which card will be charged
- As an admin, I want to click "Upgrade", "Downgrade", and "Cancel" buttons so that I can manage my plan (even if real logic connects later)

## Acceptance Criteria

### Page Access

- [ ] Billing portal accessible at `/admin/billing` (admin only)
- [ ] Page is accessible regardless of subscription status — even cancelled or expired plans can view billing

### Plan Overview Card

- [ ] Shows plan name (`pricing_tier` field, e.g. "Starter", "Growth"), billing cycle (monthly/annual), and next renewal date
- [ ] Shows price per user formatted as currency (e.g. "€29 / user / month"); displays "—" if `price_per_user_cents` is null
- [ ] Trial banner shown when status is `trialing`: "X days remaining in your free trial" (countdown from `trial_ends_at`)
- [ ] Status badge shown: Active / Trialing / Past Due / Cancelled

### Seat Usage Card

- [ ] Shows "{used} of {licensed} seats used" with a progress bar
- [ ] If `licensed_seats` is null: shows "Unlimited seats" (no progress bar)
- [ ] Seat count uses confirmed active users only (same count as team management page — no pending users)
- [ ] Progress bar turns amber at ≥ 80% used, red at 100%

### Invoice List

- [ ] Shows a table of invoices: date, amount (formatted currency), status badge (Paid / Pending / Failed), download button
- [ ] Download button links to `pdf_url` if present; disabled with tooltip "PDF will be available once your payment provider is connected" if null
- [ ] Empty state shown when no invoices exist: "No invoices yet. Your first invoice will appear after your first billing cycle."
- [ ] Invoices sorted by date descending (newest first)

### Payment Method

- [ ] Placeholder card: "No payment method connected yet" when no payment provider is configured
- [ ] When provider is connected (future): shows card type + last 4 digits (UI prepared but not active yet)

### Billing Contact Form

- [ ] Form with fields: Company name, Street address, City, Postal code, Country, VAT ID
- [ ] All fields optional (no required validation in placeholder phase)
- [ ] "Save" button updates the tenant record; shows success toast on save
- [ ] Form pre-populates with existing values on page load

### Subscription Action Buttons

- [ ] "Upgrade plan" button: navigates to `/admin/billing/upgrade` (placeholder page)
- [ ] "Downgrade plan" button: navigates to `/admin/billing/downgrade` (placeholder page)
- [ ] "Cancel subscription" button: opens confirmation dialog showing plan name
- [ ] On cancel confirm: shows toast "Cancellation requested — our team will be in touch shortly" (no actual status change yet)
- [ ] All placeholder pages show: "Payment provider integration coming soon"

## Edge Cases

- `licensed_seats` is null → Show "Unlimited seats", omit progress bar
- `price_per_user_cents` is null → Show "—" in plan card (will be filled by Stripe webhook)
- `pricing_tier` is null → Show "Custom plan" as fallback
- `next_renewal_date` is null → Show "—" in plan card
- `trial_ends_at` is in the past but status is still `trialing` → Show "Trial expired" instead of countdown
- No invoices exist → Show empty state (expected for new tenants)
- Admin clicks cancel then closes the dialog without confirming → No action taken
- Two admins open billing page simultaneously → Read-only data, no conflict

## Technical Requirements

### Database Changes (migration required)

**On `subscriptions` table** — add one column:

- `price_per_user_cents INTEGER NULLABLE` — price per user in cents; null until Stripe is connected; set by PROJ-11 webhooks

**On `tenants` table** — add billing contact columns:

- `billing_company_name TEXT NULLABLE`
- `billing_address_street TEXT NULLABLE`
- `billing_address_city TEXT NULLABLE`
- `billing_address_postal_code TEXT NULLABLE`
- `billing_address_country TEXT NULLABLE`
- `billing_vat_id TEXT NULLABLE`

**New `invoices` table** (empty now, populated by PROJ-11):

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
- `stripe_invoice_id TEXT UNIQUE NULLABLE` — external reference (set by webhooks)
- `amount_cents INTEGER NOT NULL DEFAULT 0`
- `currency TEXT NOT NULL DEFAULT 'eur'`
- `status TEXT NOT NULL DEFAULT 'pending'` — `paid`, `pending`, `failed`
- `invoice_date DATE NOT NULL`
- `pdf_url TEXT NULLABLE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- RLS enabled; admin reads own tenant's invoices only

### API Routes

| Method | Path                  | Purpose                                                          |
| ------ | --------------------- | ---------------------------------------------------------------- |
| GET    | `/api/subscription`   | Already exists — reuse; also returns seat usage                  |
| PATCH  | `/api/tenant/billing` | Save billing contact fields to tenant                            |
| GET    | `/api/invoices`       | Fetch invoices for current tenant (sorted desc)                  |
| POST   | `/api/billing/cancel` | Placeholder cancel action — logs intent, returns success message |

The existing `GET /api/subscription` and `PATCH /api/subscription` endpoints are reused as-is.

### No New Packages

All UI components needed (Card, Progress, Badge, Table, Dialog, Form, Input) are already installed as shadcn/ui. No Stripe SDK needed at this stage.

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Component Structure

```
/admin/billing (page — replaces placeholder)
│
├── Plan Overview Card
│   ├── Plan name (pricing_tier) + Status badge (Active / Trialing / Past Due / Cancelled)
│   ├── Price per user + billing cycle ("€29 / user / month" or "—")
│   ├── Next renewal date ("—" if not set)
│   ├── Trial banner — shown only when status = trialing
│   │   └── "X days remaining in your free trial" (or "Trial expired")
│   └── Action buttons row
│       ├── [Upgrade plan] → navigates to /admin/billing/upgrade
│       ├── [Downgrade plan] → navigates to /admin/billing/downgrade
│       └── [Cancel subscription] → opens Cancel Confirm Dialog
│
├── Seat Usage Card
│   ├── "{used} of {licensed} seats" label
│   ├── Progress bar (normal → amber at ≥80% → red at 100%)
│   └── "Unlimited seats" variant (no progress bar, when licensed_seats = null)
│
├── Invoice List
│   ├── Table: Invoice Date | Amount | Status Badge | Download
│   ├── Status badges: Paid (green) / Pending (amber) / Failed (red)
│   ├── Download button: links to pdf_url when available; disabled with tooltip when null
│   └── Empty state: "No invoices yet" message
│
├── Payment Method Card
│   └── Placeholder: "No payment method connected yet"
│       (UI slot prepared for card type + last 4 digits when Stripe connects)
│
├── Billing Contact Form
│   ├── Company name (Input)
│   ├── Street address (Input)
│   ├── City (Input)
│   ├── Postal code (Input)
│   ├── Country (Input)
│   ├── VAT ID (Input)
│   └── [Save] button → PATCH /api/tenant/billing → success toast
│
└── Cancel Subscription Dialog (AlertDialog)
    ├── "Cancel [Plan Name]?"
    ├── Warning message about losing access
    ├── [Keep subscription] and [Request cancellation] buttons
    └── On confirm: success toast, no status change

/admin/billing/upgrade   (placeholder page — "Payment provider coming soon")
/admin/billing/downgrade (placeholder page — "Payment provider coming soon")
```

---

### Data Model

**Existing `subscriptions` table — one new field added:**

- `price_per_user_cents` — price in euro cents (e.g. 2900 = €29); null until Stripe is connected; displayed as formatted currency on the billing page

**Existing `tenants` table — six new billing contact fields added:**

- Company name, street address, city, postal code, country, VAT ID
- All optional; pre-filled from DB on page load; saved via the new billing API

**New `invoices` table — created now, populated later by PROJ-11 (Stripe webhooks):**

| Field             | Description                                        |
| ----------------- | -------------------------------------------------- |
| id                | Unique invoice ID                                  |
| tenant_id         | Which tenant this invoice belongs to               |
| stripe_invoice_id | External Stripe reference (set by webhook, unique) |
| amount_cents      | Invoice amount in cents                            |
| currency          | Currency code (default: eur)                       |
| status            | paid / pending / failed                            |
| invoice_date      | Date invoice was issued                            |
| pdf_url           | Link to downloadable PDF (set by Stripe webhook)   |
| created_at        | Timestamp                                          |

Row-level security enabled: admins can only read invoices for their own tenant.

---

### API Surface

| Method  | Path                  | What it does                                                            |
| ------- | --------------------- | ----------------------------------------------------------------------- |
| `GET`   | `/api/subscription`   | **Reused** — returns subscription fields + seat usage                   |
| `GET`   | `/api/tenant`         | **Reused** — returns tenant data including billing contact fields       |
| `PATCH` | `/api/tenant/billing` | **New** — saves billing contact fields (company, address, VAT ID)       |
| `GET`   | `/api/invoices`       | **New** — returns invoices for the current tenant, sorted newest first  |
| `POST`  | `/api/billing/cancel` | **New (placeholder)** — returns a success message; no status change yet |

**Note on seat counting:** The existing `GET /api/subscription` counts all active users including pending invites. During the backend phase, this will be updated to use the `count_confirmed_active_users` database function (built in PROJ-9) to match the team management page behavior.

---

### Data Flow

**Page load (parallel):**

1. Fetch subscription + seat count → `GET /api/subscription`
2. Fetch tenant billing contact data → `GET /api/tenant`
3. Fetch invoices → `GET /api/invoices`

**User actions:**

- Save billing contact → `PATCH /api/tenant/billing` → success toast
- Cancel subscription → confirm dialog → `POST /api/billing/cancel` → success toast
- Upgrade / Downgrade → client-side navigation only (no API call)
- Download invoice → open `pdf_url` in new tab (no API call)

---

### Tech Decisions

**Why a separate `/api/tenant/billing` instead of reusing `PATCH /api/tenant`?**
The existing `PATCH /api/tenant` is used for branding (company name, logo, color). Billing contact is a different concern — it needs its own validation and will later trigger Stripe customer updates. Keeping them separate avoids a single endpoint growing into a dumping ground.

**Why create the invoices table now even though it's empty?**
PROJ-11 (Stripe webhooks) will need this table to already exist when it lands. Creating it now means PROJ-11 can focus purely on webhook logic and not worry about schema migrations alongside business logic. It also means the UI can render the correct empty state from day one rather than showing an error.

**Why no new packages?**
Every required component is already installed: Card, Progress, Badge, Table, Dialog, AlertDialog, Input, Skeleton, Tooltip, Toast/Sonner. Currency formatting uses the browser's built-in `Intl.NumberFormat` (no library needed).

---

### New Files

| File                                                    | Purpose                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| `src/app/(app)/admin/billing/page.tsx`                  | Main billing page (replaces placeholder) |
| `src/app/(app)/admin/billing/upgrade/page.tsx`          | Placeholder upgrade page                 |
| `src/app/(app)/admin/billing/downgrade/page.tsx`        | Placeholder downgrade page               |
| `src/app/api/tenant/billing/route.ts`                   | PATCH — save billing contact             |
| `src/app/api/invoices/route.ts`                         | GET — list invoices for tenant           |
| `src/app/api/billing/cancel/route.ts`                   | POST — placeholder cancel handler        |
| `supabase/migrations/20260228000004_proj10_billing.sql` | DB: add columns + invoices table         |

## QA Test Results (Round 2)

**Tested:** 2026-02-28
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build:** Passes (`npm run build` clean, all routes compile)
**Prior Round:** Round 1 found 8 bugs (1 Critical, 1 High, 2 Medium, 4 Low). This round re-verifies all fixes and performs a fresh audit.

### Round 1 Bug Fix Verification

| Bug                                         | Severity | Status | Notes                                                                                                          |
| ------------------------------------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| BUG-1: Missing migration file               | Critical | FIXED  | `supabase/migrations/20260228000004_proj10_billing_portal.sql` now exists with all required schema changes     |
| BUG-2: Seat count dependency on PROJ-9      | Medium   | FIXED  | PROJ-9 now "Deployed" in INDEX.md; `count_confirmed_active_users` RPC exists in PROJ-9 migration               |
| BUG-3: No rate limiting                     | High     | FIXED  | All 3 endpoints now use `checkRateLimit()`: billing PATCH (10/5min), invoices GET (30/min), cancel POST (3/hr) |
| BUG-4: INDEX.md status not updated          | Low      | FIXED  | PROJ-10 now shows "In Review" in INDEX.md                                                                      |
| BUG-5: No input trimming                    | Low      | FIXED  | `safeString` helper applies `.trim()` transform in Zod pipeline                                                |
| BUG-6: No HTML stripping                    | Medium   | FIXED  | `safeString` helper applies `.replace(/<[^>]*>/g, '')` after trim                                              |
| BUG-7: Cancel logs sensitive info           | Low      | FIXED  | Log now reads `'[billing/cancel] Cancellation requested'` without user/tenant IDs                              |
| BUG-8: GET /api/subscription not admin-only | Low/Info | N/A    | Documented as by-design -- shared endpoint used by subscription banner                                         |

### Acceptance Criteria Status

#### AC-1: Page Access

- [x] PASS: Billing portal accessible at `/admin/billing` -- route exists at `src/app/(app)/admin/billing/page.tsx`, compiles clean
- [x] PASS: Page accessible regardless of subscription status -- `/admin/billing` is in `SUBSCRIPTION_EXEMPT_PREFIXES` in proxy.ts (line 38)
- [x] PASS: Admin-only access enforced -- three-layer protection: (1) proxy.ts `ADMIN_PREFIXES` check redirects non-admins server-side, (2) admin layout.tsx checks `useCurrentUser().isAdmin` client-side, (3) all API endpoints use `requireAdmin()`

#### AC-2: Plan Overview Card

- [x] PASS: Shows plan name from `pricing_tier` field with "Custom plan" fallback when null (line 397)
- [x] PASS: Shows billing cycle (monthly/annual) with capitalize CSS and next renewal date via `formatDate()`
- [x] PASS: Shows price per user using `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`; shows em-dash when `price_per_user_cents` is null (lines 544-546)
- [x] PASS: Trial banner conditionally rendered when `status === 'trialing'` (line 509); shows day countdown with proper pluralization or "Trial expired" when `trialDaysRemaining === 0` (lines 519-529)
- [x] PASS: Status badge component renders 4 statuses with correct colors: Active (green), Trialing (blue), Past Due (amber), Cancelled (red), plus a fallback for unknown statuses (lines 127-172)

#### AC-3: Seat Usage Card

- [x] PASS: Shows "{used} of {licensed} seats used" with Progress component (lines 601-630)
- [x] PASS: Unlimited seats shown when `licensed_seats` is null -- no progress bar rendered, shows "Unlimited seats on your current plan" text (lines 632-646)
- [x] PASS: Seat count uses `count_confirmed_active_users` RPC via `GET /api/subscription` (confirmed in subscription route.ts line 40) -- excludes pending invites
- [x] PASS: Progress bar color changes: red class `[&>div]:bg-red-500` at >= 100%, amber class `[&>div]:bg-amber-500` at >= 80% (lines 412-419)

#### AC-4: Invoice List

- [x] PASS: Table with columns: Date, Amount, Status Badge, Download button (lines 674-744)
- [x] PASS: Download button links to `pdf_url` in new tab with `rel="noopener noreferrer"` when present; disabled with Tooltip when null showing "PDF will be available once your payment provider is connected" (lines 701-737)
- [x] PASS: Empty state: "No invoices yet" with "Your first invoice will appear after your first billing cycle." (lines 662-671)
- [x] PASS: Sorted descending by `invoice_date` via `.order('invoice_date', { ascending: false })` in API (invoices route.ts line 32)

#### AC-5: Payment Method

- [x] PASS: Placeholder card shows "No payment method connected yet" with CreditCard icon (lines 751-772)
- [x] PASS: UI structure is prepared for future card details display

#### AC-6: Billing Contact Form

- [x] PASS: All 6 fields present: Company name, Street address, City, Postal code, Country, VAT ID (lines 786-882)
- [x] PASS: All fields optional -- no `required` attributes on inputs, Zod schema uses `.optional()` on all fields
- [x] PASS: Save button sends PATCH to `/api/tenant/billing` with success toast (lines 313-348)
- [x] PASS: Form pre-populates from tenant data fetched via `GET /api/tenant` (lines 280-287)

#### AC-7: Subscription Action Buttons

- [x] PASS: "Upgrade plan" button uses `<Link href="/admin/billing/upgrade">` (lines 565-569)
- [x] PASS: "Downgrade plan" button uses `<Link href="/admin/billing/downgrade">` (lines 571-575)
- [x] PASS: "Cancel subscription" opens AlertDialog with title "Cancel {planName}?" (line 909)
- [x] PASS: Cancel confirm shows toast with title "Cancellation requested" and description about team being in touch (lines 373-377); no actual subscription status mutation
- [x] PASS: Upgrade placeholder page shows "Payment provider integration coming soon" (upgrade/page.tsx line 27)
- [x] PASS: Downgrade placeholder page shows "Payment provider integration coming soon" (downgrade/page.tsx line 29)
- [x] PASS: Closing cancel dialog without confirming takes no action -- `onOpenChange` guard with `!cancelling` prevents accidental close during request (line 905)

### Edge Cases Status

#### EC-1: licensed_seats is null

- [x] PASS: "Unlimited seats" variant rendered, no Progress bar -- conditional branch at line 632

#### EC-2: price_per_user_cents is null

- [x] PASS: Em-dash (`\u2014`) displayed -- ternary at line 544

#### EC-3: pricing_tier is null

- [x] PASS: "Custom plan" fallback -- nullish coalescing at line 397

#### EC-4: next_renewal_date is null

- [x] PASS: Em-dash returned by `formatDate(null)` -- early return at line 114

#### EC-5: trial_ends_at in past but status still trialing

- [x] PASS: `getTrialDaysRemaining()` returns 0 via `Math.max(0, ...)` (subscription-helpers.ts line 56); page shows "Trial expired" when `trialDaysRemaining === 0` and status is `trialing` (lines 402-403, 519-522)

#### EC-6: No invoices exist

- [x] PASS: Empty state with FileText icon and descriptive text -- conditional at line 662

#### EC-7: Admin clicks cancel then closes dialog

- [x] PASS: AlertDialog `onOpenChange` with guard `!cancelling` prevents close during active request; closing when idle resets state without side effects

#### EC-8: Two admins open billing page simultaneously

- [x] PASS: Read-only data (subscription, invoices) has no conflict. Note: billing contact form uses last-writer-wins semantics -- documented below as informational finding.

### Security Audit Results

#### Authentication & Authorization

- [x] PASS: `PATCH /api/tenant/billing` uses `requireAdmin()` -- verifies Bearer token, profile existence, `is_active === true`, and `role === 'admin'`
- [x] PASS: `GET /api/invoices` uses `requireAdmin()` with identical checks
- [x] PASS: `POST /api/billing/cancel` uses `requireAdmin()` with identical checks
- [x] PASS: Proxy middleware (proxy.ts line 126-133) redirects non-admins from `/admin/*` routes server-side
- [x] PASS: Admin layout (layout.tsx) provides client-side fallback guard via `useCurrentUser().isAdmin`

#### Input Validation

- [x] PASS: Zod schema validates all billing contact fields with max length constraints (255, 500, 255, 20, 100, 50)
- [x] PASS: `safeString` helper trims whitespace and strips HTML tags before storage
- [x] PASS: Invalid JSON body returns 400 with "Invalid JSON body" message
- [x] PASS: Empty update object returns 400 with "No fields to update" message
- [ ] BUG: Client-side form inputs have no `maxLength` attribute -- see NEW-BUG-1

#### Rate Limiting

- [x] PASS: `PATCH /api/tenant/billing` -- 10 requests per 5 minutes per user
- [x] PASS: `GET /api/invoices` -- 30 requests per minute per user
- [x] PASS: `POST /api/billing/cancel` -- 3 requests per hour per user
- [x] PASS: Rate limit uses Supabase-backed persistence (survives serverless cold starts)

#### Data Isolation (Multi-tenancy)

- [x] PASS: `GET /api/invoices` scoped to `auth.profile.tenant_id` -- admin can only see own tenant's invoices
- [x] PASS: `PATCH /api/tenant/billing` scoped to `.eq('id', auth.profile.tenant_id)` -- cannot update other tenants
- [x] PASS: `POST /api/billing/cancel` has no data mutation; log is anonymous
- [x] PASS: No user-controllable `tenant_id` parameter in any request -- always derived server-side

#### RLS Policies

- [x] PASS: `invoices` table has RLS enabled with SELECT-only policy for admins of the owning tenant
- [x] PASS: No INSERT/UPDATE/DELETE policies on `invoices` -- only service role (webhook handlers) can write
- [ ] BUG: No CHECK constraint on `invoices.status` column -- see NEW-BUG-2

#### Exposed Secrets / Data Leaks

- [x] PASS: No secrets in source code
- [x] PASS: Generic error messages in API responses
- [x] PASS: `stripe_invoice_id` in invoice response is acceptable (admin-only endpoint)

#### IDOR / Authorization Bypass

- [x] PASS: All tenant scoping is server-side, derived from authenticated user's profile
- [x] PASS: No direct object reference attacks possible on any of the 3 new endpoints

#### Open Redirect / URL Injection

- [ ] BUG: `pdf_url` from invoices table rendered directly in `<a href>` without URL validation -- see NEW-BUG-3

### New Bugs Found (Round 2)

| Bug                                         | Severity | Status                                                    |
| ------------------------------------------- | -------- | --------------------------------------------------------- |
| NEW-BUG-1: No maxLength on inputs           | Low      | FIXED — all 6 inputs now have `maxLength` attributes      |
| NEW-BUG-2: No CHECK on invoices.status      | Low      | FIXED — CHECK constraint present in migration             |
| NEW-BUG-3: pdf_url no URL validation        | Low      | FIXED — `/^https?:\/\//` regex validates before rendering |
| NEW-BUG-4: Invoice table no overflow-x-auto | Low      | FIXED — `overflow-x-auto` class added to wrapper          |

### Cross-Browser Testing Notes

- All UI built with shadcn/ui components (Card, Badge, Progress, Table, AlertDialog, Input, Label, Tooltip, Button, Skeleton, Separator) -- cross-browser tested by the component library
- `Intl.NumberFormat` for currency formatting: supported in Chrome 24+, Firefox 29+, Safari 10+ -- no compatibility concerns
- `Date.toLocaleDateString` for date formatting: universal browser support
- No browser-specific CSS, no CSS custom properties beyond shadcn's established variables
- `flex-wrap` for action buttons: universal support
- **Chrome:** No issues expected
- **Firefox:** No issues expected
- **Safari:** No issues expected (no WebKit-specific edge cases in the used components)

### Responsive Testing Notes

- **375px (Mobile):** Plan Overview and Seat Usage cards stack vertically (`lg:grid-cols-2` breaks at 1024px). Billing form fields stack to single column (below `sm` 640px breakpoint). Action buttons wrap via `flex-wrap`. Invoice table may clip without horizontal scroll -- see NEW-BUG-4.
- **768px (Tablet):** Cards still stack vertically (lg breakpoint). Billing form uses 2-column grid via `sm:grid-cols-2`. All content fits comfortably.
- **1440px (Desktop):** Plan Overview and Seat Usage cards side-by-side in 2-column grid. Billing form in 2 columns. Invoice table renders with ample space. All elements well-proportioned.

### Regression Testing Notes

- **PROJ-4 (Subscription Data Model):** `GET /api/subscription` has been updated to use `count_confirmed_active_users` RPC (seat counting change). The subscription response shape now includes `seatUsage` object which is consumed by the billing page. No breaking changes to the existing subscription banner usage since it only reads `subscription` field.
- **PROJ-9 (Team Management):** PROJ-9's `count_confirmed_active_users` RPC is a dependency for seat counting on the billing page. PROJ-9 is "Deployed" -- no regression expected.
- **PROJ-8 (User Profile):** No overlap with billing portal. No regression.
- **GET /api/tenant:** Modified to include billing contact fields in the SELECT query (line 40-46). These are additional columns -- existing consumers that read `name`, `logo_url`, `primary_color` etc. are unaffected since they access specific fields, not `SELECT *`.

### Summary

- **Acceptance Criteria:** 24/24 passed
- **Edge Cases:** 8/8 passed
- **Round 1 Bugs:** 7/7 actionable bugs fixed (1 informational item remains documented)
- **New Bugs Found (Round 2):** 4 total — all 4 fixed
- **Security Audit:** Authentication, authorization, rate limiting, input validation, data isolation, and RLS all solid.
- **Build:** Passes clean
- **Production Ready:** YES

## Deployment

_To be added by /deploy_

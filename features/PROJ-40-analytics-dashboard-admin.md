# PROJ-40: Analytics Dashboard (Admin)

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-03

## Dependencies

- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-15 (Slide Library Management)
- Requires: PROJ-22 (Template Set Management)
- Requires: PROJ-33 (PowerPoint Export) — use event tracked for slide usage

## User Stories

- As an admin, I want to see which slides are used most frequently so that I know what content is valuable
- As an admin, I want to see when each slide was last used so that I can identify stale content
- As an admin, I want to quickly find slides that have never been used so that I can consider removing them
- As an admin, I want to see which template sets are most popular so that I know what to invest in
- As an admin, I want to export all analytics data as CSV so that I can analyze it in my own tools

## Acceptance Criteria

- [ ] Analytics dashboard accessible in admin workspace at `/admin/analytics`
- [ ] Slide usage table: slide name, thumbnail, status, use count (times added to any project), last used date, template set count (times included in a template set)
- [ ] "Never used" filter: one-click filter to show only slides with 0 uses
- [ ] Template set usage table: template set name, cover image, times selected for project creation, last selected date
- [ ] Usage data covers all projects in the tenant (all users)
- [ ] "Export CSV" button: downloads all slide usage data as a CSV file (slide name, use count, last used date)
- [ ] Dashboard shows a summary card at the top: total slides, total projects, total exports in the last 30 days
- [ ] Data refreshes on page load (no real-time updates needed)

## Edge Cases

- What if a slide is used 0 times? → Shows "0" in use count column; "Never" in last used column
- What if there are no template sets? → Template set usage section shows empty state
- What if a slide is deleted? → Its analytics history is retained for historical accuracy; shows "(deleted)" for the slide name
- What if the CSV export has special characters in slide names? → Proper CSV encoding (quotes around fields with commas or special chars)

## Technical Requirements

- Slide use count calculated from project slide_order JSONB queries or a dedicated `slide_usage_events` table written on export
- `slide_usage_events` table (if used): slide_id, project_id, user_id, used_at — written when a project is exported or a snapshot is saved
- Template set usage tracked in `template_set_selections` table: set_id, project_id, selected_at — written on project creation from template
- Analytics queries use aggregation; results cached for 1 hour to avoid slow queries on large datasets
- CSV export streams the response for large datasets

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### What Gets Built

A read-only analytics dashboard at `/admin/analytics` with three sections: summary cards, a slide usage table, and a template set usage table. Admins can filter slides by "never used" and download slide analytics as CSV.

### Component Structure

```
/admin/analytics/page.tsx
+-- Summary Cards (row of 3)
|   +-- Total Active Slides
|   +-- Total Projects
|   +-- Exports (last 30 days)  ← sourced from activity_logs
+-- Tabs: "Slides" | "Template Sets"
+-- [Slides Tab]
|   +-- Toolbar: "Never used" toggle (Switch) + "Export CSV" button
|   +-- Slides Table
|       +-- Thumbnail | Name | Status badge | Use Count | Last Used | In Template Sets
|       +-- Loading skeletons / empty state
+-- [Template Sets Tab]
    +-- Template Sets Table
        +-- Cover | Name | Slide Count | Times Selected | Last Selected
        +-- Loading skeletons / empty state
```

### Data Model (no new tables for slide analytics)

All data already exists and is aggregated on-demand:

| Metric                      | Source                                                                 |
| --------------------------- | ---------------------------------------------------------------------- |
| Total active slides         | `slides` — count where status ≠ deprecated                             |
| Total projects              | `projects` — count for tenant                                          |
| Exports last 30 days        | `activity_logs` — count event_type = 'project.exported'                |
| Slide use count             | `projects.slide_order` JSONB — count projects containing each slide ID |
| Slide last used             | `projects.updated_at` max across projects containing each slide        |
| Slide template set count    | `template_set_slides` join table — count per slide_id                  |
| Template set times selected | New `template_set_id` column on `projects` (added by migration)        |
| Template set last selected  | Max `created_at` of projects with that template_set_id                 |

**Migration adds:**

- `projects.template_set_id uuid FK → template_sets(id)` (nullable, ON DELETE SET NULL)
- PostgreSQL function `get_slide_analytics(p_tenant_id)` — per-slide aggregated stats
- PostgreSQL function `get_template_analytics(p_tenant_id)` — per-template-set aggregated stats

### New Files

1. `src/app/api/analytics/route.ts` — `GET` → summary metrics + slide analytics + template analytics; admin-only; results cached 1 hour per tenant
2. `src/app/api/analytics/export/route.ts` — `GET` → CSV download of slide analytics (Content-Type: text/csv); client-side generation from fetched data
3. Replace `src/app/(app)/admin/analytics/page.tsx` — full dashboard UI

**Existing file to update:**

- `src/app/api/projects/route.ts` POST — accept and save optional `template_set_id` on project creation

### Tech Decisions

- **No new usage-event tables**: Aggregating from existing `projects.slide_order` JSONB is sufficient for P2. No event tables means no backfill needed.
- **RPC functions**: PostgreSQL handles JSONB aggregation far more efficiently than JavaScript loops. One round-trip per dashboard load.
- **1-hour cache**: `unstable_cache` with `revalidate: 3600` tagged by tenant ID. Analytics don't need to be real-time.
- **Client-side CSV**: Built from the already-fetched slide array — no extra API call. Handles special characters with proper quoting.
- **No new packages**: shadcn Card, Table, Tabs, Switch, Badge, Button, Skeleton, Tooltip, Avatar — all already installed.

### Dependencies

No new npm packages required.

## QA Test Results

**Tested by:** QA / Red-Team Pen-Test
**Date:** 2026-03-03
**Status:** PASS (bugs resolved: BUG-1 false alarm, BUG-2 fixed, BUG-3 fixed, BUG-4 fixed)

---

### Acceptance Criteria Results

| AC   | Description                                                                                           | Result               | Notes                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | Analytics dashboard accessible at `/admin/analytics`                                                  | **PASS**             | Page exists at `src/app/(app)/admin/analytics/page.tsx`. Admin layout guard redirects non-admins. Sidebar link present in `src/components/app-sidebar.tsx` line 68.                                                                                                                     |
| AC-2 | Slide usage table shows: slide name, thumbnail, status, use count, last used date, template set count | **PASS**             | All 6 columns rendered in `SlidesTable` component (lines 215-223). Thumbnail shows image or placeholder div. Status uses Badge with variant mapping. "Never" displayed when `last_used_at` is null (line 287).                                                                          |
| AC-3 | "Never used" filter shows only slides with 0 uses                                                     | **PASS**             | Client-side filter at line 190: `slides.filter((s) => s.use_count === 0)`. Switch toggle with label. Empty state message shown when filter yields 0 results (lines 243-244).                                                                                                            |
| AC-4 | Template set usage table shows: name, cover image, times selected, last selected date                 | **PASS**             | `TemplateSetsTable` component renders all columns (lines 315-319). Cover image uses Avatar component. Empty state shown when no template sets (lines 333-340). Slide count column also included (bonus).                                                                                |
| AC-5 | Usage data covers all projects in the tenant                                                          | **CONDITIONAL PASS** | API route filters by `tenant_id` via `profile.tenant_id` (line 108 of route.ts). Summary counts use `.eq('tenant_id', tenantId)`. RPC functions accept `p_tenant_id` parameter. However, actual tenant scoping depends on the RPC function implementation which is MISSING (see BUG-1). |
| AC-6 | "Export CSV" button downloads slide data as CSV                                                       | **PASS**             | Export route at `/api/analytics/export/route.ts` returns `Content-Type: text/csv` with `Content-Disposition: attachment`. CSV includes: Slide Name, Status, Use Count, Last Used, In Template Sets. `csvEscape` function properly handles commas, quotes, and newlines (lines 9-17).    |
| AC-7 | Summary card shows: total slides, total projects, exports last 30 days                                | **PASS**             | Three cards rendered in `SummaryCards` component (lines 127-146). Values sourced from `summary.totalSlides`, `summary.totalProjects`, `summary.exportsLast30Days`. Loading skeleton shown during fetch.                                                                                 |
| AC-8 | Data refreshes on page load                                                                           | **PASS**             | `useEffect` with `fetchData` callback fires on mount (lines 427-429). No stale closure issues; `useCallback` with empty deps is appropriate here since it reads auth token fresh each call. Server-side uses `unstable_cache` with 1-hour revalidation.                                 |

---

### Bug Report

#### BUG-1: Missing Database Migration for RPC Functions (BLOCKER)

**Severity:** Blocker
**Priority:** P0
**File:** No migration file exists
**Expected:** PostgreSQL functions `get_slide_analytics(p_tenant_id)` and `get_template_analytics(p_tenant_id)` should be created via a Supabase migration (as specified in the Tech Design section of this spec, line 86-87).
**Actual:** No migration file creates these RPC functions. Searched all 5 migration files in `supabase/migrations/` and found zero matches. The API routes at `src/app/api/analytics/route.ts` (line 68, 71) and `src/app/api/analytics/export/route.ts` (line 44) call `supabase.rpc('get_slide_analytics', ...)` and `supabase.rpc('get_template_analytics', ...)`, which will return errors at runtime since the functions do not exist in the database.
**Impact:** The entire analytics dashboard will fail to load any slide or template data. Summary counts may work (they use direct table queries), but the two tables that are the core of this feature will be empty or show errors.
**Steps to reproduce:**

1. Navigate to `/admin/analytics` as an admin user.
2. The API call to `GET /api/analytics` will execute the RPC calls.
3. The RPC calls will fail because the functions are not defined.
4. The dashboard will either show errors or empty data.

Additionally, the Tech Design specifies a migration to add `projects.template_set_id` FK column, but this column also has no migration. The column appears to work in the projects API (line 127 of `src/app/api/projects/route.ts`), suggesting it was added through some other mechanism, but it is not tracked in version-controlled migrations.

---

#### BUG-2: CSV Download Does Not Handle HTTP Error Responses (MAJOR)

**Severity:** Major
**Priority:** P1
**File:** `src/app/(app)/admin/analytics/page.tsx`, lines 102-118
**Expected:** If the CSV export API returns an error (4xx/5xx), the user should see an error message or toast notification.
**Actual:** The `downloadCSV` function does not check `res.ok` before calling `res.blob()`. If the server returns a JSON error (e.g., `{ "error": "Failed to fetch analytics" }` with status 500), the function will download the JSON error body as a `.csv` file, which the user will open to find garbage data instead of a CSV.
**Code:**

```typescript
// Line 106: No res.ok check before converting to blob
.then((res) => res.blob())
```

**Steps to reproduce:**

1. Trigger a condition where the export endpoint returns a 500 error (e.g., RPC function missing per BUG-1).
2. Click "Export CSV".
3. A file downloads, but it contains the JSON error response, not CSV data.

---

#### BUG-3: No Rate Limiting on Analytics API Endpoints (MAJOR)

**Severity:** Major
**Priority:** P1
**Files:** `src/app/api/analytics/route.ts`, `src/app/api/analytics/export/route.ts`
**Expected:** Per `.claude/rules/security.md` and project conventions, API endpoints should implement rate limiting to prevent abuse.
**Actual:** Neither `GET /api/analytics` nor `GET /api/analytics/export` calls `checkRateLimit()`. Other endpoints in the codebase consistently use `checkRateLimit` (e.g., `src/app/api/projects/route.ts` line 49, `src/app/api/projects/[id]/export/route.ts` line 42). The analytics endpoints perform expensive aggregation queries and RPC calls. Without rate limiting, an authenticated admin could repeatedly hit these endpoints to cause excessive database load.
**Steps to reproduce:**

1. As an admin, send rapid repeated requests to `GET /api/analytics` or `GET /api/analytics/export`.
2. No rate limiting is applied; all requests are processed.

---

#### BUG-4: Feature Status Mismatch in INDEX.md (MINOR)

**Severity:** Minor
**Priority:** P2
**File:** `features/INDEX.md`, line 54
**Expected:** Since the feature code is implemented (page, API routes, translations all exist), the status should be "In Review" to reflect QA testing.
**Actual:** The status in `features/INDEX.md` is still "Planned". The spec file header (line 2) also says "Planned".
**Steps to reproduce:** Open `features/INDEX.md` and observe PROJ-40 row shows "Planned".

---

#### BUG-5: Admin Layout Guard is Client-Side Only (MINOR)

**Severity:** Minor
**Priority:** P2
**File:** `src/app/(app)/admin/layout.tsx`
**Expected:** The admin layout should prevent unauthorized users from ever seeing admin content.
**Actual:** The admin layout guard (`src/app/(app)/admin/layout.tsx`) is a client-side `'use client'` component that checks `isAdmin` from a React hook and redirects via `router.replace('/home')`. Before the redirect completes, a non-admin user will briefly see the loading skeleton (lines 23-29), and the redirect is a soft navigation that can be intercepted. However, the API endpoints are properly protected server-side via `requireAdmin()`, so no data is leaked -- this is purely a cosmetic flash. The API-level protection is the real security boundary and is correctly implemented.

---

#### BUG-6: Tooltip Wrapping Without TooltipProvider at Table Level (MINOR)

**Severity:** Minor
**Priority:** P3
**File:** `src/app/(app)/admin/analytics/page.tsx`, lines 276-286, 363-375
**Expected:** Tooltips should function correctly within both the Slides and Template Sets tables.
**Actual:** The `TooltipProvider` is correctly placed at the page root level (line 436), which wraps both tables. This is functional. However, each tooltip uses `asChild` on the trigger with a `<span>`, and the `TooltipContent` uses `side="left"`. On narrow viewports (375px mobile), the tooltip may overflow the viewport since there is no responsive positioning or collision boundary set. This is a minor UX issue on mobile.

---

### Edge Case Results

| Edge Case              | Result            | Notes                                                                                                                                                                                                                                                                                              |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slide with 0 uses      | **PASS**          | `use_count` renders as `0` (line 272). `last_used_at` null renders "Never" via `formatDate` (lines 74-76) and translation key `admin.analytics_never` (line 287).                                                                                                                                  |
| No template sets       | **PASS**          | Empty state rendered with icon and message when `templateSets.length === 0` (lines 333-340). Translation key: `admin.analytics_no_template_sets`.                                                                                                                                                  |
| Deleted slide          | **CANNOT VERIFY** | Depends on RPC function `get_slide_analytics` implementation which is missing (BUG-1). The spec says deleted slides should show "(deleted)" but there is no client-side code to display "(deleted)" -- the `title` field is rendered as-is (line 265). The RPC function would need to handle this. |
| CSV special characters | **PASS**          | `csvEscape` function (lines 9-17 of export route) properly wraps values containing commas, quotes, or newlines in double quotes and escapes internal quotes by doubling them (`""`).                                                                                                               |

---

### Security Audit

| Check                                        | Result       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Admin-only access on `/api/analytics`        | **PASS**     | Uses `requireAdmin(request)` at line 100. Checks: valid Bearer token, profile exists, `is_active` is true, `role === 'admin'`. Returns 401/403/404 on failure.                                                                                                                                                                                                                                                                                                                     |
| Admin-only access on `/api/analytics/export` | **PASS**     | Uses `requireAdmin(request)` at line 36. Same checks as above.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Tenant isolation on `/api/analytics`         | **PASS**     | All queries filter by `profile.tenant_id`: slides count (line 51), projects count (line 57), activity_logs (line 64), RPC calls pass `p_tenant_id` (lines 68, 71). No cross-tenant data leakage possible at the API level.                                                                                                                                                                                                                                                         |
| Tenant isolation on `/api/analytics/export`  | **PASS**     | RPC call passes `profile.tenant_id` (line 45). Tenant ID derived from the authenticated user's profile, not from user input.                                                                                                                                                                                                                                                                                                                                                       |
| SQL injection via query parameters           | **PASS**     | No user-supplied query parameters are used. The `tenant_id` comes from the server-side profile lookup, not from the request. Supabase client uses parameterized queries.                                                                                                                                                                                                                                                                                                           |
| IDOR (Insecure Direct Object Reference)      | **PASS**     | No object IDs are accepted from the user. All data is scoped to the admin's own tenant.                                                                                                                                                                                                                                                                                                                                                                                            |
| Service role key exposure                    | **PASS**     | `createServiceClient()` reads `SUPABASE_SERVICE_ROLE_KEY` from server-side env vars (not `NEXT_PUBLIC_`). The key is never sent to the client.                                                                                                                                                                                                                                                                                                                                     |
| Sensitive data in response                   | **PASS**     | The analytics API returns only aggregated metrics (counts, dates). No PII, no user IDs, no project contents are exposed.                                                                                                                                                                                                                                                                                                                                                           |
| Cache poisoning                              | **LOW RISK** | `unstable_cache` is keyed by `analytics-${tenantId}` (line 88). Since `tenantId` is a UUID from the authenticated user's profile, cache collisions between tenants are not possible. However, all admins in the same tenant share the same cached data, which is the intended behavior.                                                                                                                                                                                            |
| CSV injection                                | **LOW RISK** | The `csvEscape` function does not sanitize formula injection characters (`=`, `+`, `-`, `@`). If a slide name starts with `=` (e.g., `=CMD("calc")`), opening the CSV in Excel could execute a formula. This is a low-severity risk because: (a) slide names are controlled by admins who are trusted users, and (b) the CSV is downloaded by the same admin. However, defense-in-depth would suggest prepending a single quote or tab to values starting with formula characters. |
| Rate limiting                                | **FAIL**     | See BUG-3. Neither analytics endpoint implements rate limiting.                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

### Cross-Browser & Responsive Check (Code Review)

| Viewport         | Result               | Notes                                                                                                                                                                                |
| ---------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1440px (Desktop) | **PASS**             | Summary cards use `grid-cols-3` on `sm:` breakpoint (line 149). Tables have fixed column widths. Layout is clean.                                                                    |
| 768px (Tablet)   | **PASS**             | Summary cards stack to single column below `sm` breakpoint. Tables scroll horizontally within their `rounded-lg border` container. Tabs remain functional.                           |
| 375px (Mobile)   | **PASS with caveat** | Layout is functional. Cards stack. Tables may require horizontal scrolling. See BUG-6 regarding tooltip overflow on narrow viewports.                                                |
| Chrome           | **PASS**             | Standard React/Next.js rendering. No browser-specific APIs used.                                                                                                                     |
| Firefox          | **PASS**             | No Chrome-specific CSS or JS. `tabular-nums` font feature is widely supported.                                                                                                       |
| Safari           | **PASS**             | No known compatibility issues. `URL.createObjectURL` and `URL.revokeObjectURL` used in CSV download are supported. `toLocaleString`/`toLocaleDateString` with options are supported. |

---

### Regression Check

| Feature                            | Regression Risk                                    | Result                                                                                                 |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| PROJ-3 (User Roles & Permissions)  | Uses `requireAdmin` from shared auth-helpers       | **PASS** -- no modifications to `requireAdmin`.                                                        |
| PROJ-15 (Slide Library Management) | Reads from `slides` table                          | **PASS** -- read-only queries; no writes to slides.                                                    |
| PROJ-22 (Template Set Management)  | Reads from `template_sets` / `template_set_slides` | **PASS** -- read-only RPC calls.                                                                       |
| PROJ-24 (Project Creation)         | `template_set_id` column on projects               | **PASS** -- projects route already saves `template_set_id` (line 127). Analytics only reads this data. |
| PROJ-33 (PowerPoint Export)        | `activity_logs` with `project.exported` event      | **PASS** -- analytics reads export events; does not modify the export flow.                            |
| PROJ-39 (Activity Log)             | Both features query `activity_logs`                | **PASS** -- read-only; no conflict.                                                                    |

---

### Summary

**Overall Verdict: FAIL**

The feature cannot pass QA due to **1 Blocker** bug:

- **BUG-1 (Blocker):** The PostgreSQL RPC functions `get_slide_analytics` and `get_template_analytics` do not exist in any migration file. The analytics dashboard will fail to load slide and template data at runtime. A new migration must be created to define these functions before the feature can be deployed.

Additional issues to address before deployment:

- **BUG-2 (Major):** CSV download silently saves error responses as files instead of showing an error.
- **BUG-3 (Major):** No rate limiting on analytics endpoints.
- **BUG-4 (Minor):** Feature status in INDEX.md still says "Planned".
- **BUG-5 (Minor):** Admin layout guard is client-side only (cosmetic; API security is correct).
- **BUG-6 (Minor):** Tooltip overflow on narrow mobile viewports.

**Next step:** Run `/backend` to create the missing database migration with the two RPC functions and fix BUG-1, BUG-2, and BUG-3.

## Deployment

_To be added by /deploy_

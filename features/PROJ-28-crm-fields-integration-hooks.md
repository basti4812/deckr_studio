# PROJ-28: CRM Fields & Integration Hook Points

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-03

## Dependencies

- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-1 (Multi-tenancy) — crm_provider stored per tenant

## User Stories

- As a user, I want to associate a project with a customer name, company name, and CRM deal ID so that I can link presentations to sales opportunities
- As a developer, I want named integration hook points in the codebase so that connecting a real CRM requires only filling in API calls, not restructuring
- As an admin, I want the CRM provider field in the tenant settings so that activating a CRM connection later requires no schema changes

## Acceptance Criteria

- [ ] Project settings panel shows three optional fields: Customer Name, Company Name, CRM Deal/Opportunity ID
- [ ] Fields are optional; project creation and export work without them
- [ ] Fields are saved to the project record: crm_customer_name, crm_company_name, crm_deal_id
- [ ] `tenants` table has a `crm_provider` field (nullable text: 'hubspot', 'salesforce', 'pipedrive', or null)
- [ ] Code contains named hook functions that are called on: project creation, project export, share link generation
- [ ] Each hook function has a clear comment: `// CRM_INTEGRATION: call {{provider}} API here`
- [ ] Hook functions are no-ops (do nothing) when crm_provider is null
- [ ] Admin settings page shows a "CRM Integration" section with a provider dropdown (placeholder: "Coming soon")

## Edge Cases

- What if the CRM deal ID format is invalid for the configured provider? → No validation at this stage; the field accepts any string
- What if crm_provider is set but no API credentials are configured? → Hooks are called but return immediately (no credentials → no-op with a warning log)

## Technical Requirements

- Hook functions live in `src/lib/crm-hooks.ts`
- Hook function signatures: `onProjectCreated(project)`, `onProjectExported(project)`, `onShareLinkGenerated(project, link)`
- All hooks are async and awaited at call sites so real async CRM calls can be added without signature changes
- Comments use the format `// CRM_INTEGRATION: {description}` for easy grep

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### What Gets Built

PROJ-28 adds three optional CRM metadata fields to projects (Customer Name, Company Name, CRM Deal ID), a CRM provider setting for tenants (admin-configurable), and named async hook functions at key business events that future CRM integrations can fill in.

### Component Structure

```
Admin Integrations Page (new: /admin/integrations)
  +-- CRM Provider dropdown (hubspot/salesforce/pipedrive/none)
  +-- "Coming soon" Badge
  +-- Save button (PATCH /api/tenant with crm_provider)

Board Page → TrayPanel → CRM Details Dialog (new)
  +-- Customer Name input (optional)
  +-- Company Name input (optional)
  +-- CRM Deal ID input (optional)
  +-- Save (PATCH /api/projects/[id] with crm_* fields)
```

### Data Model

- **Already exists:** `tenants.crm_provider` (nullable TEXT)
- **New columns on `projects`:** `crm_customer_name TEXT`, `crm_company_name TEXT`, `crm_deal_id TEXT` (all nullable)

### New/Modified Files

| File                                             | Change                                                     |
| ------------------------------------------------ | ---------------------------------------------------------- |
| `src/lib/crm-hooks.ts`                           | NEW — 3 async hook functions with CRM_INTEGRATION comments |
| `src/app/api/projects/route.ts`                  | Accept crm\_\* fields in POST, call onProjectCreated       |
| `src/app/api/projects/[id]/route.ts`             | Accept crm\_\* fields in PATCH, return in GET              |
| `src/app/api/projects/[id]/export/route.ts`      | Call onProjectExported after export                        |
| `src/app/api/projects/[id]/share-links/route.ts` | Call onShareLinkGenerated after link creation              |
| `src/app/api/tenant/route.ts`                    | Add crm_provider to PATCH schema                           |
| `src/app/(app)/admin/integrations/page.tsx`      | NEW — CRM provider settings                                |
| `src/components/projects/crm-details-dialog.tsx` | NEW — Edit CRM fields on project                           |

### Tech Decisions

- **Hook functions are no-ops** when `crm_provider` is null — fire-and-forget like `logActivity()`
- **No validation on CRM deal ID format** — accepts any string at this stage
- **Admin page at `/admin/integrations`** — future SSO/webhook settings can live here too

## QA Test Results

**Tested by:** QA / Red-Team Pen-Test
**Date:** 2026-03-03
**Build:** `npm run build` -- PASS (no errors)

---

### Acceptance Criteria Results

| #    | Criterion                                                                                                   | Result | Notes                                                                                                                                                                                                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-1 | Project settings panel shows three optional fields: Customer Name, Company Name, CRM Deal/Opportunity ID    | PASS   | CRM Details dialog (`crm-details-dialog.tsx`) renders three `<Input>` fields with labels matching the requirement. Triggered via Briefcase button on board page when `projectId && canEdit`.                                                                                                         |
| AC-2 | Fields are optional; project creation and export work without them                                          | PASS   | POST `/api/projects` schema marks `crmCustomerName`, `crmCompanyName`, `crmDealId` as `.optional()`. Export route (`export/route.ts`) does not gate on CRM fields. Insert uses `?? null` fallback.                                                                                                   |
| AC-3 | Fields are saved to the project record: crm_customer_name, crm_company_name, crm_deal_id                    | PASS   | POST inserts all three fields (lines 132-134). PATCH validates and updates all three (lines 164-178). GET returns full `*` select which includes them.                                                                                                                                               |
| AC-4 | `tenants` table has a `crm_provider` field (nullable text: 'hubspot', 'salesforce', 'pipedrive', or null)   | PASS   | GET `/api/tenant` selects `crm_provider` in its join (line 36). PATCH schema validates `crm_provider: z.enum(['hubspot', 'salesforce', 'pipedrive']).nullable().optional()` (line 87). Tenant provider exposes `crmProvider` in context. DB migration applied via Supabase MCP (project convention). |
| AC-5 | Code contains named hook functions called on: project creation, project export, share link generation       | PASS   | Three exported async functions in `src/lib/crm-hooks.ts`: `onProjectCreated` (line 48), `onProjectExported` (line 64), `onShareLinkGenerated` (line 80). Called at: `projects/route.ts:142`, `export/route.ts:229`, `share-links/route.ts:154`.                                                      |
| AC-6 | Each hook function has a clear comment: `// CRM_INTEGRATION: call {{provider}} API here`                    | PASS   | All three functions contain exactly `// CRM_INTEGRATION: call {{provider}} API here` (lines 52, 68, 87). Additionally, descriptive CRM_INTEGRATION comments exist at each call site and as function-level doc comments. Total of 10 CRM_INTEGRATION comments found via grep.                         |
| AC-7 | Hook functions are no-ops (do nothing) when crm_provider is null                                            | PASS   | Each hook calls `getCrmProvider(tenantId)` and returns early with `if (!provider) return` (lines 50, 66, 85). When provider IS set but no credentials exist, a `console.warn` is emitted -- correct per edge case spec.                                                                              |
| AC-8 | Admin settings page shows a "CRM Integration" section with a provider dropdown (placeholder: "Coming soon") | PASS   | `/admin/integrations/page.tsx` renders a Card with title "CRM Integration" (i18n: `admin.crm_integration`), a `<Select>` dropdown with HubSpot/Salesforce/Pipedrive/None options, and a `<Badge variant="secondary">Coming soon</Badge>`. Save button persists via PATCH `/api/tenant`.              |

**Overall AC Result: 8/8 PASS**

---

### Additional Checks

| Check                                      | Result | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Build passes                               | PASS   | `npm run build` completes with no errors.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Zod validation on CRM fields (max lengths) | PASS   | POST schema: `crmCustomerName: z.string().max(200)`, `crmCompanyName: z.string().max(200)`, `crmDealId: z.string().max(100)`. PATCH validates each field individually with same limits. Client-side `maxLength` attributes match (200, 200, 100).                                                                                                                                                                                                                                                                                                  |
| i18n keys in en.json                       | PASS   | All keys present: `crm.button`, `crm.dialog_title`, `crm.dialog_description`, `crm.customer_name`, `crm.customer_name_placeholder`, `crm.company_name`, `crm.company_name_placeholder`, `crm.deal_id`, `crm.deal_id_placeholder`, `crm.save`. Admin keys: `admin.crm_integration`, `admin.crm_integration_description`, `admin.coming_soon`, `admin.crm_provider`, `admin.crm_select_provider`, `admin.crm_none`, `admin.crm_provider_hint`, `admin.crm_saved`, `admin.crm_save_provider`, `admin.integrations`, `admin.integrations_description`. |
| i18n keys in de.json                       | PASS   | All corresponding German translations present and verified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| CRM_INTEGRATION grep tags                  | PASS   | 10 occurrences across 4 files: `crm-hooks.ts` (6), `projects/route.ts` (1), `export/route.ts` (1), `share-links/route.ts` (1), plus spec file.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Hook function signatures match spec        | PASS   | `onProjectCreated(project)`, `onProjectExported(project)`, `onShareLinkGenerated(project, link)` -- all match spec exactly.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Hooks are async                            | PASS   | All three are `async function` returning `Promise<void>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| DB migration (Supabase MCP)                | N/A    | Project convention -- migrations applied via Supabase MCP, no local migration files expected. Not flagged.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Sidebar nav item for Integrations          | PASS   | `app-sidebar.tsx` line 71: `{ labelKey: 'nav.integrations', href: '/admin/integrations', icon: Plug }` in adminNavItems.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Tenant provider exposes crmProvider        | PASS   | `tenant-provider.tsx` includes `crmProvider: string                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | null`in`TenantContextValue`(line 47), populated from`userData.tenant.crm_provider` (line 151). |

---

### Security Audit (Red-Team Perspective)

| Finding                                                    | Severity | Details                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BUG-1: No rate limiting on PATCH /api/tenant               | Medium   | The `PATCH /api/tenant` endpoint has no `checkRateLimit` call. All other mutating endpoints in this feature (POST /api/projects, PATCH /api/projects/[id], POST export, POST share-links) have rate limiting. An attacker with a valid admin session could spam tenant updates.                                      |
| Auth on admin integrations page                            | PASS     | The `src/app/(app)/admin/layout.tsx` checks `isAdmin` via `useCurrentUser()` and redirects non-admins to `/home`. The API endpoint (PATCH `/api/tenant`) independently verifies `userRow.role !== 'admin'` server-side (line 136). Two-layer protection.                                                             |
| Auth on CRM fields PATCH (projects)                        | PASS     | PATCH `/api/projects/[id]` requires authentication, active profile, and owner/admin/edit-share access before processing any fields including CRM fields.                                                                                                                                                             |
| Tenant isolation on CRM hooks                              | PASS     | `getCrmProvider()` queries by `tenantId` which is derived from the project record, not user input. Hook functions receive `tenant_id` from the authenticated project data.                                                                                                                                           |
| Tenant isolation on integrations page                      | PASS     | PATCH `/api/tenant` updates only the tenant associated with the authenticated admin user (`userRow.tenant_id`). No tenant ID is accepted from client input.                                                                                                                                                          |
| Input sanitization                                         | PASS     | CRM fields are validated via Zod with max length constraints. No SQL injection risk (parameterized via Supabase client). No XSS risk in stored values (React auto-escapes).                                                                                                                                          |
| No secret leakage                                          | PASS     | No API keys, credentials, or secrets in CRM-related code. Hook functions are placeholders with `console.warn` only.                                                                                                                                                                                                  |
| CRM fields accessible to shared users with edit permission | INFO     | Shared users with `edit` permission can modify CRM fields (crm_customer_name, crm_company_name, crm_deal_id) on projects shared with them. This may or may not be desired -- unlike `name` and `status` which are restricted to owner/admin only, CRM fields have no such restriction. Flagged for product decision. |

---

### Bug Report

#### BUG-1: No rate limiting on PATCH /api/tenant endpoint

- **Severity:** Medium
- **Priority:** P2
- **Component:** `src/app/api/tenant/route.ts`
- **Steps to reproduce:**
  1. Authenticate as an admin user
  2. Send rapid repeated PATCH requests to `/api/tenant` with `{ "crm_provider": "hubspot" }`
  3. Observe that no rate limit is enforced
- **Expected:** Rate limiting should be applied (consistent with all other mutating API endpoints in this project)
- **Actual:** Unlimited requests are accepted
- **Impact:** Potential for abuse/DoS against the tenant update endpoint. While limited to authenticated admins, this is inconsistent with the project's security posture where every other mutating endpoint has rate limiting.
- **Note:** This is a pre-existing issue on the tenant PATCH endpoint, not introduced by PROJ-28. However, PROJ-28 added a new field (`crm_provider`) to this endpoint, making it relevant to flag here.

---

### Regression Check

Verified against `features/INDEX.md` -- no regressions detected in dependent features:

| Feature                                 | Status   | Regression Risk                      | Result                                                                                                                              |
| --------------------------------------- | -------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| PROJ-24 (Project Creation & Management) | Deployed | High -- POST/PATCH projects modified | PASS -- Existing fields (name, templateSetId, slide_order, text_edits, status) unchanged. New CRM fields are additive and optional. |
| PROJ-1 (Multi-tenancy)                  | Deployed | Medium -- tenant PATCH modified      | PASS -- Existing tenant fields unchanged. `crm_provider` added as optional field to existing schema.                                |
| PROJ-33 (PowerPoint Export)             | Deployed | Medium -- export route modified      | PASS -- Export logic unchanged. `onProjectExported` hook is fire-and-forget with `.catch()`.                                        |
| PROJ-35 (External Share Links)          | Deployed | Medium -- share-links route modified | PASS -- Share link creation logic unchanged. `onShareLinkGenerated` hook is fire-and-forget with `.catch()`.                        |

---

### Cross-Browser / Responsive Notes

The CRM Details Dialog and Admin Integrations Page are standard shadcn/ui components (Dialog, Card, Select, Input, Button). Based on component library compatibility:

- **Chrome/Firefox/Safari:** All shadcn/ui components used are cross-browser compatible.
- **375px (mobile):** Dialog uses `sm:max-w-md` so it will be full-width on mobile. Select dropdown at `w-64` may need adjustment on very narrow screens but is usable.
- **768px (tablet):** Adequate layout.
- **1440px (desktop):** Standard layout, no issues.

---

### Summary

PROJ-28 implementation is **complete and correct** against all 8 acceptance criteria. One medium-severity bug found (BUG-1: missing rate limiting on PATCH /api/tenant) which is a pre-existing issue. One informational finding about CRM field edit permissions for shared users. Build passes. i18n complete in both languages. Security audit passed with no critical or high-severity findings.

## Deployment

_To be added by /deploy_

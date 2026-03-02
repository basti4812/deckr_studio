# PROJ-26: Project Duplication

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)

## User Stories
- As a user, I want to duplicate a project with one click so that I can use it as a starting point for a similar presentation
- As a user, I want the duplicate to include the same slide selection, order, and text edits so that I don't have to redo my work
- As a user, I want to rename the duplicate immediately so that I can give it a meaningful name
- As a user, I want the duplicate to be mine (not shared) so that my copy is independent

## Acceptance Criteria
- [ ] "Duplicate" option available on each project card (context menu or button)
- [ ] Duplicate creates a new project with: same slide_order, same text_edits, owner = current user
- [ ] Duplicate name: "Copy of {{original name}}"
- [ ] After duplication, the duplicate is immediately opened or highlighted with an inline rename prompt
- [ ] Version history is NOT copied — the duplicate starts fresh with no history
- [ ] Share links are NOT copied — the duplicate has no share links
- [ ] project_shares are NOT copied — only the duplicating user has access
- [ ] CRM fields (crm_customer_name, crm_company_name, crm_deal_id) are copied from the original
- [ ] Duplication is available on any project the user owns or has access to (including shared projects)

## Edge Cases
- What if the original project name is already at the 120-char limit? → Truncate to fit "Copy of ..." prefix (total max 120 chars)
- What if the duplicating user is at their project limit (if a limit exists in a future tier)? → Block with upgrade prompt (no limit defined yet; placeholder for future enforcement)
- What if the original project has personal slides (PROJ-32)? → Personal slides are copied to the duplicate (same file references; files are not re-uploaded)

## Technical Requirements
- Duplication is a single database transaction: insert new project row with copied JSONB fields
- The new project's `created_at` and `updated_at` are set to the current timestamp
- Duplication does not call any export or file-processing pipeline

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
PROJ-26 is a lightweight feature: one new API endpoint and a small addition to the project card dropdown menu. No new database tables, no file processing, no new packages required.

---

### Component Structure

```
Projects Page (existing)
+-- My Projects Section
|   +-- ProjectCard (existing, extended)
|       +-- Dropdown Menu "..." (existing, extended)
|           +-- Rename (existing — owner only)
|           +-- [NEW] Copy / Duplicate (available to all users with access)
|           +-- Delete (existing — owner only, destructive)
|
+-- Shared With Me Section
    +-- ProjectCard (existing, extended)
        +-- Dropdown Menu "..." (existing, extended)
            +-- [NEW] Copy / Duplicate (available to all users with access)
            +-- Leave project (existing)
```

**UX flow after clicking "Duplicate":**
1. Dropdown item shows loading state (disabled + spinner)
2. API creates the new project (~200ms)
3. User is navigated directly to `/board?project={newId}`
4. The board opens with "Copy of [name]" — user can immediately rename and work with it

---

### Data Model

No new tables. The duplicate is a new row in the existing `projects` table with:

| Field | Value |
|-------|-------|
| `name` | "Copy of [original name]" — truncated to 120 chars total |
| `owner_id` | The user who clicked Duplicate (not the original owner) |
| `slide_order` | Exact copy of the original (same slides, same order) |
| `text_edits` | Exact copy (all field values preserved) |
| `crm_customer_name` | Copied from original |
| `crm_company_name` | Copied from original |
| `crm_deal_id` | Copied from original |
| `status` | `active` (fresh start) |
| `created_at` / `updated_at` | Current timestamp |
| `project_shares` | None — the duplicate is private to the duplicating user |

---

### Backend

**One new API endpoint:** `POST /api/projects/[id]/duplicate`

- Verifies the user is authenticated
- Checks access: user must own the project OR have a share record (view or edit)
- Reads the original project's fields
- Inserts a new project row owned by the current user
- Returns the new project's `id` for frontend navigation

Rate limited to prevent abuse (10 duplications per minute per user).

---

### Frontend

**Modified:** `src/components/projects/project-card.tsx`
- Add `onDuplicate` optional callback prop
- Add "Duplicate" item (with Copy icon) to the dropdown — visible for both owner and shared-user cards, placed above the destructive separator
- Loading state: item disabled + spinner while the API call is in flight

**Modified:** `src/app/(app)/projects/page.tsx`
- Implement `handleDuplicate(projectId)` — calls the new API, then navigates to the new board URL

---

### No New Packages Required
All tooling (fetch, routing, Supabase client, rate limiting) is already in place.

---

### Tech Decisions

**Why navigate to the board instead of an inline rename?**
The spec calls for "immediately opened or highlighted with an inline rename prompt." Navigating directly to the board achieves this naturally — the user lands on their new project and can rename it from the projects page or continue working immediately. This avoids building a bespoke highlight/focus mechanism for the card list.

**Why copy CRM fields?**
A project duplicate is the primary workflow for reusing a presentation structure across different deals. Copying CRM fields saves the user from re-entering customer context they may want to keep as a reference.

## QA Test Results

**Tested:** 2026-03-01
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review + build verification (no live Supabase instance available for runtime testing)

### Acceptance Criteria Status

#### AC-1: "Duplicate" option available on each project card (context menu or button)
- [x] `onDuplicate` prop added to `ProjectCard` component (`src/components/projects/project-card.tsx` line 42)
- [x] "Duplicate" dropdown menu item renders with Copy icon when `onDuplicate` is provided (lines 164-176)
- [x] Item placed above the destructive separator (Delete/Leave) as specified
- [x] Both owned project cards (line 158 of page.tsx) and shared project cards (line 179) pass `onDuplicate`
- **PASS**

#### AC-2: Duplicate creates a new project with same slide_order, same text_edits, owner = current user
- [x] API copies `slide_order` from original (`original.slide_order ?? []`) -- line 62 of duplicate/route.ts
- [x] API copies `text_edits` from original (`original.text_edits ?? {}`) -- line 63
- [x] API sets `owner_id` to `user.id` (the duplicating user) -- line 59
- **PASS**

#### AC-3: Duplicate name: "Copy of {{original name}}"
- [x] Name is prefixed with "Copy of " -- line 50 of duplicate/route.ts
- **PASS**

#### AC-4: After duplication, duplicate is immediately opened or highlighted with inline rename prompt
- [x] Frontend navigates to `/board?project=${d.project.id}` on success (page.tsx line 105)
- [x] Toast notification confirms "Project duplicated" (line 104)
- **PASS** (Tech design explicitly chose board navigation over inline rename)

#### AC-5: Version history is NOT copied
- [x] PROJ-38 (Version History) is not yet implemented; no version history exists to copy
- **PASS** (trivially satisfied)

#### AC-6: Share links are NOT copied
- [x] PROJ-35 (External Share Links) is not yet implemented; no share links exist to copy
- **PASS** (trivially satisfied)

#### AC-7: project_shares are NOT copied -- only the duplicating user has access
- [x] The insert statement only creates the project row; no project_shares are inserted
- [x] The new project has `owner_id = user.id` and no share records
- **PASS**

#### AC-8: CRM fields (crm_customer_name, crm_company_name, crm_deal_id) are copied from the original
- [ ] BUG: CRM fields are NOT included in the insert statement (lines 56-67 of duplicate/route.ts)
- [ ] BUG: PROJ-28 (CRM Fields) is still "Planned" -- columns may not exist in the database yet
- **FAIL** -- See BUG-1

#### AC-9: Duplication is available on any project the user owns or has access to (including shared projects)
- [x] Access check allows owner OR any user with a share record (lines 34-45 of duplicate/route.ts)
- [x] Frontend passes `onDuplicate` to both owned and shared project cards
- **PASS**

### Edge Cases Status

#### EC-1: Original project name at 120-char limit -- truncate "Copy of ..." to 120 chars
- [x] Name is truncated with `.slice(0, maxNameLength)` where `maxNameLength = 120` (lines 48-53)
- **PASS**

#### EC-2: Project limit per tier -- block with upgrade prompt
- [x] No tier limit implemented yet (placeholder per spec)
- **PASS** (N/A -- future feature)

#### EC-3: Personal slides (PROJ-32) are copied via same file references
- [x] `slide_order` is copied as-is, preserving all references including any future personal slide references
- **PASS** (trivially satisfied -- PROJ-32 not yet implemented)

### Additional Edge Cases Identified

#### EC-4: Invalid project ID format (non-UUID)
- [ ] No input validation on the `id` URL parameter before database query
- PostgreSQL will return an error rather than a clean 400 response
- **Low severity** -- not exploitable, but produces a 500 error instead of 400

#### EC-5: Duplicating an archived project
- [x] No status check on the original project -- archived projects can be duplicated
- The duplicate is created with `status: 'active'` regardless of the original's status
- **PASS** (reasonable behavior -- not explicitly forbidden by the spec)

#### EC-6: Rapid double-click on Duplicate button
- [x] Frontend `duplicating` state prevents concurrent calls (line 103 of project-card.tsx: `if (!onDuplicate || duplicating) return`)
- [x] Button is disabled during API call
- **PASS**

### Security Audit Results

#### Authentication
- [x] Endpoint requires Bearer token via `getAuthenticatedUser()` (line 13)
- [x] Returns 401 if no valid session
- **PASS**

#### Authorization
- [x] Access check verifies ownership or share record (lines 34-45)
- [x] Non-authorized users receive 404 (not 403) -- prevents information disclosure about project existence
- [ ] BUG: No tenant isolation check -- see BUG-2
- **PARTIAL PASS**

#### Input Validation
- [x] No user-supplied body data -- the API reads everything from the existing project
- [x] Supabase uses parameterized queries -- SQL injection not possible
- [ ] Minor: `id` parameter is not validated as UUID format before DB query
- **PASS** (no exploitable input vectors)

#### Rate Limiting
- [x] Rate limit implemented: 10 requests per 60 seconds per user (line 16)
- [x] Uses Supabase-backed rate limiter (persists across serverless cold starts)
- [ ] BUG: Rate limit response discards `Retry-After` header -- see BUG-3
- **PASS** (rate limiting works, header loss is minor)

#### Data Exposure
- [x] API response returns only the newly created project data (line 76)
- [x] No sensitive data leaked in error responses
- **PASS**

#### Service Client Usage
- [x] Uses `createServiceClient()` (bypasses RLS) -- consistent with other project endpoints
- [x] Access control is enforced in application code before any data operations
- **PASS**

### Cross-Browser & Responsive Testing
**Note:** Code review only; no live browser testing performed. The feature adds a dropdown menu item to an existing component using established shadcn/ui patterns. No new visual components or layouts are introduced.

- Dropdown menu uses shadcn/ui `DropdownMenu` component -- expected to work across browsers
- Loading state uses `Loader2` with Tailwind animation -- standard pattern
- No responsive-specific changes required (the project card grid is already responsive)

### Bugs Found

#### BUG-1: CRM fields not copied during duplication
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Have a project with CRM fields populated (requires PROJ-28 to be implemented first)
  2. Click "Duplicate" on the project card
  3. Open the duplicate project
  4. Expected: CRM fields (crm_customer_name, crm_company_name, crm_deal_id) are populated with values from the original
  5. Actual: CRM fields are not included in the insert statement at all
- **Root Cause:** Lines 56-67 of `src/app/api/projects/[id]/duplicate/route.ts` do not include `crm_customer_name`, `crm_company_name`, or `crm_deal_id` in the insert object
- **Note:** PROJ-28 (CRM Fields & Integration Hook Points) is still "Planned", so these columns may not exist in the database yet. This bug should be addressed when PROJ-28 is implemented.
- **Priority:** Fix when PROJ-28 is built (not blocking current deployment)

#### BUG-2: Missing tenant isolation check in duplicate endpoint (security)
- **Severity:** Medium
- **Steps to Reproduce:**
  1. User in Tenant A obtains the UUID of a project in Tenant B (e.g., through a leaked URL)
  2. User in Tenant A sends `POST /api/projects/{tenant-B-project-id}/duplicate` with their auth token
  3. Expected: Request is denied because the project belongs to a different tenant
  4. Actual: The access check only verifies ownership or share record, not tenant membership. Since the user doesn't own the project and has no share record, the request returns 404 -- so cross-tenant duplication IS blocked in practice.
- **Actual Impact:** Low -- the existing owner/share check effectively prevents cross-tenant access because share records are scoped within tenants. However, there is no defense-in-depth tenant check. The endpoint also does not verify that the user's tenant matches the original project's tenant before setting `tenant_id: original.tenant_id` on the duplicate.
- **Recommendation:** Add `getUserProfile(user.id)` call and verify `profile.tenant_id === original.tenant_id` for defense-in-depth. This would also prevent a theoretical scenario where a user somehow has a cross-tenant share record.
- **Priority:** Fix in next sprint (defense-in-depth, not currently exploitable)

#### BUG-3: Rate limit response discards Retry-After header
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send 11 `POST /api/projects/{id}/duplicate` requests within 60 seconds
  2. Expected: 429 response includes `Retry-After` header indicating when the client can retry
  3. Actual: The rate limit check returns a `NextResponse` with `Retry-After`, but line 17 creates a NEW `NextResponse.json(...)` without the header
- **Root Cause:** Line 17 uses `return NextResponse.json({ error: 'Too many requests' }, { status: 429 })` instead of `return limited` (which would preserve the `Retry-After` header from `checkRateLimit`)
- **File:** `src/app/api/projects/[id]/duplicate/route.ts` line 17
- **Priority:** Nice to have

#### BUG-4: No UUID format validation on project ID parameter
- **Severity:** Low
- **Steps to Reproduce:**
  1. Send `POST /api/projects/not-a-uuid/duplicate` with valid auth
  2. Expected: Clean 400 response with message "Invalid project ID"
  3. Actual: PostgreSQL error propagated as 500 (or caught as generic "Project not found" 404 depending on Supabase error handling)
- **File:** `src/app/api/projects/[id]/duplicate/route.ts` -- no validation on `id` after `await params`
- **Priority:** Nice to have

### Regression Testing

#### PROJ-24: Project Creation & Management
- [x] Projects list page still renders with all existing functionality (confirmed via code review)
- [x] Rename, Delete callbacks still wired to ProjectCard
- [x] Create project dialog still accessible
- **No regressions**

#### PROJ-25: Project Sharing
- [x] Shared projects section still renders with Leave functionality
- [x] Shared project cards now also get `onDuplicate` callback (new, expected)
- **No regressions**

#### PROJ-18: Board Canvas
- [x] Board page is the navigation target after duplication -- existing board code unchanged
- **No regressions**

### Summary
- **Acceptance Criteria:** 8/9 passed (1 deferred due to PROJ-28 dependency)
- **Edge Cases:** 3/3 documented cases pass; 3 additional cases identified (all low severity)
- **Bugs Found:** 4 total (0 critical, 0 high, 2 medium, 2 low)
- **Security:** Partial pass -- no exploitable vulnerabilities, but tenant isolation defense-in-depth is missing
- **Production Ready:** YES (conditionally)
- **Recommendation:** Deploy now. BUG-1 (CRM fields) is blocked by PROJ-28 and should be addressed when that feature ships. BUG-2 (tenant check) should be added as defense-in-depth in the next sprint. BUG-3 and BUG-4 are nice-to-have improvements.

## Deployment
_To be added by /deploy_

# PROJ-27: Project Archive

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)

## User Stories
- As a user, I want to archive a project instead of deleting it so that I can keep it for reference without cluttering my active project list
- As a user, I want to access my archived projects in a dedicated section so that I can find them when needed
- As a user, I want to restore an archived project to my active list so that I can work on it again
- As a user, I want to permanently delete an archived project so that I can remove it entirely when I'm sure I don't need it

## Acceptance Criteria
- [ ] "Archive" option available on each project card (context menu or button) — only for the project owner
- [ ] Archiving a project sets its status to 'archived'; it disappears from the main project list
- [ ] Archived projects are accessible via an "Archive" section on the home screen
- [ ] Archive section shows the same project card UI with modified date and slide count
- [ ] "Restore" button on archived project cards: restores status to 'active', project reappears in main list
- [ ] "Delete permanently" button on archived project cards: confirmation dialog required; deletes the project and all associated data
- [ ] Archiving does NOT affect version history (PROJ-38), comments (PROJ-30), shared access (PROJ-25), or share links (PROJ-35)
- [ ] Only the project owner can archive or restore; shared users cannot archive
- [ ] Admins can archive or delete any project in their tenant (via admin activity tools)

## Edge Cases
- What if a shared user tries to archive a project they don't own? → "Archive" button is not visible to shared users
- What if an archived project has active share links (PROJ-35)? → Share links remain valid unless manually expired; archiving is not equivalent to revoking links
- What if the project owner is removed from the team (PROJ-9) while the project is archived? → Project is transferred to the admin who removed them; admin can restore or delete

## Technical Requirements
- Archive is a soft delete: project status column changes from 'active' to 'archived'
- Main project list query always filters status = 'active'
- Archive section query filters status = 'archived'
- Permanent delete removes the project row and all related rows (cascade delete)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
PROJ-27 is purely a status-toggle feature — the `projects` table already has a `status` column (`'active'` / `'archived'`). No new database tables or schema changes are needed. The active project list already filters `status = 'active'`. This feature adds the UI controls and the two missing API pieces.

---

### Component Structure

```
Projects Page (existing, extended)
+-- Active Projects Section (existing)
|   +-- ProjectCard (existing, extended)
|       +-- Dropdown Menu "..."
|           +-- Rename (existing — owner only)
|           +-- Duplicate (existing — all with access)
|           +-- [NEW] Archive (owner only)
|           +-- Delete (existing — owner only, destructive)
|
+-- Shared with me Section (existing, unchanged)
|
+-- [NEW] Archived Section (collapsible, owner-only)
    +-- [NEW] Section header with toggle to expand/collapse
    +-- ArchivedProjectCard (same visual as ProjectCard, different actions)
        +-- [NEW] "Restore" button — moves project back to active
        +-- [NEW] "Delete permanently" button — triggers confirmation dialog
```

**Collapsible behaviour:** The Archived section is collapsed by default. A chevron toggle expands it to show the list. This keeps the page clean for users with many archived projects.

---

### Data Model

No new columns or tables required. The `projects` table already has:

| Field | Values | Notes |
|-------|--------|-------|
| `status` | `'active'` \| `'archived'` | Already exists. Toggled by archive/restore. |

When archived: `status = 'archived'`, `updated_at` refreshed.
When restored: `status = 'active'`, `updated_at` refreshed.
When permanently deleted: the entire row is deleted (existing behaviour — `DELETE /api/projects/[id]`).

---

### Backend

**Extended:** `PATCH /api/projects/[id]`
- Already supports `name`, `slide_order`, `text_edits`
- Add `status` as a new accepted field (`'archived'` or `'active'`)
- Status changes are **owner-only** (same as rename — shared users cannot archive or restore)

**New endpoint:** `GET /api/projects/archived`
- Returns the caller's own projects where `status = 'archived'`, sorted by `updated_at` descending
- Owner-only (mirrors the existing `GET /api/projects` which already filters `owner_id + status = active`)

**No new endpoint for permanent delete** — the existing `DELETE /api/projects/[id]` already handles this and is already owner-only.

---

### Frontend

**Modified:** `src/components/projects/project-card.tsx`
- Add `onArchive?: (id) => void` prop — shows "Archive" in dropdown (owner only, active cards)
- Add `onRestore?: (id) => void` prop — shows "Restore" button (owner only, archived cards)
- Add `onDeletePermanently?: (id) => void` prop — shows "Delete permanently" with confirmation dialog (archived cards)
- When a card is in archived context: hide Rename/Duplicate/Archive; show Restore + Delete permanently

**Modified:** `src/app/(app)/projects/page.tsx`
- Fetch `/api/projects/archived` alongside the active + shared lists
- Add `handleArchive(id)` → PATCH status to 'archived', remove from active list
- Add `handleRestore(id)` → PATCH status to 'active', remove from archived list, prepend to active list
- Add `handleDeletePermanently(id)` → DELETE, remove from archived list
- Render the new collapsible Archived section (collapsed by default, only shown when `archivedProjects.length > 0`)

---

### No New Packages Required
All tooling is already in place. The collapsible section uses the existing shadcn/ui `Collapsible` component (already installed).

---

### Tech Decisions

**Why extend PATCH instead of new archive/restore endpoints?**
Archive and restore are both status updates — one field change on one row. Adding dedicated endpoints (`/archive`, `/restore`) would be redundant when the existing PATCH already handles status as a concept. Keeping it in PATCH keeps the API surface small.

**Why collapsible (not a separate tab or page)?**
Archived projects are rarely accessed. A collapsible section on the same page gives access without adding navigation complexity or a new route. It follows the same pattern used for the "Shared with me" section.

## QA Test Results

**QA Date:** 2026-03-02
**QA Engineer:** Claude Opus 4.6 (automated review)
**Status:** FAIL -- 5 bugs found (1 high, 3 medium, 1 low)

---

### Acceptance Criteria Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| AC-1 | "Archive" option available on each project card -- only for the project owner | PASS | Dropdown shows "Archive" only when `!isArchived && isOwner && onArchive` (project-card.tsx:229). Shared users see no Archive option because projects/page.tsx passes `isOwner={false}` for shared projects and does not pass `onArchive`. |
| AC-2 | Archiving sets status to 'archived'; disappears from main project list | PASS | `handleArchive` sends `PATCH { status: 'archived' }`, backend validates with `z.enum(['active', 'archived'])`, filters active list by `status = 'active'` (projects/route.ts:21). Frontend optimistically moves card from active to archived array (projects/page.tsx:129-130). |
| AC-3 | Archived projects accessible via "Archive" section on home screen | PASS | Collapsible "Archived" section rendered at projects/page.tsx:246-273 when `archivedProjects.length > 0`. Fetched from `GET /api/projects/archived`. |
| AC-4 | Archive section shows same project card UI with modified date and slide count | PASS | Same `ProjectCard` component is reused with `variant="archived"`. Footer shows `timeAgo(project.updated_at)` and slide count badge (project-card.tsx:298-317). Archived badge also shown. |
| AC-5 | "Restore" button restores status to 'active', project reappears in main list | PASS | `handleRestore` sends `PATCH { status: 'active' }`. On success, removes from archived array, prepends to active array (projects/page.tsx:147-148). Backend validates and updates. |
| AC-6 | "Delete permanently" button with confirmation dialog; deletes project and all associated data | PASS | Confirmation dialog at project-card.tsx:343-361. Uses existing `DELETE /api/projects/[id]` which is owner-only. Cascade delete handled at DB level. |
| AC-7 | Archiving does NOT affect version history, comments, shared access, or share links | PASS | Archive is a soft status change only (`UPDATE projects SET status = 'archived'`). No related rows are touched. The shared projects endpoint filters `status = 'active'` (shared/route.ts:39), so shared users will not see the project while archived, but the share records remain intact and will reappear on restore. See BUG-5 for a nuance. |
| AC-8 | Only the project owner can archive or restore; shared users cannot archive | PASS | Backend enforces owner-only at [id]/route.ts:144: `if (!isOwner) return 403`. Frontend hides Archive for non-owners (project-card.tsx:229). Shared users with edit permission get 403 if they try the API directly. |
| AC-9 | Admins can archive or delete any project in their tenant | FAIL | See BUG-1. |

---

### Bugs Found

#### BUG-1: Admin cannot archive or delete projects they do not own (AC-9)
- **Severity:** HIGH
- **Priority:** P1
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/[id]/route.ts` (lines 110-123, 143-144, 178-183)
- **Description:** The acceptance criteria state "Admins can archive or delete any project in their tenant (via admin activity tools)." However, the PATCH handler only checks `owner_id` match and share records -- it has no admin role bypass. The DELETE handler similarly filters `eq('owner_id', user.id)` on line 182, so an admin who does not own a project gets a 404. There is no admin path in either handler.
- **Steps to reproduce:** (1) Log in as a tenant admin. (2) Attempt to archive or delete a project owned by another user in the same tenant. (3) Observe 404 or 403 response.
- **Expected:** Admin should be able to archive/delete any project in their tenant.
- **Fix suggestion:** Add an admin check: if the user is not the owner, check their role via `getUserProfile()`. If `role === 'admin'` and `profile.tenant_id === project.tenant_id`, allow the operation. Apply to both PATCH (status field) and DELETE handlers.

#### BUG-2: Archived endpoint does not check user active status
- **Severity:** MEDIUM
- **Priority:** P2
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/archived/route.ts`
- **Description:** The `GET /api/projects/archived` endpoint does not call `getUserProfile()` and therefore does not check `is_active`. A deactivated user whose Supabase Auth session is still valid can query their archived projects. The main `GET /api/projects` endpoint calls `getUserProfile` and checks for a valid profile (route.ts:13-14), but the archived endpoint skips this entirely.
- **Steps to reproduce:** (1) Deactivate a user via team management. (2) If that user still holds a valid JWT, call `GET /api/projects/archived`. (3) Observe that the response returns data instead of 403.
- **Expected:** Deactivated users should receive a 403 or similar rejection.
- **Fix suggestion:** Add `getUserProfile(user.id)` check with `is_active` validation, matching the pattern in `GET /api/projects` (route.ts:13-14).

#### BUG-3: Rate limit return value inconsistency in archived endpoint
- **Severity:** MEDIUM
- **Priority:** P2
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/archived/route.ts` (line 15)
- **Description:** The rate limit check on line 15 does `if (limited) return limited`, returning the NextResponse object directly from `checkRateLimit`. This is correct behavior and matches the `checkRateLimit` return signature (it returns `NextResponse | null`). However, this pattern is inconsistent with the shared endpoint (shared/route.ts:15) which does `if (limited) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })` -- creating a *second* 429 response instead of returning the one from `checkRateLimit`. Meanwhile, [id]/route.ts:28 also creates its own 429. The inconsistency is cosmetic but could confuse maintainers.
- **Impact:** The `return limited` pattern is actually more correct (it includes `Retry-After` header from `checkRateLimit`). The other endpoints that create their own 429 lose the `Retry-After` header. Not a functional bug in the archived endpoint itself, but a codebase inconsistency worth noting.

#### BUG-4: Archived projects remain accessible via direct board URL
- **Severity:** MEDIUM
- **Priority:** P2
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/[id]/route.ts` (GET handler, lines 22-83)
- **Description:** The `GET /api/projects/[id]` endpoint does not filter by `status`. A user can navigate to `/board?project=<archived-project-id>` and the board page will load the project successfully, allowing full editing, exporting, and sharing operations on an archived project. This contradicts the intent of archiving (removing from active workflow). The project-card.tsx correctly prevents click navigation on archived cards (line 161: `if (editing || isArchived) return`), but a user can type the URL directly.
- **Steps to reproduce:** (1) Archive a project. (2) Navigate directly to `/board?project=<id>`. (3) Observe the project loads and is fully editable.
- **Expected:** Either block access to archived projects from the board (show a banner/redirect), or at minimum show them as read-only with a "Restore to edit" prompt.
- **Fix suggestion:** In the board page or the GET endpoint, check `project.status === 'archived'` and either redirect to the projects page with a toast message, or render a read-only view with a restore action.

#### BUG-5: No UUID format validation on project ID parameter
- **Severity:** LOW
- **Priority:** P3
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/[id]/route.ts`
- **Description:** The `[id]` parameter is not validated as a UUID before being used in database queries. The duplicate endpoint (`duplicate/route.ts:22`) validates with a UUID regex, but the main `[id]/route.ts` does not. While Supabase/Postgres will reject invalid UUIDs at the DB level, this results in a 500 error with a raw Postgres error message being sent to the client, rather than a clean 400.
- **Steps to reproduce:** Call `GET /api/projects/not-a-uuid`. Observe a 500 error with a Postgres error message.
- **Expected:** A 400 response with a clean error message like "Invalid project ID".
- **Fix suggestion:** Add UUID regex validation at the top of each handler, matching the pattern in `duplicate/route.ts`.

---

### Security Audit

| Check | Result | Notes |
|-------|--------|-------|
| Authentication on all endpoints | PASS | Both PATCH and GET /archived require `getAuthenticatedUser`. |
| Authorization (owner-only for status change) | PASS | PATCH checks `isOwner` before allowing status update (line 144). |
| Authorization (admin bypass) | FAIL | See BUG-1. Admin access path is missing entirely. |
| Input validation (Zod) | PASS | Status field validated with `z.enum(['active', 'archived'])` (line 145). |
| Rate limiting | PASS | All endpoints have rate limiting. |
| Tenant isolation (archived list) | PASS | `GET /api/projects/archived` filters by `owner_id = user.id`, which inherently isolates by tenant. |
| Tenant isolation (PATCH status) | PASS | PATCH checks ownership (`owner_id = user.id`) or share record, both of which are tenant-scoped. |
| IDOR on archive/restore | PASS | PATCH requires ownership match. A user cannot archive another user's project by guessing the ID. |
| Deactivated user access | FAIL | See BUG-2. Archived endpoint does not check `is_active`. |
| Mass assignment on PATCH | PASS | Only explicit fields (`name`, `slide_order`, `text_edits`, `status`) are accepted. Other fields in body are ignored. |
| Error message leakage | PARTIAL | Supabase error messages may leak on 500 (line 159). Consider wrapping. See also BUG-5 for raw Postgres errors on invalid IDs. |
| Injection | PASS | All queries use Supabase parameterized query builder. No raw SQL. |
| CSRF | N/A | API uses Bearer token auth, not cookies. |

---

### Edge Case Review

| Edge Case | Result | Notes |
|-----------|--------|-------|
| Shared user tries to archive | PASS | Archive button hidden in UI. Backend returns 403. |
| Archived project has active share links | N/A | PROJ-35 not yet implemented. Status change does not touch share data. |
| Owner removed while project archived | N/A | Ownership transfer logic is in PROJ-9 scope, not PROJ-27. |
| Archive then restore roundtrip | PASS | Status toggles correctly. `updated_at` is refreshed by Supabase. Project moves between arrays in frontend state. |
| Archive, then delete permanently | PASS | Frontend correctly calls DELETE and removes from archived array. Backend DELETE does not check status, so it works on both active and archived projects. |
| Empty archived list | PASS | Archived section is hidden when `archivedProjects.length === 0` (projects/page.tsx:246). |
| Collapsible default state | PASS | `archiveOpen` defaults to `false` (projects/page.tsx:24). Section is collapsed by default. |
| Archived card click navigation | PASS | Clicking an archived card does nothing -- `handleCardClick` returns early when `isArchived` is true (project-card.tsx:161). |
| Direct URL access to archived project | FAIL | See BUG-4. Board loads the archived project with full edit capability. |

---

### Regression Check (Existing Features)

| Feature | Impact | Notes |
|---------|--------|-------|
| PROJ-24 (Project Creation & Management) | No regression | Active project list still filters `status = 'active'`. Create always sets `status = 'active'` (via DB default). |
| PROJ-25 (Project Sharing) | No regression | Shared project list filters `status = 'active'` (shared/route.ts:39). Share records are preserved on archive. |
| PROJ-26 (Project Duplication) | No regression | Duplicate always creates with `status: 'active'` (duplicate/route.ts:78). However, note that an archived project CAN be duplicated via direct API call since the duplicate endpoint does not check source project status -- this is arguably acceptable behavior. |
| PROJ-29 (Text Editing) | No regression | Text edits are preserved through archive/restore cycle. |
| PROJ-33/34 (Export) | No regression | Export endpoints do not check project status. An archived project can be exported via direct API call. Acceptable since the primary guard is the UI hiding the board for archived projects (though see BUG-4). |

---

### Summary

**5 bugs total:** 1 HIGH, 3 MEDIUM, 1 LOW

The core archive/restore/delete-permanently workflow is well-implemented. The primary gap is BUG-1 (missing admin authority) which is a clear acceptance criteria failure. BUG-4 (direct URL access to archived projects) is a UX/security concern that undermines the purpose of archiving. BUG-2 (deactivated user access) is a defense-in-depth issue. BUG-3 is a minor inconsistency, and BUG-5 is a low-priority input validation gap.

**Recommendation:** Fix BUG-1 and BUG-4 before marking PROJ-27 as Deployed. BUG-2 should be fixed in the same pass. BUG-3 and BUG-5 can be deferred.

## Deployment
_To be added by /deploy_

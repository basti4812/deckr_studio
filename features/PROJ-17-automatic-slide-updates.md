# PROJ-17: Automatic Slide Updates across Projects

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-15 (Slide Library Management) — admin replaces a slide
- Requires: PROJ-24 (Project Creation & Management) — projects contain slides
- Requires: PROJ-13 (In-app Notifications) — notify affected users
- Requires: PROJ-14 (Email Notifications) — notify affected users by email
- Requires: PROJ-38 (Version History) — snapshots preserve the old version

## User Stories
- As an admin, I want slide updates to automatically propagate to all projects containing that slide so that everyone always works with the latest version
- As a user, I want to be notified when a slide in one of my active projects has been updated so that I know to review the change
- As a user, I want version snapshots to preserve the slide as it was at snapshot time so that historical records are not retroactively changed

## Acceptance Criteria
- [ ] When an admin uploads a new PPTX version to an existing slide, the update propagates to all projects containing that slide
- [ ] "Contains that slide" means: the slide_id is in the project's current slide list (not in version history snapshots)
- [ ] After propagation, each affected project's exported file would use the new slide version
- [ ] Users who own or have access to affected projects receive an in-app notification: "A slide in {{project}} was updated by an admin"
- [ ] The same users receive an email notification (subject to their email preferences, PROJ-14)
- [ ] Version history snapshots (PROJ-38) are NOT retroactively updated — they preserve the slide as it was at snapshot time
- [ ] The update propagation is logged in the activity log (PROJ-39)

## Edge Cases
- What if a project contains the same slide multiple times? → Both instances are updated
- What if a project is archived? → Archived projects are still updated (they may be restored)
- What if the slide update propagation fails for some projects? → Retry mechanism; if still failing, log error and notify admin
- What if an admin cancels the upload mid-way? → No propagation occurs; existing slide record unchanged
- What if no projects contain the updated slide? → No notifications sent; update is silent

## Technical Requirements
- Propagation does not copy the PPTX file into project records; projects reference the slide by slide_id and always use the latest version's pptx_url
- Version snapshots store a point-in-time copy of pptx_url (resolved at snapshot creation time) so history is preserved
- Propagation logic runs server-side in an API route or Supabase Edge Function after the slide upload completes
- Notification batching: if a user has multiple affected projects, send one notification per project (not one per slide)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### How propagation works
Projects reference slides by `slide_id` — the PPTX file URL lives exclusively on the slides table. When an admin replaces a slide's PPTX, the updated `pptx_url` is immediately available to all projects on the next board load or export. No data needs to be pushed to individual projects.

### What was built

**Database:** Added `pptx_updated_at TIMESTAMPTZ` column to slides table. Set only when `pptx_url` changes, not when title/tags/status change. This distinguishes "content updates" from "metadata updates."

**Backend (`PATCH /api/slides/[id]`):**
- Sets `pptx_updated_at = NOW()` when `pptx_url` is in the update payload
- After update: queries all active projects containing the slide (via JSONB contains), logs affected project count
- TODO stubs added for PROJ-13 (in-app notifications), PROJ-14 (email notifications), PROJ-39 (activity log)

**Frontend — Tray "Updated" badge:**
- `TraySlideItem` receives `projectUpdatedAt` prop
- Shows "Updated" badge when `slide.pptx_updated_at > project.updated_at`
- Badge clears automatically when user next saves the project (bumping project.updated_at)
- `TrayPanel` threads `projectUpdatedAt` from board page through to each item
- Board page passes `project.updated_at` to TrayPanel

### Notification integration points
When PROJ-13 is built, replace the `console.log` in `PATCH /api/slides/[id]` with real notification dispatch. The affected projects query and user resolution scaffold is already in place.

## QA Test Results

**Tested:** 2026-03-02
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: When an admin uploads a new PPTX version to an existing slide, the update propagates to all projects containing that slide
- [x] Projects reference slides by `slide_id` -- the PPTX file URL lives on the `slides` table, so updating the slide record immediately makes the new version available to all referencing projects
- [x] PATCH /api/slides/[id] accepts `pptx_url` and sets `pptx_updated_at` when the PPTX content changes (route.ts line 72-76)
- [ ] BUG: No UI exists for admins to replace a PPTX file on an existing slide. The EditSlideDialog only sends title, status, tags, and editable_fields -- it does NOT include a file picker for PPTX replacement (see BUG-1 below)

#### AC-2: "Contains that slide" means the slide_id is in the project's current slide list (not in version history snapshots)
- [x] The affected-projects query uses `.contains('slide_order', [{ slide_id: id }])` which correctly checks the JSONB slide_order for the slide_id
- [x] PROJ-38 (Version History) is Planned, not Deployed, so there are no snapshots to worry about yet. The architecture correctly documents that snapshots will store a point-in-time copy of pptx_url

#### AC-3: After propagation, each affected project's exported file would use the new slide version
- [x] PPTX export (POST /api/projects/[id]/export) fetches slide data from the `slides` table at export time: `.select('id, title, pptx_url, editable_fields')` -- always uses the current pptx_url
- [x] PDF export (POST /api/projects/[id]/export/pdf) similarly fetches slide data at export time: `.select('id, title, thumbnail_url')` -- always uses the current thumbnail
- [x] No caching layer sits between the slide record and the export logic

#### AC-4: Users who own or have access to affected projects receive an in-app notification
- [ ] NOT IMPLEMENTED: PROJ-13 (In-app Notifications) has status "Planned". A TODO stub exists at line 96 of PATCH /api/slides/[id] with `console.log` placeholder
- [x] ACCEPTABLE: The dependency is clearly documented, and the integration point (affected-projects query + user resolution scaffold) is in place

#### AC-5: The same users receive an email notification (subject to email preferences, PROJ-14)
- [ ] NOT IMPLEMENTED: PROJ-14 (Email Notifications) has status "Planned". A TODO stub exists at line 97
- [x] ACCEPTABLE: Same rationale as AC-4

#### AC-6: Version history snapshots (PROJ-38) are NOT retroactively updated
- [ ] CANNOT VERIFY: PROJ-38 (Version History) has status "Planned". No snapshot mechanism exists yet
- [x] ACCEPTABLE: The tech design documents that snapshots will store point-in-time pptx_url copies. Since the current architecture references slides by ID (not by URL copy), the snapshot feature will need to resolve URLs at snapshot creation time -- this is correctly documented

#### AC-7: The update propagation is logged in the activity log (PROJ-39)
- [ ] NOT IMPLEMENTED: PROJ-39 (Activity Log) has status "Planned". A TODO stub exists at line 98
- [x] ACCEPTABLE: Stub and integration point in place

### Edge Cases Status

#### EC-1: Project contains the same slide multiple times
- [x] Handled correctly by design. Since projects reference by slide_id and always fetch the latest version from the slides table, both instances automatically get the updated PPTX. The "Updated" badge logic in TraySlideItem compares `slide.pptx_updated_at > project.updated_at` which applies to all instances of the same slide in the tray

#### EC-2: Archived project should still be updated
- [x] Propagation itself is correct: archived projects also reference slides by slide_id, so when they are restored and exported, they will use the latest version
- [ ] BUG: The affected-projects query in PATCH /api/slides/[id] (line 104) filters `.eq('status', 'active')`, which means archived projects are excluded from the console.log and from future notification dispatch. When PROJ-13 notifications are implemented, archived project owners will NOT be notified (see BUG-2 below)

#### EC-3: Slide update propagation fails for some projects
- [ ] BUG: No retry mechanism exists. The current implementation only logs affected projects to console. There is no error handling, retry logic, or admin notification for failures (see BUG-3 below). However, since propagation is by-reference, the "failure" scenario described in the spec would only apply to notifications, not to the actual data propagation

#### EC-4: Admin cancels upload mid-way
- [x] Handled correctly. The PPTX file is uploaded to Supabase Storage first, then the slide record is updated via PATCH. If the admin cancels before the PATCH call, no update occurs. If the Storage upload fails, the API is never called

#### EC-5: No projects contain the updated slide
- [x] Handled correctly. The affected-projects query returns an empty array and the console.log block is skipped (line 107: `if (affectedProjects && affectedProjects.length > 0)`)

### Security Audit Results

- [x] Authentication: PATCH /api/slides/[id] requires admin role via `requireAdmin()` -- non-admin users get 403
- [x] Authorization: Slide ownership verified by tenant_id match (line 57-65)
- [x] Tenant isolation: All queries scope to `auth.profile.tenant_id`
- [ ] BUG: No rate limiting on PATCH /api/slides/[id] or DELETE /api/slides/[id]. An authenticated admin could flood the endpoint (see BUG-4 below)
- [ ] BUG: Incomplete input validation on PATCH /api/slides/[id]. `pptx_url` is not validated as a URL, `thumbnail_url` is not validated as a URL, `title` has no max-length check, `editable_fields` accepts `unknown[]` without schema validation. Only `tags` and `status` have proper validation (see BUG-5 below)
- [x] No XSS vectors: all data is stored as plain text/JSON, no HTML rendering of user input
- [x] No SQL injection: Supabase client uses parameterized queries
- [x] No secrets exposed in API responses
- [x] Cross-tenant data access impossible -- slide ownership verified before update

### Cross-Browser Testing

- [x] Chrome: "Updated" badge renders correctly in TraySlideItem using standard CSS classes (blue-100/blue-700 for light, blue-900/blue-300 for dark)
- [x] Firefox: Same Tailwind CSS used, no browser-specific rendering issues in badge markup
- [x] Safari: Standard flex/inline-block layout, no Safari-specific CSS issues identified

### Responsive Testing

- [x] Desktop (1440px): TrayPanel renders at w-72 (288px) with badge visible
- [x] Tablet (768px): Board page uses `hidden md:flex` -- tray visible at 768px+
- [x] Mobile (375px): Board page shows mobile guard: "The board canvas requires a desktop browser" -- consistent with product constraints (desktop-first, mobile with reduced feature set)

### Bugs Found

#### BUG-1: No UI for PPTX file replacement on existing slides
- **Severity:** High
- **Steps to Reproduce:**
  1. Go to /admin/slides
  2. Click the menu on any slide card and select "Edit"
  3. The EditSlideDialog opens with fields for title, status, tags, and editable fields
  4. Expected: A file picker to upload a new PPTX version (replacing the existing one), as described in AC-1 and PROJ-15 AC-8 ("Admin can replace a slide by uploading a new PPTX version")
  5. Actual: No file picker is present. The dialog only sends title, status, tags, and editable_fields to PATCH /api/slides/[id]. There is no way for an admin to replace the PPTX file through the UI
- **Files:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/slides/edit-slide-dialog.tsx` (line 110-114 -- only sends title, status, tags, editable_fields)
- **Impact:** The core use case of PROJ-17 -- "admin uploads a new PPTX version to an existing slide" -- cannot be triggered through the UI. The backend supports it (PATCH accepts pptx_url), but the frontend does not expose it
- **Priority:** Fix before deployment -- this is the primary trigger for the entire feature

#### BUG-2: Affected-projects query excludes archived projects
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Create a project, add slides, then archive the project
  2. Update one of those slides' PPTX via API (PATCH /api/slides/[id] with pptx_url)
  3. Expected: The archived project appears in the affected-projects log (and future notifications)
  4. Actual: The query at line 104 of `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts` filters `.eq('status', 'active')`, excluding archived projects
- **Files:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts` line 104
- **Impact:** When PROJ-13 notifications are implemented, archived project owners will not be notified. The actual data propagation is unaffected (archived projects still reference slides by ID)
- **Priority:** Fix before deployment -- the spec explicitly says "Archived projects are still updated"

#### BUG-3: No retry mechanism for propagation failures
- **Severity:** Low
- **Steps to Reproduce:**
  1. Update a slide's PPTX when the database is under load
  2. Expected: Retry mechanism; if still failing, log error and notify admin (per edge case spec)
  3. Actual: The affected-projects query runs once with no retry. If the Supabase query fails, the error is silently swallowed (no catch block around the query)
- **Files:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts` lines 99-113
- **Impact:** Low -- the slide update itself succeeds (line 84-88), only the notification/logging query could fail. Since notifications are not yet implemented (PROJ-13 is Planned), this is a future concern
- **Priority:** Fix in next sprint

#### BUG-4: No rate limiting on PATCH and DELETE /api/slides/[id]
- **Severity:** Medium
- **Steps to Reproduce:**
  1. As an authenticated admin, send rapid PATCH or DELETE requests to /api/slides/[id]
  2. Expected: Rate limiting (consistent with other endpoints like /api/projects/[id] which has 60 req/min)
  3. Actual: No rate limiting applied. Neither PATCH nor DELETE import or call `checkRateLimit`
- **Files:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts`
- **Impact:** An admin account (or compromised admin token) could flood the endpoint with update/delete requests
- **Priority:** Fix before deployment

#### BUG-5: Incomplete Zod input validation on PATCH /api/slides/[id]
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send PATCH /api/slides/[id] with body `{ "pptx_url": "not-a-url" }` -- accepted
  2. Send PATCH /api/slides/[id] with body `{ "title": "<very long string of 10000 chars>" }` -- accepted
  3. Send PATCH /api/slides/[id] with body `{ "editable_fields": [{"arbitrary": "data"}] }` -- accepted
  4. Expected: All fields validated with Zod schemas (pptx_url as z.string().url(), title with max length, editable_fields with proper schema)
  5. Actual: Only `tags` and `status` have validation. Other fields are passed through without schema checks
- **Files:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts` lines 20-34
- **Impact:** Invalid data could be stored in the database. Malformed pptx_url or thumbnail_url could cause export failures. Unvalidated editable_fields could break the text editing UI
- **Priority:** Fix before deployment

### Regression Testing

- [x] PROJ-15 (Slide Library Management): Admin slide library page loads correctly, upload dialog works, edit dialog works, delete with project-usage check works
- [x] PROJ-24 (Project Creation): Projects page loads, projects can be created and opened on the board
- [x] PROJ-21 (Project Tray): Tray panel renders slides correctly, drag-and-drop reorder works
- [x] PROJ-29 (Text Editing): Edit fields dialog opens from tray, fill warning dialog works
- [x] PROJ-33 (PowerPoint Export): Export flow uses latest slide data from slides table
- [x] PROJ-34 (PDF Export): PDF export flow uses latest slide data from slides table
- [x] PROJ-18 (Board Canvas): Canvas renders groups and slides, zoom controls work

### Summary
- **Acceptance Criteria:** 3/7 passed, 1 failed (BUG-1), 3 deferred to dependent features (AC-4/5/6/7 depend on PROJ-13/14/38/39 which are Planned)
- **Edge Cases:** 3/5 passed, 1 has bug (BUG-2), 1 has minor bug (BUG-3)
- **Bugs Found:** 5 total (0 critical, 1 high, 3 medium, 1 low)
- **Security:** Issues found (BUG-4 rate limiting, BUG-5 input validation)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (High: no PPTX replacement UI) and BUG-2 (Medium: archived project exclusion) before deployment. BUG-4 and BUG-5 should also be addressed for security hardening. BUG-3 can wait for the next sprint.

## Deployment
_To be added by /deploy_

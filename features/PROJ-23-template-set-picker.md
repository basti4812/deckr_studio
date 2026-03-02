# PROJ-23: Template Set Picker

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-22 (Template Set Management Admin)
- Requires: PROJ-24 (Project Creation & Management)

## User Stories
- As a user creating a new project, I want to browse available template sets so that I can start from a curated slide selection instead of from scratch
- As a user, I want to see cover images, descriptions, and slide counts for each template set so that I can choose the right one
- As a user, I want to preview the full slide order of a template set before selecting it so that I know exactly what I'm getting
- As a user, I want to filter template sets by category so that I can find relevant options quickly
- As a user, I want to start a project from scratch without using a template so that I have full flexibility

## Acceptance Criteria
- [ ] Template set picker is shown as a step during project creation (before the board opens)
- [ ] Picker shows two options: "Start from scratch" and "Choose a template"
- [ ] If "Choose a template" is selected: show a visual grid of available template sets
- [ ] Each template set card shows: cover image, name, description, slide count, category tag
- [ ] Category filter: filter by category tag; "All" is the default
- [ ] Clicking a template set card shows a full preview: ordered list of all slide thumbnails and titles in the set
- [ ] User can confirm selection or go back to the grid
- [ ] After confirmation, the project tray is pre-populated with the template set's slides in order
- [ ] Mandatory slides are automatically added in addition to template slides
- [ ] "Start from scratch" populates the tray with only the mandatory slides
- [ ] If no template sets exist, the picker skips straight to "Start from scratch" (or shows an empty state)

## Edge Cases
- What if a template set contains deprecated slides? → Deprecated slides are shown with a deprecated warning in the preview; they are NOT added to the project tray on confirmation
- What if a template set contains slides the user's tenant no longer has access to? → Those slides are skipped silently during population
- What if the user goes back from the template picker to change their project name? → Template selection is not reset; selection is remembered during the creation flow
- What if there are more than 20 template sets? → Grid paginates or scrolls; category filter helps narrow down

## Technical Requirements
- Picker is implemented as a modal or a dedicated step in the project creation flow
- Template set analytics (PROJ-40) track when each set is selected for a new project
- Slide preview in the picker uses thumbnails (not the full PPTX)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI Structure
```
CreateProjectDialog (extended — 3 views inside one dialog)
│
├── View 1: Name entry (existing)
│   ├── "Project name" text field
│   └── "Next →" button (replaces current "Create")
│
├── View 2: Template picker
│   ├── "← Back" link + step indicator ("Step 2 of 2")
│   ├── Category filter tabs ("All" + distinct categories from loaded sets)
│   ├── Template grid (2-column scroll)
│   │   ├── "Start from scratch" tile (always first)
│   │   └── TemplateSetPickerCard per set
│   │       ├── Cover image / first-slide thumbnail fallback
│   │       ├── Name, category badge, slide count
│   │       ├── Description snippet
│   │       └── Click → View 3
│   └── Empty state (no sets → "Start from scratch" only)
│
└── View 3: Template preview (replaces View 2 content)
    ├── "← Back to templates" link
    ├── Set header (name, category badge, slide count)
    ├── Scrollable ordered slide list (thumbnail + title + "Deprecated" badge)
    └── "Use this template" button → creates project
```

### Data Flow
1. User enters project name → "Next" → `GET /api/template-sets` loads picker
2. User clicks a template card → `GET /api/template-sets/[id]/slides` loads preview
3. "Use this template" → `POST /api/projects { name, templateSetId }` → board
4. "Start from scratch" → `POST /api/projects { name }` → board (existing behavior)

### Backend Change: POST /api/projects
Accepts optional `templateSetId`. When provided:
- Fetches ordered template set slides (filters out deprecated and slides the tenant no longer has)
- Fetches tenant mandatory slides
- Merges: mandatory slides first, then template slides not already covered by mandatory ones
- Creates project with pre-populated `slide_order`

### Key Design Decisions
- **Extend dialog, not a new page:** Creation flow stays in one dialog — no navigation context lost
- **Reuse PROJ-22 APIs:** `GET /api/template-sets` and `GET /api/template-sets/[id]/slides` support this picker directly
- **Server-side merge:** Slide merging logic is on the backend so mandatory slide enforcement cannot be bypassed
- **Category filter client-side:** Categories are derived from loaded set data — no extra API call
- **Lazy preview fetch:** Slide thumbnails for a specific set are only loaded when the user clicks that card

### Files to Modify
- `src/components/projects/create-project-dialog.tsx` — extend to 3-view flow
- `src/app/api/projects/route.ts` — accept optional `templateSetId`, merge slides

## QA Test Results

**Tested:** 2026-03-02
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Method:** Code review of all implementation files + build verification

### Acceptance Criteria Status

#### AC-1: Template set picker is shown as a step during project creation
- [x] CreateProjectDialog implements a 3-view state machine: 'name' -> 'picker' -> 'preview'
- [x] "Next" button on name view advances to picker (line 168)
- [x] Picker is shown before board opens (handleCreate redirects to board only after API call)

#### AC-2: Picker shows "Start from scratch" and "Choose a template"
- [x] "Start from scratch" tile is always first in the 2-column grid (lines 331-342)
- [x] Template set cards shown alongside in the grid (lines 345-351)

#### AC-3: "Choose a template" shows a visual grid of available template sets
- [x] 2-column grid layout (`grid grid-cols-2 gap-3`) renders TemplatePickerCard components
- [x] Data loaded from GET /api/template-sets on picker view entry

#### AC-4: Each template set card shows cover image, name, description, slide count, category tag
- [x] Cover image with fallback to first_slide_thumbnail (line 485)
- [x] Name rendered with truncation (line 505)
- [x] Description with line-clamp-2 (lines 516-518)
- [x] Slide count displayed (lines 512-514)
- [x] Category Badge shown when present (lines 507-510)

#### AC-5: Category filter with "All" as default
- [x] Categories derived client-side from loaded sets (lines 82-85)
- [x] "All" is always first and is the default state (line 74, line 84)
- [x] Filter pills shown only when more than one category exists (line 301)

#### AC-6: Clicking a template set card shows full preview
- [x] handleSelectTemplate transitions to 'preview' view (lines 221-224)
- [x] Slides fetched lazily from GET /api/template-sets/[id]/slides (lines 134-157)
- [x] Ordered slide list with numbered positions, thumbnails, titles (lines 418-453)
- [x] Deprecated badge shown for deprecated slides (lines 442-449)

#### AC-7: User can confirm selection or go back to the grid
- [x] "Use this template" button calls handleCreate(selectedSet.id) (line 463)
- [x] "Back" button returns to picker view (line 460)
- [x] Back arrow link also returns to picker (line 380)

#### AC-8: After confirmation, project tray is pre-populated with template slides in order
- [x] POST /api/projects accepts optional templateSetId (line 67 in route.ts)
- [x] Template set slides fetched ordered by position (line 82)
- [x] Slide order built: mandatory first, then template slides (lines 61-99)
- [x] Server-side merge prevents client-side bypass

#### AC-9: Mandatory slides automatically added in addition to template slides
- [x] Mandatory slides fetched from slides table where status='mandatory' (lines 52-56)
- [x] Mandatory IDs tracked in a Set to prevent duplicates (line 58)
- [x] Template slides that are already mandatory are skipped (line 97)

#### AC-10: "Start from scratch" populates tray with only mandatory slides
- [x] handleCreate() called without templateSetId (line 333)
- [x] When no templateSetId provided, only mandatory slides added to slide_order (lines 60-64)

#### AC-11: No template sets = skip to scratch or show empty state
- [x] Empty state message shown: "No template sets available. Start from scratch to continue." (lines 355-358)
- [x] "Start from scratch" tile always visible even when no template sets exist
- [ ] BUG: Picker does NOT auto-skip to "Start from scratch" -- it shows the full picker UI with empty state. Spec says "skips straight to 'Start from scratch'" as first option. Current behavior matches the "(or shows an empty state)" alternative.

### Edge Cases Status

#### EC-1: Deprecated slides in template set
- [x] Preview shows orange "Deprecated" badge on deprecated slides (lines 442-449)
- [x] POST /api/projects skips slides with status === 'deprecated' (line 97 in route.ts)

#### EC-2: Slides tenant no longer has access to
- [x] POST /api/projects fetches slides with `.eq('tenant_id', profile.tenant_id)` filter (line 90)
- [x] GET /api/template-sets/[id]/slides filters by slide existence (line 55)
- [x] Missing slides silently excluded from both preview and project population

#### EC-3: Back from picker to change project name -- selection remembered
- [x] handleBackToName only changes view, preserves selectedSet and templateSets in state (line 232-234)
- [x] Project name preserved in state when navigating back and forward
- [ ] BUG (Low): templateSets are re-fetched on every picker view entry due to useEffect dependency on view (causes loading flicker)

#### EC-4: More than 20 template sets
- [x] ScrollArea with max-h-[400px] provides scrolling (line 321)
- [x] Category filter helps narrow down large sets

### Security Audit Results

- [x] Authentication: Both GET /api/template-sets and GET /api/template-sets/[id]/slides require Bearer token via getAuthenticatedUser
- [x] Authorization (tenant isolation): Template sets filtered by tenant_id; slides filtered by tenant_id
- [x] Authorization (is_active): GET /api/template-sets checks profile.is_active; GET /api/template-sets/[id]/slides checks profile.is_active
- [ ] BUG: POST /api/projects does NOT check profile.is_active -- deactivated users can create projects (BUG-3)
- [ ] BUG: POST /api/projects has NO rate limiting -- can be abused for resource exhaustion (BUG-2)
- [ ] BUG: POST /api/projects has NO Zod validation -- templateSetId not validated as UUID (BUG-1)
- [x] XSS: React renders template names/descriptions as text content, not innerHTML -- safe from XSS
- [x] IDOR: Template set ID verified against tenant_id on server side before processing
- [x] Cover image URLs: Signed URLs from Supabase storage with tenant-scoped paths
- [ ] BUG: Database tables (template_sets, template_set_slides, slides, projects) have no RLS policies in migrations -- mitigated by service client but no defense-in-depth (BUG-7)

### Cross-Browser & Responsive Notes

- [x] All UI components use shadcn/ui primitives (Dialog, Button, Badge, Input, ScrollArea, Skeleton) -- well-tested cross-browser
- [x] Tailwind classes used exclusively (grid, flex, gap) -- no browser-specific CSS concerns
- [x] img elements use object-cover (universally supported)
- [x] ScrollArea component handles cross-browser scroll behavior
- [ ] NOTE: 2-column grid inside dialog may be cramped on 375px mobile viewport -- potential UX issue but functional

### Regression Assessment

- [x] PROJ-24 (Project Creation): Name entry view unchanged; POST /api/projects works identically without templateSetId
- [x] PROJ-22 (Template Set Management): Read-only usage of PROJ-22 APIs; no modifications to admin endpoints
- [x] PROJ-21 (Project Tray): slide_order populated correctly; no changes to tray component

### Bugs Found

#### BUG-1: POST /api/projects -- No Zod validation on request body
- **Severity:** Medium
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/route.ts`
- **Steps to Reproduce:**
  1. Send POST /api/projects with body `{ "name": "test", "templateSetId": "not-a-uuid" }`
  2. Expected: 400 Bad Request with validation error
  3. Actual: Supabase query proceeds with invalid UUID, may cause a 500 error or silent failure
- **Details:** The endpoint manually checks `name` but does not use Zod validation. The `templateSetId` field accepts any string without UUID format validation. This violates the project rule: "Validate ALL user input on the server side with Zod."
- **Priority:** Fix before deployment

#### BUG-2: POST /api/projects -- No rate limiting
- **Severity:** High
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/route.ts`
- **Steps to Reproduce:**
  1. Send 100+ rapid POST /api/projects requests with valid auth token
  2. Expected: 429 Too Many Requests after threshold
  3. Actual: All requests succeed, creating 100+ projects
- **Details:** Every other mutation endpoint in the codebase (template-sets, profile, avatar, etc.) uses `checkRateLimit()`. The project creation endpoint is unprotected, allowing database flooding.
- **Priority:** Fix before deployment

#### BUG-3: POST /api/projects -- No is_active check on user profile
- **Severity:** High
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/route.ts` (lines 13-14)
- **Steps to Reproduce:**
  1. Deactivate a user via admin team management
  2. Use the deactivated user's still-valid session token to POST /api/projects
  3. Expected: 403 Forbidden
  4. Actual: Project created successfully
- **Details:** The endpoint checks `if (!profile)` but does NOT check `if (!profile.is_active)`. Compare with GET /api/template-sets (line 15) which correctly checks `if (!profile || !profile.is_active)`.
- **Priority:** Fix before deployment

#### BUG-4: GET /api/template-sets -- No rate limiting on read endpoint
- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/template-sets/route.ts`
- **Steps to Reproduce:**
  1. Rapidly request GET /api/template-sets hundreds of times
  2. Expected: Rate limiting after threshold
  3. Actual: All requests processed
- **Details:** While read-only, rapid polling could contribute to API abuse. The endpoint performs multiple database queries (template_sets + template_set_slides + slides) per request.
- **Priority:** Nice to have

#### BUG-5: Template sets reloaded on every picker view transition
- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/projects/create-project-dialog.tsx` (lines 108-131)
- **Steps to Reproduce:**
  1. Open create project dialog, enter name, click Next (loads template sets)
  2. Click Back arrow to return to name view
  3. Click Next again
  4. Expected: Template sets shown immediately (cached)
  5. Actual: Loading skeletons appear while template sets are re-fetched
- **Details:** The useEffect on line 108 fires whenever `view === 'picker'`, causing a re-fetch every time. Should check if templateSets are already loaded before fetching.
- **Priority:** Nice to have

#### BUG-6: No .limit() on GET /api/template-sets query
- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/template-sets/route.ts` (line 19-23)
- **Steps to Reproduce:**
  1. Create 500+ template sets for a tenant
  2. Call GET /api/template-sets
  3. Expected: Paginated or limited response
  4. Actual: All 500+ sets returned in one response
- **Details:** Per backend rules: "Use `.limit()` on all list queries." The template_set_slides sub-query also has no limit.
- **Priority:** Nice to have

#### BUG-7: No database RLS on template_sets, template_set_slides, slides, and projects tables
- **Severity:** Medium
- **Files:** SQL migrations in `/Users/sebastianploeger/AppProjekte/deckr_studio/supabase/migrations/`
- **Steps to Reproduce:**
  1. Review all SQL migrations for `ENABLE ROW LEVEL SECURITY` statements
  2. Expected: All data tables have RLS enabled with tenant-scoped policies
  3. Actual: Only tenants, users, subscriptions, invoices, and project_shares have RLS. The template_sets, template_set_slides, slides, and projects tables have NO RLS policies.
- **Details:** The storage bucket policies for 'template-sets' and 'slides' buckets exist, but these only protect file storage, not database rows. The API uses `createServiceClient()` which bypasses RLS, so this is currently not exploitable. However, the project security rules state "ALWAYS enable Row Level Security on every table" and "Use Supabase RLS as a second line of defense." This is a defense-in-depth gap.
- **Priority:** Fix before deployment

#### BUG-8: Silent failure when template set API fetch fails in picker
- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/projects/create-project-dialog.tsx` (line 122)
- **Steps to Reproduce:**
  1. Block network request to /api/template-sets (e.g., offline or server error)
  2. Open create project dialog, enter name, click Next
  3. Expected: Error message indicating template sets could not be loaded
  4. Actual: Shows "No template sets available" as if none exist -- misleading
- **Details:** The catch block is empty with a comment "Silent -- user can still pick Start from scratch." While functional, this provides misleading feedback.
- **Priority:** Nice to have

### Build Verification
- [x] `npm run build` passes with no errors
- [x] All template-sets API routes compiled as dynamic server functions
- [x] create-project-dialog.tsx compiles without warnings

### Summary
- **Acceptance Criteria:** 10/11 passed (1 partial pass -- AC-11 shows empty state instead of auto-skipping, which is an acceptable alternative per spec wording)
- **Edge Cases:** 4/4 passed (1 has a minor UX inefficiency -- BUG-5)
- **Bugs Found:** 8 total (0 critical, 2 high, 3 medium, 3 low)
- **Security:** Issues found (BUG-2 rate limiting, BUG-3 is_active bypass, BUG-7 missing RLS)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-2 (rate limiting) and BUG-3 (is_active check) before deployment. BUG-1 (Zod validation) and BUG-7 (database RLS) should also be addressed as they violate stated project security rules. Low-severity bugs can be addressed in next sprint.

### Bug Fix Status

| Bug | Status | Fix Applied |
|-----|--------|-------------|
| BUG-1 | FIXED | Added Zod schema (`CreateProjectSchema`) with UUID validation for `templateSetId` |
| BUG-2 | FIXED | Added `checkRateLimit(user.id, 'projects:create', 20, 60_000)` |
| BUG-3 | FIXED | Added `!profile.is_active` → 403 Forbidden check |
| BUG-4 | DEFERRED | Read endpoint rate limiting — nice to have |
| BUG-5 | FIXED | Guard `useEffect`: skip fetch if `templateSets.length > 0` |
| BUG-6 | FIXED | Added `.limit(100)` to GET /api/template-sets query |
| BUG-7 | FALSE POSITIVE | RLS was applied via Supabase MCP, not local migrations |
| BUG-8 | DEFERRED | Silent failure on fetch — functional, user can still pick "Start from scratch" |

### Summary After Fixes
- **5 of 8 bugs fixed**, 1 false positive, 2 deferred (low priority)
- `npm run build` passes
- **Production Ready:** YES

## Deployment
_To be added by /deploy_

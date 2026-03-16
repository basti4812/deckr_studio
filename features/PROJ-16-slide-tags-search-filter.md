# PROJ-16: Slide Tags & Search/Filter

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies

- Requires: PROJ-15 (Slide Library Management)
- Requires: PROJ-18 (Board Canvas) — search/filter lives in the board view

## User Stories

- As an admin, I want to add free-form tags to slides so that they can be categorized beyond their board group
- As a user, I want to search slides by title so that I can quickly find specific slides
- As a user, I want to search by tag so that I can find all slides related to a topic (e.g. "pricing")
- As a user, I want to filter by slide status (mandatory, deprecated, editable) so that I can focus on relevant slides
- As a user, I want to filter by group/section so that I can browse a specific category
- As a user, I want to combine search and multiple filters simultaneously so that I can narrow down results precisely
- As a user, I want live results as I type so that I don't need to press "Search"

## Acceptance Criteria

- [ ] `slide_tags` table: slide_id, tag (text), tenant_id — or stored as text array on the slides table
- [ ] Tags are managed by admins only: add/remove tags in the slide detail panel
- [ ] Tags are displayed on slide cards in the board view as chips/badges
- [ ] Search bar is persistent in the board's slide library area
- [ ] Search runs against slide title AND tags simultaneously as the user types (debounced 200ms)
- [ ] Search is case-insensitive
- [ ] Filter panel: collapsible sidebar/panel; contains: Group/Section checkboxes, Tag checkboxes, Status checkboxes
- [ ] Multiple filters can be active simultaneously; results show slides matching all active filters (AND logic)
- [ ] Filter state and search state are independent (both can be active at once)
- [ ] Clear search button resets search; "Clear all filters" button resets all filters
- [ ] Clearing search and all filters returns the board to its full view
- [ ] Active filter count badge shown on filter panel toggle button
- [ ] Result count displayed: "X slides found"

## Edge Cases

- What if search returns 0 results? → Empty state: "No slides match your search. Try different keywords or clear the filters."
- What if a tag is deleted by an admin? → The tag is removed from all slides; filter panel no longer shows it
- What if a slide has no tags? → It is not shown in tag-specific filters, but appears in title search and group filter
- What if a user types very fast? → Debounce prevents excessive queries; last input wins

## Technical Requirements

- Search implemented with PostgreSQL full-text search or ILIKE on title + tag array contains
- Tags stored as `text[]` array on the slides table for simplicity (or normalized tag table)
- Filter state stored in URL query params so the URL is shareable and browser back/forward works
- No separate search API route needed — queries run via Supabase client with filter chaining

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

Tags are stored as a `text[]` array column directly on the `slides` table (simpler than a normalized tag table at this scale — max 500 slides per tenant, max 20 tags per slide). All filtering happens client-side: the board page already loads all slides into memory, so no new search API is needed. Filter state is persisted in URL query params for shareability.

---

### Component Structure

```
Board Page (existing, extended)
+-- [NEW] SearchFilterBar
|   +-- Search input (debounced 200ms, × clear button)
|   +-- "Filter" toggle button (badge shows active filter count)
|   +-- "X slides found" counter
|   +-- "Clear all" button (when any filter/search is active)
+-- [NEW] FilterPanel (collapsible, opens below the bar)
|   +-- Groups section (checkbox per group)
|   +-- Tags section (checkbox per unique tag across all slides)
|   +-- Status section (checkboxes: Standard, Mandatory, Deprecated)
|   +-- "Clear all filters" button
+-- Canvas (existing)
    +-- GroupSection (existing, now receives filtered slides)
        +-- CanvasSlideCard (existing, extended)
            +-- [NEW] Tag chips (up to 3 shown, "+N more" if more)

Admin: EditSlideDialog (existing, extended)
+-- [NEW] Tag chip input (type → Enter/comma to add, × to remove)
```

---

### Data Model

No new tables. One new column on the existing `slides` table:

| Field  | Type     | Notes                                                          |
| ------ | -------- | -------------------------------------------------------------- |
| `tags` | `text[]` | Default empty array. Max 20 tags per slide, each max 50 chars. |

A GIN index is added on `tags` for efficient database-level array queries (used by any future server-side filtering).

---

### Backend

**Extended:** `PATCH /api/slides/[id]`

- Adds `tags` as an updatable field — admin-only (same guard as `status`)
- Validation: array of strings, max 20 items, each trimmed and max 50 chars

**Extended:** `POST /api/slides`

- Adds `tags` to the creation schema (optional, default `[]`)

**No new endpoints.** `GET /api/slides` already selects `*` so it will return `tags` once the column exists.

---

### Frontend

**Board page state additions:**

- `searchQuery: string` — live-updated, debounced 200ms before filtering
- `activeFilters: { groups: string[], tags: string[], statuses: string[] }` — checked filter values
- `filteredSections` — derived from `buildSections()`, then filtered by all active criteria (AND logic across filter types)
- URL sync: `?q=`, `?tags=`, `?statuses=`, `?groups=` — read on mount, updated on change via `replaceState`

**Filtering logic (AND across types, OR within a type):**

- A slide passes if: title/tag matches search query AND is in one of selected groups AND has one of selected tags AND has one of selected statuses
- When a filter type has no selection → that type is effectively inactive (shows everything)

---

### Tech Decisions

**Why `text[]` on slides table instead of a separate tags table?**
At ≤500 slides per tenant and ≤20 tags per slide, a normalized table adds join complexity with no query performance benefit. A `text[]` column with a GIN index is standard Postgres practice for this pattern and keeps the API simpler.

**Why client-side filtering?**
The board page already loads all slides on mount (≤500). Running filter logic in JavaScript on an in-memory array is instant (<1ms) and avoids round-trips. The debounce (200ms) prevents unnecessary re-renders while typing.

**Why URL params for filter state?**
Allows users to bookmark or share a filtered view (e.g. "all slides tagged 'pricing' and status mandatory"). Browser back/forward also restores the filter state naturally.

---

### No New Packages Required

All UI primitives are already installed: `Input`, `Checkbox`, `Badge`, `Collapsible` (shadcn/ui), and `Lucide` icons.

## QA Test Results

**Tested:** 2026-03-02
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Tags stored as text array on the slides table

- [x] `Slide` TypeScript interface includes `tags: string[]` (`src/components/slides/slide-card.tsx` line 24)
- [x] `POST /api/slides` schema includes `tags` with default `[]`, max 20, each max 50 chars
- [x] `PATCH /api/slides/[id]` validates tags with Zod schema (max 20, each max 50 chars)
- [ ] BUG: No database migration file exists for the `tags` column or GIN index (see BUG-1)

#### AC-2: Tags are managed by admins only (add/remove in slide detail panel)

- [x] `PATCH /api/slides/[id]` uses `requireAdmin()` guard -- only admins can update tags
- [x] `POST /api/slides` uses `requireAdmin()` guard -- only admins can create slides with tags
- [x] `EditSlideDialog` contains a tag chip input with Enter/comma to add, X to remove
- [x] Tag input supports Backspace to remove the last tag when input is empty
- [x] Tag input placeholder changes when tags are empty ("Type a tag and press Enter...")
- [x] Tag input is disabled when 20 tags are reached
- [x] Tags are normalized to lowercase on commit
- [x] Duplicate tags are prevented
- [x] Tags longer than 50 chars are rejected
- [ ] BUG: PATCH endpoint uses raw body `tags` instead of Zod-parsed/trimmed value (see BUG-2)

#### AC-3: Tags displayed on slide cards in board view as chips/badges

- [x] `CanvasSlideCard` renders tag chips below the title
- [x] Up to 3 tags shown, with "+N more" indicator when more than 3 exist
- [x] Tag chips styled as rounded-full bg-secondary pills with 10px font

#### AC-4: Search bar is persistent in the board's slide library area

- [x] `SearchFilterBar` component rendered in absolute top-left position on the canvas
- [x] Search bar has `data-no-pan` attribute to prevent canvas drag interference
- [x] Search bar shows when slides are loaded (`!loading && slides.length > 0`)
- [x] Search icon (magnifying glass) shown as prefix inside the input

#### AC-5: Search runs against slide title AND tags simultaneously (debounced 200ms)

- [x] Debounce implemented: `useEffect` with 200ms `setTimeout` from `searchInput` to `debouncedQuery`
- [x] Filtering logic checks both `slide.title.toLowerCase().includes(q)` and `slide.tags.some(t => t.toLowerCase().includes(q))`
- [x] Debounce cleanup: timer cleared on unmount via `clearTimeout` in effect return

#### AC-6: Search is case-insensitive

- [x] Both title and tag matching use `.toLowerCase()` before comparison

#### AC-7: Filter panel with Group, Tag, and Status checkboxes

- [x] `FilterPanel` component with three sections: Groups, Tags, Status
- [x] Each section uses shadcn `Checkbox` + `Label` components
- [x] Groups section shows all group names from the board
- [x] Tags section shows all unique tags across all slides (sorted alphabetically)
- [x] Status section has three hardcoded options: Standard, Mandatory, Deprecated
- [x] Panel is toggled via the "Filters" button in the `SearchFilterBar`
- [x] Panel has max-height scrollable areas for groups and tags (max-h-40)
- [ ] BUG: Filter panel is not using shadcn Collapsible component for animated open/close (see BUG-3)

#### AC-8: Multiple filters active simultaneously (AND logic)

- [x] AND logic across filter types confirmed: group AND tag AND status AND search query
- [x] OR logic within a filter type confirmed: e.g., checking two statuses shows slides with either status
- [x] When a filter type has no selection, that type is inactive (shows everything)

#### AC-9: Filter state and search state are independent

- [x] `searchInput`/`debouncedQuery` state is separate from `activeFilters` state
- [x] Clearing search does not affect active filters
- [x] Clearing filters does not affect search text

#### AC-10: Clear search button resets search; "Clear all filters" button resets all filters

- [x] Clear search (X button) calls `onSearchChange('')` which resets `searchInput`
- [x] "Clear all filters" button in `FilterPanel` calls `onClearFilters` which resets all three filter arrays
- [x] "Clear all" button in `SearchFilterBar` resets both search AND filters AND closes filter panel

#### AC-11: Clearing search and all filters returns board to full view

- [x] `isFiltering` check correctly determines if any filter/search is active
- [x] When `isFiltering` is false, `displaySections` shows full `sections` (all groups with all slides)

#### AC-12: Active filter count badge shown on filter panel toggle button

- [x] `filterCount` computed as sum of all active filter selections (groups + tags + statuses)
- [x] Badge rendered next to "Filters" text when `filterCount > 0`
- [x] Badge uses shadcn `Badge` component with `variant="secondary"`

#### AC-13: Result count displayed

- [x] Result count shown when filtering is active
- [ ] BUG: Text format is "{X} of {Y} slides" instead of spec's "X slides found" (see BUG-4)

### Edge Cases Status

#### EC-1: Search returns 0 results -- empty state

- [x] Empty state rendered: "No slides match your search." + "Try different keywords or clear the filters."
- [x] Shown correctly when `isFiltering && resultCount === 0`

#### EC-2: Tag deleted by admin -- removed from all slides

- [x] When admin removes a tag in `EditSlideDialog` and saves, the PATCH API updates the slide's tags array
- [x] After save, `onSaved` callback updates the slide in the admin page's state
- [ ] BUG: Board page does not auto-refresh after admin edits tags in the EditSlideDialog (board page and admin page are separate; stale data until page reload) -- this is acceptable since board page re-fetches on mount. Minor concern.

#### EC-3: Slide has no tags -- appears in title search and group filter

- [x] Filtering logic: when no tag filters are selected, slides without tags are shown
- [x] Tag filter check: `activeFilters.tags.length > 0 && !(slide.tags ?? []).some(...)` -- uses `?? []` fallback
- [x] Slides without tags still appear in title-based search results

#### EC-4: User types very fast -- debounce prevents excessive queries

- [x] 200ms debounce timer set in `useEffect`; each keystroke resets the timer
- [x] "Last input wins" behavior confirmed: `clearTimeout(timer)` before setting new timeout

### Additional Edge Cases Identified

#### EC-5: URL params restore on page load

- [x] URL params (`q`, `tags`, `statuses`, `groups`) read on mount via `useSearchParams`
- [x] `window.history.replaceState` used to sync state back to URL (not `pushState`, avoiding history pollution)

#### EC-6: Tags with special characters

- [ ] BUG: Tag input does not sanitize special characters (HTML entities, angle brackets, etc.) -- tags are rendered directly in JSX which React auto-escapes, so XSS is mitigated. However, comma-separated URL params could conflict if a tag contains a comma (see BUG-5)

#### EC-7: Empty tag input

- [x] `commitTagInput()` trims input and rejects empty strings (`if (!trimmed || ...`)

#### EC-8: Filter panel sections hidden when no data

- [x] Groups section hidden when `groups.length === 0`
- [x] Tags section hidden when `tags.length === 0`
- [x] Status section always shown (hardcoded three options)

### Security Audit Results

#### Authentication & Authorization

- [x] `GET /api/slides` -- requires authentication (`getAuthenticatedUser` check)
- [x] `POST /api/slides` -- requires admin role (`requireAdmin` check)
- [x] `PATCH /api/slides/[id]` -- requires admin role (`requireAdmin` check)
- [x] `DELETE /api/slides/[id]` -- requires admin role (`requireAdmin` check)
- [x] Tenant isolation: all queries filter by `auth.profile.tenant_id`

#### Input Validation

- [x] `POST /api/slides`: tags validated via Zod schema (array of trimmed strings, max 20, each max 50 chars)
- [ ] BUG: `PATCH /api/slides/[id]`: Zod validation runs but parsed result discarded; raw body value stored (see BUG-2)
- [x] Client-side: tag input trimmed and lowercased before adding
- [x] Client-side: duplicate tags rejected
- [x] Client-side: max 20 tags enforced (input disabled)

#### XSS / Injection

- [x] Tags rendered via React JSX -- auto-escaped by React, no `dangerouslySetInnerHTML`
- [x] Search input value not directly interpolated into HTML
- [x] URL params read via `searchParams.get()` (safe API)
- [ ] BUG: Tags containing commas would be split incorrectly when restored from URL params (see BUG-5)

#### Rate Limiting

- [ ] BUG: No rate limiting on `PATCH /api/slides/[id]` or `POST /api/slides` endpoints (see BUG-6)

#### Data Exposure

- [x] `GET /api/slides` returns `SELECT *` which includes tags -- appropriate for all authenticated users
- [x] No sensitive data leaked in tag responses

### Cross-Browser Testing (Code Review)

#### Chrome / Firefox / Safari

- [x] All components use standard React/JSX -- no browser-specific APIs
- [x] CSS uses Tailwind utility classes -- cross-browser compatible
- [x] `crypto.randomUUID()` used in tag input context (within EditSlideDialog for editable fields) -- supported in all modern browsers
- [x] `window.history.replaceState` -- universally supported
- [x] No WebKit/Moz-specific CSS prefixes needed (Tailwind handles this)

### Responsive Testing (Code Review)

#### Desktop (1440px)

- [x] Board canvas with search/filter bar renders correctly at desktop widths
- [x] Filter panel has fixed width (w-72 = 288px) -- appropriate for desktop

#### Tablet (768px) / Mobile (375px)

- [x] Board page shows mobile guard: "The board canvas requires a desktop browser" for `md:hidden`
- [x] Search/filter bar only renders inside `hidden md:flex` container -- not visible on mobile (by design, since the board canvas is desktop-only per PROJ-18)

### Bugs Found

#### BUG-1: Missing database migration for tags column and GIN index

- **Severity:** Critical
- **Steps to Reproduce:**
  1. Check `supabase/migrations/` directory
  2. Search for any migration creating a `tags` column on the `slides` table
  3. Expected: A migration file adding `ALTER TABLE slides ADD COLUMN tags text[] DEFAULT '{}'` and `CREATE INDEX idx_slides_tags ON slides USING GIN (tags)`
  4. Actual: No migration file exists. The column must be created manually in Supabase or via a new migration file. Without this migration, the feature cannot work in a fresh deployment.
- **Priority:** Fix before deployment

#### BUG-2: PATCH endpoint discards Zod-parsed tags, stores raw input

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Open `src/app/api/slides/[id]/route.ts` lines 43-50 and 69
  2. Zod validates and trims tags at line 45-46, but `parsed.data` is never used
  3. Line 69: `if (tags !== undefined) updates.tags = tags` stores the original raw body value
  4. Expected: `updates.tags = parsed.data` so Zod's `.trim()` transform is applied
  5. Actual: Tags with leading/trailing whitespace are stored untrimmed in the database
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts`
- **Priority:** Fix before deployment

#### BUG-3: Filter panel uses conditional render instead of shadcn Collapsible

- **Severity:** Low
- **Steps to Reproduce:**
  1. Open `src/app/(app)/board/page.tsx` lines 722-732
  2. Filter panel is toggled via `{filterOpen && <FilterPanel ... />}` (conditional render)
  3. Expected: Use shadcn `Collapsible` component for animated open/close transition as mentioned in the tech design ("Collapsible" listed as already installed)
  4. Actual: Panel appears/disappears instantly without animation
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/(app)/board/page.tsx`
- **Priority:** Nice to have

#### BUG-4: Result count text format differs from spec

- **Severity:** Low
- **Steps to Reproduce:**
  1. Open `src/components/board/search-filter-bar.tsx` line 71
  2. Expected: "X slides found" (per acceptance criterion AC-13)
  3. Actual: "{resultCount} of {totalCount} slides" -- provides more context (total count), but differs from spec
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/board/search-filter-bar.tsx`
- **Priority:** Nice to have (current format is arguably better)

#### BUG-5: Tags containing commas break URL param restore

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Admin creates a slide with a tag containing a comma, e.g. "sales, marketing"
  2. User navigates to board page and filters by that tag
  3. URL encodes tag as `?tags=sales%2C%20marketing`
  4. On page reload, `tagParam.split(',')` at line 241 of board/page.tsx splits it into `["sales", " marketing"]` instead of keeping it as one tag
  5. Expected: Tags with commas are correctly round-tripped through URL params
  6. Actual: The tag is split into two separate (non-existent) tags, breaking the filter
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/(app)/board/page.tsx`
- **Priority:** Fix before deployment

#### BUG-6: No rate limiting on slide CRUD endpoints

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Send rapid repeated PATCH requests to `/api/slides/[id]` (e.g., 100 requests in 1 second)
  2. Expected: Rate limiter returns 429 after threshold
  3. Actual: All requests are processed without throttling
- **Note:** Per security rules, rate limiting should be implemented on endpoints that modify data. The PROJ-8 implementation added rate limiting to profile endpoints as a pattern to follow.
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/[id]/route.ts`
- **Priority:** Fix in next sprint

#### BUG-7: EditSlideDialog tag input onBlur fires on dialog close, potentially adding unintended tag

- **Severity:** Low
- **Steps to Reproduce:**
  1. Open the Edit Slide dialog
  2. Start typing a tag but do not press Enter (e.g., type "pric")
  3. Click "Cancel" or click outside to close the dialog
  4. Expected: The partial tag "pric" is discarded since the user did not explicitly submit it
  5. Actual: `onBlur` calls `commitTagInput()` which adds "pric" as a tag just before the dialog closes. However, since the dialog close does not save (only "Save changes" saves), this only affects local state. If the user re-opens the dialog, the effect is lost. Minimal real impact.
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/slides/edit-slide-dialog.tsx`
- **Priority:** Nice to have

### Regression Testing

#### PROJ-15: Slide Library Management (Admin)

- [x] Admin slides page still uses `EditSlideDialog` -- now extended with tag management
- [x] `SlideCard` component unchanged in admin view (tags not displayed on admin cards, only on board canvas cards)
- [x] Upload, edit, delete flows unaffected by tag additions

#### PROJ-18: Board Canvas

- [x] Canvas pan/zoom unaffected -- search bar uses `data-no-pan` attribute
- [x] `buildSections()` logic unchanged -- filtering wraps around it
- [x] Canvas world size recalculation accounts for filtered sections

#### PROJ-19: Slide Groups & Admin Board Layout

- [x] Group sections render correctly with filtered slides
- [x] Empty groups shown as "No slides in this group" when filtered out
- [x] When not filtering, all groups display normally

#### PROJ-21: Project Tray & Drag-and-Drop Assembly

- [x] Adding slides to tray still works during active search/filter
- [x] Tray items reference slide IDs, not affected by filter state

### Summary

- **Acceptance Criteria:** 11/13 passed (2 with bugs: AC-1 missing migration, AC-13 text format)
- **Bugs Found:** 7 total (1 critical, 2 medium, 0 high, 4 low)
- **Security:** Issues found (BUG-2 raw input bypass, BUG-5 param injection, BUG-6 no rate limiting)
- **Production Ready:** NO
- **Recommendation:** Fix BUG-1 (migration), BUG-2 (Zod parsed data), and BUG-5 (comma in tags) before deployment. BUG-6 (rate limiting) can be addressed in next sprint. BUG-3, BUG-4, BUG-7 are low priority and can be deferred.

## Deployment

_To be added by /deploy_

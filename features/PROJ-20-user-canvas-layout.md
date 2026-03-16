# PROJ-20: User Canvas Layout (Personal Rearrangement)

## Status: In Review

**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies

- Requires: PROJ-18 (Board Canvas)
- Requires: PROJ-19 (Slide Groups & Admin Board Layout)

## User Stories

- As a user, I want to rearrange slides and sections on my own canvas so that I can organize the board in a way that suits my workflow
- As a user, I want to create personal groupings on my canvas so that I can logically cluster slides for my use cases
- As a user, I want to add text labels above slides as personal annotations so that I can add context for myself
- As a user, I want to reset my canvas to the admin default layout so that I can start fresh without losing my personal slides
- As a user, I want my personal layout to persist across sessions so that I don't have to rearrange every time I log in

## Acceptance Criteria

- [ ] Users can drag slides to different positions and groups on their personal canvas view
- [ ] Users can create personal groups (named sections) visible only to themselves
- [ ] Users can rename personal groups
- [ ] Users can add short text annotations (labels) above any slide on their canvas — visible only to themselves
- [ ] All personal layout changes are saved automatically and persist across sessions
- [ ] "Reset to admin layout" button available in the board toolbar — resets the user's layout back to the admin default
- [ ] After reset: only admin-configured groups and positions remain; personal annotations and personal groups are removed
- [ ] After reset: personal slides (PROJ-32) are always preserved and reappear in an "My Slides" section
- [ ] Personal layout is stored per user, per tenant — not shared with anyone else
- [ ] Other users always see their own layout or the admin default; personal changes are never visible to colleagues

## Edge Cases

- What if the admin adds new slides after the user has customized their layout? → New slides appear in an "Ungrouped" section at the bottom of the user's canvas until rearranged
- What if the admin deletes a slide the user had positioned? → Slide disappears from the user's canvas; no error
- What if a user resets the canvas while having unsaved drag operations? → Reset applies immediately; confirmation dialog first
- What if a user creates a personal group with the same name as an admin group? → Allowed; they are distinct objects; no deduplication

## Technical Requirements

- `user_board_layouts` table: user_id, tenant_id, layout_data (JSONB with group positions, slide positions, personal annotations), updated_at
- Layout changes auto-saved with debounce (e.g. 1 second after last drag operation)
- Layout is applied client-side on top of the admin default: fetch admin layout, then overlay user overrides
- Reset deletes the user's `user_board_layouts` record; subsequent render falls back to admin layout

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### UI Structure

```
Board Page (extended)
│
├── Toolbar (existing)
│   ├── ZoomControls (existing)
│   ├── SearchFilterBar (existing)
│   └── "Reset to default" button  ← NEW
│       └── ResetLayoutDialog (confirmation)
│
└── Canvas (extended)
    ├── Admin groups (existing rendering, reused)
    │   └── Slides rearrangeable within/between groups
    ├── Personal groups  ← NEW
    │   ├── PersonalGroupHeader (editable name + delete button)
    │   └── Slides draggable in/out
    ├── "Ungrouped" section (existing, for new admin slides)
    └── Slide Annotation  ← NEW (small label above any card)
```

### Data Model

**New table: `user_board_layouts`**

One row per user. Stores the entire personal layout as a JSON blob.

```
user_board_layouts has:
- User ID (links to user)
- Tenant ID (data isolation)
- Layout data (JSONB):
    personalGroups:  list of { id, name, position }
    slideOverrides:  per-slide { groupId, position, annotation? }
- Updated timestamp
```

The `slideOverrides` map is the key structure — it records which slides the user has moved and where, plus any personal annotation text. Slides not in this map remain in their admin-defined position.

**How layout is composed at render time (client-side):**

1. Fetch admin layout (groups + slide positions from PROJ-19 data)
2. Fetch user layout (JSONB from new table)
3. Merge: user overrides take precedence; admin-only slides with no override stay in their admin position; slides added by admin after last user save appear in "Ungrouped"

### API Routes

| Method | Route               | Purpose                                                   |
| ------ | ------------------- | --------------------------------------------------------- |
| GET    | `/api/board/layout` | Fetch caller's personal layout (empty if none saved yet)  |
| PUT    | `/api/board/layout` | Create or replace the full personal layout (upsert)       |
| DELETE | `/api/board/layout` | Reset — deletes the user's record, restores admin default |

All three routes are regular-user endpoints (not admin-only). RLS on the table ensures users can only touch their own row.

### Key Design Decisions

**Why client-side merge instead of server-side?**
Admin layout can change at any time (admins add/remove slides and groups). Merging on the client at render time means new admin slides always appear correctly (in "Ungrouped") without needing to update every user's saved layout. Server-side merge would require a background job or complex migration logic.

**Why PUT (full replace) instead of PATCH (partial update)?**
The layout is a single JSONB object that always represents the full state. Sending the entire document on each save is simpler and eliminates merge-conflict logic. Layout data is small (a few KB at most), so the payload cost is negligible.

**Why a separate `user_board_layouts` table instead of a column on `users`?**
Keeps the users table clean. The layout data can grow (many slides, many personal groups) and is read/written independently. Also easier to delete on reset.

**Debounce strategy (1 second):**
Matches the existing auto-save pattern used for project tray changes. Changes are batched in a ref, then a single PUT is sent 1 second after the last drag event.

**Annotation design:**
Short text labels (max 100 chars) stored inline in `slideOverrides`. No separate table needed. Displayed as a small caption above the slide card on canvas.

### Files to Modify

| File                           | Change                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------- |
| `src/app/(app)/board/page.tsx` | Add personal layout fetch, merge logic, reset button, personal group management, annotation display |

### Files to Create

| File                                           | Purpose                            |
| ---------------------------------------------- | ---------------------------------- |
| `src/app/api/board/layout/route.ts`            | GET + PUT + DELETE personal layout |
| `src/components/board/reset-layout-dialog.tsx` | Confirmation dialog before reset   |

### Database

New `user_board_layouts` table with RLS (applied via Supabase MCP):

- `SELECT` / `INSERT` / `UPDATE` / `DELETE` allowed only when `user_id = auth.uid()`
- Admins have no special elevated access to other users' layouts

## QA Test Results

**QA Date:** 2026-03-02
**Build:** PASS (npm run build)

### Acceptance Criteria

| #   | Criterion                                                                | Result                                    |
| --- | ------------------------------------------------------------------------ | ----------------------------------------- |
| 1   | Users can drag slides to different positions and groups                  | PASS (via right-click context menu)       |
| 2   | Users can create personal groups (named sections)                        | PASS                                      |
| 3   | Users can rename personal groups                                         | PASS                                      |
| 4   | Users can add short text annotations above any slide                     | PASS (via right-click → "Add annotation") |
| 5   | All personal layout changes saved automatically, persist across sessions | PASS (1s debounce, PUT to API)            |
| 6   | "Reset to admin layout" button in toolbar                                | PASS                                      |
| 7   | After reset: only admin groups/positions remain                          | PASS                                      |
| 8   | After reset: personal slides preserved in "My Slides"                    | N/A (PROJ-32 not built yet)               |
| 9   | Personal layout stored per user, per tenant                              | PASS                                      |
| 10  | Other users see their own layout or admin default                        | PASS (RLS enforced)                       |

### Bugs Found & Fixed

| ID    | Severity | Description                                                                                                                                | Status                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| BUG-1 | High     | Sort instability in `buildSections` — annotation-only overrides broke admin slide ordering (non-overridden slides defaulted to position 0) | FIXED — partitioned admin vs overridden slides, preserve admin order      |
| BUG-2 | Medium   | No UI to move slides between groups — `moveSlideToGroup` existed but wasn't wired                                                          | FIXED — added right-click context menu with "Move to group" submenu       |
| BUG-3 | Medium   | No way to add annotation on slides without existing one                                                                                    | FIXED — right-click context menu provides "Add annotation" for all slides |
| BUG-4 | Low      | Dead state variables `editingGroupId`/`editingGroupName`                                                                                   | FIXED — removed                                                           |

### Security Audit

| Check                  | Result                                         |
| ---------------------- | ---------------------------------------------- |
| Auth on all endpoints  | PASS (getAuthenticatedUser)                    |
| is_active check        | PASS (getUserProfile + is_active)              |
| Rate limiting          | PASS (30/min on PUT/DELETE)                    |
| Input validation (Zod) | PASS (groups max 50, annotation max 100 chars) |
| Tenant isolation       | PASS (user_id + tenant_id filter)              |
| RLS policies           | PASS (SELECT/INSERT/UPDATE/DELETE for own row) |
| XSS prevention         | PASS (React auto-escapes)                      |

### Edge Cases Verified

| Scenario                                           | Result                                 |
| -------------------------------------------------- | -------------------------------------- |
| Admin adds new slides after user customizes layout | PASS — appear in "Ungrouped"           |
| Admin deletes a slide the user had positioned      | PASS — slide disappears, no error      |
| User resets with unsaved operations                | PASS — confirmation dialog shown first |
| Personal group with same name as admin group       | PASS — allowed, distinct objects       |

## Deployment

_To be added by /deploy_

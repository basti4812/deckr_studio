# PROJ-31: Slide Notes (Private)

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies

- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-21 (Project Tray) — note icon on tray slide

## User Stories

- As a user, I want to write private notes on individual slides within a project so that I can keep talking points or reminders for myself
- As a user, I want my notes to be visible only to me so that collaborators and external viewers never see them
- As a user, I want a visual indicator on the slide in the tray when I have a note so that I know notes exist without opening them
- As a mobile user, I want to read and add slide notes so that I can review my talking points on the go

## Acceptance Criteria

- [ ] `slide_notes` table: id, project_id, slide_id, slide_instance_index, user_id, body, created_at, updated_at
- [ ] Notes button/icon on each tray slide; clicking opens the notes panel for that slide
- [ ] A yellow sticky-note icon on the tray slide card indicates a note exists (PROJ-21)
- [ ] Notes panel shows the user's current note for that slide as an editable textarea
- [ ] Note auto-saves on blur or after 1 second of inactivity
- [ ] Notes are never included in exports (PPTX or PDF)
- [ ] Notes are never shown to shared users or external viewers
- [ ] Notes are accessible in the mobile view (PROJ-42): read and edit are supported
- [ ] If no note exists, the panel shows an empty state: "Add a private note for this slide..."

## Edge Cases

- What if a user shares a project — do the notes become visible to the shared user? → No; notes are always private per user
- What if a slide is removed from the tray? → The note is retained in the DB (slide may be re-added); not shown but not deleted
- What if the project is archived? → Notes are preserved; edit is possible if the project is restored; mobile read-only view still shows them
- What if a user is removed from the team? → Their notes are retained in the DB but no longer accessible to anyone

## Technical Requirements

- RLS policy: notes readable/writable only by the user who owns them (user_id = auth.uid())
- Notes body: plain text, max 2000 characters
- Auto-save uses debounce (1000ms); no manual save button needed

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

One private, auto-saving text note per user per slide in a project. Stored in a new `slide_notes` table with strict per-user RLS. UI reuses the Sheet panel pattern from PROJ-30 (CommentPanel), but is simpler: single textarea with debounced auto-save, no threading, no notifications.

---

### Component Structure

```
Board Page (existing)
+-- TraySlideItem (extended, same as PROJ-30)
|   +-- [NEW] Notes button (StickyNote icon, hover-visible)
|   +-- [NEW] Yellow dot indicator when note exists
+-- [NEW] NotePanel (Sheet, side="right", sm:max-w-sm)
    +-- Header: "Private Note" + slide title
    +-- Textarea (full-height, auto-save)
    |   +-- Character counter (x / 2000)
    |   +-- Auto-save status ("Saving…" / "Saved")
    +-- Empty state prompt: "Add a private note…" (placeholder)
```

---

### Data Model

New `slide_notes` table:

| Column                 | Type        | Notes                       |
| ---------------------- | ----------- | --------------------------- |
| `id`                   | uuid        | PK                          |
| `project_id`           | uuid        | FK → projects               |
| `slide_id`             | uuid        | FK → slides                 |
| `slide_instance_index` | integer     | Tray position (0-based)     |
| `user_id`              | uuid        | FK → auth.users — the owner |
| `body`                 | text        | Max 2000 chars              |
| `created_at`           | timestamptz | Default now()               |
| `updated_at`           | timestamptz | Updated on every save       |

**Unique constraint:** `(project_id, slide_id, user_id)` — one note per user per slide per project.

**RLS:** Only `user_id = auth.uid()` can SELECT, INSERT, UPDATE. No one else can see another user's notes, even project owners.

---

### API Routes

| Method | Route                                   | Purpose                                              |
| ------ | --------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/projects/[id]/notes?slide_id=xxx` | Fetch the current user's note for a slide            |
| PUT    | `/api/projects/[id]/notes`              | Upsert note (create or update on the unique key)     |
| GET    | `/api/projects/[id]/notes/has`          | Returns `{ [slide_id]: true }` map for badge display |

The `has` endpoint is lightweight — it only returns which slides the user has notes on, not the note content. This powers the yellow dot badge when the board loads.

---

### Tech Decisions

**Why Sheet (not inline in tray)?**
Same reason as PROJ-30: the tray (288px) is too narrow for comfortable writing. A narrower Sheet (sm:max-w-sm = 384px) is sufficient since notes are plain text with no threading.

**Why auto-save with debounce instead of a Save button?**
The spec requires it. Debounce (1000ms after last keystroke) keeps the note in sync without requiring a user action. This follows the pattern already used in the text-editing fields (PROJ-29).

**Why UPSERT instead of separate create/update?**
There is exactly one note per user/slide. UPSERT on the unique constraint `(project_id, slide_id, user_id)` eliminates the need to track whether a note exists before saving.

**Why a separate `has` endpoint (not loading all note bodies)?**
Loading full note bodies for all slides on board mount would be wasteful for large projects. The `has` endpoint returns only a boolean map, keeping the initial load fast.

**Why no DELETE endpoint?**
Clearing the textarea saves an empty body. Empty-body notes are treated as "no note" in the UI (badge hidden). A true delete is unnecessary.

---

### No New Packages Required

`useCallback`, `useRef`, debounce via `setTimeout`/`clearTimeout` (no extra library). All UI primitives already installed: Sheet, Textarea, Badge (shadcn/ui), StickyNote icon (Lucide).

## QA Test Results

### Acceptance Criteria Verification

| #   | Criterion                                        | Result                                                                                                  |
| --- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | `slide_notes` table with all required columns    | PASS — 8 columns: id, project_id, slide_id, slide_instance_index, user_id, body, created_at, updated_at |
| 2   | Notes button/icon on each tray slide             | PASS — StickyNote icon in TraySlideItem, hover-visible                                                  |
| 3   | Yellow sticky-note icon when note exists         | PASS — `text-yellow-600 dark:text-yellow-400 opacity-100` when `hasNote`                                |
| 4   | Notes panel with editable textarea               | PASS — Sheet panel with Textarea component                                                              |
| 5   | Auto-save on blur or 1s inactivity               | PASS — 1000ms debounce + `handleBlur` immediate save                                                    |
| 6   | Notes not included in exports                    | PASS — export logic reads `text_edits` only, not notes                                                  |
| 7   | Notes not shown to shared users/external viewers | PASS — RLS enforces `user_id = auth.uid()`, API verifies project access                                 |
| 8   | Mobile view support                              | DEFERRED — PROJ-42 (Mobile View) not yet implemented                                                    |
| 9   | Empty state placeholder                          | PASS — "Add a private note for this slide..."                                                           |

### Database Verification

- RLS: SELECT, INSERT, UPDATE all enforce `user_id = auth.uid()` — no DELETE policy (by design)
- Unique constraint: `(project_id, slide_id, user_id)` — verified
- Check constraint: `char_length(body) <= 2000` — verified
- FK cascades: project, slide, user — all ON DELETE CASCADE
- Indexes: PK, unique, `(project_id, user_id)`, `(project_id, slide_id)` — all present
- `updated_at` trigger: present with `SET search_path = ''`

### Security Audit

- All API routes validate authentication (Bearer token)
- Rate limiting on all 3 endpoints (60/min each)
- Zod UUID validation on `slide_id` in GET and PUT
- Body max length validated both in Zod (2000) and DB check constraint
- Project access verified before any data operation
- No Supabase security advisor warnings related to PROJ-31

### Edge Cases Verified

- Shared project: notes invisible to other user (RLS `user_id = auth.uid()`)
- Slide removed from tray: note retained in DB, not deleted
- Empty body: treated as "no note" by `has` endpoint (`.neq('body', '')`)
- Rapid open/close: `handleClose` flushes pending save before unmount
- Switch slides while panel open: `key={noteSlideId}` forces clean remount

### Bugs Found & Fixed

**BUG-1 (Medium): Pending note lost on close within debounce window**

- Root cause: `useEffect` cleanup cleared debounce timer without flushing save; ESC close caused immediate unmount before `handleBlur` fired
- Fix: Added `handleClose()` in `note-panel.tsx` that flushes pending saves before calling `onClose()`

**BUG-2 (Low): Stale note text visible when switching slides**

- Root cause: NotePanel reused without remount when `noteSlideId` changed; old body visible until fetch completed
- Fix: Added `key={noteSlideId}` on NotePanel in `board/page.tsx` to force clean remount

### Build Verification

- `npm run build` — PASS (no errors or warnings)

## Deployment

_To be added by /deploy_

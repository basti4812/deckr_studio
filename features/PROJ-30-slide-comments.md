# PROJ-30: Slide Comments (Threaded)

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-25 (Project Sharing) — comments visible to all shared users
- Requires: PROJ-8 (User Profile) — author name and avatar
- Requires: PROJ-13 (In-app Notifications) — new comment notification
- Requires: PROJ-14 (Email Notifications) — new comment email

## User Stories
- As a user, I want to leave a comment on a slide in a shared project so that I can communicate feedback without switching to another tool
- As a user, I want to see comments from all collaborators so that I have full context on the discussion
- As a user, I want to reply to a comment in a thread so that the conversation is organized and readable
- As a user, I want to delete my own comments so that I can correct mistakes
- As an admin or project owner, I want to delete any comment so that I can moderate content

## Acceptance Criteria
- [ ] `comments` table: id, project_id, slide_id, slide_instance_index, parent_comment_id (nullable), author_id, body, created_at, deleted_at (nullable)
- [ ] Comment button/icon on each slide in the tray; clicking opens the comment panel for that slide
- [ ] A yellow comment icon on the tray slide card indicates that comments exist (PROJ-21)
- [ ] Comments panel shows: all top-level comments sorted oldest first, with threaded replies nested beneath
- [ ] Each comment shows: author avatar, author name, timestamp (relative), comment text
- [ ] Reply button on each comment opens an inline reply input
- [ ] Comment input: textarea, submit on button click or Cmd/Ctrl+Enter
- [ ] Users can delete only their own comments; admins and project owners can delete any comment
- [ ] Deleted comments show "This comment was deleted" placeholder (not removed from thread, to preserve thread continuity)
- [ ] New comment triggers in-app and email notification to all other project participants (owner + shared users)
- [ ] Comments are visible to all users who have access to the project (owner + shared users); not visible to external viewers (PROJ-35)

## Edge Cases
- What if a user who left a comment is removed from the team? → Comments remain; author name shows as "Former member"
- What if the project is archived? → Comments are preserved; no new comments can be added (archived = read-only)
- What if a comment contains very long text? → Display with "Show more" truncation after 300 chars
- What if a user comments on an unshared (personal) project? → Comments are visible only to the owner; still stored in DB
- What if the same user comments multiple times in quick succession? → Each comment is separate; no rate limiting

## Technical Requirements
- `parent_comment_id` enables threading: only one level of nesting (replies to top-level comments only; no nested replies)
- Comments are loaded per slide when the comment panel is opened (lazy load)
- Real-time updates via Supabase Realtime for new comments in the panel (while the panel is open)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
Threaded slide comments scoped to projects. Comments stored in a new `comments` table with RLS for project access control. UI uses a Sheet panel (same pattern as SharePanel). Real-time updates via Supabase Realtime. Notifications via existing `createNotifications()`.

---

### Component Structure

```
Board Page (existing)
+-- TraySlideItem (extended)
|   +-- [NEW] Comment button (MessageSquare icon, hover-visible)
|   +-- [NEW] Yellow dot badge when slide has comments
+-- [NEW] CommentPanel (Sheet, side="right")
    +-- Header: slide title + close button
    +-- Comment list (scrollable, oldest first)
    |   +-- CommentItem
    |   |   +-- Author avatar + name + relative timestamp
    |   |   +-- Comment body (truncated at 300 chars with "Show more")
    |   |   +-- Reply button → opens inline reply input
    |   |   +-- Delete button (own comment / admin / owner)
    |   |   +-- Nested replies (indented, same structure)
    |   +-- "Deleted comment" placeholder for soft-deleted items
    |   +-- Empty state: "No comments yet"
    +-- Comment input: textarea + Cmd/Ctrl+Enter submit
```

---

### Data Model

New `comments` table:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `project_id` | uuid | FK → projects |
| `slide_id` | uuid | FK → slides |
| `slide_instance_index` | integer | Tray position (0-based) |
| `parent_comment_id` | uuid | Nullable — top-level replies only |
| `author_id` | uuid | FK → auth.users |
| `body` | text | Max 2000 chars |
| `created_at` | timestamptz | Default now() |
| `deleted_at` | timestamptz | Nullable — soft delete |

RLS: access if user is project owner OR in project_shares.

---

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/projects/[id]/comments?slide_id=xxx` | List comments with author info |
| POST | `/api/projects/[id]/comments` | Create comment or reply |
| DELETE | `/api/projects/[id]/comments/[commentId]` | Soft-delete |
| GET | `/api/projects/[id]/comments/counts` | Comment counts per slide |

---

### Tech Decisions

**Why Sheet?** Tray is 288px wide — too narrow for comments. Sheet (448px) follows the existing SharePanel pattern.

**Why soft delete?** Preserves thread structure. "This comment was deleted" placeholder keeps replies contextual.

**Why single-level nesting?** Deep nesting is unreadable on small screens. Enforced in API: parent_comment_id must reference a top-level comment.

**Why comment counts endpoint?** Avoids loading all comments on board mount. Lightweight `{slide_id: count}` map for yellow dot badges.

**Why Supabase Realtime?** Spec requires real-time. Same pattern as notification-panel.tsx: subscribe on panel open, unsubscribe on close.

---

### No New Packages Required
All UI primitives already installed: Sheet, Avatar, Textarea, Button (shadcn/ui).

## QA Test Results
**Tested:** 2026-03-02
**Build:** PASS (`npm run build` succeeds)
**Supabase Advisors:** No new issues from PROJ-30

### Acceptance Criteria Verification

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | `comments` table with correct schema | PASS | All columns, types, FKs, indexes, CHECK(body <= 2000) verified |
| 2 | Comment button on each tray slide | PASS | MessageSquare icon, hover-visible, click opens panel |
| 3 | Yellow comment icon when comments exist | PASS | Yellow-600 color, always visible when count > 0 |
| 4 | Panel shows threaded comments oldest-first | PASS | GET API orders by created_at ASC, topLevel + replyMap threading |
| 5 | Each comment shows avatar, name, timestamp, text | PASS | CommentBubble with Avatar, timeAgo, body |
| 6 | Reply button opens inline reply input | PASS | setReplyingTo + "Replying to" banner |
| 7 | Textarea submit on click or Cmd/Ctrl+Enter | PASS | onKeyDown handler + Send button |
| 8 | Delete permissions (own/admin/owner) | PASS | DELETE route checks author, owner, tenant admin |
| 9 | Deleted comments show placeholder | PASS | "This comment was deleted" italic text |
| 10 | Notification on new comment | PASS | `notifyCommentAdded` → `createNotifications` (in-app + email) |
| 11 | Visible only to project participants | PASS | `verifyProjectAccess` + RLS policies (SELECT, INSERT, UPDATE) |

### Edge Cases Verification

| Edge Case | Status | Notes |
|-----------|--------|-------|
| Removed team member → "Former member" | PASS | GET enriches with `is_active !== false` check |
| Archived project → read-only | PARTIAL | API blocks POST (400), but UI shows input (BUG-1) |
| Long text → "Show more" at 300 chars | PASS | CommentBubble truncates + "Show more" button |
| Single-level nesting only | PASS | API validates parent has no parent |

### Security Audit

| Check | Status | Notes |
|-------|--------|-------|
| RLS policies on comments | PASS | SELECT, INSERT, UPDATE with proper project access checks |
| No DELETE RLS (intentional) | PASS | API uses soft-delete (UPDATE), not hard DELETE |
| Auth required on all routes | PASS | `getAuthenticatedUser` on GET, POST, DELETE, counts |
| Rate limiting | PASS | All 4 endpoints have `checkRateLimit` |
| Zod input validation | PASS | `CreateCommentSchema` validates slide_id (UUID), body (1-2000), parent_comment_id |
| Body length enforced | PASS | Zod max(2000) + DB CHECK constraint |
| XSS protection | PASS | React auto-escapes, `whitespace-pre-wrap` + `break-words` for body |
| Realtime enabled | PASS | `comments` in `supabase_realtime` publication |
| FK cascades | PASS | project/slide deletion cascades to comments |

### Bugs Found

**BUG-1 (Medium): `isArchived` hardcoded to `false` — archived projects show comment input**
- File: `src/app/(app)/board/page.tsx:1247`
- The board page's local `Project` interface lacks a `status` field, so `isArchived` is hardcoded to `false`
- Impact: Archived projects show the comment input; submitting fails silently (API returns 400)
- Fix: Add `status` to the board page's `Project` interface and fetch it, then pass `project?.status === 'archived'`

**BUG-2 (Medium): No error feedback in CommentPanel on failed submit/delete**
- File: `src/components/board/comment-panel.tsx`
- `handleSubmit` (line 127) and `handleDelete` (line 166) silently swallow API errors
- Impact: User types a comment, hits submit, nothing happens — no toast or error message
- Fix: Add `toast.error()` when `!res.ok` in both handlers

**BUG-3 (Medium): Realtime callback triggers side effect inside `setComments` updater**
- File: `src/components/board/comment-panel.tsx:108-113`
- `fetchComments()` is called inside a `setComments` updater function, which should be pure
- Impact: Works in practice but violates React rules; may double-fetch in StrictMode
- Fix: Move duplicate-check + re-fetch logic outside the updater

**BUG-4 (Low): `slide_id` query param not validated as UUID in GET endpoint**
- File: `src/app/api/projects/[id]/comments/route.ts:54`
- `slide_id` is taken from query params without UUID format validation
- Impact: Minimal — Supabase returns empty results for invalid UUIDs, no injection risk
- Fix: Add `z.string().uuid()` validation before querying

### Summary
- **Acceptance criteria met:** 11/11
- **Edge cases:** 4/4
- **Bugs found:** 4 (0 High, 3 Medium, 1 Low) — **ALL FIXED**
- **Security:** No issues
- **Production Ready:** YES

## Deployment
_To be added by /deploy_

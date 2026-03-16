# PROJ-36: Share Link Tracking

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-03

## Dependencies

- Requires: PROJ-35 (External Share Links & Branded Viewer) — tracking happens on viewer access

## User Stories

- As a user who shared a presentation, I want to see how many times my link was opened so that I know if the prospect viewed it
- As a user, I want to see a timestamped list of when the link was accessed so that I can see exactly when the prospect looked at it
- As a user, I want this data in the project's share panel so that I can access it without navigating away

## Acceptance Criteria

- [ ] `share_link_accesses` table: id, share_link_id, accessed_at, ip_hash (anonymized)
- [ ] Every time the viewer at `/view/{token}` is opened, a new access record is created
- [ ] Sharing panel shows per share link: total view count, timestamped list of all accesses (date + time)
- [ ] View count is shown on the share link card: "Viewed 3 times"
- [ ] Timestamped list shows the most recent 20 accesses; "Show all" expands the list
- [ ] Access tracking records are created server-side (not via client-side scripts) to avoid ad-blocker interference
- [ ] IP addresses are hashed before storage (never stored in plain text); used for analytics only, not exposed in the UI

## Edge Cases

- What if the same viewer opens the link multiple times? → Each page load is a separate access record; no deduplication (one person viewing 5 times = 5 records)
- What if the share link is expired? → Viewer shows "link expired" page; no access record is created for expired link views
- What if there are thousands of accesses? → UI shows last 20; DB stores all; no cap
- What if the user deletes the share link (PROJ-35)? → Access records are cascade-deleted with the link

## Technical Requirements

- Access record created in the server-side viewer page handler (Next.js server component or API route)
- IP hashing: SHA-256 of IP address + daily salt (anonymized per GDPR)
- Tracking does not require any JavaScript on the viewer page — purely server-side
- Access data loaded on demand when the user opens the share panel (not preloaded)

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### What Gets Built

PROJ-36 adds a **timestamped access log** to the share link system built in PROJ-35. Every time a recipient opens a presentation via a public share link, a record is written on the server — silently, instantly, without any JavaScript on the viewer page. Project owners and editors can then open the Share panel and see exactly when their link was viewed.

---

### Component Structure

```
SharePanel (existing — no change to panel itself)
  └── TabsContent "links"
        └── ShareLinksTab (extended)
              └── Link Card (extended)
                    ├── URL row            (existing)
                    ├── Meta row           (existing: view count, expiry, status)
                    └── Access History     (NEW — expandable)
                          ├── "Viewed 3 times — Show accesses ▾" toggle
                          ├── Access rows  (date + time, newest first, max 20)
                          └── "Show all X accesses" button (if > 20 total)
```

No new pages. No new panels. The tracking data surfaces inside the existing Share Link card within the existing Share panel.

---

### Data Model

**New table: `share_link_accesses`**

| Field           | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `id`            | Unique identifier for this access event                              |
| `share_link_id` | Which share link was accessed (FK → share_links, deletes cascade)    |
| `accessed_at`   | When the page was opened (server timestamp)                          |
| `ip_hash`       | SHA-256 of visitor IP + today's date — anonymized, never shown in UI |

**Modified: `share_links.view_count`**

Existing. Currently updated via the `increment_view_count` database function. PROJ-36 replaces this with a **database trigger** — when a new access record is inserted, the trigger automatically increments `view_count` on the parent share link. This means the viewer page only needs one DB write instead of two, and `view_count` stays perfectly in sync with the actual access table.

---

### What Changes

| Where                                                               | What Changes                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Database                                                            | Add `share_link_accesses` table + trigger replacing the RPC                                   |
| `/view/[token]/page.tsx`                                            | Replace fire-and-forget RPC with an insert into `share_link_accesses` (still fire-and-forget) |
| **New** API: `GET /api/projects/[id]/share-links/[linkId]/accesses` | Returns the timestamped access list for a specific link (auth required: owner or editor)      |
| `share-links-tab.tsx`                                               | Add expandable "Access History" section to each link card                                     |

---

### Tech Decisions

**Why a DB trigger instead of calling two things from the viewer?**
The viewer page is a public Server Component — it should do as little work as possible. A trigger on the database side means one insert = view count updated automatically. No chance of the two getting out of sync. Simpler code, more reliable data.

**Why SHA-256 + daily date salt for IP hashing?**
GDPR requires that personal data (IP addresses qualify) be handled with purpose limitation. Hashing the IP prevents us from ever reconstructing the original address. The daily date salt means the same visitor gets a different hash each day — we can't track a single person over time, only count visits per day. The hash is never shown in the UI; it's purely a technical field for potential future deduplication analytics.

**Why load access history on demand (not preloaded)?**
The Share panel may list several links. Loading all access history for all links upfront would be slow and wasteful. Instead, each link card has a toggle — only when expanded does it fetch its history. This keeps the panel fast to open.

**Why no pagination on the API — just a `limit` parameter?**
The UI shows the last 20 by default. A "Show all" button re-fetches without a limit. Simple, no infinite scroll complexity, and the data set is small (accesses per link, not global).

---

### New Files & Modified Files

| File                                                               | Type               | Change                                 |
| ------------------------------------------------------------------ | ------------------ | -------------------------------------- |
| DB migration `proj36_share_link_accesses`                          | SQL (Supabase MCP) | New table + trigger + RLS              |
| `src/app/api/projects/[id]/share-links/[linkId]/accesses/route.ts` | API (GET, auth)    | New — returns access list              |
| `src/app/view/[token]/page.tsx`                                    | Server Component   | Replace RPC with access record insert  |
| `src/components/projects/share-links-tab.tsx`                      | Client Component   | Add expandable access history per link |

---

### No New Dependencies

All required tools are already available: Supabase for the database, the existing `createBrowserSupabaseClient` for authenticated API calls in the tab, the native `crypto` module for SHA-256 hashing on the server.

## QA Test Results

**Tested:** 2026-03-03
**Build Status:** `npm run build` PASSES

### Acceptance Criteria: 7/7 PASS

| AC                                           | Status | Notes                                                                            |
| -------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| AC-1: `share_link_accesses` table            | PASS   | Table created via Supabase MCP with correct schema, FK CASCADE, indexes, trigger |
| AC-2: Access record on every viewer load     | PASS   | Server-side insert in `page.tsx`, fire-and-forget with error logging             |
| AC-3: View count + timestamped list in panel | PASS   | Badge + expandable AccessHistory component                                       |
| AC-4: "Viewed 3 times" on link card          | PASS   | `viewCountLabel` used consistently on Badge and toggle                           |
| AC-5: Last 20 + "Show all"                   | PASS   | Initial load = 20, "Show all" fetches up to 500                                  |
| AC-6: Server-side tracking only              | PASS   | Insert in Server Component, no client-side tracking                              |
| AC-7: IP hashed, never exposed               | PASS   | SHA-256 + daily salt, `ip_hash` never returned in API                            |

### Bugs Found & Status

| Bug                                        | Severity | Status                                                                    |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------- |
| BUG-1: Missing local migration file        | Medium   | FALSE POSITIVE — migrations applied via Supabase MCP (project convention) |
| BUG-2: Inconsistent view count text        | Low      | FIXED — Badge now uses `viewCountLabel`                                   |
| BUG-3: "Show all" fetches only 20          | High     | FIXED — `handleShowAll` passes `limit=500`                                |
| BUG-4: No tenant isolation on accesses API | Medium   | FIXED — added `getUserProfile` + `tenant_id` check                        |
| BUG-5: No rate limiting on viewer          | Medium   | DEFERRED — Server Component limitation, deferred to PROJ-42               |
| BUG-6: Silent error swallowing             | Low      | FIXED — added `console.error` in rejection handler                        |

### Security: PASS

- Auth required on accesses API, tenant isolation added
- IP hashes never exposed, Zod validation on all inputs
- Rate limiting on all authenticated endpoints

## Deployment

_To be added by /deploy_

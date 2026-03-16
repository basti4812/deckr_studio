# PROJ-35: External Share Links & Branded Viewer

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies

- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-21 (Project Tray) — defines slide order for viewer
- Requires: PROJ-1 (Multi-tenancy) — tenant branding in the viewer
- Requires: PROJ-34 (PDF Export) — PDF download in the viewer

## User Stories

- As a user, I want to generate a shareable link for my presentation so that external recipients can view it without logging in
- As an external viewer, I want to browse the presentation in a clean, fullscreen slide viewer in my browser so that I don't need any software
- As an external viewer, I want to download the presentation as a PDF so that I can keep a copy
- As a user, I want to configure the expiry of each share link so that I control how long the link is valid
- As a user, I want the viewer to show the tenant's branding so that the experience is professional

## Acceptance Criteria

- [ ] `share_links` table: id, project_id, tenant_id, created_by, token (unique random string), expires_at (nullable), created_at
- [ ] "Share" button in the project/board toolbar opens the sharing panel
- [ ] Sharing panel allows creating a new share link with expiry options: 1 day, 7 days (default), 30 days, No expiry
- [ ] Share link format: `https://app.onslide.io/view/{token}` (or domain-relative)
- [ ] External viewer at `/view/{token}` accessible without login
- [ ] Viewer shows: tenant logo, tenant primary color as accent, slides in tray order, slide-by-slide navigation (left/right arrows or click)
- [ ] Viewer is clean and fullscreen; no internal project data, comments, or notes are exposed
- [ ] Viewer shows a "Download PDF" button; clicking downloads the PDF version of the presentation (PROJ-34)
- [ ] If the link is expired: viewer shows an "This link has expired" page
- [ ] If the link token is invalid: viewer shows a "Link not found" page
- [ ] Sharing panel shows all existing share links for the project with: creation date, expiry, view count, status (active/expired)
- [ ] User can delete a share link from the panel to revoke access immediately

## Edge Cases

- What if the project is deleted after a share link is generated? → Expired/invalid page shown in viewer
- What if the project's slides are updated after a link is generated? → Viewer always shows the current project state (live, not a snapshot)
- What if the tenant's logo changes? → Viewer reflects the new logo on next load (no caching of branding)
- What if the same project has many share links? → Panel shows all of them; user can delete old ones

## Technical Requirements

- Share link tokens: 32-character URL-safe random string (crypto.randomUUID or similar)
- Viewer route is publicly accessible (no auth middleware)
- Tenant branding (logo, primary color) is loaded from the tenant record using the project's tenant_id
- Link expiry checked on every viewer page load (server-side)
- PDF for viewer download: generated on demand or cached per project version

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

This feature adds two things: (1) a management panel for creating/revoking public share links, and (2) a fully public, branded slide viewer that anyone with the link can access — no login required.

The existing internal `SharePanel` (PROJ-25) is extended with a new "External Links" section. The public viewer lives at a completely separate route (`/view/{token}`) that sits outside the authenticated app layout.

---

### A) Component Structure

```
Board Toolbar (existing)
+-- Share Button (opens SharePanel)

SharePanel — Sheet (right side drawer) — EXTENDED from PROJ-25
+-- Tab: People (existing internal sharing)
+-- Tab: Share Links (NEW)
    +-- "Create Link" controls
    |   +-- Expiry selector (1 day / 7 days / 30 days / No expiry)
    |   +-- "Create link" button
    +-- ShareLinkRow (one per existing link)
    |   +-- Full URL (click-to-copy)
    |   +-- Creation date + expiry date
    |   +-- View count badge
    |   +-- Status badge (Active / Expired)
    |   +-- Revoke button (trash icon)
    +-- Empty state ("No share links yet")

Public Viewer Page — /view/{token} — NO login required
+-- Branded Header Bar
|   +-- Tenant logo (from tenants.logo_url)
|   +-- Project name
|   +-- "Download PDF" button (accent color from tenants.primary_color)
+-- Slide Canvas (full-width, max-height, centered)
|   +-- Slide image (thumbnail_url)
|   +-- Placeholder tile for personal slides (no thumbnail)
+-- Navigation Controls
|   +-- Previous arrow button (left)
|   +-- Slide counter ("3 / 12")
|   +-- Next arrow button (right)
+-- Keyboard navigation (ArrowLeft / ArrowRight)

Error States (full-page, clean)
+-- Expired Link Page ("This link has expired.")
+-- Invalid Token Page ("Link not found.")
```

---

### B) Data Model

**New table: `share_links`**

Each share link record stores:

- Unique ID
- Which project it links to
- Which tenant it belongs to (for quick scoping)
- Who created it (the logged-in user)
- Token — 32-character URL-safe random string, globally unique
- Expiry timestamp (optional; null = never expires)
- View count — incremented on every viewer load
- Creation timestamp

The `token` is what goes in the URL: `/view/{token}`. It is never predictable or guessable.

**Tenant branding already exists** in the `tenants` table:

- `logo_url` — the company logo shown in the viewer header
- `primary_color` — the accent color for the Download PDF button and header bar

No new branding data is needed.

---

### C) Tech Decisions

**Why extend SharePanel instead of creating a new panel?**
The existing SharePanel is already wired into the board page and project cards. Adding a "Share Links" tab keeps all sharing controls in one place — consistent UX with minimal new plumbing.

**Why is `/view/{token}` outside the (app) route group?**
The `(app)` route group wraps every page with the authenticated sidebar layout. The viewer must be accessible to anyone without a login. Placing `view/[token]` at the top level of the app router (not inside any auth route group) means it gets no auth enforcement and no sidebar — just a clean blank canvas.

**Why server-side rendering for the viewer?**
Token validation and expiry checking happen on the server before any HTML is sent. If the token is invalid or expired, the server returns the error page directly — no JavaScript needed, no flash of the viewer before redirecting. Branding and slide data are also loaded server-side, so the page renders fully on first load.

**Why a dedicated `/api/view/[token]/pdf` endpoint?**
The existing PDF export API (`/api/projects/[id]/export/pdf`) requires user authentication. The viewer has no auth cookie. A separate public-facing endpoint accepts a share token instead, validates it, and generates the same PDF using the service client — reusing all the existing PDF generation logic.

**Token format**
32-character base64url string generated with `crypto.randomBytes(24)`. This gives 192 bits of entropy — practically impossible to guess.

**View count tracking**
Incremented server-side on every viewer page load (fire-and-forget, using the service client). This is what powers the "view count" displayed in the SharePanel.

**Rate limiting**
The public viewer and PDF endpoint use IP-based rate limiting (existing `ip_rate_limits` table) to prevent bulk scraping. Authenticated share link management endpoints use the standard per-user rate limiter.

---

### D) New Files & Routes

**Database**

- New migration: `proj35_share_links` — creates `share_links` table with RLS

**New API Routes (authenticated)**

- `POST /api/projects/[id]/share-links` — create a new share link
- `GET /api/projects/[id]/share-links` — list all links for the project
- `DELETE /api/projects/[id]/share-links/[linkId]` — revoke a link

**New API Routes (public, no auth)**

- `POST /api/view/[token]/pdf` — validate token, generate and stream PDF

**New Page**

- `src/app/view/[token]/page.tsx` — Server Component; validates token, fetches data, renders viewer

**New Components**

- `src/components/view/viewer-slideshow.tsx` — Client Component; handles slide navigation, keyboard events, Download PDF call
- `src/components/projects/share-links-tab.tsx` — the "Share Links" tab content for SharePanel

**Modified Components**

- `src/components/projects/share-panel.tsx` — add Tabs (People / Share Links), wire in ShareLinksTab

---

### E) Dependencies / Packages

No new packages required. All needed tools are already installed:

- `pdf-lib` — already used for PDF export
- shadcn `Tabs` — already installed (`src/components/ui/tabs.tsx`)
- shadcn `Badge`, `Button`, `Select`, `Sheet` — all already installed

## QA Test Results

**Tested:** 2026-03-03
**Build:** `npm run build` passes

### Acceptance Criteria: 12/12 PASS

| AC    | Description                                             | Status                                                          |
| ----- | ------------------------------------------------------- | --------------------------------------------------------------- |
| AC-1  | `share_links` table with correct schema                 | PASS (migration applied via Supabase MCP: `proj35_share_links`) |
| AC-2  | Share button opens sharing panel                        | PASS                                                            |
| AC-3  | Create link with expiry options (1d/7d/30d/never)       | PASS                                                            |
| AC-4  | Share link format `/view/{token}`                       | PASS                                                            |
| AC-5  | Viewer accessible without login                         | PASS                                                            |
| AC-6  | Viewer: tenant branding, tray order, navigation         | PASS                                                            |
| AC-7  | Viewer: clean, no internal data exposed                 | PASS                                                            |
| AC-8  | Viewer: Download PDF button                             | PASS                                                            |
| AC-9  | Expired link → "This link has expired"                  | PASS                                                            |
| AC-10 | Invalid token → "Link not found"                        | PASS                                                            |
| AC-11 | Panel shows links with date, expiry, view count, status | PASS                                                            |
| AC-12 | Delete link to revoke access                            | PASS                                                            |

### Edge Cases: 4/4 PASS

All edge cases pass: project deletion, slide updates, logo changes, multiple links.

### Bugs Found: 2 (both fixed)

**BUG-3/BUG-6 (Medium) — Share button/panel hidden from editors** FIXED

- QA found Share button and SharePanel only rendered for `isProjectOwner`. API allows editors.
- Fix: Changed board page conditions from `isProjectOwner` to `canEdit` for both the Share button (line 1257) and the SharePanel rendering (line 1354).

**BUG-5 (Medium) — Missing .catch() on view count increment** FIXED

- QA found `.then(() => {})` without `.catch()` on the `increment_view_count` RPC call.
- Fix: Changed to `.catch(() => {})` in `src/app/view/[token]/page.tsx`.

### QA False Positives

**BUG-1, BUG-2 — "Missing migration / RPC function"**: FALSE POSITIVE. Same pattern as PROJ-32 QA. The `share_links` table, RLS policies, indexes, and `increment_view_count` function were all applied via Supabase MCP `apply_migration` tool. The QA agent only searched local `supabase/migrations/` files and couldn't see remote MCP-applied migrations. Verified via `mcp__supabase__list_tables` (shows `share_links` with RLS enabled) and `mcp__supabase__list_migrations` (shows `proj35_share_links`).

### Known Limitations (deferred)

- **Viewer page rate limiting:** The `/view/[token]` Server Component has no IP rate limiting. Server Components don't receive `NextRequest`, so `checkIpRateLimit` can't be called directly. Would require Next.js middleware. The PDF download endpoint IS rate-limited. Deferred to PROJ-42 (middleware addition).
- **>50 share links:** No pagination. Unlikely scenario for V1.
- **Mobile 375px:** Share link URL row slightly cramped. Deferred to PROJ-42 (mobile responsive).

### Security Audit: PASS

- Auth: All management endpoints require Bearer token
- Tenant isolation: Ownership + project_shares checks prevent cross-tenant access
- Token: 192 bits entropy (crypto.randomBytes), UNIQUE constraint in DB
- Rate limiting: All authenticated endpoints + public PDF endpoint rate-limited
- No secrets exposed; no XSS vectors; security headers applied globally

## Deployment

_To be added by /deploy_

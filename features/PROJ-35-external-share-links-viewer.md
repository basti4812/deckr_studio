# PROJ-35: External Share Links & Branded Viewer

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

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
- [ ] Share link format: `https://app.deckr.io/view/{token}` (or domain-relative)
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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

# PROJ-36: Share Link Tracking

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

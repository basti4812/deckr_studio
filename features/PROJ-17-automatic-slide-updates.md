# PROJ-17: Automatic Slide Updates across Projects

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

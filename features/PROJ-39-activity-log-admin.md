# PROJ-39: Activity Log (Admin)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-1 (Multi-tenancy)

## User Stories
- As an admin, I want to see a log of all important actions taken in my tenant so that I have operational visibility
- As an admin, I want to filter the log by event type so that I can focus on a specific area
- As an admin, I want to filter the log by user so that I can audit a specific team member's activity
- As an admin, I want to see who did what, when, and to which object so that I have full context

## Acceptance Criteria
- [ ] `activity_logs` table: id, tenant_id, actor_id, event_type, resource_type, resource_id, resource_name, metadata (JSONB), created_at
- [ ] Activity log is accessible in admin workspace at `/admin/activity`
- [ ] Log shows events in reverse chronological order (newest first)
- [ ] Each log entry shows: actor name + avatar, event description, affected resource (linked), timestamp
- [ ] Events logged:
  - `slide.uploaded` — slide uploaded or updated
  - `slide.deprecated` — slide marked as deprecated
  - `template_set.created` — template set created
  - `template_set.updated` — template set updated
  - `project.exported` — project exported (by any user in tenant)
  - `user.invited` — user invited
  - `user.removed` — user removed
  - `user.role_changed` — user role changed
  - `subscription.changed` — subscription status changed
  - `share_link.created` — share link generated
- [ ] Filter by event type: dropdown with all event types; multi-select
- [ ] Filter by user: dropdown of all tenant users; single select
- [ ] Filters can be combined
- [ ] Log is paginated (20 per page)
- [ ] Log entries are retained for 12 months; older entries are auto-deleted

## Edge Cases
- What if the actor is an admin acting on behalf of a removed user? → Actor shown as the admin; resource_name preserved in metadata
- What if a log entry references a deleted resource? → Resource name preserved in `resource_name` field; link shows "Deleted" state
- What if there are no log entries? → Empty state: "No activity yet"
- What if two actions happen simultaneously? → Both are logged; order by `created_at` timestamp

## Technical Requirements
- Log entries are written in API routes after the relevant action completes (fire-and-forget; logging failure does not fail the action)
- `actor_id` references the `users` table; preserved even if user is later removed (via resource_name snapshot)
- Log is read-only; no deletion or editing of individual entries from the UI

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

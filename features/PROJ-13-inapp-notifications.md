# PROJ-13: In-app Notifications

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-4 (Subscription Data Model) — trial expiry notifications
- Requires: PROJ-24 (Project Creation) — project-related notification triggers
- Requires: PROJ-25 (Project Sharing) — sharing notification triggers

## User Stories
- As a user, I want to see a notification badge on the bell icon when I have unread notifications so that I know something needs my attention
- As a user, I want to click the bell icon and see a list of all recent notifications with timestamps so that I can review what happened
- As a user, I want to click a notification to navigate directly to the relevant project or admin section so that I can act on it quickly
- As a user, I want to mark individual notifications as read so that I can manage my notification list
- As a user, I want to mark all notifications as read at once so that I can clear the list efficiently
- As an admin, I want to receive notifications for payment failures and new team members so that I stay informed of team events

## Acceptance Criteria
- [ ] Bell icon in the main navigation bar shows an unread count badge (disappears when all are read)
- [ ] Clicking the bell opens a notification panel/drawer listing all notifications for the current user
- [ ] Each notification shows: icon by type, message text, timestamp (relative: "2 hours ago"), and "unread" indicator
- [ ] Clicking a notification navigates to the relevant resource and marks it as read
- [ ] "Mark all as read" button in the notification panel header
- [ ] Notifications are created for:
  - Project shared with user: "{{user}} shared {{project}} with you"
  - New comment on a project the user is part of: "{{user}} commented on {{slide}} in {{project}}"
  - Slide marked as deprecated in active project: "A slide in {{project}} has been deprecated"
  - Slide auto-updated in active project: "A slide in {{project}} was updated by an admin"
  - Trial ending at 7 days: "Your free trial ends in 7 days — subscribe to keep access"
  - Trial ending at 1 day: "Your free trial ends tomorrow!"
  - Payment failed (admins only): "Payment failed — please update your payment method"
  - New team member joined (admins only): "{{user}} joined your team"
- [ ] Notifications older than 90 days are automatically deleted
- [ ] Notification list is paginated or uses infinite scroll if more than 20 items

## Edge Cases
- What if a notification links to a project that no longer exists? → Clicking navigates to home screen; notification shows as stale
- What if a user has 0 notifications? → Bell shows no badge; panel shows "No notifications yet"
- What if a notification is created for a user who is no longer active (removed from team)? → Notification is created but never seen; ignored
- What if the same trigger fires twice in a short window (e.g., two rapid comments)? → Each comment creates a separate notification; no deduplication

## Technical Requirements
- `notifications` table: id, tenant_id, user_id, type, message, resource_type, resource_id, is_read, created_at
- Notifications are inserted via database triggers or API calls on the triggering events
- Real-time badge update via Supabase Realtime subscription on the notifications table (filtered by user_id)
- Notification panel loads via API call when opened (not preloaded)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

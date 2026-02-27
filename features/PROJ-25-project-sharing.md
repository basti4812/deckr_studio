# PROJ-25: Project Sharing (within tenant)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-13 (In-app Notifications) — sharing notification

## User Stories
- As a project owner, I want to share my project with specific colleagues so that we can collaborate on the presentation
- As a shared user, I want to view and edit a shared project so that I can contribute to it
- As a project owner, I want to revoke a colleague's access at any time so that I control who sees the project
- As a shared user, I want to see shared projects in a "Shared with me" section so that I can find them quickly

## Acceptance Criteria
- [ ] `project_shares` table: project_id, user_id, shared_by, shared_at
- [ ] Sharing panel accessible from the project (e.g., share icon in the board toolbar)
- [ ] Sharing panel shows: list of users currently with access (name, avatar, "Remove" button), search field to add new users
- [ ] User search: type a name or email to find colleagues within the same tenant
- [ ] Adding a user: creates a `project_shares` record; triggers in-app and email notification to the added user
- [ ] Shared users have full view and edit access (same as owner, except they cannot delete or archive the project)
- [ ] Owner can remove any shared user at any time; removal takes effect immediately
- [ ] Shared users can leave a shared project themselves via a "Leave project" option
- [ ] Shared projects appear in a "Shared with me" section on the home screen
- [ ] Sharing is scoped to the tenant: users from other tenants cannot be added

## Edge Cases
- What if the owner tries to share with themselves? → Blocked: "You already own this project"
- What if a shared user is removed from the team (PROJ-9)? → Their project_shares records are deleted; they lose access
- What if the project is deleted by the owner? → project_shares records are deleted; shared users see the project disappear
- What if a user tries to share with someone who already has access? → Error: "{{user}} already has access to this project"

## Technical Requirements
- RLS policy: project is readable/writable by owner OR by any user with a matching project_shares record
- Notification sent asynchronously after the share record is created
- Sharing panel loaded on demand (not pre-fetched with the project)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

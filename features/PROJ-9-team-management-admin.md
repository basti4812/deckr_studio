# PROJ-9: Team Management (Admin)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model)
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-4 (Subscription Data Model & Access Control) — seat limit enforcement

## User Stories
- As an admin, I want to invite new team members via email so that they can access the app
- As an admin, I want to create user accounts directly (without invitation email) so that I can set up accounts for users in advance
- As an admin, I want to change a user's role between admin and employee so that responsibilities can be reassigned
- As an admin, I want to remove a user from the team so that former employees lose access immediately
- As an admin, I want to see all current team members with their role, email, last active date, and profile picture so that I have a clear overview of my team
- As a removed user, I want my projects to remain in the system reassigned to the admin who removed me so that no work is lost

## Acceptance Criteria
- [ ] Team management page accessible in admin workspace at `/admin/team`
- [ ] Team list shows all users: profile picture, name, email, role, last active, join date
- [ ] "Invite user" button: opens form with email input field; sends invitation email; creates a pending user record
- [ ] Invited users appear in the list with status "Pending" until they accept
- [ ] "Create user directly" option: admin sets name, email, and temporary password; user receives a "set your password" email
- [ ] Role change: dropdown or toggle on each user row; changes take effect immediately
- [ ] Remove user: confirmation dialog required; user loses access instantly; their projects are transferred to the admin who removed them
- [ ] Seat limit: if licensed_seats is set and the team is at capacity, the invite button shows an upgrade prompt instead
- [ ] Admin cannot remove themselves
- [ ] Admin cannot change their own role if they are the last admin
- [ ] Pending invitations can be cancelled; cancellation removes the pending record and invalidates the invite link

## Edge Cases
- What if an invited email already has a pending invitation? → Error: "An invitation has already been sent to this email"
- What if a removed user tries to use their existing session? → Middleware detects removed status and logs them out immediately
- What if the invitation email bounces? → No automatic retry; admin sees invitation as "Pending" and can resend or cancel
- What if two admins remove the same user simultaneously? → Only one remove succeeds; second gets a "User not found" error
- What if the team is at the seat limit and the admin tries to invite? → Upgrade prompt shown; no invitation is sent

## Technical Requirements
- User removal sets an `is_active = false` flag; the user record is retained for data integrity
- Projects are transferred to the removing admin via a database transaction
- Invitation tokens are stored in the database with an expiry (7 days); expired tokens show "Invitation expired" on accept
- Last active date is updated on each authenticated API request

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

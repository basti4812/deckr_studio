# PROJ-9: Team Management (Admin)

## Status: In Progress
**Created:** 2026-02-25
**Last Updated:** 2026-02-27

## Dependencies
- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model)
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-4 (Subscription Data Model & Access Control) — seat limit enforcement
- Requires: PROJ-8 (User Profile & Account Settings) — avatar display in team list

## User Stories
- As an admin, I want to invite new team members via email so that they can self-service set up their account
- As an admin, I want to create user accounts directly with a temporary password so that I can onboard users without waiting for them to accept an invite
- As an admin, I want to resend a pending invitation so that I can help users who missed or deleted the email
- As an admin, I want to cancel a pending invitation so that I can revoke access before a user accepts
- As an admin, I want to change a team member's role between admin and employee so that responsibilities can be reassigned
- As an admin, I want to remove a user from the team so that former employees lose access immediately
- As an admin, I want to see all current and pending team members with their role, email, last active date, and profile picture so that I have a clear overview of my team
- As a removed user, I want my projects to remain in the system reassigned to the admin who removed me so that no work is lost

## Acceptance Criteria

### Team List
- [ ] Team management page accessible at `/admin/team` (admin only)
- [ ] Team list shows all users: profile picture (or initials fallback), display name, email, role badge, last active date, join date
- [ ] Last active date shows "Never" for users who have never logged in (pending + newly created)
- [ ] Active and pending users displayed in the same list; pending users show a "Pending" badge
- [ ] List sorted by join date (newest first); pending invitations shown at the top

### Invite via Email
- [ ] "Invite member" button opens a dialog with an email input
- [ ] On submit: sends a Supabase-managed invite email; creates a pending user record in the DB
- [ ] Invited user appears in the list immediately with "Pending" status
- [ ] Pending users show "Resend" and "Cancel" actions in their row
- [ ] Resend invitation: sends a new invite email and resets the 7-day expiry
- [ ] Cancel invitation: removes the pending user record and invalidates the invite link; confirmation dialog required
- [ ] Invite is blocked with an upgrade prompt if seat limit is reached (`active users >= licensed_seats`)

### Create User Directly
- [ ] "Create user" option (separate from Invite) opens a dialog with: name, email, temporary password fields
- [ ] On submit: creates the user account immediately (active, not pending); user receives a Supabase system email to set/confirm their password
- [ ] Newly created user appears in the list immediately with their role
- [ ] Create is blocked with an upgrade prompt if seat limit is reached

### Role Management
- [ ] Each active user row shows a role dropdown (Admin / Employee)
- [ ] Role change takes effect immediately (no save button required)
- [ ] Admin cannot change their own role if they are the last admin (dropdown disabled with tooltip explaining why)

### Remove User
- [ ] "Remove" action available on each active user row (not on own row)
- [ ] Confirmation dialog required before removal; shows the user's name
- [ ] On confirm: user's `is_active` set to `false`; existing Supabase Auth session invalidated
- [ ] Removed user's projects are transferred to the admin who performed the removal (database transaction)
- [ ] Admin cannot remove themselves (Remove action hidden/disabled on own row)

## Edge Cases
- Invited email already has a pending invitation → Error: "An invitation has already been sent to this email"
- Invited email already belongs to an active account in this tenant → Error: "This email is already a team member"
- Removed user tries to use an existing session → Proxy detects `is_active = false` and redirects to `/login` with an appropriate message
- Two admins remove the same user simultaneously → Only one succeeds; second gets a 404 "User not found" error
- Seat limit reached while an invitation is pending (another user accepts) → New invitations blocked; existing pending invitations remain valid until accepted or expired
- Last admin tries to change own role or remove themselves → Action is disabled (same guard for both)

## Technical Requirements
- **DB migration:** Add `last_active_at TIMESTAMPTZ` column to `users` table (nullable; updated on each authenticated API call via a shared helper)
- **Invite mechanism:** Use Supabase Auth `admin.inviteUserByEmail()` — no custom invitation token table needed; pending status detected via Supabase auth metadata (`email_confirmed_at IS NULL`)
- **Direct create:** Use Supabase Auth `admin.createUser()` with `password` set and `email_confirm: false`; Supabase sends a confirmation email automatically
- **Session invalidation on removal:** Call `admin.auth.signOut(userId, 'others')` after setting `is_active = false`
- **Project transfer:** Run as a Supabase service-role DB call — update `projects SET user_id = adminId WHERE user_id = removedUserId AND tenant_id = tenantId`
- **Seat counting:** Count `users WHERE tenant_id = X AND is_active = true AND email_confirmed_at IS NOT NULL` — pending users do NOT count against seat limit
- **Admin protection (last admin guard):** Before role demotion or removal, verify at least one other active admin exists in the tenant
- **Security:** All team management API endpoints use `requireAdmin()`; tenant isolation enforced on every query via `tenant_id` filter

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

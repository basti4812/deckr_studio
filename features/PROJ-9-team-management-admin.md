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

### Overview
Team Management replaces the placeholder at `/admin/team` with a fully functional page
where admins can view, invite, create, role-change, and remove team members — all within
their own tenant. No new third-party packages are required; all UI components are already
installed and the role-change API route already exists.

---

### Component Structure

```
/admin/team (TeamManagementPage)
├── Page Header
│   ├── Title: "Team Management"
│   ├── Seat Usage Indicator (e.g. "3 / 10 seats used")
│   ├── [Invite Member] button → opens InviteDialog
│   └── [Create User] button → opens CreateUserDialog
│
├── Team Table (shadcn Table)
│   ├── Columns: Avatar+Name, Email, Role, Status, Last Active, Since, Actions
│   │
│   ├── Row — Active User
│   │   ├── Avatar (photo or initials) + Display Name
│   │   ├── Email address
│   │   ├── Role Dropdown (Admin / Employee) — inline, no save button
│   │   │   └── Disabled with tooltip if: (a) own row or (b) last admin
│   │   ├── Active badge (green)
│   │   ├── Last active date (or "Never")
│   │   ├── Join date
│   │   └── [Remove] button (hidden on own row)
│   │
│   ├── Row — Pending User (invited, not yet accepted)
│   │   ├── — (no avatar; initials from email initial)
│   │   ├── Email address
│   │   ├── Role: Employee (fixed, cannot change until accepted)
│   │   ├── Pending badge (amber)
│   │   ├── "Never" (last active)
│   │   ├── Invite sent date
│   │   └── [Resend] | [Cancel] buttons
│   │
│   └── Empty State (if no members other than self)
│
├── InviteDialog (shadcn Dialog)
│   ├── Email input (required)
│   ├── [Send Invite] button (disabled at seat limit)
│   └── Seat-limit upgrade prompt (shown instead of button when at capacity)
│
├── CreateUserDialog (shadcn Dialog)
│   ├── Display Name input (required)
│   ├── Email input (required)
│   ├── Temporary Password input (required, min 8 chars)
│   ├── Role selector (Admin / Employee, default Employee)
│   ├── [Create Account] button (disabled at seat limit)
│   └── Seat-limit upgrade prompt (shown instead of button when at capacity)
│
├── RemoveConfirmDialog (shadcn AlertDialog)
│   ├── "Remove [Name] from your team?"
│   ├── Note: "Their projects will be transferred to you."
│   ├── [Cancel] and [Remove] buttons
│   └── Loading state while processing
│
└── CancelInviteConfirmDialog (shadcn AlertDialog)
    ├── "Cancel invite for [email]?"
    ├── [Keep Invite] and [Cancel Invite] buttons
    └── Loading state while processing
```

---

### Data Model Changes

**One new database column** on the existing `users` table:
- `last_active_at` — a timestamp, nullable, updated every time a user makes an authenticated
  API request. Starts as empty (NULL) for new/pending users, displayed as "Never" in the UI.

**No new tables** — pending invitations are detected by checking whether a user has completed
email verification (a built-in Supabase Auth field), so no separate invitation token table
is needed.

---

### API Surface

Six endpoints are needed (one already exists):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/team` | Fetch all team members (active + pending) for the admin's tenant |
| POST | `/api/team/invite` | Send an email invitation via Supabase Auth |
| POST | `/api/team/create` | Create a user account directly with a temp password |
| DELETE | `/api/team/[id]` | Remove a user (soft-delete + project transfer) |
| POST | `/api/team/[id]/invite/resend` | Resend a pending invitation email |
| DELETE | `/api/team/[id]/invite` | Cancel a pending invitation |
| **PATCH** | **`/api/users/[id]/role`** | **Already exists — reused as-is for role changes** |

All endpoints are admin-only and enforce tenant isolation.

---

### How Pending Users Work

When an admin sends an email invitation, Supabase Auth creates a user record and sends
a link. Until the invitee clicks that link and sets their password, their account is in a
"pending" state (recognizable because their email is unconfirmed). The backend detects this
by reading the Supabase Auth confirmation timestamp.

This means:
- No separate invitation token database needed
- Pending status is reliable and tamper-proof (comes from Supabase, not our DB)
- Cancelling an invitation deletes the unconfirmed Supabase Auth user + our users row

---

### How Seat Counting Works

Seats are counted as: active users whose email is confirmed (i.e., they have actually
accepted and set up their account). Pending invitations and newly created accounts awaiting
email confirmation do NOT count against the seat limit — only fully onboarded users do.

If `licensed_seats` is null (no cap), the limit is never enforced.

---

### How Project Transfer Works

When a user is removed, the database is updated in a single operation:
1. Mark the removed user as inactive
2. Reassign all their projects to the admin who clicked Remove

Both happen together so there is no window where a project has no owner.

---

### Key Reuse Points

| Existing Asset | Used For |
|----------------|----------|
| `PATCH /api/users/[id]/role` | Role change dropdown (already has last-admin guard) |
| `requireAdmin()` helper | Auth + tenant check on all new endpoints |
| `createServiceClient()` | Server-side Supabase queries bypassing RLS |
| `checkRateLimit()` | Rate-limit invite and create endpoints |
| shadcn Table, Dialog, AlertDialog, Badge, Avatar, Select | All UI components |
| `useCurrentUser()` hook | Get current admin's ID + tenant for seat count display |

---

### Tech Decisions

**Why no custom invitation table?**
Supabase Auth's built-in invite system handles token generation, expiry (7 days by default),
and email delivery. Building a parallel system would duplicate this work and create two
sources of truth. Using Supabase's native mechanism is simpler and more secure.

**Why reuse the existing role endpoint?**
`PATCH /api/users/[id]/role` already implements the last-admin guard, tenant isolation, and
JWT sync. Calling it from the team page dropdown avoids duplicating security logic.

**Why soft-delete instead of hard-delete?**
The `is_active = false` approach keeps the user's history (projects, comments, audit trail)
intact. The Supabase Auth session is invalidated immediately, so they lose access at once
even though the DB row is retained.

**Why update last_active_at in API middleware?**
Adding it to `src/proxy.ts` (which runs on every request) means every API call automatically
keeps the timestamp fresh — no individual route needs to handle it.

---

### New Files

| File | Purpose |
|------|---------|
| `src/app/(app)/admin/team/page.tsx` | Main page (replaces placeholder) |
| `src/app/api/team/route.ts` | GET (list) + POST invite + POST create |
| `src/app/api/team/[id]/route.ts` | DELETE (remove user) |
| `src/app/api/team/[id]/invite/route.ts` | DELETE (cancel invite) + POST (resend) |

**Migration file:**
- Add `last_active_at TIMESTAMPTZ` column to `users` table
- Update `src/proxy.ts` to write `last_active_at` on authenticated requests

---

### No New Packages Required
All needed UI components (Table, Dialog, AlertDialog, Select, Avatar, Badge, Tooltip, Skeleton)
are already installed as shadcn/ui components. Supabase admin Auth functions are available
via the existing service client.

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

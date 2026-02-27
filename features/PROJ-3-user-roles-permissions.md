# PROJ-3: User Roles & Permissions

## Status: In Review
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model)
- Requires: PROJ-2 (Authentication & User Sessions)

## User Stories
- As a system, I want to assign each user exactly one role (admin or employee) so that access control is enforced throughout the app
- As an admin, I want a dual workspace so that I can switch between managing the slide library and using the app like a regular employee
- As an admin, I want admin-only UI sections to be hidden from employees so that they cannot accidentally access admin controls
- As an employee, I want to see only the user workspace so that the interface is simple and focused
- As an admin, I want to change another user's role so that team members can be promoted or demoted
- As a developer, I want role checks in all API routes so that employees cannot call admin endpoints

## Acceptance Criteria
- [ ] `users` table has a `role` column with values: 'admin' | 'employee'
- [ ] The first user who creates a tenant is automatically assigned the 'admin' role
- [ ] Admin users see a workspace switcher in the navigation: "Admin" and "Personal"
- [ ] Admin workspace shows: slide library management, template set management, board layout config, team management, billing, activity log, analytics
- [ ] Employee workspace (and admin personal workspace) shows: home screen, board (user mode), projects, profile
- [ ] API routes that perform admin actions check the user's role and return 403 if not admin
- [ ] RLS policies on admin-only tables (e.g. slide upload, template set create) restrict write access to admins
- [ ] Role changes by an admin take effect immediately without requiring the affected user to re-login
- [ ] An admin cannot demote themselves if they are the last admin in the tenant

## Edge Cases
- What if the last admin tries to demote themselves? → Blocked with error: "At least one admin must remain in the team"
- What if an employee tries to access an admin URL directly? → Redirected to their home screen with no error
- What if a role change happens while the user is active in the app? → On their next navigation or page refresh, new permissions apply
- What if the `role` value is missing or malformed in the database? → Default to 'employee' permissions (fail safe)

## Technical Requirements
- Role must be stored in the `users` table, not inside the JWT (JWT is derived from Supabase Auth user metadata)
- Role checks in Next.js API routes use the authenticated user's DB record, not just the JWT
- Frontend role-based rendering uses a shared `useCurrentUser` hook that exposes `role`
- No UI components for admin functions are ever rendered for employees, even conditionally hidden

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-02-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: users table has role column
- [x] Registration creates user with role: 'admin' (verified in /api/register)
- [x] Role values validated with Zod enum: 'admin' | 'employee' (in /api/users/[id]/role)

#### AC-2: First user gets admin role
- [x] Registration API always sets role: 'admin' for the creating user

#### AC-3: Admin workspace switcher
- [x] AppSidebar shows "Admin" / "Personal" toggle for admin users
- [x] Toggle navigates between /dashboard and /home
- [x] Not shown for employee users

#### AC-4: Admin workspace navigation
- [x] Admin nav includes: Dashboard, Slide Library, Template Sets, Board Configuration, Team Management, Analytics, Activity Log, Billing

#### AC-5: Employee workspace navigation
- [x] Personal nav includes: Home, Board, Projects, Profile
- [x] Same nav shown for admin in personal mode

#### AC-6: API role checks
- [x] requireAdmin() helper verifies role === 'admin' before admin operations
- [x] Returns 403 for non-admin users
- [x] Used consistently in: /api/slides, /api/groups, /api/users/[id]/role, /api/subscription PATCH

#### AC-7: RLS policies restrict admin-only operations
- [ ] CANNOT VERIFY DIRECTLY: Requires Supabase dashboard review

#### AC-8: Role changes take effect immediately
- [x] PATCH /api/users/[id]/role updates both DB and auth app_metadata
- [x] If app_metadata sync fails, treated as non-fatal (DB is source of truth)

#### AC-9: Last admin cannot demote themselves
- [x] Last-admin guard implemented: counts admins in tenant, blocks if <= 1
- [x] Returns 422 with message "At least one admin must remain in the team"

### Edge Cases Status

#### EC-1: Last admin demotion blocked
- [x] Correctly implemented with admin count check

#### EC-2: Employee accesses admin URL
- [x] Admin layout component redirects non-admin to /home
- [ ] BUG: Client-side redirect only -- no server-side middleware check for /admin/* routes

#### EC-3: Role change while user is active
- [x] Role stored in DB as source of truth; TenantProvider re-fetches on navigation

#### EC-4: Missing or malformed role
- [x] Login defaults to 'employee' if role not in app_metadata (line 92: ?? 'employee')
- [x] Sidebar shows 'employee' as fallback

### Security Audit Results
- [x] Authorization: API routes use requireAdmin() -- employees get 403
- [x] Cross-tenant role change prevented: target user's tenant_id must match caller's
- [ ] BUG: Admin routes protected only client-side, not in middleware

### Bugs Found

#### BUG-5: Admin routes not protected server-side in middleware
- **Severity:** High
- **Steps to Reproduce:**
  1. An employee user navigates directly to /admin/slides in the browser
  2. The proxy.ts middleware does NOT check user role -- it only checks authentication
  3. The admin layout does a client-side redirect after rendering
  4. For a brief moment, the admin page shell renders before redirect
  5. Expected: Middleware should block /admin/* routes for non-admin users server-side
  6. Actual: Only client-side layout guard exists
- **Note:** The actual data is still protected because API routes use requireAdmin(), so no data leakage occurs. But the admin UI momentarily renders.
- **Priority:** Fix before deployment

#### BUG-6: GET /api/slides requires admin role -- employees cannot read slides
- **Severity:** High
- **Steps to Reproduce:**
  1. Employee user navigates to /board
  2. Board page fetches GET /api/slides
  3. GET /api/slides uses requireAdmin() -- returns 401/403 for employees
  4. Expected: All tenant users should be able to read slides (AC says "all tenant users can SELECT")
  5. Actual: Only admins can read slides via the API
- **Priority:** Fix before deployment

#### BUG-7: GET /api/groups requires admin role -- employees cannot see groups
- **Severity:** High
- **Steps to Reproduce:**
  1. Employee user navigates to /board
  2. Board page fetches GET /api/groups
  3. GET /api/groups uses requireAdmin() -- returns 401/403 for employees
  4. Expected: All tenant users should be able to read groups for the board
  5. Actual: Only admins can read groups via the API
- **Priority:** Fix before deployment

### Summary
- **Acceptance Criteria:** 8/9 passed (1 requires Supabase dashboard verification)
- **Bugs Found:** 3 total (0 critical, 3 high, 0 medium, 0 low)
- **Security:** Authorization gaps -- employees blocked from reading slides/groups they should access
- **Production Ready:** NO
- **Recommendation:** Fix BUG-6 and BUG-7 (change GET /api/slides and GET /api/groups to use getAuthenticatedUser instead of requireAdmin). Fix BUG-5 (add role check to middleware).

## Deployment
_To be added by /deploy_

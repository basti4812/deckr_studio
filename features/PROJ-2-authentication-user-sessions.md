# PROJ-2: Authentication & User Sessions

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies

- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model) — registration creates a tenant

## User Stories

- As a new admin, I want to register with email and password so that I can create my team's workspace
- As a returning user, I want to log in with email and password so that I can access my projects
- As a user, I want my session to persist across browser refreshes so that I don't have to log in repeatedly
- As a user, I want to log out and have my session fully invalidated so that my account is secure on shared devices
- As a user, I want to reset my password via email so that I can regain access if I forget it
- As an enterprise admin, I want to see an SSO login placeholder on the login screen so that SSO can be activated per tenant without UI changes
- As a developer, I want all authentication to go through Supabase Auth so that session management is handled securely

## Acceptance Criteria

- [ ] Registration page: email, password, confirm password, company name (creates tenant + admin user)
- [ ] Login page: email + password with error messages for invalid credentials
- [ ] Password reset: user enters email, receives reset link, sets new password
- [ ] Session persistence: Supabase session token stored and refreshed automatically
- [ ] Logout: clears session, redirects to login page
- [ ] Protected routes: unauthenticated users are redirected to login
- [ ] After login, admin users land on admin dashboard; employee users land on home screen
- [ ] Login page shows a visible but inactive "SSO Login" button/link with placeholder message
- [ ] Auth state is accessible throughout the app via a shared hook/context
- [ ] Email confirmation is sent on registration (Supabase built-in)

## Edge Cases

- What if a user registers with an email already in use? → Clear error: "An account with this email already exists"
- What if the password reset email is not received? → Resend link available after 60 seconds
- What if a user tries to access a protected route with an expired session? → Silently redirect to login, then back to intended URL after login
- What if login fails 5 times in a row? → Rate limiting message, temporary lockout (Supabase handles this)
- What if the company name field is empty during registration? → Validation error, registration blocked
- What if a user registered but never confirmed their email? → Login attempt shows "Please confirm your email" with resend option

## Technical Requirements

- Use Supabase Auth exclusively (no custom JWT logic)
- Use `window.location.href` for post-login redirect (not `router.push`) to avoid stale auth state
- Always verify `data.session` exists before redirecting
- Reset loading state in all code paths (success, error, finally)
- SSO fields (clientId, tenantId, domain) are stored in the tenant record but no SSO logic is active

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_To be added by /architecture_

## QA Test Results

**Tested:** 2026-02-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Registration page

- [x] Registration page at /register with email, password, confirm password, company name fields
- [x] Also includes display name and preferred language fields (bonus)
- [x] Zod validation on all fields (client + server side)
- [x] Password confirmation mismatch detected via superRefine

#### AC-2: Login page

- [x] Login page at /login with email + password
- [x] Error messages for invalid credentials ("Incorrect email or password")
- [x] Error handling for email not confirmed with resend option

#### AC-3: Password reset

- [x] Forgot password page at /forgot-password with email input
- [x] Reset password page at /reset-password with new password + confirm
- [x] 60-second resend cooldown implemented
- [x] API always returns 200 to prevent email enumeration (forgot-password)

#### AC-4: Session persistence

- [x] Uses @supabase/ssr for automatic cookie-based session handling
- [x] Proxy middleware uses getUser() for server-side token validation on every request

#### AC-5: Logout

- [x] POST /api/auth/logout clears session via supabase.auth.signOut()
- [x] Sidebar footer has logout button that calls signOut() and redirects to /login

#### AC-6: Protected routes

- [x] Proxy middleware (proxy.ts) redirects unauthenticated users to /login
- [x] Redirect includes original path as ?redirect= parameter for post-login navigation

#### AC-7: Role-based landing after login

- [x] Login page checks app_metadata.role -- admin -> /dashboard, employee -> /home
- [x] Auth callback route also routes by role
- [x] Uses window.location.href for redirect (as per best practice)

#### AC-8: SSO Login placeholder

- [x] Login page shows disabled "SSO Login" button with "Coming soon" badge
- [x] Tooltip: "Contact your admin to enable SSO for your organization"

#### AC-9: Auth state accessible via hook/context

- [x] TenantProvider context wraps the app layout
- [x] useCurrentUser() hook exposes userId, role, isAdmin, etc.
- [x] Auth state change listener re-fetches on login/logout

#### AC-10: Email confirmation on registration

- [x] Registration API calls generateLink for signup confirmation
- [x] SKIP_EMAIL_CONFIRMATION env var for development convenience
- [x] Login page handles "email not confirmed" error with resend button

### Edge Cases Status

#### EC-1: Duplicate email registration

- [x] Registration API returns 409 with message when email already exists

#### EC-2: Password reset email not received

- [x] Resend available after 60-second cooldown (implemented)

#### EC-3: Expired session on protected route

- [x] Proxy middleware redirects to /login with ?redirect= for post-login navigation

#### EC-4: Login fails 5 times

- [x] Registration endpoint has rate limiting (5 per hour per IP)
- [x] ACCEPTED: Login rate limiting is handled natively by Supabase Auth (signInWithPassword is a client-side call to Supabase, which enforces its own rate limits). No additional app-level rate limiting needed.

#### EC-5: Empty company name during registration

- [x] Zod validation: tenantName min 1 char required (server-side)
- [x] Client-side: companyName min 1 char required

#### EC-6: Unconfirmed email login attempt

- [x] Shows "Please confirm your email" with resend option

### Security Audit Results

- [x] Authentication: Proxy middleware validates session on every request using getUser()
- [x] Password hashing: Handled by Supabase Auth (bcrypt)
- [x] No secrets in client code: Service role key only used server-side
- [x] Registration rate limiting: 5 attempts per hour per IP (Supabase-backed, persists across cold starts)
- [x] Email enumeration prevention: forgot-password always returns 200
- [x] FIXED: Rate limiting now uses Supabase RPC (increment_ip_rate_limit) -- persists across serverless cold starts

### Bugs Found (Original)

#### BUG-2: No rate limiting on login endpoint

- **Severity:** Medium
- **Status:** ACCEPTED
- **Resolution:** Login calls supabase.auth.signInWithPassword directly from the browser client, which is rate-limited by Supabase Auth natively. No app-level wrapper is needed or possible (client-side call).

#### BUG-3: In-memory rate limiting on registration does not survive restarts

- **Severity:** Medium
- **Status:** FIXED (commit cab7c1c)
- **Verification:** Registration rate limiting now uses `checkIpRateLimit()` from `/src/lib/rate-limit.ts`, which calls `increment_ip_rate_limit` Supabase RPC. This persists across serverless cold starts and is shared across all instances.

#### BUG-4: Feature spec status mismatch

- **Severity:** Low
- **Status:** FIXED -- spec header now reads "Status: Deployed"

### Re-test Results (2026-03-07)

#### BUG-3 Re-test: Supabase-backed rate limiting

- [x] `checkIpRateLimit()` function uses Supabase RPC `increment_ip_rate_limit`
- [x] Returns 429 with Retry-After header when limit exceeded
- [x] Falls through (allows request) if RPC call fails (fail-open -- acceptable for registration)
- [x] IP extracted from x-forwarded-for or x-real-ip headers with 'unknown' fallback

#### New Issues Found During Re-test

#### BUG-20: IP rate limiter uses x-forwarded-for which can be spoofed

- **Severity:** Low
- **Steps to Reproduce:**
  1. Send POST /api/register with a custom `X-Forwarded-For: 1.2.3.4` header
  2. Each request with a different spoofed IP bypasses the rate limit
  3. Expected: Rate limiting should be resilient to header spoofing
  4. Actual: Attacker can rotate X-Forwarded-For values to bypass the 5-per-hour limit
- **Note:** This is a common pattern and acceptable when deployed behind a CDN/reverse proxy (Vercel) that overwrites x-forwarded-for with the real client IP. On Vercel specifically, `x-forwarded-for` is set by the platform and cannot be spoofed by end users.
- **Priority:** Nice to have (only relevant if deployed without a trusted reverse proxy)

### Summary

- **Acceptance Criteria:** 10/10 passed
- **Previous Bugs:** 3 total -- 1 accepted, 1 fixed, 1 fixed
- **New Bugs:** 1 (low severity)
- **Security:** PASS
- **Production Ready:** YES
- **Recommendation:** All previous bugs resolved. Deploy.

## Deployment

_To be added by /deploy_

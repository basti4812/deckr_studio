# Security Audit Report -- onslide Studio

**Auditor:** QA/Red-Team Pen-Tester
**Date:** 2026-03-16
**Scope:** Full codebase audit of `src/app/api/`, `src/lib/`, `next.config.ts`, `.env.local.example`, client-side code
**Methodology:** Static code analysis, pattern matching, threat modeling

---

## Executive Summary

The onslide Studio application demonstrates **strong security fundamentals**: every API route has authentication checks, Zod validation is used consistently, rate limiting is applied broadly, tenant isolation is enforced in data queries, and security headers are properly configured. However, several findings ranging from Medium to Critical severity were identified that require attention before production launch.

**Findings by severity:**

- Critical: 1
- High: 4
- Medium: 7
- Low: 5
- Info: 4

---

## Findings

---

### SEC-1: Open Redirect via Auth Callback `redirect` Parameter

**Severity:** HIGH
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/auth/callback/route.ts` (lines 51-53)
**Category:** Authentication & Session Security

**Description:**
The auth callback route accepts a `redirect` query parameter and uses it to construct a redirect URL without validating that the target is a same-origin path. An attacker can craft a link like:

```
/auth/callback?code=VALID_CODE&redirect=https://evil.com/steal-session
```

The `new URL(redirectTo, origin)` call will resolve `//evil.com` or `https://evil.com` as an absolute URL, redirecting the user off-site after authentication.

**Code:**

```typescript
if (redirectTo) {
  const url = new URL(redirectTo, origin)
  return NextResponse.redirect(url)
}
```

**Impact:** Post-authentication phishing. An attacker can send a user a link that goes through the legitimate auth flow but redirects them to a malicious site after login, potentially harvesting credentials or session tokens.

**Remediation:** Validate that `redirectTo` starts with `/` and does not start with `//` (protocol-relative URL). Alternatively, use a whitelist of allowed redirect paths.

---

### SEC-2: Missing Tenant Isolation in `GET /api/projects/[id]`

**Severity:** HIGH
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/projects/[id]/route.ts` (lines 34-40)
**Category:** IDOR / Tenant Isolation

**Description:**
The `GET /api/projects/[id]` endpoint fetches a project by ID without filtering by `tenant_id`. While it checks `owner_id` and falls back to `project_shares`, the initial project query uses only `.eq('id', id)`. This means an authenticated user from Tenant A can probe for the existence of project IDs belonging to Tenant B. If User A is somehow added to Tenant B's project shares (or if the project_shares check has a gap), cross-tenant data could leak.

The query at line 34:

```typescript
const { data, error } = await supabase
  .from('projects')
  .select('*')
  .eq('id', id) // <-- no tenant_id filter
  .single()
```

Compare with the `PATCH` handler on line 112 which also lacks `tenant_id` on the initial fetch, though it adds a profile tenant check later.

**Impact:** An authenticated user can enumerate project IDs across tenants. While the ownership/share check prevents direct data access in most paths, the response pattern (404 vs. successful project check) can leak information about project existence in other tenants.

**Remediation:** Add `.eq('tenant_id', profile.tenant_id)` to the initial project query in GET, PATCH, and DELETE handlers. This provides defense-in-depth alongside the ownership check.

---

### SEC-3: Missing `requireAuth` Helper -- No `is_active` Check in Many Routes

**Severity:** MEDIUM
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/lib/auth-helpers.ts`
**Category:** Authorization

**Description:**
The codebase has `getAuthenticatedUser()` (checks token) and `requireAdmin()` (checks token + admin role + is_active), but there is NO `requireAuth()` helper that checks `is_active` for regular users. Many routes use only `getAuthenticatedUser()` which does NOT verify `is_active`:

- `GET /api/slides` (line 23)
- `GET /api/projects` (line 13)
- `GET /api/projects/[id]` (line 24)
- `GET /api/profile` (line 18)
- `POST /api/profile/password` (line 25)
- `POST /api/projects/[id]/export` (line 43)
- `GET /api/projects/shared` (line 11)
- `POST /api/projects/[id]/share-links` (line 82)
- `DELETE /api/projects/[id]/share-links/[linkId]` (line 13)

A deactivated user (e.g., removed from the team via `DELETE /api/team/[id]`) retains a valid Supabase Auth session until it expires. During this window, they can still access and export data.

**Impact:** A removed team member can continue accessing all their data (projects, slides, exports) until their session naturally expires or the ban takes effect. The ban at line 107 of `team/[id]/route.ts` uses `876600h` which should be effective, but there is a race window.

**Remediation:** Create a `requireAuth()` helper that combines `getAuthenticatedUser()` + `getUserProfile()` + `is_active` check. Use it in all non-admin routes that currently use only `getAuthenticatedUser()`.

---

### SEC-4: Beta Access Password Comparison is Not Timing-Safe

**Severity:** MEDIUM
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/beta-access/route.ts` (line 16)
**Category:** Authentication

**Description:**
The beta access password is compared using a simple `!==` operator, which is vulnerable to timing attacks:

```typescript
if (!body.password || body.password !== betaPassword) {
  return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
}
```

Other parts of the codebase (webhook auth, unsubscribe tokens) correctly use `timingSafeEqual`.

**Impact:** Low practical risk since this is a gate password, not a user credential. An attacker could theoretically extract the beta password character by character via response timing differences.

**Remediation:** Use `timingSafeEqual` from `crypto` module, consistent with the webhook auth pattern.

---

### SEC-5: No Rate Limiting on Auth Endpoints (Login, Forgot Password)

**Severity:** HIGH
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/auth/forgot-password/route.ts`
**Category:** Rate Limiting

**Description:**
The `POST /api/auth/forgot-password` endpoint has NO rate limiting. While it correctly returns a generic success message to prevent email enumeration, an attacker can flood Supabase's email infrastructure by sending unlimited password reset requests. This can:

1. Cause Supabase email rate limits to be hit, blocking legitimate resets
2. Spam a victim's inbox with password reset emails

Similarly, the login flow (handled by Supabase client-side) has no server-side rate limiting via an API route. The `POST /api/auth/reset-password` endpoint also lacks rate limiting.

**Impact:** Email bombardment, potential DoS on Supabase email sending limits.

**Remediation:** Add `checkIpRateLimit()` to `forgot-password` (e.g., 5 requests per 15 minutes per IP). Add rate limiting to `reset-password` as well.

---

### SEC-6: Signed URL Expiration of 1 Year for Slides

**Severity:** MEDIUM
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/convert-presentation/route.ts` (line 114)
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/template-sets/[id]/cover/route.ts` (line 90)
**Category:** Storage & File Handling

**Description:**
Signed URLs for slide PPTX files and template set covers are created with a 1-year expiration:

```typescript
.createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1-year
```

These URLs are stored in the database and served to clients. Once generated, there is no way to revoke them before expiry. If a signed URL leaks (browser history, logs, Referer header), the file remains accessible for up to a year.

**Impact:** Leaked signed URLs provide unauthorized access to slide content (potentially confidential presentations) for an extended period.

**Remediation:** Reduce signed URL expiration to 1-24 hours. Generate fresh signed URLs on each request instead of storing them. Alternatively, use Supabase storage policies to control access.

---

### SEC-7: SSRF Risk in `generate-thumbnails` Route -- Unvalidated `pptx_url`

**Severity:** HIGH
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/generate-thumbnails/route.ts` (lines 74-92)
**Category:** SSRF

**Description:**
The `generate-thumbnails` endpoint fetches slides from the database, then passes their `pptx_url` directly to ConvertAPI without validating the URL:

```typescript
body: JSON.stringify({
    Parameters: [
        { Name: 'File', FileValue: { Url: pptxUrl } },
    ],
}),
```

Unlike `convert-presentation/route.ts` which validates that `sourceUrl` starts with the Supabase storage URL (line 54), the `generate-thumbnails` route does NOT validate `pptx_url`. If an attacker (admin user) can set a slide's `pptx_url` to an internal URL, ConvertAPI will fetch it, enabling SSRF.

The `pptx_url` is set via `POST /api/slides` (line 82) and `PATCH /api/slides/[id]` (line 83), where it only validates that it is a valid URL (Zod `z.string().url()`), not that it points to Supabase storage.

**Impact:** An admin user could point `pptx_url` to internal services, cloud metadata endpoints (`http://169.254.169.254/`), or other sensitive URLs. ConvertAPI would fetch the content and return it in the response, leaking internal data.

**Remediation:** Validate that `pptx_url` starts with `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/` before passing it to ConvertAPI. Apply the same validation in `render-preview/route.ts` line 94 where `slide.pptx_url` is fetched directly by the server.

---

### SEC-8: No `requireAdmin` Rate Limiting Check for Group Name Input

**Severity:** LOW
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/groups/route.ts` (lines 32-57)
**Category:** Input Validation

**Description:**
The `POST /api/groups` endpoint does not validate the `name` field with Zod. It uses `body.name?.trim() || 'New Group'` without length limits. An admin could submit extremely long group names that could cause display issues or excessive database storage:

```typescript
const name = body.name?.trim() || 'New Group'
```

There is also no rate limiting on group creation.

**Impact:** Low. Only admin users can create groups. However, missing length validation could lead to data quality issues.

**Remediation:** Add `z.string().min(1).max(100)` validation and rate limiting consistent with other endpoints.

---

### SEC-9: `render-preview` Downloads Arbitrary URLs (Potential SSRF)

**Severity:** HIGH (duplicate/extension of SEC-7)
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/render-preview/route.ts` (line 94)
**Category:** SSRF

**Description:**
The `render-preview` endpoint downloads the PPTX directly from `slide.pptx_url` server-side:

```typescript
const downloadRes = await fetch(slide.pptx_url)
```

While the slide record is fetched with tenant isolation (`eq('tenant_id', profile.tenant_id)`), the `pptx_url` itself could point to any URL if an admin has set it to an arbitrary value.

Same issue exists in:

- `POST /api/projects/[id]/export/route.ts` (line 162): `const downloadRes = await fetch(slide.pptx_url)`

**Impact:** The server acts as a proxy, fetching any URL stored in the `pptx_url` field. This enables SSRF attacks against internal networks.

**Remediation:** Validate all `pptx_url` values before server-side fetching. Either validate at write time (in `POST/PATCH /api/slides`) or validate at read time before `fetch()`.

---

### SEC-10: Missing CSRF Protection on State-Changing Endpoints

**Severity:** MEDIUM
**File:** All `POST`, `PATCH`, `PUT`, `DELETE` API routes
**Category:** CSRF

**Description:**
The application uses Bearer token authentication (Authorization header) for API routes, which provides inherent CSRF protection since browsers do not automatically send Authorization headers in cross-origin requests. However, the auth callback at `/auth/callback/route.ts` and logout at `/api/auth/logout` use cookie-based authentication, which IS vulnerable to CSRF.

The logout endpoint uses a cookie-based Supabase server client, meaning a malicious site could trigger a logout by making a POST request to `/api/auth/logout` from the user's browser.

**Impact:** An attacker could force a user to log out by embedding a form submission on a malicious page. Not high-impact but can be annoying.

**Remediation:** Add a CSRF token check on the logout endpoint, or verify the Origin/Referer header.

---

### SEC-11: `editable_fields` Accepts `z.array(z.unknown())` Without Type Validation

**Severity:** LOW
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/slides/route.ts` (line 13)
**Category:** Input Validation

**Description:**
The `CreateSlideSchema` accepts `editable_fields` as `z.array(z.unknown())`:

```typescript
editable_fields: z.array(z.unknown()).default([]),
```

This allows any arbitrary JSON to be stored in the `editable_fields` column. While the data is stored as JSONB in PostgreSQL (which prevents SQL injection), storing arbitrary data can lead to unexpected behavior in downstream code that processes these fields.

**Impact:** Low. Could lead to runtime errors or unexpected behavior in export/render-preview code that casts `editable_fields` to a specific shape.

**Remediation:** Use the same `EditableFieldSchema` from `/api/slides/[id]/route.ts` for the create endpoint as well.

---

### SEC-12: No Middleware for Route Protection

**Severity:** MEDIUM
**File:** No `middleware.ts` found in project
**Category:** Authentication & Session Security

**Description:**
The application has no Next.js middleware for route protection. All authentication checks are done within individual API route handlers. While this works, it means:

1. There is no centralized auth check -- every new route must remember to add authentication
2. Server-rendered pages under `(app)/` can potentially be accessed without authentication if the page component doesn't check
3. No automatic session refresh/redirect for expired sessions

**Impact:** Future routes added without authentication checks would be publicly accessible. Server components could render sensitive data for unauthenticated requests.

**Remediation:** Add a `middleware.ts` at `src/middleware.ts` that validates Supabase session cookies for all routes under `/(app)/` and redirects to `/login` if no valid session exists.

---

### SEC-13: `cover_image_url` Accepts Arbitrary URLs Without Validation

**Severity:** LOW
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/template-sets/[id]/route.ts` (lines 61-63)
**Category:** Input Validation

**Description:**
The PATCH endpoint for template sets accepts `cover_image_url` without any URL validation:

```typescript
if (body.cover_image_url !== undefined) {
  updates.cover_image_url = body.cover_image_url
}
```

An admin could set this to any URL, including `javascript:` schemes (though these would not execute in an `<img>` tag), tracking pixels, or internal URLs.

**Impact:** Low. Only admin users can set this value. The URL is used in `<img>` tags which limits XSS risk.

**Remediation:** Validate with `z.string().url()` or restrict to Supabase storage URLs.

---

### SEC-14: Webhook Body Parsing Before Auth Verification

**Severity:** LOW
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/webhooks/subscription-created/route.ts` (lines 18-25)
**Category:** Webhook Security

**Description:**
In all webhook endpoints, the request body is parsed BEFORE the webhook secret is verified:

```typescript
let body: unknown
try {
  body = await request.json()
} catch {
  body = null
}
const authError = verifyWebhookSecret(request)
if (authError) return authError
```

This means the server processes (parses JSON) for ALL incoming requests, even unauthenticated ones.

**Impact:** Low. JSON parsing is computationally cheap. However, an attacker could send very large payloads that consume memory before authentication fails.

**Remediation:** Move `verifyWebhookSecret()` before `request.json()` parsing. This is a defense-in-depth improvement.

---

### SEC-15: No Replay Protection on Webhooks

**Severity:** MEDIUM
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/lib/webhook-auth.ts`
**Category:** Webhook Security

**Description:**
The webhook authentication uses a static shared secret without any timestamp or nonce-based replay protection. An attacker who captures a valid webhook request (e.g., via network sniffing) can replay it indefinitely.

The `payment-failed` webhook at `/api/webhooks/payment-failed/route.ts` trusts the `tenant_id` from the request body and sends notifications to that tenant's admins. A replayed `payment-failed` webhook would repeatedly trigger false payment failure notifications.

**Impact:** Medium. Replayed webhooks could trigger duplicate notifications and potentially manipulate subscription state when real handlers are implemented.

**Remediation:** Add a timestamp to webhook payloads and reject requests older than 5 minutes. When Stripe is connected, use Stripe's built-in signature verification which includes timestamp protection.

---

### SEC-16: `payment-failed` Webhook Trusts `tenant_id` From Request Body

**Severity:** CRITICAL
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/api/webhooks/payment-failed/route.ts` (line 30)
**Category:** Webhook Security / Authorization

**Description:**
The `payment-failed` webhook reads `tenant_id` directly from the untrusted request body:

```typescript
const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id : null
```

Then uses it to look up and notify all admins in that tenant. An attacker who knows the `WEBHOOK_SECRET` (or exploits the non-replay-protected webhook) can send a crafted payload targeting ANY tenant, causing false payment failure notifications to appear for any organization.

While the webhook secret provides some protection, the pattern of trusting body-supplied identifiers is dangerous. When real payment processing is connected, this pattern could allow an attacker to manipulate the subscription status of arbitrary tenants.

**Impact:** An attacker with the webhook secret can send false payment failure notifications to any tenant. When real payment processing is implemented with this pattern, the impact escalates to subscription manipulation.

**Remediation:** When Stripe is connected, derive `tenant_id` from the Stripe customer/subscription object, NOT from the webhook body. For now, add validation that the `tenant_id` exists in the database before sending notifications.

---

### SEC-17: `email` Subject Line Contains Unsanitized User-Supplied `message`

**Severity:** LOW
**File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/lib/email.ts` (line 114)
**Category:** Email Security

**Description:**
The email subject line includes the user-supplied `message` parameter without specific email-header sanitization:

```typescript
const subject = `${params.tenantName}: ${params.message}` // plain text, no HTML
```

While the HTML body is properly escaped with `escapeHtml()`, email subjects with newlines or very long strings could cause issues with some email clients. The `fromName` is sanitized (line 115), but the subject is not.

**Impact:** Low. Nodemailer handles header encoding, but extremely long subjects or embedded newlines could theoretically enable header injection in edge cases.

**Remediation:** Truncate the subject to ~200 characters and strip newlines/control characters.

---

---

## Positive Security Findings (What Was Done Well)

### AUTH-GOOD-1: Consistent Authentication Checks

Every single API route has either `getAuthenticatedUser()`, `requireAdmin()`, or `checkIpRateLimit()` as its first operation. No unauthenticated access to protected endpoints was found.

### AUTH-GOOD-2: Token Verification via Supabase `getUser()`

The `getAuthenticatedUser()` function correctly calls `supabase.auth.getUser()` which validates the JWT server-side against Supabase, rather than just decoding the token locally. This prevents forged token attacks.

### RATE-GOOD-1: Comprehensive Rate Limiting

Rate limiting (Supabase-backed, persistent across cold starts) is applied to virtually all state-changing endpoints. The IP-based rate limiter is correctly used for unauthenticated endpoints (register, unsubscribe, view-pdf).

### INPUT-GOOD-1: Consistent Zod Validation

Nearly all API routes use Zod schemas for input validation. JSON parsing is wrapped in try/catch blocks consistently.

### TENANT-GOOD-1: Tenant Isolation in Queries

Almost all database queries include `.eq('tenant_id', profile.tenant_id)` to enforce multi-tenant data isolation. The slide, project, team, and analytics routes all properly scope data to the authenticated user's tenant.

### STORAGE-GOOD-1: Magic Bytes Validation on File Uploads

Avatar upload (`/api/profile/avatar`) and template cover upload (`/api/template-sets/[id]/cover`) both validate magic bytes in addition to MIME type, preventing content-type spoofing.

### SSRF-GOOD-1: SSRF Protection on convert-presentation

The `convert-presentation` endpoint correctly validates that `sourceUrl` points to Supabase storage before forwarding it to ConvertAPI.

### HEADER-GOOD-1: Security Headers Properly Configured

`next.config.ts` sets all recommended security headers: X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: origin-when-cross-origin, Strict-Transport-Security with includeSubDomains.

### XSS-GOOD-1: No dangerouslySetInnerHTML Usage

Zero instances of `dangerouslySetInnerHTML` found in the codebase. All user-supplied content is rendered through React's default escaping.

### EMAIL-GOOD-1: HMAC-Signed Unsubscribe Tokens

Unsubscribe tokens use HMAC-SHA256 with timing-safe comparison, preventing forgery and timing attacks.

### WEBHOOK-GOOD-1: Timing-Safe Secret Comparison

Webhook authentication uses `timingSafeEqual` to prevent timing attacks on the shared secret.

### ENV-GOOD-1: Proper .env Configuration

`.env.local.example` contains only placeholder values. `NEXT_PUBLIC_` prefix is used only for Supabase URL, anon key, and app URL (all safe to expose). Service role key and secrets are server-only. `.gitignore` correctly excludes `.env*.local`.

### PASSWORD-GOOD-1: Current Password Verification

The password change endpoint (`/api/profile/password`) correctly verifies the current password before allowing an update, preventing account takeover via stolen session.

### CLIENT-GOOD-1: No Sensitive Data in localStorage

localStorage is only used for cookie consent preferences and collapsed group states -- no tokens or sensitive data.

---

## Priority Remediation Order

| Priority | Finding                                                     | Severity | Effort |
| -------- | ----------------------------------------------------------- | -------- | ------ |
| 1        | SEC-16: Webhook trusts body-supplied tenant_id              | Critical | Low    |
| 2        | SEC-1: Open redirect in auth callback                       | High     | Low    |
| 3        | SEC-7/SEC-9: SSRF in generate-thumbnails and render-preview | High     | Low    |
| 4        | SEC-5: No rate limit on forgot-password                     | High     | Low    |
| 5        | SEC-2: Missing tenant_id filter in project GET              | High     | Low    |
| 6        | SEC-3: No is_active check in many routes                    | Medium   | Medium |
| 7        | SEC-12: No middleware for route protection                  | Medium   | Medium |
| 8        | SEC-6: 1-year signed URL expiration                         | Medium   | Medium |
| 9        | SEC-10: Missing CSRF on cookie-based endpoints              | Medium   | Low    |
| 10       | SEC-15: No replay protection on webhooks                    | Medium   | Medium |
| 11       | SEC-4: Beta access timing attack                            | Medium   | Low    |
| 12       | SEC-8: Group name missing validation                        | Low      | Low    |
| 13       | SEC-11: editable_fields allows unknown types                | Low      | Low    |
| 14       | SEC-13: cover_image_url not validated                       | Low      | Low    |
| 15       | SEC-14: Webhook body parsed before auth                     | Low      | Low    |
| 16       | SEC-17: Email subject unsanitized                           | Low      | Low    |

---

## Scope Notes

- **RLS Policies:** Could not be audited from source code alone. Supabase RLS policies should be reviewed separately via the Supabase dashboard.
- **CORS:** Next.js API routes do not have explicit CORS configuration; same-origin policy applies by default. Cross-origin access to API routes should be tested in the browser.
- **Cookie Flags:** Supabase SSR library handles cookie configuration. The beta access cookie correctly sets `httpOnly`, `secure` (in production), and `sameSite: 'lax'`.
- **SQL Injection:** Not applicable -- all database queries use the Supabase client library with parameterized queries.
- **Dependency Vulnerabilities:** Not audited. Run `npm audit` separately.

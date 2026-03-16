# PROJ-8: User Profile & Account Settings

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-02-27

## Dependencies

- Requires: PROJ-2 (Authentication & User Sessions)
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories

- As a user, I want to update my display name so that colleagues see my correct name throughout the app
- As a user, I want to upload a profile picture so that I am visually identifiable in comments, sharing, and team lists
- As a user, I want to change my preferred language (German or English) so that the app displays in my language
- As a user, I want to change my password so that I can keep my account secure
- As a user, I want changes to take effect immediately without needing to reload the page

## Acceptance Criteria

- [ ] Profile page is accessible at `/profile` for all authenticated users
- [ ] Display name field: editable, required, min 1 character, max 80 characters
- [ ] Profile picture upload: accepts JPEG, PNG, WebP; max 5MB; stored in Supabase Storage
- [ ] Profile picture is displayed in: comments, project sharing panel, team management list, top navigation avatar
- [ ] Language preference: dropdown with 'Deutsch' and 'English'; saved to user record; triggers immediate UI language switch
- [ ] Password change: current password, new password, confirm new password; validation that new ≠ current
- [ ] Success/error feedback shown inline for each section (not a full page reload)
- [ ] Profile picture can be removed (reverts to generated avatar/initials fallback)
- [ ] All changes are saved immediately on submit (not all at once)

## Edge Cases

- What if the profile picture upload fails? → Show error, keep existing picture
- What if the display name is empty on save? → Blocked, validation error shown
- What if the current password entered is incorrect during password change? → Error: "Current password is incorrect"
- What if the new password doesn't meet minimum requirements? → Error with requirements listed (min 8 chars)
- What if the user uploads a profile picture larger than 5MB? → Error before upload: "Image must be smaller than 5MB"
- What if the user changes language — does it persist across sessions? → Yes, stored in user record and loaded on login

## Technical Requirements

- Profile picture stored in Supabase Storage at path: `avatars/{tenant_id}/{user_id}/{filename}`
- Old profile picture is deleted from storage when a new one is uploaded
- Password change delegated to Supabase Auth (`updateUser` method)
- Language preference stored in `users.preferred_language` column

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_To be added by /architecture_

## QA Test Results

### Round 1

**Tested:** 2026-02-27
**Tester:** QA Engineer (AI)

- Found 6 bugs (0 critical, 0 high, 3 medium, 3 low)
- BUG-3 (rate limiting on profile/avatar endpoints) -- FIXED in commit `da891b8`
- BUG-4 (in-memory rate limiter) -- FIXED in commit `ecd28bd` (replaced with Supabase-backed persistence)
- BUG-1, BUG-2 remain (expected gaps from unbuilt dependent features)
- BUG-5, BUG-6 remain (low priority)

---

### Round 2

**Tested:** 2026-02-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)
**Build status:** PASS (`npm run build` succeeds)
**Lint status:** FAIL (`npm run lint` still broken -- see BUG-6)

### Re-verification of Round 1 Fixes

#### BUG-3 (FIXED): Rate limiting on profile update and avatar upload endpoints

- [x] `PATCH /api/profile` now calls `checkRateLimit(user.id, 'profile:patch', 20, 15 * 60 * 1000)` -- 20 requests per 15 minutes
- [x] `POST /api/profile/avatar` now calls `checkRateLimit(user.id, 'profile:avatar', 5, 15 * 60 * 1000)` -- 5 uploads per 15 minutes
- [x] `POST /api/profile/password` retains `checkRateLimit(user.id, 'profile:password', 5, 15 * 60 * 1000)` -- 5 attempts per 15 minutes
- [x] Rate limit returns HTTP 429 with `Retry-After` header

#### BUG-4 (FIXED): In-memory rate limiter replaced with Supabase-backed persistence

- [x] `src/lib/rate-limit.ts` now uses `rate_limits` table in Supabase via `createServiceClient()`
- [x] Rate limit state persists across serverless cold starts
- [x] Window-based expiry: checks `reset_at > now` for active windows
- [x] Counter incremented via `update` within active window, `upsert` for new windows
- [ ] BUG-7: No migration file for `rate_limits` table (see new bugs below)

### Acceptance Criteria Status

#### AC-1: Profile page accessible at `/profile` for all authenticated users

- [x] Route exists at `src/app/(app)/profile/page.tsx`
- [x] Proxy middleware (`src/proxy.ts`) redirects unauthenticated users to `/login` -- `/profile` is not in `PUBLIC_ROUTES`
- [x] Page renders four separate cards: Display Name, Profile Picture, Language, Password

#### AC-2: Display name field: editable, required, min 1, max 80 characters

- [x] Input field present with `maxLength={80}`
- [x] Client-side validation blocks empty/whitespace-only names via `name.trim()` check
- [x] Server-side Zod validation enforces `z.string().min(1).max(80)`
- [x] Save button with loading state, toast feedback on success/error
- [x] `useEffect` syncs local state when `displayName` prop changes from provider

#### AC-3: Profile picture upload: JPEG, PNG, WebP; max 5MB; Supabase Storage

- [x] Client-side 5MB check before upload
- [x] Server-side 5MB check (`MAX_SIZE = 5 * 1024 * 1024`)
- [x] MIME type validation: `image/jpeg`, `image/png`, `image/webp`
- [x] Magic byte validation prevents MIME spoofing (JPEG, PNG, WebP signatures checked)
- [x] Stored at `avatars/{tenant_id}/{user_id}/avatar.{ext}` (matches tech requirement)
- [x] Old avatar with different extension is deleted before new upload
- [x] Rate limited to 5 uploads per 15 minutes (BUG-3 fix verified)

#### AC-4: Profile picture displayed in: comments, project sharing panel, team management list, top navigation avatar

- [x] Top navigation avatar in sidebar footer uses `avatarUrl` from `useCurrentUser()`
- [ ] KNOWN GAP: Profile picture is NOT displayed in comments (PROJ-30 is "Planned")
- [ ] KNOWN GAP: Profile picture is NOT displayed in project sharing panel (PROJ-25 is "Planned")
- [ ] KNOWN GAP: Profile picture is NOT displayed in team management list (PROJ-9 is "Planned")

**Note:** These gaps are expected -- dependent features are not built yet. The avatar infrastructure is correctly wired via `TenantProvider` context and `useCurrentUser()` hook, so downstream features can consume it when implemented. Not counted as bugs for PROJ-8.

#### AC-5: Language preference: dropdown with Deutsch/English; saved to user record; triggers immediate UI language switch

- [x] Dropdown present with "Deutsch" (value: `de`) and "English" (value: `en`) options
- [x] Saved to `users.preferred_language` column via `PATCH /api/profile`
- [x] Server-side Zod validation: `z.enum(['de', 'en'])`
- [ ] BUG-1 (OPEN): Language change does NOT trigger immediate UI language switch -- PROJ-41 (Internationalisation) is "Planned"
- [ ] BUG-8 (NEW): Language dropdown does not sync initial value from server (see new bugs below)

#### AC-6: Password change: current password, new password, confirm new password; validation new != current

- [x] Three password fields with correct `autoComplete` attributes
- [x] Client-side validation: current required, new >= 8 chars, new != current, confirm matches new
- [x] Server-side Zod validation mirrors client-side checks
- [x] Current password verified via `signInWithPassword` before update
- [x] Password updated via `supabase.auth.admin.updateUserById`
- [x] Fields cleared on success
- [x] Rate limited to 5 attempts per 15 minutes (BUG-3/BUG-4 fix verified)

#### AC-7: Success/error feedback shown inline (no full page reload)

- [x] All sections use `toast()` from `sonner` for success/error messages
- [x] Password section shows inline error messages below fields via `errors` state
- [x] No page reload on any action

#### AC-8: Profile picture can be removed (reverts to initials fallback)

- [x] Remove button visible only when avatar exists (`previewUrl && ...`)
- [x] DELETE endpoint removes all files in user's avatar directory
- [x] Database `avatar_url` set to `null`
- [x] `AvatarFallback` component renders initials from display name

#### AC-9: All changes saved immediately on submit (not all at once)

- [x] Each card (Display Name, Avatar, Language, Password) has its own independent save/submit action
- [x] No global "Save All" button

### Edge Cases Status

#### EC-1: Profile picture upload fails

- [x] Upload errors are caught and displayed via `toast.error(d.error ?? 'Upload failed')`
- [x] Existing picture is preserved (`previewUrl` only updates on success)

#### EC-2: Display name empty on save

- [x] Client blocks with `toast.error('Display name cannot be empty')` when trimmed value is empty
- [x] Server validates via Zod `min(1)`

#### EC-3: Incorrect current password during password change

- [x] Server returns `{ error: 'Current password is incorrect', field: 'currentPassword' }` with status 400
- [x] Client shows inline error below current password field

#### EC-4: New password doesn't meet minimum requirements

- [x] Client validates `next.length < 8` and shows "New password must be at least 8 characters"
- [x] Server validates via Zod `min(8)`

#### EC-5: Profile picture larger than 5MB

- [x] Client-side check before upload: `file.size > 5 * 1024 * 1024` shows `toast.error('Image must be smaller than 5 MB')`
- [x] Server-side check as backup

#### EC-6: Language change persists across sessions

- [x] Stored in `users.preferred_language` column (database level)
- [x] Loaded via `TenantProvider` on every session init (`/api/tenant` endpoint)

### Security Audit Results

- [x] Authentication: All API endpoints verify Bearer token via `getAuthenticatedUser()` which calls `supabase.auth.getUser()` (server-validated, not just decoded JWT)
- [x] Authorization: Users can only modify their own profile -- user ID comes from JWT token, not request body (no IDOR possible)
- [x] Cross-tenant isolation: Avatar storage path includes `tenant_id` from server-side profile lookup (cannot be spoofed by client)
- [x] Input validation: Server-side Zod schemas on all three endpoints; display name length enforced; language restricted to enum; password requirements enforced
- [x] File upload security: MIME type whitelist + magic byte validation prevents malicious file upload; size limit enforced server-side
- [x] Rate limiting: All three endpoints (`PATCH /api/profile`, `POST /api/profile/avatar`, `POST /api/profile/password`) now have Supabase-backed rate limiting
- [x] Security headers: X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy origin-when-cross-origin, HSTS with includeSubDomains -- all configured in `next.config.ts`
- [x] No secrets exposed: Service role key used only server-side in `createServiceClient()`; client uses anon key only
- [x] XSS protection: React's default JSX escaping prevents stored XSS in display name; no `dangerouslySetInnerHTML` usage anywhere in profile code
- [x] Password verification: Current password verified via `signInWithPassword` before allowing update -- prevents unauthorized password changes even with a valid session
- [x] No sensitive data in API responses: `PATCH /api/profile` returns only `id, display_name, preferred_language, avatar_url` -- no password hashes or internal fields
- [ ] BUG-7 (NEW): No SQL migration for `rate_limits` and `ip_rate_limits` tables -- see bugs below
- [ ] BUG-9 (NEW): `DELETE /api/profile/avatar` has no rate limiting -- see bugs below
- [ ] NOTE: Avatar storage bucket created with `public: false` in migration. However, the code uses `getPublicUrl()` which generates a URL that works only if the bucket is public. This indicates the bucket must be manually set to public in Supabase dashboard for avatars to load. This is acceptable for profile pictures but should be documented.
- [ ] NOTE: No Content-Security-Policy header configured. While not blocking for PROJ-8, it would strengthen XSS defense-in-depth.

### Cross-Browser Testing (Code Review)

- [x] No browser-specific APIs used (File API, FormData, fetch are universally supported)
- [x] shadcn/ui components (Avatar, Button, Card, Input, Select) are cross-browser compatible via Radix primitives
- [x] No CSS features that require vendor prefixes (Tailwind handles this)
- [x] `autoComplete` attributes on password fields work across all major browsers
- Note: Manual cross-browser testing in Chrome, Firefox, Safari not performed (requires running application with live Supabase instance)

### Responsive Testing (Code Review)

- [x] Page uses `max-w-2xl` with `mx-auto` and `p-6` -- properly centered on all screen sizes
- [x] Select dropdown at `w-48` fits within mobile viewports
- [x] Password card stacks vertically via `space-y-4`
- [ ] BUG-5 (OPEN): Avatar card layout may not wrap well on 375px -- `flex items-center gap-6` without `flex-wrap`

### Bugs Found

#### BUG-1 (OPEN, from Round 1): Language switch has no visible UI effect

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Go to `/profile`
  2. Change language from "Deutsch" to "English" and click Save
  3. Expected: UI language switches to English immediately
  4. Actual: Toast says "Language preference saved" but no UI text changes
- **Root Cause:** PROJ-41 (Internationalisation) is "Planned" status. The preference is stored but not consumed.
- **Priority:** Fix when PROJ-41 is implemented (not a blocker for PROJ-8)

#### BUG-2 (OPEN, from Round 1): Profile picture not shown in comments, sharing panel, team management

- **Severity:** Low
- **Steps to Reproduce:**
  1. Upload a profile picture on `/profile`
  2. Navigate to comments, project sharing, or team management
  3. Expected: Avatar visible in those locations
  4. Actual: Those features are placeholder pages
- **Root Cause:** Dependent features PROJ-9, PROJ-25, PROJ-30 not yet implemented
- **Priority:** Fix when dependent features are built (not a blocker for PROJ-8)

#### BUG-3 (FIXED in `da891b8`): Rate limiting on profile update and avatar upload endpoints

- Verified: `PATCH /api/profile` and `POST /api/profile/avatar` now have rate limiting

#### BUG-4 (FIXED in `ecd28bd`): In-memory rate limiter replaced with Supabase-backed persistence

- Verified: `src/lib/rate-limit.ts` uses `rate_limits` table in Supabase

#### BUG-5 (OPEN, from Round 1): Avatar card may overflow on mobile (375px)

- **Severity:** Low
- **Steps to Reproduce:**
  1. View `/profile` at 375px viewport width
  2. Observe the avatar card with the 80px avatar and buttons side by side
  3. Expected: Layout wraps gracefully
  4. Actual: Horizontal overflow possible -- no `flex-wrap` on the container
- **Root Cause:** `CardContent className="flex items-center gap-6"` in `AvatarCard` has no `flex-wrap`
- **File:** `src/app/(app)/profile/page.tsx` line 205
- **Priority:** Fix in next sprint

#### BUG-6 (OPEN, from Round 1): Lint command is broken

- **Severity:** Low
- **Steps to Reproduce:**
  1. Run `npm run lint`
  2. Expected: ESLint runs successfully
  3. Actual: Error "Invalid project directory provided, no such directory: .../lint"
- **Root Cause:** ESLint v9 is installed (`package.json` shows `"eslint": "^9"`) but `.eslintrc.json` uses the old config format (`extends: "next/core-web-vitals"`). Next.js 16 with ESLint 9 requires the flat config format (`eslint.config.mjs`). No `eslint.config.mjs` exists in the project root.
- **Priority:** Fix before deployment

#### BUG-7 (NEW): No SQL migration for `rate_limits` and `ip_rate_limits` tables

- **Severity:** High
- **Steps to Reproduce:**
  1. Inspect `supabase/migrations/` -- only two migration files exist: `20260225000001_proj1_multi_tenancy.sql` and `20260226000002_proj4_subscriptions.sql`
  2. The `src/lib/rate-limit.ts` file references `rate_limits` table (lines 17-22) and `ip_rate_limits` table (lines 71-76)
  3. Deploy to a fresh Supabase instance
  4. Expected: Rate limiting works
  5. Actual: All rate-limited endpoints will fail with a database error because the tables do not exist
- **Root Cause:** The rate limiting fix (commit `ecd28bd`) added Supabase-backed rate limiting but did not create a migration file for the required tables
- **File:** Missing migration in `supabase/migrations/`
- **Priority:** Fix before deployment (blocking -- rate limiting will fail without these tables)

#### BUG-8 (NEW): Language dropdown does not sync initial value from server

- **Severity:** Medium
- **Steps to Reproduce:**
  1. User has `preferred_language = 'en'` saved in the database
  2. Navigate to `/profile`
  3. Expected: Language dropdown shows "English" on page load
  4. Actual: Dropdown shows "Deutsch" (the hardcoded default `'de'` from `useState(preferredLanguage ?? 'de')`) because `preferredLanguage` is `null` during the initial render before `TenantProvider` finishes loading
- **Root Cause:** `LanguageCard` uses `useState(preferredLanguage ?? 'de')` but does NOT have a `useEffect` to sync when `preferredLanguage` changes. Compare with `DisplayNameCard` which has `useEffect(() => { setName(displayName ?? '') }, [displayName])` -- `LanguageCard` is missing this pattern.
- **File:** `src/app/(app)/profile/page.tsx` line 260
- **Fix:** Add `useEffect(() => { setLang(preferredLanguage ?? 'de') }, [preferredLanguage])`
- **Priority:** Fix before deployment (user sees wrong language preference)

#### BUG-9 (NEW): DELETE /api/profile/avatar has no rate limiting

- **Severity:** Medium
- **Steps to Reproduce:**
  1. Authenticate and obtain a valid Bearer token
  2. Send rapid repeated `DELETE /api/profile/avatar` requests
  3. Expected: Rate limiting after N requests
  4. Actual: All requests are processed -- no `checkRateLimit` call in the DELETE handler
- **Root Cause:** The BUG-3 fix added rate limiting to `POST /api/profile/avatar` but not to `DELETE /api/profile/avatar` in the same file
- **File:** `src/app/api/profile/avatar/route.ts` lines 115-141 (DELETE handler)
- **Priority:** Fix before deployment (while less critical than upload since DELETE is less resource-intensive, an attacker could still spam the storage API and database)

#### BUG-10 (NEW): Avatar URL caching issue when re-uploading same file type

- **Severity:** Low
- **Steps to Reproduce:**
  1. Upload a JPEG profile picture
  2. Note the avatar URL (e.g., `.../avatar.jpg`)
  3. Upload a different JPEG profile picture
  4. Expected: New image displays immediately
  5. Actual: Browser or CDN may serve the cached old image because the URL path is identical (`avatar.jpg` with `upsert: true`)
- **Root Cause:** The upload path is always `avatar.{ext}` and the returned `publicUrl` from `getPublicUrl()` does not include a cache-busting parameter. The `AvatarImage` component will use the same URL and the browser will serve from cache.
- **File:** `src/app/api/profile/avatar/route.ts` line 99
- **Fix:** Append `?t=${Date.now()}` to the `publicUrl` before saving to database
- **Priority:** Fix in next sprint

### Regression Testing

- [x] Build succeeds (`npm run build` passes with no errors)
- [x] Profile route builds as static page (shown in build output)
- [x] All three API routes build as dynamic server functions (`/api/profile`, `/api/profile/avatar`, `/api/profile/password`)
- [x] `TenantProvider` and `useCurrentUser` hook still function correctly (no changes to their interface)
- [x] Proxy middleware still correctly protects authenticated routes and redirects to `/login`
- [x] No regressions detected in PROJ-2 (Auth), PROJ-3 (Roles), PROJ-4 (Subscriptions) from profile changes
- [x] Security headers in `next.config.ts` unchanged and properly configured

### Summary

- **Acceptance Criteria:** 7/9 passed (2 partial failures due to unbuilt dependent features -- expected, not blockers for PROJ-8)
- **Edge Cases:** 6/6 passed
- **Bugs Found (Round 2):** 10 total -- 4 new, 2 fixed, 4 open from Round 1
  - 0 Critical
  - 1 High (BUG-7: missing rate_limits migration)
  - 3 Medium (BUG-1: i18n, BUG-8: language dropdown initial value, BUG-9: DELETE rate limiting)
  - 2 Low (BUG-5: mobile overflow, BUG-10: avatar caching)
  - 2 Low (BUG-2: dependent features, BUG-6: lint broken) -- not blockers
- **Security:** Strong overall. Auth, authorization, cross-tenant isolation, input validation, file upload security, and XSS protection are all properly implemented. Rate limiting is now Supabase-backed, but the migration is missing (BUG-7) and DELETE endpoint is unprotected (BUG-9).
- **Production Ready:** NO
- **Blockers:**
  1. BUG-7 (High): Create migration for `rate_limits` and `ip_rate_limits` tables -- without this, ALL rate limiting silently fails on a fresh deployment
  2. BUG-8 (Medium): Add `useEffect` sync to `LanguageCard` -- users see wrong language preference
  3. BUG-9 (Medium): Add rate limiting to `DELETE /api/profile/avatar`
- **Recommendation:** Fix BUG-7, BUG-8, and BUG-9 before deployment. BUG-1 and BUG-2 resolve automatically when their dependent features ship. BUG-5, BUG-6, and BUG-10 are low priority polish.

---

### Round 3 -- Cross-Feature Bug Fix Verification

**Tested:** 2026-03-08
**Tester:** QA Engineer (AI)
**Build status:** PASS (`npm run build` succeeds)
**Scope:** 10 bug fixes and enhancements across board, PPTX parser, presentation mode, slide preview, i18n, and template picker

---

#### Fix #1: Template set thumbnail size constraint

**File:** `src/components/projects/create-project-dialog.tsx` (line 497)
**Status:** PASS

- [x] `max-h-[140px]` applied to the cover image container div
- [x] `overflow-hidden` present to clip oversized images
- [x] `aspect-video` retained for proper proportions before max-height kicks in
- [x] Fallback icon still centered when no cover image exists
- No issues found.

---

#### Fix #2: Filter freehand shapes in PPTX parser

**File:** `src/lib/pptx-parser.ts` (line 56)
**Status:** PASS

- [x] Check `if (sp.includes('<a:custGeom')) continue` is correctly placed after the `txBody` check (line 53) and before shape name extraction (line 59)
- [x] Ordering is correct: first confirm the shape has a text body, then skip if it is a freehand/custom geometry, then proceed to parse
- [x] Uses `continue` to skip the entire shape, not just the geometry part
- No issues found.

---

#### Fix #3: Done button in edit fields dialog

**File:** `src/components/board/edit-fields-dialog.tsx` (lines 73-80)
**Status:** PASS

- [x] `DialogFooter` imported from `@/components/ui/dialog` (line 9)
- [x] Footer contains auto-save indicator text using `t('edit_fields.auto_saved')`
- [x] Done button uses `t('edit_fields.done')` for label
- [x] Button calls `onClose` on click
- [x] i18n key `edit_fields.done` exists in en.json ("Done") and de.json ("Fertig")
- [x] i18n key `edit_fields.auto_saved` exists in en.json ("Changes saved automatically") and de.json ("Aenderungen werden automatisch gespeichert")
- [x] Footer layout uses `flex items-center justify-between sm:justify-between` for proper spacing
- No issues found.

---

#### Fix #4: Fill warning scroll area increased

**File:** `src/components/board/fill-warning-dialog.tsx` (line 56)
**Status:** PASS

- [x] Changed from `max-h-64` (256px) to `max-h-[50vh]` (50% viewport height)
- [x] `ScrollArea` component correctly applies the constraint
- [x] Responsive benefit: dialog shows more content on larger screens, stays contained on smaller ones
- No issues found.

---

#### Fix #5: Text field required default changed

**File:** `src/lib/pptx-parser.ts` (line 102)
**Status:** PASS

- [x] All detected fields now default to `required: false`
- [x] Previous logic (`required: phType === 'title' || phType === 'ctrTitle'`) removed
- [x] Admins can still manually toggle required via the edit slide dialog checkbox
- No issues found.

---

#### Fix #6: Collapsed group thumbnail

**File:** `src/components/board/group-section.tsx` (lines 171-178)
**Status:** PASS

- [x] Conditional rendering checks `isCollapsed && slides.length > 0 && slides[0].thumbnail_url`
- [x] All three conditions properly guard against rendering when group is expanded, empty, or has no thumbnail
- [x] `img` element has proper alt text from `slides[0].title`
- [x] Thumbnail is sized `h-7 w-12` with `shrink-0 rounded border object-cover`
- [x] ESLint disable comment for `@next/next/no-img-element` present (external images from Supabase Storage)
- No issues found.

---

#### Fix #7: Thumbnail resolution increased

**File:** `src/app/api/slides/generate-thumbnails/route.ts` (lines 88-89)
**Status:** PASS

- [x] `ImageHeight` changed from `'540'` to `'1080'`
- [x] `ImageWidth` changed from `'960'` to `'1920'`
- [x] Values maintain 16:9 aspect ratio (1920/1080 = 16/9)
- [x] Values passed as strings to ConvertAPI (correct format per their API)
- Note: Higher resolution will increase ConvertAPI processing time and storage size. Acceptable trade-off for better thumbnail quality.
- No issues found.

---

#### Fix #8: Text edit indicator in presentation mode

**Files:** `src/components/board/presentation-mode.tsx`, `src/app/(app)/board/page.tsx`
**Status:** PASS

- [x] `PresentationSlide` interface extended with optional `hasTextEdits?: boolean` field (line 10)
- [x] Pencil badge renders conditionally when `slide.hasTextEdits && showUI` (line 154)
- [x] Badge positioned with `fixed top-4 right-20 z-[56]` to avoid overlapping exit button
- [x] Badge uses `pointer-events-none` to not intercept clicks
- [x] Badge fades with UI (controlled by `showUI` state from mouse movement timer)
- [x] i18n key `presentation.text_edited` exists in en.json ("Text edited") and de.json ("Text bearbeitet")
- [x] Board page correctly computes `hasTextEdits` for each tray item (lines 1259-1261)
- [x] Logic: `!!edits && Object.values(edits).some((v) => v.trim() !== '')` -- correctly checks for non-empty text edits
- [x] Personal slides default to `hasTextEdits: false` (line 1255) -- correct since personal slides don't have text edits
- No issues found.

---

#### Fix #9: i18n translations

**Files:** `public/locales/en.json`, `public/locales/de.json`, `src/components/projects/create-project-dialog.tsx`, `src/components/view/viewer-slideshow.tsx`, `src/components/slides/edit-slide-dialog.tsx`
**Status:** PASS with BUGS

**create-project-dialog.tsx:**

- [x] All user-facing strings use `t()` calls with proper key namespacing under `create_project.*`
- [x] All referenced keys exist in both en.json and de.json (verified: title, description, project_name, project_name_placeholder, project_name_error, project_name_too_long, cancel, next, choose_template, template_description, start_from_scratch, only_mandatory_slides, no_templates, creating_project, back, use_this_template, creating, template_no_slides, deprecated_badge, slide_count)
- [x] Pluralization key `slide_count` uses i18next `_one`/`_other` suffix pattern correctly

**viewer-slideshow.tsx:**

- [x] Most strings use `t()` calls under `viewer.*` namespace
- [x] Keys exist in both locales (verified: download_pdf, exit, fullscreen, pdf_failed, dismiss)

**edit-slide-dialog.tsx:**

- [x] Most strings use `t()` calls under `slides.*` namespace

**slide-preview-dialog.tsx (new file):**

- [x] All strings use `t()` calls under `slide_preview.*` namespace
- [x] Keys exist in both locales (verified: title, text_fields, no_text_edits, field_empty, close)

**Bugs found in i18n audit -- see below.**

---

#### Fix #10: Slide preview dialog

**Files:** `src/components/board/slide-preview-dialog.tsx` (new), `src/components/board/canvas-slide-card.tsx`, `src/app/(app)/board/page.tsx`
**Status:** PASS with OBSERVATION

**slide-preview-dialog.tsx:**

- [x] Dialog component is well-structured with proper shadcn Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
- [x] Handles null slide with early return (`if (!slide) return null` at line 32)
- [x] Large thumbnail preview with `max-h-[50vh] object-contain`
- [x] Fallback for missing thumbnail (LayoutTemplate icon + title text)
- [x] Metadata badges for mandatory/deprecated status
- [x] Tags rendered as secondary badges
- [x] Text fields section with scroll area, shows field labels, required badges, and edit values
- [x] Empty state for no text edits
- [x] Close button in footer using i18n
- [x] All i18n keys present in both locales

**canvas-slide-card.tsx:**

- [x] Eye icon imported from lucide-react (line 5)
- [x] `onPreview` prop added to interface (line 31)
- [x] Eye button positioned `absolute top-1.5 right-1.5` on the thumbnail area
- [x] Shows on hover with `opacity-0 group-hover/card:opacity-100 transition-opacity`
- [x] `e.stopPropagation()` prevents triggering the card's main click (add to tray)
- [x] `data-no-pan` attribute prevents canvas panning on click
- [x] `title` attribute uses `t('slide_preview.title')` for accessibility
- [x] Only renders when `onPreview` callback is provided (conditional rendering at line 131)

**board/page.tsx:**

- [x] `previewSlideId` state declared (line 225)
- [x] `SlidePreviewDialog` imported and rendered conditionally (lines 1893-1899)
- [x] `onPreview` callback wired to `GroupSection` (line 1626)
- [x] Slide looked up from `slideMap` which is a `Map<string, Slide>` -- efficient O(1) lookup

**Observation:** The `SlidePreviewDialog` accepts an optional `textEdits` prop but the board page does not pass it when rendering from the canvas. This is intentionally correct because canvas preview shows the library slide (not a tray instance), so there are no text edits to display. However, if slide preview is ever added to the tray panel, `textEdits` should be passed.

---

### Bugs Found in Round 3

#### BUG-11 (NEW): Hardcoded English string in edit-slide-dialog.tsx

- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/slides/edit-slide-dialog.tsx` line 132
- **Code:** `setError('All editable fields must have a label')`
- **Expected:** Should use `t('slides.fields_need_label')` or similar i18n key
- **Impact:** German-language users see English error text when saving with an empty field label
- **Priority:** Fix in next i18n pass

#### BUG-12 (NEW): Hardcoded tooltip in viewer-slideshow.tsx

- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/view/viewer-slideshow.tsx` line 265
- **Code:** `title="Fullscreen (F)"`
- **Expected:** Should use `t('viewer.fullscreen_tooltip')` or similar i18n key
- **Impact:** German-language users see English tooltip on the fullscreen button
- **Priority:** Fix in next i18n pass

#### BUG-13 (NEW): Hardcoded aria-labels in create-project-dialog.tsx

- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/projects/create-project-dialog.tsx` lines 289, 383
- **Code:** `aria-label="Back to name"` and `aria-label="Back to templates"`
- **Expected:** Should use i18n keys for accessibility labels
- **Impact:** Screen reader users always hear English regardless of language setting
- **Priority:** Fix in next i18n pass

#### BUG-14 (NEW): Missing i18n keys for fill-warning-dialog.tsx

- **Severity:** Medium
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/components/board/fill-warning-dialog.tsx` lines 65, 71
- **Keys used but missing from locale files:**
  - `fill_warning.slide_position` (used at line 65 with `{ position: first.trayPosition }`)
  - `fill_warning.field_required` (used at line 71 with `{ label: f.fieldLabel }`)
- **Also:** `fill_warning.description` uses `{ action }` interpolation parameter but en.json value is `"The following required fields must be filled in before exporting:"` without `{{action}}`
- **Also:** `fill_warning.proceed_anyway` uses `{ action }` interpolation parameter but en.json value is `"Export anyway"` without `{{action}}`
- **Impact:** Users see raw i18n key strings instead of translated text (e.g., `fill_warning.slide_position` displayed literally)
- **Priority:** Fix before deployment -- visible UI text rendering as raw keys

#### BUG-15 (NEW): Hardcoded English proceedLabel strings in board page

- **Severity:** Low
- **File:** `/Users/sebastianploeger/AppProjekte/deckr_studio/src/app/(app)/board/page.tsx` lines 800, 811, 821
- **Code:**
  - `proceedLabel: 'Export'` (line 800)
  - `proceedLabel: 'Export PDF'` (line 811)
  - `proceedLabel: 'Present'` (line 821)
- **Expected:** Should use `t('board.export')`, `t('board.export_pdf')`, `t('board.present')` or similar
- **Impact:** German-language users see English labels in the fill warning dialog action buttons
- **Note:** This is related to BUG-14 since `proceedLabel` is passed to the fill-warning dialog's `proceed_anyway` interpolation
- **Priority:** Fix alongside BUG-14

---

### Round 3 Summary

- **Fixes Verified:** 10/10 code changes are structurally correct and build-passing
- **New Bugs Found:** 5
  - 0 Critical, 0 High
  - 1 Medium (BUG-14: missing i18n keys in fill-warning-dialog -- raw keys shown to users)
  - 4 Low (BUG-11, BUG-12, BUG-13, BUG-15: hardcoded English strings in various components)
- **Blockers:** BUG-14 should be fixed before deployment as it causes visible raw key strings in the fill warning dialog
- **All other fixes are clean:** No type errors, no null safety issues, no missing imports, no runtime risks detected
- **i18n coverage:** Good overall. The new `slide_preview`, `edit_fields.done`, `edit_fields.auto_saved`, and `presentation.text_edited` keys all exist in both en.json and de.json with proper translations.

## Deployment

_To be added by /deploy_

# PROJ-15: Slide Library Management (Admin)

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-02-26

## Dependencies

- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model)
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories

- As an admin, I want to upload PowerPoint files to the slide library so that employees can use approved slides
- As an admin, I want to set each slide as mandatory, deprecated, or standard so that I control how slides are used
- As an admin, I want to define which text fields on a slide are editable and which are required so that employees can customize without breaking the design
- As an admin, I want to update a slide by uploading a new PPTX version so that the slide stays current across all projects
- As an admin, I want to delete a slide from the library so that outdated slides are removed
- As an employee, I want to see the slide library with clear visual indicators of slide status so that I understand what I can and cannot do with each slide

## Acceptance Criteria

- [ ] `slides` table: id, tenant_id, title, status ('standard'|'mandatory'|'deprecated'), pptx_url, thumbnail_url, editable_fields (JSONB), created_at, updated_at, created_by
- [ ] Admin can upload a PPTX file; each slide in the file becomes a slide record (or single slide per upload — defined in /architecture)
- [ ] After upload, a thumbnail image is generated and stored
- [ ] Admin can set a slide's status: Standard, Mandatory, or Deprecated
- [ ] Mandatory slides: shown with a lock icon; cannot be removed from projects by employees
- [ ] Deprecated slides: shown with a warning icon; cannot be added to new projects; visible with warning in existing projects
- [ ] Editable fields: admin defines a list of field objects per slide: `{id, label, placeholder, required: bool}` stored in JSONB
- [ ] Admin can edit a slide's title and status after upload
- [ ] Admin can replace a slide by uploading a new PPTX version to the same slide record; thumbnail is regenerated; see PROJ-17 for propagation
- [ ] Admin can delete a slide; deletion is blocked if the slide is in any active project (or soft-deleted with a warning)
- [ ] All slides are scoped to the current tenant via RLS

## Edge Cases

- What if a user uploads a non-PPTX file? → Validation error: "Only .pptx files are accepted"
- What if the uploaded PPTX file is corrupt? → Error message: "File could not be processed"; no slide is created
- What if thumbnail generation fails? → Slide is created with a placeholder thumbnail; admin can re-trigger generation
- What if an admin tries to delete a slide that is in active projects? → Warning dialog showing how many projects are affected; soft-delete (deprecated status) recommended instead
- What if a mandatory slide is deleted? → Same block as above; warn that removing mandatory slides affects all presentations

## Technical Requirements

- PPTX files stored in Supabase Storage: `slides/{tenant_id}/{slide_id}/original.pptx`
- Thumbnail stored: `slides/{tenant_id}/{slide_id}/thumbnail.png`
- Thumbnail generation via a server-side job (Edge Function or API route) — LibreOffice or similar
- `editable_fields` JSONB schema: `[{id: string, label: string, placeholder: string, required: boolean}]`
- RLS: only admins can INSERT/UPDATE/DELETE slides; all tenant users can SELECT

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_To be added by /architecture_

## QA Test Results

**Tested:** 2026-02-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: slides table schema

- [x] POST /api/slides creates slide with: tenant_id, title, status, pptx_url, thumbnail_url, editable_fields, created_by
- [x] Status values validated via Zod: 'standard' | 'mandatory' | 'deprecated'
- [x] editable_fields stored as JSONB array
- [x] Additional fields: tags, page_index, page_count, source_filename (schema extended)

#### AC-2: PPTX upload creates slide record

- [x] UploadSlideDialog component handles file upload
- [x] POST /api/slides creates the database record

#### AC-3: Thumbnail generated after upload

- [ ] CANNOT VERIFY: Thumbnail generation logic depends on external service (ConvertAPI)
- [x] thumbnail_url field exists and is stored

#### AC-4: Admin can set slide status

- [x] PATCH /api/slides/[id] accepts status field
- [x] Validates against allowed values via Zod
- [x] EditSlideDialog component allows status change

#### AC-5: Mandatory slides shown with lock icon

- [x] SlideCard component renders status badge
- [x] Board canvas shows status badges on slide cards

#### AC-6: Deprecated slides shown with warning

- [x] Status badge differentiation in UI components

#### AC-7: Editable fields per slide

- [x] editable_fields JSONB stored on slide record
- [x] EditSlideDialog allows field management
- [x] PATCH /api/slides/[id] validates editable_fields with full EditableFieldSchema (id, label, placeholder, required)

#### AC-8: Admin can edit title and status

- [x] PATCH /api/slides/[id] supports title and status updates
- [x] EditSlideDialog provides UI

#### AC-9: Admin can replace slide (new PPTX)

- [x] PATCH /api/slides/[id] accepts pptx_url and thumbnail_url updates
- [x] pptx_updated_at timestamp set when pptx_url changes
- [x] Affected project owners notified (PROJ-17 integration)

#### AC-10: Admin can delete slide

- [x] DELETE /api/slides/[id] implemented
- [x] Confirmation dialog in SlideLibraryPage
- [x] Storage file cleanup attempted (best-effort)
- [x] FIXED: Project usage check added -- returns 409 with count of affected projects if slide is in any active project

#### AC-11: Slides scoped to tenant via RLS

- [x] API routes filter by tenant_id from authenticated user's profile
- [x] All queries include .eq('tenant_id', auth.profile.tenant_id)

### Edge Cases Status

#### EC-1: Non-PPTX file upload

- [ ] CANNOT VERIFY without running UploadSlideDialog in browser -- validation should be client-side

#### EC-2: Corrupt PPTX

- [ ] CANNOT VERIFY without external processing service

#### EC-3: Thumbnail generation failure

- [x] Slide can be created with thumbnail_url = null (placeholder handling)

#### EC-4: Delete slide in active projects

- [x] FIXED: DELETE /api/slides/[id] now checks `projects.slide_order` for references to the slide. Returns 409 with message "Slide is used in N project(s). Remove it from all projects before deleting."

#### EC-5: Mandatory slide deleted

- [x] FIXED: Same project usage check applies to all slide statuses including mandatory

### Security Audit Results

- [x] All write operations (POST, PATCH, DELETE) require admin role via requireAdmin()
- [x] Tenant isolation enforced on all queries
- [x] FIXED: POST /api/slides now uses CreateSlideSchema (Zod) for full input validation
- [x] No XSS vectors: title is stored as plain text
- [x] Rate limiting on PATCH (60/min) and DELETE (30/min) per admin user

### Bugs Found (Original)

#### BUG-18: Slide deletion does not check for active project usage

- **Severity:** Medium
- **Status:** FIXED (verified in current codebase)
- **Verification:** DELETE /api/slides/[id] now queries projects table with `.contains('slide_order', [{ slide_id: id }])` and returns 409 if count > 0. The error message includes the number of affected projects.

#### BUG-19: POST /api/slides lacks Zod validation

- **Severity:** Medium
- **Status:** FIXED (commit cab7c1c)
- **Verification:** POST /api/slides now uses CreateSlideSchema with Zod validation:
  - `title`: string, min 1, max 255 (required)
  - `status`: enum ['standard', 'mandatory', 'deprecated'] with default 'standard'
  - `tags`: array of trimmed strings, max 20 items
  - `pptx_url`: optional nullable URL
  - `thumbnail_url`: optional nullable URL
  - `editable_fields`: array of unknown, default []
  - `page_index`: integer, min 0, default 0
  - `page_count`: integer, min 1, default 1
  - `source_filename`: optional nullable string, max 255

### Re-test Results (2026-03-07)

#### BUG-18 Re-test: Slide deletion with project usage check

- [x] DELETE endpoint queries projects for slide references using `.contains('slide_order', [{ slide_id: id }])`
- [x] Returns HTTP 409 (Conflict) when slide is in use, with count of affected projects
- [x] Only deletes if no projects reference the slide
- [x] Storage file cleanup happens after successful DB delete (correct order)
- [x] Tenant scoping maintained: only checks projects in the same tenant

#### BUG-19 Re-test: Zod validation on POST /api/slides

- [x] CreateSlideSchema validates all input fields
- [x] Invalid JSON returns 400 "Invalid JSON"
- [x] Missing title returns 400 with Zod error message
- [x] Invalid status value returns 400 with Zod error message
- [x] Title max length enforced (255 chars)
- [ ] BUG-24: editable_fields uses z.array(z.unknown()) -- accepts any array items without structure validation (POST only; PATCH uses proper EditableFieldSchema)

#### New Issues Found During Re-test

#### BUG-24: POST /api/slides editable_fields not fully schema-validated

- **Severity:** Low
- **Steps to Reproduce:**
  1. POST /api/slides with body: `{ "title": "Test", "editable_fields": [{"garbage": true}, 42, "string"] }`
  2. Expected: Validation error -- editable_fields items should match `{id, label, placeholder, required}` schema
  3. Actual: Accepted -- `z.array(z.unknown())` allows any array contents
- **Note:** PATCH /api/slides/[id] correctly uses `z.array(EditableFieldSchema)` which validates `{id, label, placeholder, required}`. Only the POST endpoint is inconsistent.
- **Priority:** Fix in next sprint -- not exploitable since only admins can POST, but violates data integrity

### Summary

- **Acceptance Criteria:** 10/11 passed (1 cannot verify without external service)
- **Previous Bugs:** 2 total -- both FIXED
- **New Bugs:** 1 (low severity)
- **Security:** PASS (all writes admin-gated, rate-limited, Zod-validated)
- **Production Ready:** YES
- **Recommendation:** All previous bugs resolved. Deploy.

---

## QA Test Results: Multi-Format Upload Enhancement (2026-03-16)

**Tested:** 2026-03-16
**Tester:** QA Engineer (AI)
**Scope:** Slide upload rewrite -- multi-file, multi-format (.pptx, .ppt, .key, .odp), new convert-presentation API endpoint, translation updates.

### Files Reviewed

- `src/components/slides/upload-slide-dialog.tsx` (major rewrite)
- `src/app/api/slides/convert-presentation/route.ts` (new)
- `src/app/(app)/admin/slides/page.tsx` (button text)
- `src/app/(app)/board/page.tsx` (button text)
- `public/locales/en.json` (translation keys)
- `public/locales/de.json` (translation keys)
- `src/lib/auth-helpers.ts` (referenced by API)
- `src/lib/rate-limit.ts` (referenced by API)
- `src/components/slides/edit-slide-dialog.tsx` (regression check)
- `src/components/board/upload-personal-slide-dialog.tsx` (regression check)

### 1. Feature Acceptance Criteria

#### Multi-file upload (up to 10 files)

- [x] `MAX_FILES = 10` enforced in `handleFileChange` (line 113)
- [x] Files can be added incrementally; count check includes existing queue length
- [x] Error message shown when limit reached via `t('slides.max_10_files')`

#### New file formats (.pptx, .ppt, .key, .odp)

- [x] `SUPPORTED_EXTENSIONS` array contains all four formats (line 25)
- [x] `ACCEPT_STRING` includes both extensions and MIME types (lines 27-31)
- [x] Extension detection via `getExtension()` is case-insensitive (line 38)

#### Button renamed to "Prasentationen hochladen"

- [x] Admin slides page uses `t('admin.upload_presentations')` (lines 269, 367)
- [x] Board page empty state uses `t('admin.upload_presentations')` (line 1622)
- [x] Upload dialog title uses `t('slides.upload_presentations')` (line 368)
- [x] `admin.upload_presentations` key present in both en.json and de.json

#### Convert-presentation API endpoint

- [x] POST /api/slides/convert-presentation exists
- [x] Admin auth required via `requireAdmin()` (line 22)
- [x] Rate limiting: 5 requests per 60 seconds (line 25)
- [x] Zod schema validates: sourceUrl (URL), sourceFormat (enum), tenantId (UUID), fileId (UUID)
- [x] Tenant mismatch check: `tenantId !== auth.profile.tenant_id` returns 403 (line 48-49)
- [x] CONVERTAPI_SECRET read from env, never exposed to client (line 28)
- [x] Converted PPTX uploaded to Supabase Storage with signed URL returned
- [x] Page count calculated from converted PPTX via JSZip

#### File validation in dialog

- [x] Extension validation against `SUPPORTED_EXTENSIONS` (line 121)
- [x] File size validation: `MAX_FILE_SIZE = 50 MB` (line 126)
- [x] Individual file errors do not block other files (`continue` on line 123, not `break`)
- [x] File removal: `removeFile()` works, blocked during upload (line 148)

#### Progress tracking

- [x] Per-file status tracking: pending, uploading, converting, processing, done, error
- [x] Status text updated per file via `t('slides.processing_file')` and `t('slides.converting_file')`
- [x] Progress bar shows `(currentFileIndex + 1) / totalFiles * 100` during upload

#### Dialog close/reset

- [x] `handleClose()` resets queue, error, statusText, currentFileIndex (lines 154-161)
- [x] Close blocked during upload (`if (uploading) return`, line 155)
- [x] Dialog `onOpenChange` calls `handleClose` (line 365)

#### Error handling per-file

- [x] Each file processed in try/catch; error on one file does not stop others (lines 331-336)
- [x] Error message stored per-file in queue entry
- [x] Thumbnail generation failure is non-fatal (fire-and-forget with `.catch()`, line 328)

### 2. API Security Audit: /api/slides/convert-presentation

- [x] **Auth check:** `requireAdmin()` -- admin-only, returns 401/403/404 appropriately
- [x] **Rate limiting:** 5 requests per 60 seconds via `checkRateLimit` (Supabase-backed, atomic RPC)
- [x] **Input validation:** Full Zod schema with `z.string().url()`, `z.enum(['ppt','key','odp'])`, `z.string().uuid()`
- [x] **Tenant isolation:** `tenantId !== auth.profile.tenant_id` check returns 403
- [x] **Secret protection:** `CONVERTAPI_SECRET` is server-only env var (no `NEXT_PUBLIC_` prefix)
- [x] **Error message safety:** ConvertAPI errors logged to console but not leaked to client (line 72-76)
- [x] **CONVERTAPI_SECRET documented** in `.env.local.example` (line 24)
- [x] **Storage path uses tenantId scoping:** `${tenantId}/${fileId}/original.pptx`

### 3. Translation Completeness

All `t()` calls in upload-slide-dialog.tsx verified against both en.json and de.json:

| Translation Key                         | en.json       | de.json       |
| --------------------------------------- | ------------- | ------------- |
| slides.upload_presentations             | OK (line 773) | OK (line 773) |
| slides.upload_presentations_description | OK (line 774) | OK (line 774) |
| slides.select_presentation_files        | OK (line 776) | OK (line 776) |
| slides.max_50_mb                        | OK (line 777) | OK (line 777) |
| slides.max_10_files                     | OK (line 778) | OK (line 778) |
| slides.upload_button                    | OK (line 781) | OK (line 781) |
| slides.uploading                        | OK (line 782) | OK (line 782) |
| slides.select_file_first                | OK (line 783) | OK (line 783) |
| slides.unsupported_format               | OK (line 784) | OK (line 784) |
| slides.file_too_large                   | OK (line 785) | OK (line 785) |
| slides.converting                       | OK (line 786) | OK (line 786) |
| slides.converting_file                  | OK (line 787) | OK (line 787) |
| slides.processing_file                  | OK (line 788) | OK (line 788) |
| slides.upload_complete                  | OK (line 789) | OK (line 789) |
| slides.some_files_failed                | OK (line 790) | OK (line 790) |
| slides.cancel                           | OK (line 791) | OK (line 791) |
| slides.close                            | OK (line 792) | OK (line 792) |
| admin.upload_presentations              | OK (line 512) | OK (line 512) |

### 4. Regression Check

- [x] **Edit slide dialog** (`edit-slide-dialog.tsx`): Still uses `.pptx` only for replacement files (line 81-82), references `t('slides.only_pptx_accepted')` -- key present in both locales (line 793). No regression.
- [x] **Board page empty state** (`board/page.tsx`): Updated to `t('admin.upload_presentations')` -- correct.
- [x] **Personal slides upload** (`upload-personal-slide-dialog.tsx`): Completely separate component. Still PPTX-only (line 58). Uses different translation keys. No regression.
- [x] **Build verification:** `npm run build` succeeds with no errors.

### 5. Bugs Found

#### BUG-25: Hardcoded English "Slide" / "Slides" text in upload dialog

- **Severity:** Medium
- **File:** `src/components/slides/upload-slide-dialog.tsx`, line 428
- **Steps to Reproduce:**
  1. Upload a multi-page PPTX file as an admin
  2. Wait for upload to complete
  3. Observe the file entry in the queue -- it shows "3 Slides" in English regardless of locale
- **Code:**
  ```tsx
  {
    qf.status === 'done' && ` · ${qf.slidesCreated} ${qf.slidesCreated === 1 ? 'Slide' : 'Slides'}`
  }
  ```
- **Expected:** Should use a translated string, e.g. `t('slides.slides_created_one')` / `t('slides.slides_created_other')` or use i18next's pluralization.
- **Impact:** German users see English text mixed into the German UI.
- **Priority:** Fix before next release. Easy fix -- add translation keys with `{{count}}` interpolation.

#### BUG-26: Dead code -- unused `succeeded` variable

- **Severity:** Low
- **File:** `src/components/slides/upload-slide-dialog.tsx`, lines 343-347
- **Code:**
  ```tsx
  const succeeded = queue.filter((_, i) => {
    // We need to check the final state -- but since setQueue is async,
    // use allCreatedSlideIds length as proxy
    return true
  })
  ```
- **Description:** This variable filters nothing (always returns true) and is never used. It appears to be a leftover from a refactor. The comment even acknowledges the issue.
- **Impact:** No functional impact. Code cleanliness issue.
- **Priority:** Clean up in next commit.

#### BUG-27: SSRF risk -- sourceUrl in convert-presentation API accepts arbitrary URLs

- **Severity:** High
- **File:** `src/app/api/slides/convert-presentation/route.ts`, line 9, 54-67
- **Steps to Reproduce:**
  1. Authenticated admin sends POST to /api/slides/convert-presentation with:
     ```json
     {
       "sourceUrl": "http://169.254.169.254/latest/meta-data/",
       "sourceFormat": "ppt",
       "tenantId": "<valid-tenant-id>",
       "fileId": "<valid-uuid>"
     }
     ```
  2. The server forwards this URL to ConvertAPI: `{ Name: 'File', FileValue: { Url: sourceUrl } }`
  3. ConvertAPI fetches the URL from its servers, so the direct SSRF vector is against ConvertAPI's infrastructure, not the app server itself. However, if the signed URL validation is weak, an attacker could:
     - Point ConvertAPI to internal Supabase storage URLs belonging to other tenants
     - Point to URLs that exfiltrate data via DNS or HTTP callbacks
- **Mitigation already present:** Only admins can call this endpoint (requireAdmin), and the sourceUrl is validated as a URL by Zod.
- **Missing mitigation:** No check that `sourceUrl` actually points to the app's own Supabase storage bucket. An admin could supply any URL, causing ConvertAPI to fetch arbitrary external resources on the app's ConvertAPI account.
- **Recommended fix:** Validate that `sourceUrl` starts with the Supabase storage URL prefix (e.g., `process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/'`) before forwarding it to ConvertAPI.
- **Priority:** Fix before production. While limited to admins, it could be exploited if an admin account is compromised.

#### BUG-28: Error message leaks internal error details in convert-presentation catch block

- **Severity:** Medium
- **File:** `src/app/api/slides/convert-presentation/route.ts`, line 131
- **Code:**
  ```tsx
  {
    error: err instanceof Error ? err.message : 'Conversion failed'
  }
  ```
- **Description:** The generic catch block on line 128-133 returns `err.message` directly to the client. If an unexpected error occurs (e.g., from JSZip, Buffer operations, or Supabase client), the raw error message could leak internal details such as file paths, stack traces, or connection strings.
- **Expected:** Return a generic error message to the client and log the details server-side only (which is already done on line 129).
- **Recommended fix:** Replace line 131 with a generic message like `{ error: 'An unexpected error occurred during conversion' }`.
- **Priority:** Fix before production.

#### BUG-29: Potential memory pressure with large base64 PPTX buffers

- **Severity:** Low
- **File:** `src/app/api/slides/convert-presentation/route.ts`, lines 79-88
- **Description:** ConvertAPI returns the converted PPTX as a base64-encoded string in the JSON response (`convertData.Files[0].FileData`). This is then decoded to a Buffer. For a 50 MB PPTX, the base64 string would be ~67 MB, plus the decoded buffer is another 50 MB, totaling ~117 MB in memory simultaneously. On Vercel serverless functions with default 1024 MB memory, this could cause OOM for large files.
- **Impact:** Large file conversions could fail silently or crash the serverless function.
- **Recommended fix:** Consider using ConvertAPI's file download URL instead of inline base64, or set a lower file size limit for non-PPTX formats (e.g., 20 MB).
- **Priority:** Monitor in production. Not critical for typical presentation file sizes (usually < 20 MB).

#### BUG-30: Duplicate "cancel" key in slides namespace in both locale files

- **Severity:** Low
- **File:** `public/locales/en.json` (lines 767 and 791), `public/locales/de.json` (lines 767 and 791)
- **Description:** The key `"cancel"` appears twice in the `slides` object in both locale files. JSON parsers take the last occurrence, so both resolve to "Cancel" / "Abbrechen" respectively. The values happen to be identical so there is no functional issue, but it is a maintenance hazard -- if someone edits the first occurrence thinking it is the active one, the change would be silently ignored.
- **Priority:** Clean up in next commit. Remove the duplicate on line 767 (the edit dialog's cancel key) or line 791.

#### BUG-31: Progress bar shows 100% before last file finishes processing

- **Severity:** Low
- **File:** `src/components/slides/upload-slide-dialog.tsx`, lines 360-362
- **Code:**
  ```tsx
  const progressPercent =
    totalFiles > 0 && uploading
      ? Math.round(((currentFileIndex + 1) / totalFiles) * 100)
      : allDone
        ? 100
        : 0
  ```
- **Description:** When the last file (index `totalFiles - 1`) starts processing, `currentFileIndex + 1` equals `totalFiles`, so `progressPercent` becomes 100% while the file is still being uploaded/converted/processed. The progress bar reaches 100% before the final file completes.
- **Expected:** Progress should only reach 100% when all files are actually done.
- **Recommended fix:** Use `currentFileIndex / totalFiles * 100` during upload (showing 0% for the first file start), or weight progress by sub-steps (uploading, converting, processing) within each file.
- **Priority:** Low cosmetic issue.

### 6. Pre-Existing Issue (Not part of this change)

**NOTE:** `admin/slides/page.tsx` line 357 passes `{ filter }` to `t('admin.no_filtered_slides')` but the translation key template uses `{{status}}`. This is a pre-existing bug, not introduced by this change.

### 7. Summary

| Category                           | Result                                  |
| ---------------------------------- | --------------------------------------- |
| Feature acceptance criteria        | PASS (all criteria met)                 |
| Multi-file upload logic            | PASS                                    |
| File format validation             | PASS                                    |
| API auth + rate limiting           | PASS                                    |
| API input validation (Zod)         | PASS                                    |
| Tenant isolation                   | PASS                                    |
| Translation completeness           | PASS (all keys present in both locales) |
| Regression: edit-slide-dialog      | PASS (no changes, still works)          |
| Regression: personal-slides-upload | PASS (unaffected)                       |
| Regression: board page             | PASS (button text updated)              |
| Build verification                 | PASS                                    |

### Bugs Summary

| Bug                                               | Severity | Priority              | Category     |
| ------------------------------------------------- | -------- | --------------------- | ------------ |
| BUG-25: Hardcoded "Slide"/"Slides" English text   | Medium   | Fix before release    | i18n         |
| BUG-26: Dead code (unused `succeeded` variable)   | Low      | Next commit           | Code quality |
| BUG-27: SSRF risk via sourceUrl parameter         | High     | Fix before production | Security     |
| BUG-28: Error message leaks internal details      | Medium   | Fix before production | Security     |
| BUG-29: Memory pressure with large base64 buffers | Low      | Monitor               | Performance  |
| BUG-30: Duplicate "cancel" key in locale files    | Low      | Next commit           | i18n         |
| BUG-31: Progress bar premature 100%               | Low      | Next commit           | UX           |

### Verdict

**Not production-ready.** Two issues must be fixed before production deployment:

1. **BUG-27** (High): Add sourceUrl domain validation to prevent SSRF
2. **BUG-28** (Medium): Sanitize error messages in the catch block

After those two fixes, one additional fix is recommended before the next user-facing release: 3. **BUG-25** (Medium): Translate the hardcoded "Slide"/"Slides" text

The remaining four bugs (BUG-26, BUG-29, BUG-30, BUG-31) are low severity and can be addressed in subsequent cleanup commits.

---

## QA Test Results: Sprint 6 -- Bulk Actions & Dashboard Trends (2026-03-17)

**Tested:** 2026-03-17
**Tester:** QA Engineer (AI)
**Scope:** Bulk status change, bulk tag add, dashboard trend metrics, BulkTagPopover component, translation additions.

### Files Reviewed

- `src/app/api/slides/bulk-status/route.ts` (new)
- `src/app/api/slides/bulk-tags/route.ts` (new)
- `src/app/api/dashboard/stats/route.ts` (modified)
- `src/app/(app)/admin/slides/page.tsx` (modified -- BulkTagPopover, handleBulkStatusChange, handleBulkAddTags)
- `src/app/(app)/dashboard/page.tsx` (modified -- trendPercent, SummaryCards trend badges)
- `public/locales/en.json` (new keys)
- `public/locales/de.json` (new keys)
- `src/lib/auth-helpers.ts` (dependency)
- `src/lib/rate-limit.ts` (dependency)
- `src/lib/notifications.ts` (dependency)
- `src/lib/activity-log.ts` (dependency)

### Build Verification

- [x] `npm run build` succeeds with zero errors
- [x] `npm run lint` produces zero errors (22 pre-existing warnings, none in Sprint 6 files)

---

### 1. API Security Audit: PATCH /api/slides/bulk-status

| Check                  | Result   | Details                                                                                                                                                                                                                            |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth required          | **PASS** | `requireAdmin(request)` enforced at line 19. Returns 401/403/404 on failure.                                                                                                                                                       |
| Rate limiting          | **PASS** | `checkRateLimit(auth.user.id, 'slides:bulk-status', 10, 60_000)` at line 24. 10 requests per minute.                                                                                                                               |
| Input validation (Zod) | **PASS** | `BulkStatusSchema` validates slideIds as `z.array(z.string().uuid()).min(1).max(100)` and status as `z.enum(['standard', 'mandatory', 'deprecated'])`.                                                                             |
| Array size bounded     | **PASS** | Max 100 slide IDs per request (`.max(100)` in schema).                                                                                                                                                                             |
| Tenant isolation       | **PASS** | Ownership verified at line 47-51: fetches slides matching both `id IN slideIds` AND `tenant_id = tenantId`. Only validated IDs are updated. Update query also includes `.eq('tenant_id', tenantId)` at line 67 (defense-in-depth). |
| Cross-tenant attack    | **PASS** | If `slideIds` contains IDs from another tenant, the ownership query returns an empty set for those IDs. They are silently excluded from `validIds`.                                                                                |
| SQL injection          | **PASS** | Supabase client uses parameterized queries. No raw SQL.                                                                                                                                                                            |
| Invalid JSON body      | **PASS** | Caught at line 28-31, returns 400 "Invalid JSON".                                                                                                                                                                                  |
| Error message safety   | **PASS** | Fetch error returns generic "Failed to verify slides". Update error at line 70 returns `updateError.message` -- see BUG-32.                                                                                                        |
| Activity logging       | **PASS** | `logActivity` called for each deprecated slide with `slide.deprecated` event type (lines 76-84).                                                                                                                                   |
| Notifications          | **PASS** | `createNotifications` called for affected project owners when status = deprecated (lines 100-112).                                                                                                                                 |

### 2. API Security Audit: POST /api/slides/bulk-tags

| Check                  | Result       | Details                                                                                                                                                                                                                                                                            |
| ---------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth required          | **PASS**     | `requireAdmin(request)` enforced at line 17.                                                                                                                                                                                                                                       |
| Rate limiting          | **PASS**     | `checkRateLimit(auth.user.id, 'slides:bulk-tags', 10, 60_000)` at line 23.                                                                                                                                                                                                         |
| Input validation (Zod) | **PASS**     | `BulkTagsSchema` validates slideIds as `z.array(z.string().uuid()).min(1).max(100)` and tags as `z.array(z.string().trim().min(1).max(50)).min(1).max(20)`. Consistent with single-slide tag validation.                                                                           |
| Array size bounded     | **PASS**     | Max 100 slide IDs, max 20 tags per request.                                                                                                                                                                                                                                        |
| Tag length bounded     | **PASS**     | Each tag max 50 chars, trimmed.                                                                                                                                                                                                                                                    |
| Tag dedup + cap        | **PASS**     | Merged tags capped at 20 per slide (line 64: `.slice(0, 20)`). Set deduplication prevents duplicates.                                                                                                                                                                              |
| Tenant isolation       | **PASS**     | Fetch query at line 46-50 filters by `tenant_id`. Update at line 71 also includes `.eq('tenant_id', tenantId)`.                                                                                                                                                                    |
| Empty tags array       | **PASS**     | Zod schema enforces `.min(1)` on tags array. Empty array is rejected.                                                                                                                                                                                                              |
| Invalid JSON body      | **PASS**     | Caught at line 28-31, returns 400.                                                                                                                                                                                                                                                 |
| Tag sanitization (XSS) | **LOW RISK** | Tags are plain strings stored in JSONB. React renders them with JSX escaping (no `dangerouslySetInnerHTML`). Stored XSS is not possible in the current rendering pipeline. However, no regex filter prevents tags containing HTML entities, angle brackets, or control characters. |

### 3. API Audit: GET /api/dashboard/stats (Modified)

| Check                    | Result         | Details                                                                                                                                                                                                                                  |
| ------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth required            | **PASS**       | `requireAdmin(request)` at line 13.                                                                                                                                                                                                      |
| Rate limiting            | **PASS**       | 30 requests per minute at line 20.                                                                                                                                                                                                       |
| Tenant isolation         | **PASS**       | All 8 queries in Promise.all filter by `tenantId` from `profile.tenant_id`.                                                                                                                                                              |
| New queries correct      | **PASS**       | `prevExportsCount` queries activity_logs with `gte(sixtyDaysAgo)` AND `lt(thirtyDaysAgo)` -- correctly targets the 30-60 day window.                                                                                                     |
| previousSlides semantics | **SEE BUG-33** | Query counts slides with `created_at < thirtyDaysAgo` and `status != deprecated`. This is NOT "slides in the previous 30-day window" but rather "total slides that existed 30 days ago." The trend comparison is semantically incorrect. |
| Null safety              | **PASS**       | All counts use `?? 0` fallback (lines 104-111).                                                                                                                                                                                          |
| Error handling           | **PASS**       | Wrapped in try/catch returning generic 500 error.                                                                                                                                                                                        |

### 4. Frontend Audit: BulkTagPopover Component

| Check                          | Result         | Details                                                                                                                                                                                                                            |
| ------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uses translated strings        | **PASS**       | All visible text uses `t()` -- `admin.add_tags`, `admin.select_tags`, `admin.new_tag_placeholder`, `admin.apply_tags`.                                                                                                             |
| Empty state (no existing tags) | **PASS**       | When `allTags.length === 0`, the checkbox section is skipped (line 102 conditional). Only the new-tag input and apply button are shown.                                                                                            |
| State reset on close           | **PASS**       | `onOpenChange` handler resets `selectedTags` and `newTag` when popover closes (lines 83-85).                                                                                                                                       |
| Keyboard support               | **PASS**       | Enter key triggers `handleApply` (lines 122-125).                                                                                                                                                                                  |
| Apply with no selection        | **PASS**       | Apply button disabled when no tags selected and no new tag typed (line 132).                                                                                                                                                       |
| shadcn Input not used          | **SEE BUG-34** | Line 115-127 uses a raw `<input>` element with manually replicated styling instead of the `Input` component from `@/components/ui/input`.                                                                                          |
| Max tag input length           | **PASS**       | `maxLength={50}` on the raw input (line 121). Consistent with Zod validation.                                                                                                                                                      |
| Duplicate new tag handling     | **LOW RISK**   | If the user types a new tag that matches an existing checked tag, both will be in the `tags` array passed to `onApply`. The API-side Set dedup handles this, but the UI does not prevent it. Not a bug -- just slightly redundant. |

### 5. Frontend Audit: handleBulkStatusChange / handleBulkAddTags

| Check                        | Result   | Details                                                                                                             |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| Optimistic UI update         | **PASS** | On success, `setSlides` updates local state to reflect new status/tags without re-fetching.                         |
| Selection cleared on success | **PASS** | `setSelected(new Set())` called on success for both handlers.                                                       |
| Error toast                  | **PASS** | On non-ok response, error is extracted from JSON and shown via toast. Falls back to `t('admin.bulk_action_error')`. |
| Loading state managed        | **PASS** | `bulkStatusLoading` and `bulkTagsLoading` set/unset in try/finally blocks.                                          |
| Session null guard           | **PASS** | Both handlers return early if `session` is null (silently -- see BUG-35).                                           |

### 6. Frontend Audit: Dashboard trendPercent + Trend Badges

| Check                  | Result   | Details                                                                                                                                                                                                              |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Division by zero       | **PASS** | `trendPercent` handles `previous === 0` explicitly at line 145-146. Returns stable if both are 0, +100% if only current > 0.                                                                                         |
| Backward compatibility | **PASS** | `DashboardData` interface includes `previousExports` and `previousSlides` as `number`. Since the API always returns these with `?? 0` fallback, undefined is not possible when the endpoint is the Sprint 6 version. |
| Trend badge visibility | **PASS** | Trend badges only shown when `direction !== 'stable'` (line 211).                                                                                                                                                    |
| Color coding           | **PASS** | Up = `text-emerald-600` (green), Down = `text-destructive` (red).                                                                                                                                                    |
| Translation            | **PASS** | `dashboard.vs_previous_30d` present in both en.json and de.json.                                                                                                                                                     |

### 7. Translation Completeness

All 9 new translation keys verified in BOTH locale files:

| Key                          | en.json                                          | de.json                                               |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| `admin.change_status`        | "Change status" (line 796)                       | "Status andern" (line 796)                            |
| `admin.add_tags`             | "Add tags" (line 797)                            | "Tags hinzufugen" (line 797)                          |
| `admin.select_tags`          | "Select tags to add" (line 798)                  | "Tags zum Hinzufugen auswahlen" (line 798)            |
| `admin.new_tag_placeholder`  | "New tag..." (line 799)                          | "Neuer Tag..." (line 799)                             |
| `admin.apply_tags`           | "Apply tags" (line 800)                          | "Tags anwenden" (line 800)                            |
| `admin.status_changed_count` | "Status updated for {{count}} slides" (line 801) | "Status fur {{count}} Slides aktualisiert" (line 801) |
| `admin.tags_added_count`     | "Tags added to {{count}} slides" (line 802)      | "Tags zu {{count}} Slides hinzugefugt" (line 802)     |
| `admin.bulk_action_error`    | "Bulk action failed" (line 803)                  | "Massenaktion fehlgeschlagen" (line 803)              |
| `dashboard.vs_previous_30d`  | "vs. previous 30 days" (line 1206)               | "ggu. vorherigen 30 Tagen" (line 1206)                |

**Result: PASS** -- all keys present in both locales with correct interpolation.

---

### 8. Bugs Found

#### BUG-32: bulk-status endpoint leaks Supabase error message to client

- **Severity:** MEDIUM
- **File:** `src/app/api/slides/bulk-status/route.ts`, line 70
- **Code:**
  ```typescript
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }
  ```
- **Description:** The raw `updateError.message` from the Supabase client is returned directly to the client. This could leak internal details such as table names, column names, constraint names, or PostgreSQL error codes. The analogous bulk-tags endpoint (line 52-54) correctly returns a generic "Failed to fetch slides" message.
- **Expected:** Return a generic error message: `{ error: 'Failed to update slides' }` and log the actual error server-side.
- **Priority:** Fix before production.

#### BUG-33: previousSlides metric is semantically misleading for trend calculation

- **Severity:** MEDIUM
- **File:** `src/app/api/dashboard/stats/route.ts`, lines 94-100
- **Code:**
  ```typescript
  // Slides created in previous 30-day window (for new-slide trend)
  supabase
    .from('slides')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .neq('status', 'deprecated')
    .lt('created_at', thirtyDaysAgo),
  ```
- **Description:** The comment says "previous 30-day window" but the query counts ALL non-deprecated slides created BEFORE 30 days ago (with no lower bound). This means `previousSlides` represents the total slide count as it was ~30 days ago. Meanwhile, `totalSlides` counts ALL non-deprecated slides including those older ones. So the trend shows growth in total library size, not a period-over-period comparison of new slides added.

  For **exports**, the trend correctly compares: "exports in last 30 days" vs "exports in the 30-60 day window" (a true period-over-period comparison).

  For **slides**, the trend compares: "total slides now" vs "total slides 30 days ago" -- this is a cumulative metric, not a period comparison. This is inconsistent with the exports trend and with the label "vs. previous 30 days."

  Example: A tenant with 100 slides 30 days ago and 110 slides now shows +10%. A tenant with 100 slides 30 days ago and 100 slides now (same slides, none added, none removed) shows 0%. The comparison is technically valid as a "library growth" metric, but it is labeled and presented as if it were a period comparison.

- **Expected:** Either (a) query slides created in the 30-60 day window (matching exports pattern) and compare against slides created in the last 30 days, or (b) update the label from "vs. previous 30 days" to "growth from 30 days ago."
- **Priority:** Fix before production. The current metric could be confusing or misleading to admins.

#### BUG-34: BulkTagPopover uses raw HTML input instead of shadcn Input component

- **Severity:** LOW
- **File:** `src/app/(app)/admin/slides/page.tsx`, lines 115-127
- **Code:**
  ```tsx
  <input
    type="text"
    className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground"
    placeholder={t('admin.new_tag_placeholder')}
    ...
  />
  ```
- **Description:** The project rules (`.claude/rules/frontend.md`) state: "NEVER create custom implementations of: Button, Input, Select, Checkbox..." A shadcn `Input` component exists at `src/components/ui/input.tsx`. The BulkTagPopover uses a raw `<input>` element with manually duplicated CSS classes instead of importing `Input` from `@/components/ui/input`. The styling also differs -- the raw input uses `h-8` while the shadcn Input uses `h-10`, and the raw input is missing the focus ring styles (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
- **Expected:** Replace with `<Input className="h-8" ... />` from `@/components/ui/input`.
- **Priority:** Fix in next sprint. Violates project conventions but is functionally correct.

#### BUG-35: Silent failure when session is null in bulk action handlers

- **Severity:** LOW
- **File:** `src/app/(app)/admin/slides/page.tsx`, lines 327-328, 362-363
- **Code:**
  ```typescript
  if (!session) return
  ```
- **Description:** In both `handleBulkStatusChange` and `handleBulkAddTags`, if `getSession()` returns no session, the function returns silently without clearing the loading state or notifying the user. Since the function entered the `try` block but returns before setting `setBulkStatusLoading(false)` in `finally` -- wait, actually the `finally` block DOES execute on early return. So loading state IS cleared. However, the user receives no feedback that the action failed due to an expired session. The button stops spinning but nothing happens.
- **Note:** This pattern is consistent with other handlers in the same file (e.g., `fetchSlides`, `handleDelete`, `handleBulkDelete`), so this is a pre-existing pattern, not specific to Sprint 6.
- **Priority:** Low. Consider adding a `toast.error('Session expired')` or triggering a re-auth flow. Non-blocking.

#### BUG-36: Unbounded project query in bulk-status notification logic

- **Severity:** MEDIUM
- **File:** `src/app/api/slides/bulk-status/route.ts`, lines 87-90
- **Code:**
  ```typescript
  const { data: affectedProjects } = await supabase
    .from('projects')
    .select('id, owner_id, name, slide_order')
    .eq('tenant_id', tenantId)
  ```
- **Description:** This query fetches ALL projects for the tenant (no `.limit()`) including the full `slide_order` JSONB column for every project. For tenants with hundreds or thousands of projects, this could be a significant performance issue and memory burden on the serverless function.

  The single-slide deprecation endpoint (`src/app/api/slides/[id]/route.ts`, line 158-162) uses a much more efficient approach: `.contains('slide_order', [{ slide_id: id }])` which filters at the database level. The bulk endpoint cannot use the same `contains` approach for multiple slide IDs in a single query, but it should at minimum add a `.limit()` or paginate.

  Additionally, per `.claude/rules/backend.md`: "Use `.limit()` on all list queries."

- **Expected:** Either (a) add a reasonable `.limit()` (e.g., 1000), or (b) for each slide ID in `validIds`, query with `.contains('slide_order', [{ slide_id: slideId }])` individually (trading N queries for reduced payload), or (c) select only `id, owner_id, name` and use a database function to check slide_order membership.
- **Priority:** Fix before production. Risk of OOM or timeout on large tenants.

#### BUG-37: Notification message only references first project per owner

- **Severity:** LOW
- **File:** `src/app/api/slides/bulk-status/route.ts`, lines 99-112
- **Code:**
  ```typescript
  const uniqueOwners = [...new Set(relevantProjects.map((p) => p.owner_id))]
  createNotifications(
    uniqueOwners.map((ownerId) => {
      const proj = relevantProjects.find((p) => p.owner_id === ownerId)!
      return {
        ...
        message: `${validIds.length} slide${...} in "${proj.name}" ${...} been deprecated`,
        resourceId: proj.id,
      }
    })
  )
  ```
- **Description:** If an owner has multiple projects affected by the bulk deprecation, `relevantProjects.find()` returns only the FIRST matching project. The notification message says "X slides in 'Project A' have been deprecated" but does not mention Project B, Project C, etc. The `resourceId` also points to only the first project, so clicking the notification navigates to only one of the affected projects.
- **Expected:** Either (a) send one notification per affected project (not per owner), or (b) adjust the message to say "X slides in Y projects have been deprecated" and list the project names.
- **Priority:** Low. Functional but incomplete information for the user.

---

### 9. Cross-Browser & Responsive Check (Code Review)

| Viewport         | Result               | Notes                                                                                                                                                                                                     |
| ---------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1440px (Desktop) | **PASS**             | Bulk action toolbar renders inline with adequate spacing. Dropdown and popover align correctly. Dashboard trend badges fit within card layout.                                                            |
| 768px (Tablet)   | **PASS**             | Selection toolbar wraps using `flex-wrap` (implicit in `flex items-center gap-3`). Popover content `w-64` fits within viewport. Dashboard cards use `sm:grid-cols-2`.                                     |
| 375px (Mobile)   | **PASS with caveat** | The bulk action toolbar has 4-5 buttons in a row which will wrap. The popover `w-64` (256px) fits within 375px viewport minus padding. Dashboard trend text may truncate on very long percentage strings. |
| Chrome           | **PASS**             | Standard React/Tailwind rendering.                                                                                                                                                                        |
| Firefox          | **PASS**             | No browser-specific APIs. DropdownMenu and Popover from Radix UI are cross-browser.                                                                                                                       |
| Safari           | **PASS**             | No known compatibility issues with the components used.                                                                                                                                                   |

### 10. Regression Check

| Feature                       | Risk                                          | Result                                                                                                                                          |
| ----------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| PROJ-15 (Slide Library)       | Modified page.tsx                             | **PASS** -- existing functionality (upload, edit, delete, single-slide operations) unchanged. New code is additive.                             |
| PROJ-16 (Slide Tags)          | Tags modified via new bulk endpoint           | **PASS** -- bulk-tags uses same merge logic as edit-slide. Single-slide tag editing unaffected.                                                 |
| PROJ-40 (Analytics Dashboard) | dashboard/stats endpoint modified             | **PASS** -- two new fields added to response; existing fields unchanged. Old dashboard code would simply ignore the new fields if not consumed. |
| PROJ-13 (Notifications)       | New notification trigger for bulk deprecation | **PASS** -- uses same `createNotifications` API as existing single-slide deprecation. No changes to notification infrastructure.                |
| PROJ-39 (Activity Log)        | New activity log entries for bulk deprecation | **PASS** -- uses same `logActivity` API. Event type `slide.deprecated` already exists in `ALL_EVENT_TYPES` array.                               |

---

### 11. Summary

| Category                               | Result                                |
| -------------------------------------- | ------------------------------------- |
| Build verification                     | **PASS**                              |
| Lint                                   | **PASS** (0 errors)                   |
| API auth + rate limiting (bulk-status) | **PASS**                              |
| API auth + rate limiting (bulk-tags)   | **PASS**                              |
| API input validation (bulk-status)     | **PASS**                              |
| API input validation (bulk-tags)       | **PASS**                              |
| Tenant isolation (both endpoints)      | **PASS**                              |
| Dashboard stats modification           | **PASS** (with BUG-33)                |
| Translation completeness               | **PASS** (all 9 keys in both locales) |
| Frontend components                    | **PASS** (with BUG-34)                |
| Cross-browser                          | **PASS**                              |
| Responsive layout                      | **PASS**                              |
| Regression                             | **PASS**                              |

### Bugs Summary

| Bug                                                            | Severity | Priority              | Category               |
| -------------------------------------------------------------- | -------- | --------------------- | ---------------------- |
| BUG-32: Supabase error message leaked to client in bulk-status | MEDIUM   | Fix before production | Security               |
| BUG-33: previousSlides metric semantically misleading          | MEDIUM   | Fix before production | Data accuracy          |
| BUG-34: Raw HTML input instead of shadcn Input component       | LOW      | Fix in next sprint    | Convention             |
| BUG-35: Silent failure on expired session in bulk handlers     | LOW      | Non-blocking          | UX                     |
| BUG-36: Unbounded project query in bulk-status notifications   | MEDIUM   | Fix before production | Performance / Security |
| BUG-37: Notification only references first project per owner   | LOW      | Non-blocking          | UX                     |

### Verdict

**Conditionally production-ready.** Three MEDIUM bugs should be fixed before production deployment:

1. **BUG-32** (Medium/Security): Replace `updateError.message` with a generic error message in bulk-status endpoint.
2. **BUG-33** (Medium/Data): Fix the previousSlides query to use a proper 30-60 day window, or relabel the trend metric.
3. **BUG-36** (Medium/Performance): Add `.limit()` or use database-level filtering for the project notification query.

The remaining three bugs (BUG-34, BUG-35, BUG-37) are LOW severity and can be addressed in subsequent sprints.

## Deployment

_To be added by /deploy_

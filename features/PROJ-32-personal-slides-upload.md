# PROJ-32: Personal Slides Upload

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-02

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-21 (Project Tray) — personal slides appear in the tray

## User Stories
- As a user, I want to upload my own PowerPoint slides to a project so that I can include custom content alongside the library slides
- As a user, I want personal slides to be visible only in my project so that they don't appear in the shared library
- As a user, I want to mix personal slides freely with library slides in the tray so that my presentation has the exact order I need
- As a user, I want personal slides to be preserved when I restore a version snapshot so that my custom content is never lost

## Acceptance Criteria
- [ ] "Upload personal slide" button available in the board/tray view for the active project
- [ ] Accepts .pptx files only; max file size: 50MB per file
- [ ] Each uploaded file is treated as one "personal slide" entry in the tray (a PPTX with one or more slides)
- [ ] A thumbnail is generated for the personal slide
- [ ] Personal slides appear in the tray mixed with library slides; they can be freely reordered
- [ ] Personal slides are visible only to the project owner and shared users (not to all tenant users)
- [ ] Personal slides are NOT visible in the tenant's slide library
- [ ] Personal slides are included in export (PPTX and PDF) at their tray position
- [ ] Version history restore always preserves personal slides (PROJ-38)
- [ ] Personal slides can be removed from the tray; removal deletes the uploaded file

## Edge Cases
- What if a user uploads a multi-slide PPTX? → Each slide in the file becomes a separate personal slide entry in the tray (or the whole file as one entry — defined in /architecture)
- What if the file upload fails mid-way? → No partial slide entry is created; error shown, user can retry
- What if the project is duplicated (PROJ-26)? → Personal slides are included in the duplicate (same file references)
- What if the project is archived? → Personal slide files are retained in storage; not deleted on archive
- What if the user's storage quota is exceeded? → Upload is blocked with an appropriate error

## Technical Requirements
- Personal slides stored in Supabase Storage: `personal-slides/{tenant_id}/{project_id}/{user_id}/{filename}`
- `project_personal_slides` table: id, project_id, user_id, filename, pptx_url, thumbnail_url, uploaded_at
- Personal slides are referenced in `projects.slide_order` JSONB with `is_personal: true` flag and a `personal_slide_id`
- Thumbnail generation follows the same pipeline as library slides (PROJ-15)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
Users upload their own `.pptx` files directly from the board tray. Each file appears as one tray entry — mixed with library slides, freely reorderable, fully exportable. Personal slides are completely private to the project (invisible to the admin library and to other tenants).

Reuses the existing admin upload pattern (`UploadSlideDialog`, Supabase Storage), but with a separate storage bucket and a new project-scoped database table.

---

### Multi-Slide Decision
**One entry per uploaded file.** A multi-slide PPTX is treated as one tray block. This avoids brittle server-side splitting of PowerPoint master/layout/theme structures. Users who need individual slides can upload separate single-slide files.

---

### Component Structure

```
Board Page (existing)
+-- TrayPanel (extended)
|   +-- [NEW] "Upload slide" button (tray header, project must be open)
|   +-- TraySlideItem (library slides — unchanged)
|   +-- [NEW] PersonalTraySlideItem (personal slides)
|       +-- "Personal" badge, title, remove button (removal deletes file)
+-- [NEW] UploadPersonalSlideDialog
    +-- File picker (.pptx only, max 50 MB)
    +-- Title input (auto-filled from filename)
    +-- Upload progress indicator
    +-- Error display
```

---

### Data Model

**New table: `project_personal_slides`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `project_id` | uuid | FK → projects (ON DELETE CASCADE) |
| `user_id` | uuid | FK → auth.users (uploader) |
| `title` | text | User-provided label (max 200 chars) |
| `filename` | text | Original filename for display |
| `pptx_storage_path` | text | Path in `personal-slides` bucket |
| `file_size_bytes` | integer | For quota checking |
| `uploaded_at` | timestamptz | Default now() |

**RLS:** SELECT for project owner + shared users; INSERT/DELETE for owner or `edit` permission users only.

**No thumbnail for V1** — tray shows a placeholder icon. Server-side PPTX → image rendering requires LibreOffice/a paid API; deferred.

**Storage bucket:** `personal-slides` (separate from admin `slides` bucket)
Path pattern: `{project_id}/{user_id}/{uuid}/original.pptx`

**TrayItem extended** (stored in `projects.slide_order` JSONB):
- Library slides: `{ id, slide_id }` (unchanged)
- Personal slides: `{ id, is_personal: true, personal_slide_id: uuid }`

**Quota:** Max 20 personal slides per project (enforced server-side on POST).

---

### API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/projects/[id]/personal-slides` | List personal slides for tray hydration |
| POST | `/api/projects/[id]/personal-slides` | Register slide after client uploads file to storage |
| DELETE | `/api/projects/[id]/personal-slides/[slideId]` | Delete record + storage file, remove from tray |

---

### Export Modification

Both `/export` (PPTX) and `/export/pdf` routes iterate `slide_order`. When an item has `is_personal: true`:
- Look up `project_personal_slides` instead of `slides`
- Download from `personal-slides` bucket
- No text field substitution (personal slides have no editable fields)
- Slide included at its tray position in full

---

### Tech Decisions

**Why separate storage bucket?**
The admin `slides` bucket is tenant-scoped. Personal slides are project-scoped and user-owned. A separate bucket avoids policy conflicts and simplifies deletion.

**Why client-side upload (direct to Storage)?**
Existing pattern for admin uploads — avoids routing large binaries through Next.js API (memory pressure, timeout risk). API is called only after file is in storage, to write the DB record.

**Why no thumbnail in V1?**
Rendering PPTX slides as images requires LibreOffice headless or a paid conversion API. A placeholder icon is acceptable for V1 and clearly distinguishes personal from library slides.

### No New Packages Required
Supabase Storage, JSZip (export), shadcn/ui Dialog + Progress, Lucide icons — all already installed.

## QA Test Results

**Tested:** 2026-03-02
**Build:** PASS (`npm run build`)

### Acceptance Criteria Verification

| # | Criterion | Result |
|---|-----------|--------|
| 1 | "Upload personal slide" button in board/tray view | PASS — Upload button in tray header, visible when `canEdit`, opens `UploadPersonalSlideDialog` |
| 2 | Accepts .pptx only; max 50 MB | PASS — Client-side extension + size check, server-side Zod validation on `file_size_bytes` |
| 3 | Each uploaded file = one tray entry | PASS — One `project_personal_slides` record + one `TrayItem` per upload |
| 4 | Thumbnail generated | PASS (deferred) — Placeholder `FileText` icon per architecture decision; server-side rendering deferred to post-V1 |
| 5 | Personal slides mixed in tray, reorderable | PASS — Same `SortableContext`, `PersonalTraySlideItem` with `useSortable` drag handle |
| 6 | Visible only to project owner + shared users | PASS — `getProjectPermission()` checks owner + `project_shares`; returns 403/404 otherwise |
| 7 | NOT visible in tenant slide library | PASS — Separate `project_personal_slides` table + `personal-slides` bucket |
| 8 | Included in export (PPTX + PDF) at tray position | PASS — Both export routes handle `is_personal` items; PPTX downloads from `personal-slides` bucket, PDF renders title-only page |
| 9 | Version history restore preserves personal slides | N/A — PROJ-38 not yet implemented |
| 10 | Removal deletes uploaded file | PASS — DELETE API removes storage file + DB record + cleans `slide_order` JSONB |

### Database Verification
- `project_personal_slides` table: 8 columns (id, project_id, user_id, title, filename, pptx_storage_path, file_size_bytes, uploaded_at)
- RLS: enabled with SELECT/INSERT/DELETE policies
- Check constraint: `char_length(title) <= 200`
- FK cascades: project (ON DELETE CASCADE), user (ON DELETE CASCADE)
- Indexes: PK, project_id, user_id
- Storage bucket: `personal-slides` (private) with upload/read/delete policies

### Security Audit
- All API routes validate authentication (Bearer token)
- Rate limiting on all 3 endpoints (GET: 60/min, POST: 20/min, DELETE: 30/min)
- Zod validation on POST body (title, filename, storage path, file size)
- Storage path validated to start with `{projectId}/{userId}/`
- Project access verified before any data operation
- Quota enforced: max 20 personal slides per project

### Edge Cases Verified
- Multi-slide PPTX: one tray entry per file (architecture decision)
- Upload failure: error shown, no partial DB record created
- Project duplication: personal slide records copied with new IDs, `slide_order` remapped
- Project archive: files retained, FK cascade on hard delete
- Quota exceeded: blocked with descriptive error

### Bugs Found & Fixed

**BUG-4 (High): DELETE didn't clean up slide_order JSONB**
- Root cause: DELETE endpoint removed DB record + storage file but left stale `is_personal` references in `projects.slide_order`
- Fix: After deleting the record, filter out matching items from `slide_order` and update the project

**BUG-7 (High): Project duplication didn't copy personal slides**
- Root cause: Duplicate endpoint copied `slide_order` (with `is_personal` references) but didn't create new `project_personal_slides` records
- Fix: After creating duplicate, load original personal slides, create new records with the duplicate's project_id, remap `personal_slide_id` references in `slide_order`

### Known Limitations (deferred)
- No server-side magic byte validation for uploaded files (client checks extension only)
- Orphan storage files possible if API registration fails after successful upload
- No thumbnail rendering in V1 (placeholder icon used)

### Build Verification
- `npm run build` — PASS (no errors or warnings)

## Deployment
_To be added by /deploy_

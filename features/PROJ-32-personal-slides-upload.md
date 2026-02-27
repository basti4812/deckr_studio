# PROJ-32: Personal Slides Upload

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

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
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

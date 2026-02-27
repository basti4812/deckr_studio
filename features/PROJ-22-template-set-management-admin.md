# PROJ-22: Template Set Management (Admin)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-15 (Slide Library Management) — template sets are composed of library slides
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories
- As an admin, I want to create named template sets for specific use cases so that employees can start projects from a curated selection of slides
- As an admin, I want to give each template set a name, description, and category tag so that employees can browse and understand them
- As an admin, I want to define the slide order within a template set so that the presentation structure is pre-built
- As an admin, I want to update or delete template sets so that the library stays current
- As an admin, I want to set a cover image for each template set so that it looks visually compelling in the picker

## Acceptance Criteria
- [ ] `template_sets` table: id, tenant_id, name, description, category, cover_image_url, created_at, updated_at
- [ ] `template_set_slides` table: template_set_id, slide_id, position (sort order)
- [ ] Admin can create a new template set with: name (required), description (optional), category (free-text tag), cover image (optional upload)
- [ ] Admin can add slides to a template set and define their order
- [ ] Admin can reorder slides within a template set by drag-and-drop
- [ ] Admin can remove a slide from a template set without deleting the slide from the library
- [ ] Admin can edit a template set's name, description, category, and cover image
- [ ] Admin can delete a template set; deletion does not affect existing projects that were created from it
- [ ] If no cover image is set, the thumbnail of the first slide in the set is used as the cover
- [ ] All template sets are scoped to the current tenant

## Edge Cases
- What if a slide in a template set is deleted from the library? → The slide is removed from the template set silently; remaining slides stay
- What if a slide in a template set is marked as deprecated? → The template set still shows it with a deprecated warning; admin should update the set
- What if a template set has no slides? → Allowed (admin may add slides later); shows in picker with "0 slides"
- What if the cover image upload fails? → Template set is saved without cover image; fallback to first slide thumbnail

## Technical Requirements
- Cover image stored in Supabase Storage: `template-sets/{tenant_id}/{set_id}/cover.jpg`
- Template set slide ordering stored in `template_set_slides.position` column (integer, 1-indexed)
- RLS: only admins can INSERT/UPDATE/DELETE template sets and their slides; all tenant users can SELECT

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

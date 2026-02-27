# PROJ-19: Slide Groups & Admin Board Layout

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-02-26

## Dependencies
- Requires: PROJ-18 (Board Canvas)
- Requires: PROJ-15 (Slide Library Management)
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories
- As an admin, I want to organize slides into named groups so that the library has a clear, logical structure
- As an admin, I want to name each group with a section label (e.g. "Intro Slides", "Pricing") so that employees can navigate the library easily
- As an admin, I want to define the order of groups and slides within groups so that the board layout reflects our content strategy
- As a user, I want to see slides organized into clearly labeled sections so that I can find what I'm looking for quickly
- As an admin, I want my configured layout to be the default that all users see so that every employee starts from the same organized view

## Acceptance Criteria
- [ ] `slide_groups` table: id, tenant_id, name, position (sort order), created_at
- [ ] `slide_group_memberships` table: slide_id, group_id, position (sort order within group)
- [ ] Admin can create, rename, and delete groups from the admin board management view
- [ ] Admin can assign slides to groups and set their order within the group
- [ ] Admin can reorder groups by dragging section labels
- [ ] Groups are displayed on the board canvas as labeled sections with a visible header
- [ ] Slides within a group are displayed in the admin-defined order beneath the group header
- [ ] The admin layout is the default layout shown to all users who have not customized their own layout (PROJ-20)
- [ ] Slides not assigned to any group appear in an "Ungrouped" section at the end of the canvas
- [ ] A slide can belong to only one group at a time
- [ ] Deleting a group moves all its slides to "Ungrouped" (not deleted)

## Edge Cases
- What if an admin deletes a group that users have in their custom layout (PROJ-20)? → User's layout for that group is removed; slides appear in Ungrouped
- What if two admins reorder groups simultaneously? → Last write wins; no conflict resolution UI needed
- What if a group has no slides? → Show the group header with an empty state: "No slides in this group"
- What if the admin layout changes after a user has customized theirs (PROJ-20)? → User's personal layout is preserved; new admin slides/groups appear in Ungrouped section of the user's view until they rearrange

## Technical Requirements
- Admin board layout is the authoritative default; stored as group ordering + group membership in DB
- Changes to the admin layout are immediately reflected for all users who have not customized (no cache issues)
- Drag-and-drop for reordering groups and slides within groups (admin view only)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

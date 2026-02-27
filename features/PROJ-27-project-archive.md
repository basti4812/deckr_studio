# PROJ-27: Project Archive

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)

## User Stories
- As a user, I want to archive a project instead of deleting it so that I can keep it for reference without cluttering my active project list
- As a user, I want to access my archived projects in a dedicated section so that I can find them when needed
- As a user, I want to restore an archived project to my active list so that I can work on it again
- As a user, I want to permanently delete an archived project so that I can remove it entirely when I'm sure I don't need it

## Acceptance Criteria
- [ ] "Archive" option available on each project card (context menu or button) — only for the project owner
- [ ] Archiving a project sets its status to 'archived'; it disappears from the main project list
- [ ] Archived projects are accessible via an "Archive" section on the home screen
- [ ] Archive section shows the same project card UI with modified date and slide count
- [ ] "Restore" button on archived project cards: restores status to 'active', project reappears in main list
- [ ] "Delete permanently" button on archived project cards: confirmation dialog required; deletes the project and all associated data
- [ ] Archiving does NOT affect version history (PROJ-38), comments (PROJ-30), shared access (PROJ-25), or share links (PROJ-35)
- [ ] Only the project owner can archive or restore; shared users cannot archive
- [ ] Admins can archive or delete any project in their tenant (via admin activity tools)

## Edge Cases
- What if a shared user tries to archive a project they don't own? → "Archive" button is not visible to shared users
- What if an archived project has active share links (PROJ-35)? → Share links remain valid unless manually expired; archiving is not equivalent to revoking links
- What if the project owner is removed from the team (PROJ-9) while the project is archived? → Project is transferred to the admin who removed them; admin can restore or delete

## Technical Requirements
- Archive is a soft delete: project status column changes from 'active' to 'archived'
- Main project list query always filters status = 'active'
- Archive section query filters status = 'archived'
- Permanent delete removes the project row and all related rows (cascade delete)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

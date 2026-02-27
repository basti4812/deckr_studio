# PROJ-24: Project Creation & Management

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model)
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-4 (Subscription Data Model) — subscription status gate

## User Stories
- As a user, I want to create a new project with a name so that I can start assembling a presentation
- As a user, I want to see all my projects on the home screen so that I can quickly resume work
- As a user, I want to rename a project so that I can give it a meaningful name for a specific customer or opportunity
- As a user, I want to delete a project so that I can remove content I no longer need
- As a user, I want to open a project and return to the board with my slide selection so that I can continue where I left off
- As a user, I want to see the last modified date and slide count for each project so that I can quickly identify what I'm looking for

## Acceptance Criteria
- [ ] `projects` table: id, tenant_id, owner_id, name, slide_order (JSONB), text_edits (JSONB), status ('active'|'archived'), crm_customer_name, crm_company_name, crm_deal_id, created_at, updated_at
- [ ] "New project" button on the home screen opens the project creation flow (name input → template picker → board)
- [ ] Project name is required; min 1 char, max 120 chars
- [ ] Home screen shows all active (non-archived) projects owned by or shared with the user
- [ ] Each project card shows: name, last modified date, slide count, owner (if shared)
- [ ] "Shared with me" section on home screen shows projects shared by colleagues (PROJ-25)
- [ ] Clicking a project card opens the board with that project's tray loaded
- [ ] Renaming a project: inline edit on the project card or in project settings; saves immediately
- [ ] Deleting a project: confirmation dialog required; permanent deletion (not archive); version history deleted too
- [ ] Projects sorted by last modified date (most recent first) by default
- [ ] Projects list is paginated or uses infinite scroll if more than 20 items

## Edge Cases
- What if two users in the same tenant create projects with the same name? → Allowed; names are not unique
- What if a project is opened while another user is also editing it (via sharing)? → Both edits are accepted; last-write-wins; no real-time conflict resolution
- What if the user's subscription expires while they have open projects? → They can see project list but are blocked from editing (subscription gate)
- What if the user deletes a project that is shared with colleagues? → Only the owner can delete; shared users see it disappear from their "Shared with me" list

## Technical Requirements
- `slide_order` JSONB: array of `{slide_id, is_personal, personal_slide_url}` objects
- `text_edits` JSONB: map of `slide_id → {field_id → value}` objects
- Project list query uses `.order('updated_at', {ascending: false}).limit(20)` with pagination
- All project writes are immediately persisted to Supabase (no local-only state)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

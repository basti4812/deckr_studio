# PROJ-26: Project Duplication

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)

## User Stories
- As a user, I want to duplicate a project with one click so that I can use it as a starting point for a similar presentation
- As a user, I want the duplicate to include the same slide selection, order, and text edits so that I don't have to redo my work
- As a user, I want to rename the duplicate immediately so that I can give it a meaningful name
- As a user, I want the duplicate to be mine (not shared) so that my copy is independent

## Acceptance Criteria
- [ ] "Duplicate" option available on each project card (context menu or button)
- [ ] Duplicate creates a new project with: same slide_order, same text_edits, owner = current user
- [ ] Duplicate name: "Copy of {{original name}}"
- [ ] After duplication, the duplicate is immediately opened or highlighted with an inline rename prompt
- [ ] Version history is NOT copied — the duplicate starts fresh with no history
- [ ] Share links are NOT copied — the duplicate has no share links
- [ ] project_shares are NOT copied — only the duplicating user has access
- [ ] CRM fields (crm_customer_name, crm_company_name, crm_deal_id) are copied from the original
- [ ] Duplication is available on any project the user owns or has access to (including shared projects)

## Edge Cases
- What if the original project name is already at the 120-char limit? → Truncate to fit "Copy of ..." prefix (total max 120 chars)
- What if the duplicating user is at their project limit (if a limit exists in a future tier)? → Block with upgrade prompt (no limit defined yet; placeholder for future enforcement)
- What if the original project has personal slides (PROJ-32)? → Personal slides are copied to the duplicate (same file references; files are not re-uploaded)

## Technical Requirements
- Duplication is a single database transaction: insert new project row with copied JSONB fields
- The new project's `created_at` and `updated_at` are set to the current timestamp
- Duplication does not call any export or file-processing pipeline

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

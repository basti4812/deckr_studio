# PROJ-31: Slide Notes (Private)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-21 (Project Tray) — note icon on tray slide

## User Stories
- As a user, I want to write private notes on individual slides within a project so that I can keep talking points or reminders for myself
- As a user, I want my notes to be visible only to me so that collaborators and external viewers never see them
- As a user, I want a visual indicator on the slide in the tray when I have a note so that I know notes exist without opening them
- As a mobile user, I want to read and add slide notes so that I can review my talking points on the go

## Acceptance Criteria
- [ ] `slide_notes` table: id, project_id, slide_id, slide_instance_index, user_id, body, created_at, updated_at
- [ ] Notes button/icon on each tray slide; clicking opens the notes panel for that slide
- [ ] A yellow sticky-note icon on the tray slide card indicates a note exists (PROJ-21)
- [ ] Notes panel shows the user's current note for that slide as an editable textarea
- [ ] Note auto-saves on blur or after 1 second of inactivity
- [ ] Notes are never included in exports (PPTX or PDF)
- [ ] Notes are never shown to shared users or external viewers
- [ ] Notes are accessible in the mobile view (PROJ-42): read and edit are supported
- [ ] If no note exists, the panel shows an empty state: "Add a private note for this slide..."

## Edge Cases
- What if a user shares a project — do the notes become visible to the shared user? → No; notes are always private per user
- What if a slide is removed from the tray? → The note is retained in the DB (slide may be re-added); not shown but not deleted
- What if the project is archived? → Notes are preserved; edit is possible if the project is restored; mobile read-only view still shows them
- What if a user is removed from the team? → Their notes are retained in the DB but no longer accessible to anyone

## Technical Requirements
- RLS policy: notes readable/writable only by the user who owns them (user_id = auth.uid())
- Notes body: plain text, max 2000 characters
- Auto-save uses debounce (1000ms); no manual save button needed

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

# PROJ-23: Template Set Picker

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-22 (Template Set Management Admin)
- Requires: PROJ-24 (Project Creation & Management)

## User Stories
- As a user creating a new project, I want to browse available template sets so that I can start from a curated slide selection instead of from scratch
- As a user, I want to see cover images, descriptions, and slide counts for each template set so that I can choose the right one
- As a user, I want to preview the full slide order of a template set before selecting it so that I know exactly what I'm getting
- As a user, I want to filter template sets by category so that I can find relevant options quickly
- As a user, I want to start a project from scratch without using a template so that I have full flexibility

## Acceptance Criteria
- [ ] Template set picker is shown as a step during project creation (before the board opens)
- [ ] Picker shows two options: "Start from scratch" and "Choose a template"
- [ ] If "Choose a template" is selected: show a visual grid of available template sets
- [ ] Each template set card shows: cover image, name, description, slide count, category tag
- [ ] Category filter: filter by category tag; "All" is the default
- [ ] Clicking a template set card shows a full preview: ordered list of all slide thumbnails and titles in the set
- [ ] User can confirm selection or go back to the grid
- [ ] After confirmation, the project tray is pre-populated with the template set's slides in order
- [ ] Mandatory slides are automatically added in addition to template slides
- [ ] "Start from scratch" populates the tray with only the mandatory slides
- [ ] If no template sets exist, the picker skips straight to "Start from scratch" (or shows an empty state)

## Edge Cases
- What if a template set contains deprecated slides? → Deprecated slides are shown with a deprecated warning in the preview; they are NOT added to the project tray on confirmation
- What if a template set contains slides the user's tenant no longer has access to? → Those slides are skipped silently during population
- What if the user goes back from the template picker to change their project name? → Template selection is not reset; selection is remembered during the creation flow
- What if there are more than 20 template sets? → Grid paginates or scrolls; category filter helps narrow down

## Technical Requirements
- Picker is implemented as a modal or a dedicated step in the project creation flow
- Template set analytics (PROJ-40) track when each set is selected for a new project
- Slide preview in the picker uses thumbnails (not the full PPTX)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

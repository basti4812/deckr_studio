# PROJ-20: User Canvas Layout (Personal Rearrangement)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-18 (Board Canvas)
- Requires: PROJ-19 (Slide Groups & Admin Board Layout)

## User Stories
- As a user, I want to rearrange slides and sections on my own canvas so that I can organize the board in a way that suits my workflow
- As a user, I want to create personal groupings on my canvas so that I can logically cluster slides for my use cases
- As a user, I want to add text labels above slides as personal annotations so that I can add context for myself
- As a user, I want to reset my canvas to the admin default layout so that I can start fresh without losing my personal slides
- As a user, I want my personal layout to persist across sessions so that I don't have to rearrange every time I log in

## Acceptance Criteria
- [ ] Users can drag slides to different positions and groups on their personal canvas view
- [ ] Users can create personal groups (named sections) visible only to themselves
- [ ] Users can rename personal groups
- [ ] Users can add short text annotations (labels) above any slide on their canvas — visible only to themselves
- [ ] All personal layout changes are saved automatically and persist across sessions
- [ ] "Reset to admin layout" button available in the board toolbar — resets the user's layout back to the admin default
- [ ] After reset: only admin-configured groups and positions remain; personal annotations and personal groups are removed
- [ ] After reset: personal slides (PROJ-32) are always preserved and reappear in an "My Slides" section
- [ ] Personal layout is stored per user, per tenant — not shared with anyone else
- [ ] Other users always see their own layout or the admin default; personal changes are never visible to colleagues

## Edge Cases
- What if the admin adds new slides after the user has customized their layout? → New slides appear in an "Ungrouped" section at the bottom of the user's canvas until rearranged
- What if the admin deletes a slide the user had positioned? → Slide disappears from the user's canvas; no error
- What if a user resets the canvas while having unsaved drag operations? → Reset applies immediately; confirmation dialog first
- What if a user creates a personal group with the same name as an admin group? → Allowed; they are distinct objects; no deduplication

## Technical Requirements
- `user_board_layouts` table: user_id, tenant_id, layout_data (JSONB with group positions, slide positions, personal annotations), updated_at
- Layout changes auto-saved with debounce (e.g. 1 second after last drag operation)
- Layout is applied client-side on top of the admin default: fetch admin layout, then overlay user overrides
- Reset deletes the user's `user_board_layouts` record; subsequent render falls back to admin layout

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

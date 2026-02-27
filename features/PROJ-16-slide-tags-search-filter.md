# PROJ-16: Slide Tags & Search/Filter

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-15 (Slide Library Management)
- Requires: PROJ-18 (Board Canvas) — search/filter lives in the board view

## User Stories
- As an admin, I want to add free-form tags to slides so that they can be categorized beyond their board group
- As a user, I want to search slides by title so that I can quickly find specific slides
- As a user, I want to search by tag so that I can find all slides related to a topic (e.g. "pricing")
- As a user, I want to filter by slide status (mandatory, deprecated, editable) so that I can focus on relevant slides
- As a user, I want to filter by group/section so that I can browse a specific category
- As a user, I want to combine search and multiple filters simultaneously so that I can narrow down results precisely
- As a user, I want live results as I type so that I don't need to press "Search"

## Acceptance Criteria
- [ ] `slide_tags` table: slide_id, tag (text), tenant_id — or stored as text array on the slides table
- [ ] Tags are managed by admins only: add/remove tags in the slide detail panel
- [ ] Tags are displayed on slide cards in the board view as chips/badges
- [ ] Search bar is persistent in the board's slide library area
- [ ] Search runs against slide title AND tags simultaneously as the user types (debounced 200ms)
- [ ] Search is case-insensitive
- [ ] Filter panel: collapsible sidebar/panel; contains: Group/Section checkboxes, Tag checkboxes, Status checkboxes
- [ ] Multiple filters can be active simultaneously; results show slides matching all active filters (AND logic)
- [ ] Filter state and search state are independent (both can be active at once)
- [ ] Clear search button resets search; "Clear all filters" button resets all filters
- [ ] Clearing search and all filters returns the board to its full view
- [ ] Active filter count badge shown on filter panel toggle button
- [ ] Result count displayed: "X slides found"

## Edge Cases
- What if search returns 0 results? → Empty state: "No slides match your search. Try different keywords or clear the filters."
- What if a tag is deleted by an admin? → The tag is removed from all slides; filter panel no longer shows it
- What if a slide has no tags? → It is not shown in tag-specific filters, but appears in title search and group filter
- What if a user types very fast? → Debounce prevents excessive queries; last input wins

## Technical Requirements
- Search implemented with PostgreSQL full-text search or ILIKE on title + tag array contains
- Tags stored as `text[]` array on the slides table for simplicity (or normalized tag table)
- Filter state stored in URL query params so the URL is shareable and browser back/forward works
- No separate search API route needed — queries run via Supabase client with filter chaining

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

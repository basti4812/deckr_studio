# PROJ-40: Analytics Dashboard (Admin)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-3 (User Roles & Permissions)
- Requires: PROJ-15 (Slide Library Management)
- Requires: PROJ-22 (Template Set Management)
- Requires: PROJ-33 (PowerPoint Export) — use event tracked for slide usage

## User Stories
- As an admin, I want to see which slides are used most frequently so that I know what content is valuable
- As an admin, I want to see when each slide was last used so that I can identify stale content
- As an admin, I want to quickly find slides that have never been used so that I can consider removing them
- As an admin, I want to see which template sets are most popular so that I know what to invest in
- As an admin, I want to export all analytics data as CSV so that I can analyze it in my own tools

## Acceptance Criteria
- [ ] Analytics dashboard accessible in admin workspace at `/admin/analytics`
- [ ] Slide usage table: slide name, thumbnail, status, use count (times added to any project), last used date, template set count (times included in a template set)
- [ ] "Never used" filter: one-click filter to show only slides with 0 uses
- [ ] Template set usage table: template set name, cover image, times selected for project creation, last selected date
- [ ] Usage data covers all projects in the tenant (all users)
- [ ] "Export CSV" button: downloads all slide usage data as a CSV file (slide name, use count, last used date)
- [ ] Dashboard shows a summary card at the top: total slides, total projects, total exports in the last 30 days
- [ ] Data refreshes on page load (no real-time updates needed)

## Edge Cases
- What if a slide is used 0 times? → Shows "0" in use count column; "Never" in last used column
- What if there are no template sets? → Template set usage section shows empty state
- What if a slide is deleted? → Its analytics history is retained for historical accuracy; shows "(deleted)" for the slide name
- What if the CSV export has special characters in slide names? → Proper CSV encoding (quotes around fields with commas or special chars)

## Technical Requirements
- Slide use count calculated from project slide_order JSONB queries or a dedicated `slide_usage_events` table written on export
- `slide_usage_events` table (if used): slide_id, project_id, user_id, used_at — written when a project is exported or a snapshot is saved
- Template set usage tracked in `template_set_selections` table: set_id, project_id, selected_at — written on project creation from template
- Analytics queries use aggregation; results cached for 1 hour to avoid slow queries on large datasets
- CSV export streams the response for large datasets

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

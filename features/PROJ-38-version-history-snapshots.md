# PROJ-38: Version History & Named Snapshots

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-33 (PowerPoint Export) — export auto-saves a snapshot
- Requires: PROJ-34 (PDF Export) — export auto-saves a snapshot
- Requires: PROJ-32 (Personal Slides) — personal slides preserved on restore

## User Stories
- As a user, I want a snapshot to be auto-saved every time I export so that I always have a record of what I sent
- As a user, I want to manually save a named version so that I can capture a specific milestone
- As a user, I want to browse the version history for a project so that I can see how it evolved
- As a user, I want to restore a previous version so that I can go back to an earlier state
- As a user, I want restored versions to always preserve my personal slides so that my custom content is never lost

## Acceptance Criteria
- [ ] `project_versions` table: id, project_id, label (nullable), slide_order_snapshot (JSONB), text_edits_snapshot (JSONB), created_at, is_auto (boolean)
- [ ] Auto-snapshot: created automatically on every export (PPTX or PDF); label is "Export — {date time}"
- [ ] Manual snapshot: "Save version" button in the project; user provides a name/label; saved immediately
- [ ] Version history panel: list of all versions sorted newest first; shows label and timestamp
- [ ] Each version entry shows: label, date/time, "Auto" or "Manual" badge, "Restore" button
- [ ] Restoring a version replaces the current project's slide_order and text_edits with the snapshot's values
- [ ] Before restoring: confirmation dialog "This will overwrite your current slide selection. Are you sure?"
- [ ] Personal slides are always preserved on restore: if personal slides exist in the current project but not in the snapshot, they are retained and appended to the restored slide order
- [ ] Version snapshots are point-in-time: slide PPTX URLs captured at snapshot time (not updated when admin updates slides — see PROJ-17)
- [ ] Version history is NOT copied on project duplication (PROJ-26) — duplicates start fresh

## Edge Cases
- What if two exports happen in rapid succession? → Two auto-snapshots are created; both are retained
- What if a manual snapshot has no label? → Default label: "Unnamed version — {date time}"
- What if the project is archived and then restored? → Version history is preserved; restore from version works normally
- What if the project has hundreds of versions? → List is paginated; oldest versions may be pruned after 90 days (auto-only; manual versions are kept indefinitely)

## Technical Requirements
- `slide_order_snapshot` is a deep copy of `projects.slide_order` at the time of snapshot
- `text_edits_snapshot` is a deep copy of `projects.text_edits` at the time of snapshot
- Restore operation: single DB update to `projects` row
- Personal slides preservation logic: after restore, re-merge any personal slide entries that exist in current project but not in snapshot

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

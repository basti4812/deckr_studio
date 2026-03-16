# PROJ-29: Text Editing & Fill Warnings

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-02-27

## Dependencies

- Requires: PROJ-15 (Slide Library Management) — editable fields defined per slide
- Requires: PROJ-21 (Project Tray) — editing happens in the context of a project's slide selection
- Requires: PROJ-33 (PowerPoint Export) — fill check happens before export
- Requires: PROJ-37 (Presentation Mode) — fill check happens before presentation

## User Stories

- As a user, I want to fill in editable text fields on slides so that I can customize the presentation for a specific customer
- As a user, I want to see which fields are required vs optional so that I know what I must fill in
- As a user, I want a warning before exporting or presenting if required fields are empty so that I don't send incomplete presentations
- As a user, I want to fill in required fields directly from the warning screen so that I can fix issues without navigating away

## Acceptance Criteria

- [ ] Each slide in the tray with editable fields shows an "Edit" button or inline edit icon
- [ ] Clicking opens an edit panel/modal showing all editable fields for that slide
- [ ] Required fields are clearly marked (e.g., asterisk, "Required" label)
- [ ] Text edits are saved to the project's `text_edits` JSONB field: `{"<instance_uuid>": {"<field_id>": "value"}}` keyed by the tray instance UUID
- [ ] Edits are saved automatically on blur or after a short debounce
- [ ] Before export (PROJ-33) and before presentation mode (PROJ-37), the app checks all required fields in the current tray
- [ ] If any required fields are empty, a warning screen/modal appears listing all issues slide by slide: "Slide X — {{field label}} is required"
- [ ] From the warning screen, the user can: click on an issue to fill in the field, or click "Export anyway" / "Present anyway" to proceed
- [ ] If no required fields are empty, export or presentation mode starts immediately
- [ ] Text edits are visible in the slide thumbnail/preview within the tray (best effort; may require a re-render)

## Edge Cases

- What if an admin removes a field definition that a user already filled in? → The stored value is retained in JSONB but not shown; data is not lost
- What if the same slide appears multiple times in the tray? → Each instance has its own text_edits keyed by the instance UUID (the `id` field in `slide_order`), so each copy is independently editable
- What if a required field value is only whitespace? → Treated as empty; warning shown
- What if the user proceeds anyway (skips warning)? → Export/presentation proceeds; a note may appear in the export metadata

## Technical Requirements

- Text edits stored in `projects.text_edits` as JSONB: `{"<instance_uuid>": {"<field_id>": "value"}}` where the key is the `id` from `slide_order` (the instance UUID, not the slide_id). This survives reordering cleanly.
- Fill check is a client-side function: iterate tray items → for each item, look up `text_edits[item.id]` → check required fields on the slide → collect unfilled
- No server-side validation of fill state is required (user can choose to proceed anyway)
- Edit panel is accessible from keyboard (ARIA compliant)

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview

Frontend-only feature. No new API routes or DB migrations required. The `projects.text_edits` JSONB column already exists and `PATCH /api/projects/[id]` already accepts it.

### Component Structure

```
Board Page
+-- TrayPanel
|   +-- TraySlideItem  ← Pencil edit icon + fill indicator dot (new props)
+-- EditFieldsDialog   ← NEW: per-instance field editor
+-- FillWarningDialog  ← NEW: pre-export/presentation gate
```

### New Components

- **`src/components/board/edit-fields-dialog.tsx`** — Dialog showing all `editable_fields` for a tray instance. Required fields marked with asterisk. Auto-saves on blur via `onChange` callback. Uses shadcn: Dialog, Textarea, Label, Badge.
- **`src/components/board/fill-warning-dialog.tsx`** — Warning modal listing unfilled required fields before export/presentation. Issues listed by tray position + slide title. Each issue has "Fill in" button. Footer: "Proceed anyway" or wait until fixed. Uses shadcn: Dialog, ScrollArea, Button.

### New Utility

- **`src/lib/fill-check.ts`** — Pure function `checkFillStatus(trayItems, slideMap, textEdits) → UnfilledField[]`. Iterates tray items, checks required fields, returns flat list of issues.

### Board Page Changes

- `textEdits` state (`Record<instanceId, Record<fieldId, value>>`) initialized from `project.text_edits`
- `scheduleSave` extended to save both `slide_order` and `text_edits` in the same PATCH
- `handleFieldChange(instanceId, fieldId, value)` updates state + schedules save
- `editingInstance` state controls which `EditFieldsDialog` is open
- `checkAndProceed(action)` helper: runs fill check → opens `FillWarningDialog` if issues, else calls `action()` immediately (used by PROJ-33 export + PROJ-37 presentation)

### Data Storage

`projects.text_edits` JSONB: `{ "<instance_uuid>": { "<field_id>": "value" } }`
Key is `TrayItem.id` (unique UUID per tray slot, not slide_id). Same slide appearing twice has independent edits. Survives reordering.

### Tech Decisions

- Auto-save on blur (no explicit Save button) via existing 500ms debounce pattern
- shadcn/ui only for all new UI (Dialog, Textarea, Label, Badge, ScrollArea, Button)
- Fill check is pure client-side; no server validation (user can proceed anyway)

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

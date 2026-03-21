# PROJ-44: Textfield Editing — Placeholder Logic Overhaul

## Status: Planned

**Created:** 2026-03-20
**Last Updated:** 2026-03-20

## Dependencies

- Requires: PROJ-15 (Slide Library Management) — slides must exist with detected text fields
- Requires: PROJ-29 (Text Editing & Fill Warnings) — current editing system to be overhauled
- Impacts: PROJ-33 (PowerPoint Export), PROJ-34 (PDF Export), PROJ-35 (Share Links)

## User Stories

- As an admin, I want all detected text fields to default to "not editable" after upload so that employees only see fields I explicitly approve
- As an admin, I want to set each text field to one of three states (not editable / can be filled / must be filled) so that I control exactly what employees can and must enter
- As an admin, I want to provide a custom label and placeholder text for each editable field so that employees understand what to type
- As an admin, I want to be warned before revoking editability on a field employees have already filled so that I don't accidentally destroy their work
- As an employee, I want to see only admin-approved editable fields so that the interface is clean and I know exactly what to fill in

## Acceptance Criteria

- [ ] After PPTX upload, all detected text fields are stored with `editable_state: 'locked'` — none are exposed to employees by default
- [ ] After a successful upload, a post-upload hint is displayed: "Lege jetzt fest, wo deine Teamkolleg:innen eigene Texte eingeben können oder müssen. Klicke dazu unter der jeweiligen Folie auf die drei Punkte und dann auf 'Bearbeiten'."
- [ ] In the admin Edit Slide dialog, each detected text field shows a tri-state selector with options: "Nicht bearbeitbar" (default), "Kann ausgefüllt werden", "Muss ausgefüllt werden"
- [ ] When the admin selects "Kann ausgefüllt werden" or "Muss ausgefüllt werden", an expandable config section appears with: Label input (required for admin), Placeholder text input (optional, pre-filled with original slide text), Delete icon (red trash, resets field to "Nicht bearbeitbar")
- [ ] The admin can switch between all three states at any time for any field
- [ ] When switching to "Nicht bearbeitbar", label and placeholder text are cleared from the field config
- [ ] When switching to "Nicht bearbeitbar" on a field that employees have already filled in, a confirmation warning is shown: "X Mitarbeiter haben dieses Feld bereits ausgefüllt. Ihre Eingaben gehen verloren." with Cancel/Confirm
- [ ] The `editable_fields` JSON stored per slide record only contains fields where `editable_state` is 'optional' or 'required' — locked fields are excluded from the employee-facing array
- [ ] All detected fields (including locked ones) are stored separately so the admin can re-enable them later without re-scanning the PPTX
- [ ] The employee-facing EditFieldsDialog only renders fields with state 'optional' or 'required'
- [ ] Required fields are enforced by the existing fill-check system (PROJ-29) — export blocked if unfilled
- [ ] The admin can re-scan a PPTX to detect new text fields added after a file replacement (via "Felder neu scannen" button)

## Edge Cases

- What if the PPTX has zero detectable text fields? → Show message: "Diese Folie enthält keine erkannten Textfelder." No tri-state selector shown.
- What if an admin sets all fields to "locked"? → Employee sees "Keine bearbeitbaren Felder" in the edit dialog. Pencil icon hidden on board.
- What if an admin re-scans and the PPTX has different fields than before? → New fields are added as 'locked', removed fields are soft-deleted (employee data preserved until admin confirms removal)
- What if the admin changes a field from 'required' to 'optional'? → Existing employee data is preserved, field simply becomes optional
- What if two admins edit the same slide's field config simultaneously? → Last-write-wins (standard Supabase behavior), no real-time conflict resolution needed for MVP

## Technical Requirements

- Store all detected fields in a `detected_fields` JSON column on the slides table (complete set from PPTX parsing)
- Store only admin-approved fields in the existing `editable_fields` column (employee-facing subset)
- The `detected_fields` column preserves `shapeName` and `phType` from the parser for future re-scanning
- Field matching on re-scan uses `shapeName` as the stable identifier (not field ID which is a random UUID)
- The warning about employee data loss requires a count query: how many distinct users have non-empty `text_edits` for this field across all projects
- Admin-only API: PATCH /api/slides/[id] must validate the tri-state transitions server-side via Zod

---

## Tech Design (Solution Architect)

### Data Model Changes

**New column on `slides` table:**

```
detected_fields (jsonb, default: '[]')
  Stores ALL detected text fields from PPTX, regardless of admin state.
  Each field:
  - id: UUID (stable across saves)
  - label: string (admin-provided or auto-generated)
  - placeholder: string (original PPTX text, pre-filled)
  - shapeName: string (stable PPTX shape identifier for re-scan matching)
  - phType: string | null (PowerPoint placeholder type)
  - editable_state: "locked" | "optional" | "required"
```

**Existing `editable_fields` column — meaning changes:**

```
editable_fields (jsonb)
  Now DERIVED from detected_fields automatically on save:
  → Only fields with editable_state "optional" or "required"
  → Without shapeName/phType (not relevant for employees)
  → Recomputed on every admin save
```

Two columns because:

- `detected_fields` = admin view (all fields, incl. locked)
- `editable_fields` = employee view (only approved fields)
- When admin locks then unlocks a field, label/placeholder are preserved

### Component Structure

```
Admin: Edit Slide Dialog (existing, extended)
├── Slide preview + title/status/tags (unchanged)
├── Text Fields Section (REDESIGNED)
│   ├── Info message if no fields detected
│   ├── Per detected field:
│   │   ├── Tri-State Selector: Locked / Can fill / Must fill
│   │   └── Expandable config (visible when Can/Must):
│   │       ├── Label input (required for admin)
│   │       ├── Placeholder input (optional, pre-filled with PPTX text)
│   │       └── Delete button (red trash → resets to Locked)
│   └── "Rescan Fields" button
└── Save / Cancel

Employee: Edit Fields Dialog (existing, minimal change)
├── Slide preview
├── Per approved field:
│   ├── Label + Required badge
│   └── Textarea with placeholder
└── Save & Render

Upload Dialog (existing, adjusted)
├── Upload flow (unchanged)
└── Post-Upload Hint (NEW)
    → "Lege jetzt fest, wo deine Teamkolleg:innen eigene Texte
       eingeben können oder müssen..."
```

### API Changes

**PATCH /api/slides/[id]** — extended:

- Accepts new `detected_fields` array with tri-state validation
- Server computes `editable_fields` automatically from `detected_fields`
- Zod validates: each field must have valid `editable_state`

**New endpoint: GET /api/slides/[id]/field-usage**

- Counts how many projects/users have filled a specific field
- Called when admin wants to lock a previously editable field
- Returns: `{ fieldId, projectCount, userCount }`

### Upload Flow Change

Before: Upload → fields detected → all saved as `editable_fields` (visible to employees immediately)

After: Upload → fields detected → all saved as `detected_fields` with `editable_state: "locked"` → `editable_fields` stays empty → post-upload hint shown → admin must explicitly approve

### Re-Scan Logic

When admin clicks "Rescan Fields":

1. PPTX re-parsed for text fields
2. New fields matched to existing via `shapeName`
3. Known fields: admin settings (state, label) preserved
4. New fields: added as "locked"
5. Removed fields: marked as "removed" (not immediately deleted)

### Migration

1. Supabase migration: add `detected_fields` column
2. Data migration: copy existing `editable_fields` into `detected_fields` with `editable_state: "optional"` (existing fields were all editable)
3. No breaking change for employees — `editable_fields` keeps the same format

### Build Sequence

1. **Backend:** Supabase migration + PATCH API extension + field-usage endpoint
2. **Frontend:** Edit Slide Dialog redesign (tri-state selector)
3. **Frontend:** Upload Dialog post-upload hint
4. **QA:** Test all transitions, re-scan, employee view

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

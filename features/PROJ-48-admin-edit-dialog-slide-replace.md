# PROJ-48: Admin Edit Dialog & Slide Replace

## Status: Planned

**Created:** 2026-03-20
**Last Updated:** 2026-03-20

## Dependencies

- Requires: PROJ-15 (Slide Library Management) — existing edit dialog
- Requires: PROJ-44 (Textfield Editing) — field configuration UI is embedded in this dialog
- Requires: PROJ-46 (Slide Deletion & Archive) — archive/replace integration
- Requires: PROJ-13 (In-app Notifications) — employee notification on replacement

## User Stories

- As an admin, I want the edit dialog to show a full slide preview at the top so that I can see the slide while configuring its fields
- As an admin, I want a "Folie ersetzen" option in the three-dot menu so that I can swap a slide everywhere it's used without breaking employee presentations
- As an admin, I want employee text inputs to carry over when I replace a slide with matching fields so that their work isn't lost
- As an employee, I want to be notified when a slide I'm using gets replaced so that I can review my text inputs

## Acceptance Criteria

- [ ] The admin Edit Slide dialog layout is: full slide preview image at top (same aspect ratio as board), edit options below (title, status, tags, textfield configuration from PROJ-44)
- [ ] The three-dot menu on each slide card shows options in this order: "Bearbeiten", "Folie ersetzen" (new), "Löschen"
- [ ] "Folie ersetzen" opens a file picker (single PPTX/PPT/KEY/ODP file) and triggers the replacement flow
- [ ] Replacement uploads the new file, processes it (same as normal upload: storage, thumbnails, field detection), and then swaps the slide record
- [ ] The original slide's `id` is preserved — all project tray references continue to point to the same slide ID
- [ ] The original slide's PPTX URL, thumbnail URL, page_index, page_count, source_filename, and detected_fields are updated to the new file's values
- [ ] Text field carry-over logic: for each editable field on the old slide, if the new slide has a detected field with the same `shapeName`, the admin config (label, placeholder, required state) and all employee text edits for that field are preserved
- [ ] Text field mismatch logic: if the new slide has different fields (different shapeNames), the old field config is discarded and employees must re-fill before their next export
- [ ] When fields change, affected employees receive a notification: "Die Folie '[Name]' wurde aktualisiert. Bitte prüfe deine Eingaben vor dem nächsten Export."
- [ ] When fields are fully preserved (all shapeNames match), no notification is sent — the swap is seamless
- [ ] Replacement triggers thumbnail re-generation for all projects that use this slide (existing rendered_previews are invalidated)
- [ ] The replacement flow shows a progress indicator while processing

## Edge Cases

- What if the replacement file has a different number of pages? → Only the specific page being replaced is affected. If the new file has fewer pages than page_index, the replacement fails with an error.
- What if the admin replaces a slide that is also archived? → The archive status is cleared (archived_at set to null), the slide becomes active again with the new content.
- What if the replacement file upload fails midway? → Original slide is untouched (replacement is atomic: swap happens only after the new file is fully processed)
- What if the replacement file is a non-PPTX format? → It's converted to PPTX first (same as normal upload via ConvertAPI), then the same replacement logic applies
- What if the admin cancels mid-replacement? → Original slide is untouched, the partially uploaded new file is cleaned up from storage
- What if 50 employees use this slide? → The notification is sent to all 50 via the existing notification system. Thumbnail re-generation is queued for all affected projects.

## Technical Requirements

- Replacement is a PATCH on the existing slide record, not a DELETE + INSERT (preserves the slide ID and all foreign key references)
- Field matching algorithm: compare old `detected_fields[].shapeName` against new `detected_fields[].shapeName`. Match = carry over, no match = new field (locked by default)
- Invalidate `rendered_previews` entries in all projects that reference this slide ID (set the entry to null so the next render uses the new thumbnail)
- Admin-only API: POST /api/slides/[id]/replace

---

## Tech Design (Solution Architect)

### API

**New: POST /api/slides/[id]/replace**

- Accepts: new pptx_url, detected_fields, page_index, page_count, source_filename
- ShapeName matching: old vs new detected_fields
- Updates slide record (PATCH, preserves ID)
- Clears archived_at if set
- Invalidates rendered_previews in affected projects
- Sends notifications if fields changed
- Deletes old storage file (best-effort)

### Component Changes

- Slide Card: add "Folie ersetzen" to three-dot menu
- Edit Slide Dialog: add thumbnail preview at top
- Replace Flow: file picker → upload → progress → result summary

### Data Flow

1. Admin clicks "Folie ersetzen" → file picker
2. Upload to Supabase Storage
3. Non-PPTX converted via ConvertAPI
4. Fields detected (parsePptxFields)
5. POST /api/slides/[id]/replace
6. Server: shapeName matching, PATCH record, invalidate previews, notify
7. Thumbnails regenerated

### Build Sequence

1. Backend: POST /api/slides/[id]/replace
2. Frontend: Menu option + Replace Flow + Edit Dialog preview
3. QA

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

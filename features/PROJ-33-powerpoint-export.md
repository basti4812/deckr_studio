# PROJ-33: PowerPoint Export (.pptx)

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-02-27

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-21 (Project Tray) — defines slide order
- Requires: PROJ-29 (Text Editing & Fill Warnings) — fill check before export
- Requires: PROJ-38 (Version History) — export auto-saves a snapshot

## User Stories
- As a user, I want to export my assembled presentation as a PowerPoint file so that I can share it or use it in meetings
- As a user, I want the exported file to preserve the original design, master slides, animations, fonts, and colors so that the result looks exactly as intended
- As a user, I want my text edits applied to the exported file so that the presentation is customized for the specific customer
- As a user, I want the export to check for unfilled required fields before proceeding so that I don't accidentally send an incomplete presentation

## Acceptance Criteria
- [ ] "Export" button available in the board/project toolbar
- [ ] Before export: run fill warning check (PROJ-29); show warning screen if required fields are empty; user can proceed anyway
- [ ] Export assembles all slides in the current tray order (library slides + personal slides) into a single .pptx file
- [ ] Text edits (PROJ-29) are applied to the respective slides in the exported file
- [ ] Original design, master slides, animations, fonts, colors, and layouts are fully preserved
- [ ] After successful export: file is downloaded to the user's device
- [ ] After successful export: a version snapshot is auto-saved (PROJ-38)
- [ ] After export: CRM hook is called (PROJ-28, no-op if no provider)
- [ ] Export progress is shown (spinner or progress bar) while the file is being assembled
- [ ] Export is logged in the activity log (PROJ-39): user, project, timestamp

## Edge Cases
- What if the export fails server-side? → Error shown: "Export failed. Please try again."; no snapshot saved
- What if the tray is empty? → Export button is disabled with a tooltip: "Add slides to export"
- What if a slide's PPTX file is no longer available in storage? → Export fails gracefully; error message names the affected slide
- What if the user closes the browser while export is processing? → Export continues server-side; user may need to re-trigger download

## Technical Requirements
- Export is a server-side operation (Next.js API route or Supabase Edge Function)
- PPTX assembly using a library such as `pptxgenjs` or `python-pptx` in a server environment
- Personal slides are merged into the output at their tray position
- Text replacements are applied using the editable_fields definitions (placeholder text matching)
- Max export file size: 200MB; larger assemblies are rejected with a clear error

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

### Overview
This is primarily a **backend feature** with a small frontend addition. The export happens entirely on the server: slides are downloaded from storage, text edits are applied, all slides are merged into a single `.pptx`, and the file is streamed back to the browser for download. No new database columns or tables are needed.

### Component Structure
```
Board Page (existing)
+-- TrayPanel header (existing)
    +-- ExportButton (NEW) — disabled + tooltip when tray is empty

ExportProgressDialog (NEW)
  — Modal shown while export is in progress (spinner + "Generating your presentation…")
  — Blocks interaction; shows error if export fails

API
+-- POST /api/projects/[id]/export (NEW)
```

### Export Flow (Step by Step)
1. User clicks **Export** in the tray header
2. Client runs `checkFillStatus()` (already built in PROJ-29)
   - If required fields are empty → `FillWarningDialog` opens (already built)
   - User can fix fields or click "Export anyway" to proceed
3. `ExportProgressDialog` opens (spinner)
4. Client POSTs to `/api/projects/[id]/export` with auth token
5. **Server-side processing:**
   a. Load project: verify ownership, read `slide_order` and `text_edits`
   b. For each tray item in order:
      - Look up the slide's `pptx_url` path in the `slides` table
      - Download the `.pptx` file from Supabase storage (`slides` bucket)
      - Apply text replacements: the slide's `editable_fields[n].placeholder` text is used as the search token in the PPTX XML; replaced with the user's value from `text_edits[instanceId][fieldId]`
   c. Merge all processed slide files into a single `.pptx` output
   d. Check total size ≤ 200 MB; reject with 413 if over
   e. Return binary `.pptx` response with `Content-Disposition: attachment; filename="presentation.pptx"`
6. Browser receives binary blob → triggers native file download
7. `ExportProgressDialog` closes; success
8. On error: dialog shows "Export failed. Please try again."

### Text Replacement Convention
Admins embed placeholder tokens in their slide `.pptx` files using the same string they enter as `editable_fields[n].placeholder` (e.g., `{{COMPANY_NAME}}`). The server finds these tokens in the slide XML and replaces them with the user's entered value. Because PowerPoint XML can split a single word across multiple text runs, the server normalizes runs before searching.

### Data Model
No new columns or tables needed:
- `slides.pptx_url` — already stores path to original `.pptx` in Supabase Storage (`slides` bucket, path: `{tenant_id}/{slide_id}/original.pptx`)
- `projects.slide_order` — already stores tray order as `[{id, slide_id}]`
- `projects.text_edits` — already stores per-instance field values as `{instanceId: {fieldId: value}}`

### Tech Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Processing location | Next.js API route (Node.js) | Needs more memory than Deno Edge; can use Node.js file APIs |
| PPTX reading/writing | `jszip` (read ZIP) + XML string manipulation | PPTX is a ZIP of XML files; no native Node.js PPTX library needed for reading |
| PPTX merging | `pptx-compose` npm package | Designed specifically to merge multiple PPTX files while preserving masters, layouts, and themes |
| File delivery | Stream binary response, `Content-Disposition: attachment` | No intermediate storage; no cost for saving generated files |
| Progress feedback | `ExportProgressDialog` with spinner | Simple; no SSE/WebSocket needed since most exports complete in seconds |
| Size limit | 413 + error message if >200 MB | Per spec; enforced server-side before streaming |

### Dependencies to Install
- `jszip` — read and write ZIP archives (PPTX format)
- `pptx-compose` — merge multiple PPTX files into one while preserving slide masters and layouts

### Deferred Items (not in this feature)
- **PROJ-38 (Version History):** Auto-save snapshot after export — stub only; no-op until PROJ-38 is built
- **PROJ-28 (CRM Hook):** No-op call after export — stub only
- **PROJ-39 (Activity Log):** No-op — activity logging deferred to PROJ-39

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

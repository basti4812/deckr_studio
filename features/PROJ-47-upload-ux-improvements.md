# PROJ-47: Upload UX Improvements

## Status: Planned

**Created:** 2026-03-20
**Last Updated:** 2026-03-20

## Dependencies

- Requires: PROJ-15 (Slide Library Management) — existing upload dialog
- Related: PROJ-45 (File Size Management) — compression prompt integrates into this flow
- Related: PROJ-44 (Textfield Editing) — post-upload hint about field configuration

## User Stories

- As an admin, I want to know that hidden slides are skipped during upload so that I'm not confused by a different slide count
- As an admin, I want a clear message during processing so that I don't accidentally close the browser tab
- As an admin, I want a success screen after upload with clear next-step actions so that I know what to do next

## Acceptance Criteria

- [ ] At the start of upload processing, an info banner is shown: "Hinweis: Ausgeblendete Folien werden beim Upload übersprungen."
- [ ] During file processing (uploading/converting/creating records), a persistent message is shown: "Deine Folien werden gerade umgewandelt — bitte schließe dieses Fenster nicht, bis der Vorgang abgeschlossen ist."
- [ ] The browser beforeunload event is hooked during upload to warn the user if they try to close the tab
- [ ] After all files are processed successfully, a success screen replaces the upload queue: heading "Upload abgeschlossen!", subheading "Du kannst jetzt deine Textfelder konfigurieren oder weitere Dateien hochladen."
- [ ] The success screen shows two action buttons: "Zu den Folien" (navigates to admin slide library) and "Weitere Dateien hochladen" (resets the upload dialog for a new batch)
- [ ] If some files failed while others succeeded, the success screen shows a mixed message: "X Dateien erfolgreich hochgeladen. Y Dateien fehlgeschlagen." with the failed files listed and their error messages
- [ ] The existing file-by-file progress indicators (pending/uploading/converting/processing/done/error) remain unchanged
- [ ] The hidden-slides hint only appears for .pptx files (other formats are fully converted server-side, hidden slide behavior depends on ConvertAPI)

## Edge Cases

- What if all files fail? → No success screen, the dialog stays on the queue view with error messages per file. The "Upload" button re-enables so the admin can retry.
- What if the user closes the dialog during upload despite the warning? → Upload in progress continues server-side (files already sent), but thumbnail generation may not complete. The slides will appear without thumbnails. Admin can trigger re-generation from the slide library.
- What if a PPTX has zero non-hidden slides? → Error: "Keine sichtbaren Folien in dieser Datei gefunden."

## Technical Requirements

- Add `window.addEventListener('beforeunload', ...)` during upload, remove on completion
- The hidden-slides hint is informational only — no actual filtering logic changes (the PPTX parser already handles hidden slides via PowerPoint's `show="0"` attribute)
- Success screen is a new state in the existing UploadSlideDialog component state machine

---

## Tech Design (Solution Architect)

### Component Structure

```
UploadSlideDialog (existing, extended)
├── File Picker Area (unchanged)
├── Hidden-Slides Info Banner (NEW)
│   └── Shown when queue contains .pptx files
├── File Queue List (unchanged)
│   └── Per-file status indicators (unchanged)
├── Processing Warning Banner (NEW)
│   └── "Bitte schließe dieses Fenster nicht..."
│   └── Visible while uploading === true
├── Progress Bar (unchanged)
├── Success Screen (NEW — replaces queue when all done)
│   ├── Heading: "Upload abgeschlossen!"
│   ├── Subheading with counts
│   ├── Failed files list (if mixed result)
│   ├── Button: "Zu den Folien"
│   └── Button: "Weitere Dateien hochladen"
└── Footer Buttons (existing, adjusted per state)
```

### Data Model

No new data model — all state lives in existing component state. New derived state:

- `hasPptxFiles` — at least one .pptx in queue (for hidden-slides hint)
- `successCount / failCount` — for success screen messaging

### Tech Decisions

- No new component needed — success screen is a new state in existing dialog
- `beforeunload` event for browser tab close warning during upload
- Hidden-slides hint only for .pptx (other formats handled by ConvertAPI server-side)
- No new API endpoint — purely frontend state management

### Files to Modify

- `src/components/slides/upload-slide-dialog.tsx` — info banner, processing warning, beforeunload hook, success screen
- i18n files (de/en) — new translation keys for hints and success screen

### Dependencies

None — all UI components (Alert, Button, Dialog) already available.

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

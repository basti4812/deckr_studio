# PROJ-34: PDF Export

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-02-27

## Dependencies
- Requires: PROJ-33 (PowerPoint Export) — PDF is derived from the same assembled output
- Requires: PROJ-29 (Text Editing & Fill Warnings) — fill check applies equally

## User Stories
- As a user, I want to export my presentation as a PDF so that I can share it with recipients who don't need an editable file
- As a user, I want the PDF to look identical to the PowerPoint so that design fidelity is preserved
- As a user, I want the same fill warning check before PDF export so that I don't send incomplete PDFs

## Acceptance Criteria
- [ ] "Export as PDF" option available alongside the PPTX export button (e.g. dropdown or separate button)
- [ ] Before export: same fill warning check as PPTX (PROJ-29)
- [ ] PDF is generated server-side from the same assembled slide content as the PPTX export
- [ ] PDF design fidelity: fonts, colors, layouts, and images are preserved
- [ ] Exported PDF is downloaded to the user's device
- [ ] PDF export is logged in the activity log (PROJ-39)
- [ ] PDF export auto-saves a version snapshot (PROJ-38) — same snapshot as PPTX export if both triggered for the same version
- [ ] PDF is used as the downloadable format in the external viewer (PROJ-35)

## Edge Cases
- What if PDF generation fails? → Error shown; PPTX export is unaffected (independent pipeline)
- What if the assembled PPTX has complex animations? → Animations are not preserved in PDF (expected behavior); a note may inform the user
- What if the tray is empty? → Same as PPTX: export button disabled

## Technical Requirements
- PDF generation from the assembled PPTX: use LibreOffice, Gotenberg, or a cloud PDF conversion service
- PDF conversion runs server-side in the same pipeline as PPTX assembly or as a subsequent step
- Generated PDF stored temporarily server-side; sent as a download response; not stored permanently in Supabase Storage (unless needed for the external viewer download link)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

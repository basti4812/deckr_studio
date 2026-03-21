# PROJ-45: File Size Management & Compression

## Status: Planned

**Created:** 2026-03-20
**Last Updated:** 2026-03-20

## Dependencies

- Requires: PROJ-15 (Slide Library Management) — upload flow to be enhanced
- Impacts: PROJ-47 (Upload UX Improvements) — compression UI is part of upload flow

## User Stories

- As an admin, I want to upload presentations up to 100 MB so that large decks with high-resolution images are supported
- As an admin, I want OnSlide to offer image compression for files under 100 MB so that I can save storage and speed up processing
- As an admin, I want files over 100 MB to be automatically compressed before upload so that they fit within the processing limits
- As a developer, I want compression to run in the browser so that server infrastructure is not burdened by heavy image processing

## Acceptance Criteria

- [ ] Upload hard limit is raised from 50 MB to 100 MB
- [ ] For files under 100 MB: after file selection, an optional compression prompt is shown: "Möchtest du die Bilder in deiner Präsentation komprimieren? Das spart Speicherplatz und beschleunigt die Verarbeitung." with "Ja, komprimieren" / "Nein, Original behalten" buttons
- [ ] For files over 100 MB: compression is mandatory. A blocking dialog is shown: "Deine Datei ist zu groß für die direkte Verarbeitung. OnSlide komprimiert jetzt die Bilder auf die benötigte Anzeigegröße — visuell kein Unterschied." with a progress indicator
- [ ] Compression runs client-side in a Web Worker to avoid blocking the UI thread
- [ ] Compression targets: images inside the PPTX are resampled to their display dimensions and re-encoded as JPEG (quality 85) or PNG (for transparency), whichever is smaller
- [ ] A progress bar is shown during compression with percentage and current file name
- [ ] After compression, the resulting file size is displayed: "Komprimiert: 120 MB → 42 MB"
- [ ] If compression fails (e.g. corrupted image), the original image is kept and a non-blocking warning is shown
- [ ] The compressed file replaces the original for upload — the original is not stored
- [ ] For non-PPTX formats (.ppt, .key, .odp): compression is not available client-side (these formats require server-side conversion first). The 100 MB limit still applies; files over 100 MB in non-PPTX formats are rejected with a message to compress in the source application first
- [ ] The file size display in the upload queue (existing UI) reflects the compressed size after compression

## Edge Cases

- What if a PPTX contains no images (only text/shapes)? → Compression completes instantly with "Keine Bilder zum Komprimieren gefunden"
- What if the compressed file is larger than the original? → Keep the original, show: "Die Datei ist bereits optimal komprimiert"
- What if the browser tab is closed during compression? → Compression is lost, user must restart. No server state is affected.
- What if a PPTX contains embedded videos alongside images? → Only images are compressed, video data is passed through unchanged
- What if an image uses an unsupported format inside the PPTX (e.g. TIFF, WMF, EMF)? → Skip that image, compress what's supported, show count of skipped images

## Technical Requirements

- Use JSZip (already in dependencies) to unpack/repack the PPTX in the browser
- Use OffscreenCanvas in the Web Worker for image decoding and re-encoding (avoids main thread)
- Image target dimensions are derived from the EMU (English Metric Units) values in the slide XML — the image's display size on the slide
- Compression quality: JPEG 85 for opaque images, PNG for images with alpha channel
- Maximum image dimension cap: 1920px on longest edge (prevents unnecessarily large images even if the PPTX declares a large display area)
- The Web Worker should process images sequentially (not in parallel) to avoid memory pressure on lower-end devices
- Consider that Vercel serverless functions have a 50 MB request body limit — browser-side compression ensures the uploaded file fits

---

## Tech Design (Solution Architect)

### Scope

Pure frontend feature — no backend changes. Compression runs in the browser before upload. Server receives already-compressed file.

### Component Structure

```
Upload Slide Dialog (existing, extended)
├── File Selection (unchanged, limit raised to 100 MB)
├── Compression Prompt (NEW, for files ≤100 MB PPTX)
│   ├── "Ja, komprimieren" button
│   └── "Nein, Original behalten" button
├── Mandatory Compression Dialog (NEW, for files >100 MB PPTX)
│   ├── Progress bar with % and current image name
│   └── Result: "Komprimiert: 120 MB → 42 MB"
├── Upload Queue (existing, shows compressed size)
└── Post-Upload Hint (existing)

PPTX Compressor Web Worker (NEW)
├── Unpack PPTX (JSZip)
├── Process images sequentially:
│   ├── Read display size from slide XML (EMU → pixels)
│   ├── Scale to max 1920px longest edge
│   ├── Re-encode as JPEG 85 or PNG (for transparency)
│   └── Keep whichever variant is smaller
├── Repack PPTX
└── Report progress (% per image)
```

### Data Flow

1. User selects file(s)
2. Size check:
   - ≤100 MB PPTX: optional compression prompt
   - > 100 MB PPTX: mandatory compression starts automatically
   - > 100 MB non-PPTX: rejected with message to compress in source app
3. Web Worker compresses images inside PPTX
4. Compressed file replaces original in queue
5. Upload proceeds as before (Supabase Storage)

### Tech Decisions

- **Web Worker**: compression doesn't block UI (image decode/encode is CPU-heavy)
- **OffscreenCanvas**: image processing in Worker without DOM access
- **Sequential image processing**: avoids memory explosion on low-end devices
- **JPEG 85 / PNG fallback**: best quality/size balance; PNG only for transparency
- **1920px max edge**: larger images never needed at slide display size
- **Client-side only**: no server load, no wait time, works offline

### Dependencies

None new — JSZip already installed, OffscreenCanvas is a browser API.

### Files to Create/Modify

- NEW: `src/workers/pptx-compressor.ts` — Web Worker for image compression
- MODIFY: `src/components/slides/upload-slide-dialog.tsx` — limit bump, compression UI
- MODIFY: `src/components/board/upload-personal-slide-dialog.tsx` — limit bump only

### Build Sequence

1. Create Web Worker (`pptx-compressor.ts`)
2. Extend Upload Dialog (100MB limit, compression prompts, progress UI)
3. Update personal slides upload limit
4. Test with various PPTX sizes

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

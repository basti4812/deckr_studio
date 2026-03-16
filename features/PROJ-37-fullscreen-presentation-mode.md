# PROJ-37: Fullscreen Presentation Mode

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-02-27

## Dependencies

- Requires: PROJ-21 (Project Tray) — slide order for presentation
- Requires: PROJ-29 (Text Editing & Fill Warnings) — fill check before presenting

## User Stories

- As a user, I want to present my slides in fullscreen mode directly from the browser so that I don't need PowerPoint or a projector app
- As a user, I want to navigate slides with keyboard arrow keys so that presenting feels natural
- As a user, I want a laser pointer effect that follows my mouse so that I can highlight content while presenting
- As a user, I want the fill warning check before entering presentation mode so that I catch incomplete slides
- As a mobile user, I want to enter presentation mode on my device so that I can present from my phone when needed

## Acceptance Criteria

- [ ] "Present" button in the board/project toolbar
- [ ] Before entering presentation mode: run fill warning check (PROJ-29); user can proceed anyway
- [ ] Entering presentation mode opens a fullscreen view (browser fullscreen API)
- [ ] Slides are displayed at full screen resolution, pixel-perfect
- [ ] Navigation: left arrow key / right arrow key / click to advance
- [ ] A progress indicator shows current slide position: "Slide 3 of 12"
- [ ] An on-screen navigation UI (arrows) appears on mouse move, disappears after 3 seconds of inactivity
- [ ] Laser pointer: a red circular dot follows the mouse cursor when the mouse moves during presentation
- [ ] Pressing Escape exits fullscreen mode and returns to the board
- [ ] Slides are pre-loaded/cached when entering presentation mode for smooth transitions
- [ ] Presentation mode is available on mobile (PROJ-42): swipe left/right for navigation; no drag-and-drop

## Edge Cases

- What if the browser does not support the fullscreen API? → Fall back to a maximized overlay view
- What if the tray is empty? → "Present" button is disabled with tooltip: "Add slides to present"
- What if the user resizes the browser during presentation? → Slides re-render at the new dimensions with maintained aspect ratio
- What if a slide thumbnail is still loading? → Show a loading placeholder; do not block navigation

## Technical Requirements

- Presentation mode uses `document.documentElement.requestFullscreen()` with a fallback to a fixed-position overlay
- Slides rendered from thumbnails at high resolution OR from the PPTX render pipeline at full resolution
- Laser pointer implemented as a CSS-positioned div following `mousemove` events (no canvas needed)
- Keyboard event listeners attached/detached on enter/exit of presentation mode

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_To be added by /architecture_

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

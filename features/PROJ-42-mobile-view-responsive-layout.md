# PROJ-42: Mobile View & Responsive Layout

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-31 (Slide Notes) — notes are readable on mobile
- Requires: PROJ-37 (Presentation Mode) — presentation mode available on mobile

## User Stories
- As a mobile user, I want to access my projects in a streamlined view so that I can check on my work on the go
- As a mobile user, I want to scroll through the slides in a project so that I can review the content
- As a mobile user, I want to read and add slide notes so that I can manage my talking points on the phone
- As a mobile user, I want to enter presentation mode so that I can present from my phone in a pinch
- As a mobile user, I want a clear notice explaining that the full editing experience requires a desktop browser so that I know what limitations to expect

## Acceptance Criteria
- [ ] When the app is opened at viewport width < 768px, a mobile-optimized layout is served automatically
- [ ] Mobile home screen: project list (owned + shared with me), archive link, profile link, notifications
- [ ] Mobile project view: scrollable list of slides in the current project (thumbnails + titles)
- [ ] Mobile slide detail: tapping a slide shows the slide thumbnail, status, and any notes for that slide
- [ ] Mobile notes: read and edit private notes per slide (PROJ-31)
- [ ] Mobile presentation mode: enter fullscreen; swipe left/right to navigate; no drag-and-drop
- [ ] Board canvas with drag-and-drop is NOT available on mobile; a banner reads: "The full editing experience is available in a desktop browser"
- [ ] All other areas fully functional on mobile: home, project list, profile settings, notifications
- [ ] Navigation: bottom navigation bar with icons (Home, Projects, Notifications, Profile)
- [ ] All mobile layouts are responsive and touch-friendly (tap targets ≥ 44×44px)
- [ ] Landscape and portrait orientations supported

## Edge Cases
- What if a user opens the board on mobile? → The board area is replaced by the mobile project list view; canvas is not rendered
- What if a user's phone has a large screen (tablet)? → At 768px–1024px: show a transitional layout with limited board features; full canvas at > 1024px
- What if the user rotates the phone during presentation mode? → Slides re-render for the new orientation; no interruption

## Technical Requirements
- Breakpoints: mobile < 768px, tablet 768–1023px, desktop ≥ 1024px
- Mobile detection via CSS media queries (Tailwind responsive prefixes); no JavaScript-based device detection
- Board canvas component is not mounted on mobile (conditional render, not hidden with CSS)
- Bottom navigation bar is a separate mobile-only component

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

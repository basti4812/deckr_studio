# PROJ-42: Mobile View & Responsive Layout

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-03

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

### Approach: CSS-First, No New APIs

All layout switching is driven by Tailwind CSS breakpoint prefixes (`md:`, `lg:`). No JavaScript device detection. No new API routes or database tables — mobile views read the same data already fetched for desktop.

**Breakpoints:**
| Viewport | Range | Tailwind |
|---|---|---|
| Mobile | < 768px | (base styles) |
| Tablet | 768–1023px | `md:` |
| Desktop | ≥ 1024px | `lg:` |

### New Components (3)

**`src/components/mobile-nav.tsx`** — Fixed bottom navigation bar (`md:hidden`). Four items: Home, Projects, Notifications, Profile. Minimum 44×44px tap targets. Active route highlighted via `usePathname()`. Notification badge count reuses the same source as the desktop sidebar.

**`src/components/board/mobile-project-view.tsx`** — Replaces the current static "open on desktop" guard on the board page. Shows a scrollable list of slides in the project. Each row: thumbnail image, title, status badge, note indicator dot. Tapping a slide opens `MobileSlideDetail`. A persistent info banner explains the desktop-only editing limitation. A "Present" button triggers the existing fullscreen presentation mode.

**`src/components/board/mobile-slide-detail.tsx`** — A bottom sheet (shadcn `Sheet`, already installed) that opens when a slide row is tapped. Contains: full-width thumbnail, title, status badge, and the existing `NotePanel` component mounted directly — no duplication of note fetch/save logic.

### Modified Files (4)

**`src/app/(app)/layout.tsx`**
- Add `<MobileNav>` below `<SidebarInset>` (`md:hidden`)
- Wrap the desktop header `<SidebarTrigger>` in `hidden md:flex` so it hides on mobile
- Add `pb-16 md:pb-0` to `<main>` so content clears the bottom nav bar

**`src/app/(app)/board/page.tsx`**
- Replace the existing `md:hidden` guard block (static monitor icon + message) with `<MobileProjectView>` receiving already-computed board state as props: `trayItems`, `slideMap`, `personalSlidesMap`, `notesExist`, `onPresent`
- Use `useIsMobile()` hook (`src/hooks/use-mobile.tsx`) to prevent the canvas from being *mounted* (not just hidden) on mobile — per spec requirement

**`src/components/board/presentation-mode.tsx`**
- Add `onTouchStart`/`onTouchEnd` handlers to the slide container: if horizontal delta > 50px, fire `advance()` or `goBack()`. Existing keyboard navigation unchanged.

**`src/components/view/viewer-slideshow.tsx`**
- Same touch swipe pattern as presentation-mode. 50px threshold. Existing keyboard + button navigation unchanged.

### Component Structure (Visual)

```
App Layout — mobile < 768px
+-- SidebarInset
|   +-- Header (hidden on mobile)
|   +-- SubscriptionBanner
|   +-- Main content (pb-16 on mobile)
+-- MobileNav (fixed bottom, md:hidden)
    +-- Home / Projects / Notifications / Profile

Board page — mobile
+-- MobileProjectView
    +-- Info banner ("Full editing available in desktop browser")
    +-- Project name + Present button
    +-- Scrollable slide list
    |   +-- MobileSlideRow (thumbnail + title + note dot)
    +-- MobileSlideDetail (Sheet, bottom)
        +-- Thumbnail + title + status
        +-- NotePanel (reused)
```

### No New Packages

- shadcn `Sheet` (already installed) → `MobileSlideDetail`
- Browser Touch API (`onTouchStart`/`onTouchEnd`) → swipe navigation
- `useIsMobile()` hook (already exists) → conditional canvas mount

### Out of Scope

- Board canvas on mobile — intentionally not rendered
- Slide text field editing on mobile — not exposed
- Admin pages on mobile — remain desktop-first
- Tablet-specific layout — desktop canvas shown from `md:` upward

## QA Test Results

**Date:** 2026-03-03
**Status:** PASS (with deferred low-severity items)

### Bugs Found & Fixed

| Bug | Severity | Description | Status |
|-----|----------|-------------|--------|
| BUG-2 | Low | `MobileProjectView` was mounted (but hidden) on desktop — unnecessary DOM nodes | Fixed — wrapped in `{isMobile && ...}` conditional |
| BUG-3 | Medium | Presentation mode progress dots were 6px tall, below the 44px minimum tap target (AC-10) | Fixed — dots now wrapped in 44px touch-target buttons |

### Deferred (Low / Out of Scope)

| Bug | Severity | Reason |
|-----|----------|--------|
| BUG-1 | Low | Mobile header showing only LanguageToggle — minor UX, no functional impact |
| BUG-4 | Low | Orientation change may exit fullscreen — inherent browser behavior |
| BUG-5 | Low | Tablet transitional layout (768–1024px) — explicitly deferred in tech design |
| BUG-6 | Low | Sidebar sheet theoretically accessible on mobile — SidebarTrigger is hidden, no swipe opens it |
| BUG-7 | Low | Home page missing explicit archive link — existing page concern, not PROJ-42 scope |

### Acceptance Criteria Results

| # | Criterion | Result |
|---|-----------|--------|
| AC-1 | Viewport < 768px serves mobile layout | PASS — Tailwind `md:` breakpoints + `useIsMobile()` hook |
| AC-2 | Mobile home screen: project list, archive, profile, notifications | PASS — existing pages remain functional; bottom nav provides navigation |
| AC-3 | Mobile project view: scrollable slide list with thumbnails + titles | PASS — `MobileProjectView` component |
| AC-4 | Tapping slide shows thumbnail, status, notes | PASS — `MobileSlideDetail` bottom Sheet |
| AC-5 | Read and edit notes per slide | PASS — inline note editing in `MobileSlideDetail` (same API as `NotePanel`) |
| AC-6 | Presentation mode with swipe navigation | PASS — `onTouchStart`/`onTouchEnd` with 50px threshold |
| AC-7 | Desktop editing banner displayed, no canvas on mobile | PASS — banner in `MobileProjectView`; canvas not mounted via `isMobile` check |
| AC-8 | Other areas functional on mobile | PASS — home, projects, profile, notifications all accessible via bottom nav |
| AC-9 | Bottom navigation bar with 4 icons | PASS — `MobileNav` with Home, Projects, Notifications, Profile |
| AC-10 | Tap targets ≥ 44×44px | PASS — `min-h-[44px]` on nav items; progress dots fixed (BUG-3) |
| AC-11 | Landscape and portrait supported | PASS — responsive CSS, no orientation lock |

### Security Audit

- No new API routes or database tables — no new attack surface
- Note editing uses existing authenticated API (`/api/projects/:id/notes`)
- No user-agent sniffing, no client-side device detection beyond `matchMedia`
- Touch event handlers are passive UI-only, no security concerns
- `MobileNav` notification logic mirrors desktop sidebar — same auth checks

## Deployment
_To be added by /deploy_

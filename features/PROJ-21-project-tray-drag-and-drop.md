# PROJ-21: Project Tray & Drag-and-Drop Assembly

## Status: Planned

**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies

- Requires: PROJ-18 (Board Canvas)
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-15 (Slide Library Management) — for mandatory slide enforcement

## User Stories

- As a user, I want a project tray on the right side of the board so that I can see the slides selected for my current project
- As a user, I want to drag slides from the library into the tray so that I can assemble my presentation visually
- As a user, I want to reorder slides in the tray by dragging so that I control the presentation sequence
- As a user, I want to remove slides from the tray so that I can change my mind without starting over
- As a user, I want mandatory slides to always be in the tray and locked so that I cannot accidentally exclude them

## Acceptance Criteria

- [ ] Project tray is displayed as a panel on the right side of the board canvas
- [ ] Tray shows the slides currently selected for the active project, in order
- [ ] Slides can be dragged from the canvas library area into the tray (drag-and-drop)
- [ ] Clicking a slide in the library area also adds it to the tray (as an alternative to drag)
- [ ] Slides in the tray can be reordered by dragging within the tray
- [ ] A "remove" button (X icon) on each tray slide removes it from the project
- [ ] Mandatory slides are always present in the tray and appear with a lock icon; remove button is hidden/disabled for mandatory slides
- [ ] When a project is first opened, all mandatory slides are pre-populated in the tray automatically
- [ ] Tray shows the slide count: "X slides" at the top
- [ ] Tray shows a thumbnail and title for each slide
- [ ] A yellow comment icon is shown on a tray slide if it has comments (PROJ-30)
- [ ] A yellow sticky-note icon is shown on a tray slide if the user has a note on it (PROJ-31)
- [ ] Adding a deprecated slide is blocked: clicking a deprecated slide shows an error: "This slide is deprecated and cannot be added to projects"
- [ ] Tray state is saved automatically as the user modifies it (changes persist on reload)

## Edge Cases

- What if a mandatory slide is later marked as deprecated by an admin? → It remains in existing projects' trays with a warning; cannot be removed (was mandatory)
- What if the same slide is dragged into the tray multiple times? → Each drag adds a separate instance (multiple uses of the same slide are valid in a presentation)
- What if the user has no active project selected? → Tray is empty with a prompt: "Create or open a project to start assembling slides"
- What if the canvas has many slides and drag-and-drop distance is large? → Auto-scroll of canvas during drag to bring the tray into view

## Technical Requirements

- Drag-and-drop implemented with `@dnd-kit/core` or similar (accessible, keyboard-navigable)
- Tray state stored in the project record (`slide_order` JSONB array in the project table)
- Auto-save tray changes with debounce (500ms after last change)
- Tray panel is collapsible on narrow desktop viewports

---

<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)

_To be added by /architecture_

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

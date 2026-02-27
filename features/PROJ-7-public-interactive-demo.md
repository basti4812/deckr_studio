# PROJ-7: Public Interactive Demo

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-15 (Slide Library Management) — demo simulates library browsing
- Requires: PROJ-18 (Board Canvas) — demo shows the board
- Requires: PROJ-21 (Project Tray) — demo shows tray interaction
- Requires: PROJ-5 (Landing Page) — demo is linked from landing page

## User Stories
- As a visitor, I want to try the app without registering so that I can evaluate it before committing
- As a visitor, I want to experience the full core workflow (browse slides, assemble a project, preview, trigger export) so that I understand the product value
- As a visitor, I want to see a clear banner indicating this is a demo so that I understand the context
- As a visitor, I want to be prompted to sign up after trying the demo so that converting is frictionless

## Acceptance Criteria
- [ ] Demo is accessible at `/demo` with no login required
- [ ] Demo uses pre-loaded, read-only example data: a fictional company with 10–15 slides, 2 template sets, and 1 sample project
- [ ] All core interactions work: browsing the board, dragging slides into the tray, reordering the tray, previewing a slide
- [ ] Export action: clicking export shows a simulated success state (no real file is generated)
- [ ] Share link generation: clicking share shows a simulated link (no real link is created, no emails sent)
- [ ] Slide library is read-only in demo: no upload, delete, or edit controls are shown
- [ ] A persistent banner at the top reads: "This is a demo with example data. No changes are saved." with a "Start your free trial" button
- [ ] Demo CTA button is visible at all times (sticky or in banner): "Create your free account"
- [ ] Demo data is hardcoded or seeded in a demo tenant; it is never modified by visitors
- [ ] Demo session is stateless: refreshing the page resets all interactions to the initial demo state

## Edge Cases
- What if a logged-in user visits /demo? → Demo is shown normally; their account session is not used inside the demo
- What if a visitor tries to navigate to a non-demo app URL? → Redirect to /demo or /login
- What if the demo data needs to be updated (new example slides)? → Admin updates the demo tenant's data via a seeding script; no UI needed
- What if two visitors use the demo simultaneously? → No conflict; demo is always read-only and stateless per session

## Technical Requirements
- Demo data is loaded from a fixed, read-only data source (either hardcoded JSON or a dedicated "demo" tenant in the database with a special flag)
- No Supabase writes occur during a demo session
- Demo mode is detected via route (`/demo`) and a context flag, disabling all write operations
- No real emails are sent from demo interactions

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

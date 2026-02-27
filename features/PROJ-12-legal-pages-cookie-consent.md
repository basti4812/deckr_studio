# PROJ-12: Legal Pages & Cookie Consent

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-5 (Landing Page) — pages linked from footer

## User Stories
- As a visitor, I want to read the Impressum so that I know who operates the website (required by German law)
- As a visitor, I want to read the Privacy Policy so that I understand how my data is handled
- As a visitor, I want to read the Terms of Service so that I understand the contractual terms
- As a visitor, I want to manage my cookie preferences so that I control which cookies are set
- As a visitor, I want to download or view the Data Processing Agreement so that my legal team can review it
- As a company using the app, I want all legal pages in both German and English so that I can share them with international stakeholders
- As an operator, I want placeholder markers [COMPANY NAME], [ADDRESS], etc. clearly visible so that I know exactly what to replace before going live

## Acceptance Criteria
- [ ] All legal pages are accessible from the landing page footer and from within the app footer (not behind a login)
- [ ] All legal pages are available in both German (/de/...) and English (/en/...) with a language toggle
- [ ] **Impressum** at `/impressum`: company name, address, managing director, commercial register, VAT ID, contact email — all as [PLACEHOLDER] markers
- [ ] **Privacy Policy / Datenschutzerklärung** at `/privacy`: covers data collected (account, usage, payment), legal basis per GDPR, retention periods, user rights, third-party services, contact for DPO — pre-filled compliant text with placeholders
- [ ] **Terms of Service / AGB** at `/terms`: scope of service, subscription and payment terms, cancellation policy, user obligations, prohibited uses, liability, IP rights, data processing responsibilities, governing law (German) — pre-filled compliant text with placeholders
- [ ] **Cookie Policy** at `/cookies`: all cookie categories (necessary, functional, analytics, marketing) with descriptions; explains how to manage/withdraw consent
- [ ] **Data Processing Agreement / AVV** at `/dpa`: downloadable as PDF or viewable inline; includes scope, TOMs, subprocessor list — with placeholders
- [ ] **Cancellation Policy / Widerrufsbelehrung** at `/cancellation`: present with a clear note that the service is B2B only and statutory consumer cancellation rights typically do not apply; includes placeholder form template
- [ ] **Cookie Consent Banner**: appears on first visit to any page; options: Accept All, Reject All, Configure; optional categories not pre-checked; consent stored in localStorage; banner not shown again once consent given
- [ ] Cookie consent can be withdrawn at any time via a "Cookie Settings" link in the footer
- [ ] All placeholder markers use the format: [COMPANY NAME], [ADDRESS], [VAT ID], [EMAIL], [DATE]

## Edge Cases
- What if a user clears their browser storage? → Cookie consent banner reappears on next visit
- What if the app is accessed without accepting cookies? → Only strictly necessary cookies are set; app functions normally
- What if the DPA PDF is not yet generated? → Show a downloadable template .docx file with placeholders instead
- What if a user switches language on a legal page? → Same page reloads in the other language, preserving scroll position (best effort)

## Technical Requirements
- Legal pages are statically rendered (no dynamic data required)
- Cookie consent state stored in localStorage key: `cookie_consent`
- Analytics and marketing cookies are only loaded after explicit consent
- Impressum must be reachable within two clicks from any page (legal requirement)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

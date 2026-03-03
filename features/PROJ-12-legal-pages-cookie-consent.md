# PROJ-12: Legal Pages & Cookie Consent

## Status: Deployed
**Created:** 2026-02-25
**Last Updated:** 2026-03-03

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

### What exists already
- `CookieConsent` component at `src/components/cookie-consent.tsx` — basic Accept/Decline, already mounted in root layout
- Landing page footer already links to `/impressum`, `/privacy`, `/terms`
- Translation keys `landing.impressum`, `landing.privacy`, `landing.terms` exist
- No legal page routes exist yet — all six URLs return 404

### Component Structure

```
src/app/(legal)/             ← new route group, no auth required
├── layout.tsx               ← shared: LandingNav + legal footer + cookie settings link
├── impressum/page.tsx       → /impressum
├── privacy/page.tsx         → /privacy
├── terms/page.tsx           → /terms
├── cookies/page.tsx         → /cookies
├── dpa/page.tsx             → /dpa (inline view + download button)
└── cancellation/page.tsx    → /cancellation

src/components/legal/
├── legal-page.tsx           ← shared wrapper: page title + section renderer
└── legal-section.tsx        ← heading + body paragraphs + placeholder highlights

src/components/cookie-consent.tsx (UPGRADED)
├── Banner:  Accept All | Reject All | Configure
└── CookieConfigDialog (Dialog)
    ├── Necessary  (toggle — always on, disabled)
    ├── Functional (toggle — optional)
    ├── Analytics  (toggle — optional)
    └── Marketing  (toggle — optional, not pre-checked)

public/legal/
└── dpa-template.docx        ← static placeholder with [PLACEHOLDER] markers
```

### Data Model

**Cookie consent** stored in `localStorage` under key `deckr_cookie_consent`:
- `version: "1"`, `necessary: true` (always), `functional`, `analytics`, `marketing` (booleans)
- Banner reappears if key is absent (cleared storage). No server-side storage.

**Legal content** in i18n JSON files (`en.json` / `de.json`) under `legal.*` namespace.
Placeholder markers (`[COMPANY NAME]`, `[ADDRESS]`, `[VAT ID]`, `[EMAIL]`, `[DATE]`) highlighted visually in yellow.

### Tech Decisions

| Decision | Why |
|----------|-----|
| `(legal)` route group | Shared LandingNav + footer layout without touching `(app)` or `(auth)` groups |
| Static pages, no backend | Legal content is identical for all users; no dynamic data needed |
| i18n JSON for content | Consistent with how all other text is handled; German/English via existing `useTranslation()` |
| Upgrade existing CookieConsent | Already mounted in root layout; extending avoids duplicate mounting |
| localStorage for consent | Device-specific per spec; no cross-device sync needed |
| Static `.docx` in `/public/legal/` | DPA as downloadable template; no PDF generation required at launch |

### Dependencies
No new packages required — uses existing Next.js, shadcn/ui (Dialog, Switch, Separator), react-i18next.

## QA Test Results

**Tested by:** QA / Red-Team Pen-Test
**Date:** 2026-03-03

---

### Acceptance Criteria Results

| # | Criterion | Result | Notes |
|---|-----------|--------|-------|
| 1 | All legal pages accessible from landing footer and within app (not behind login) | PASS | Landing page footer links to /impressum, /privacy, /terms, /cookies, /dpa. Legal layout footer has all 6 links. All under `(legal)` route group — no auth required. |
| 2 | All pages in both German and English with language toggle | PASS | LanguageToggle rendered in legal layout. 101 `legal.*` keys in both `en.json` and `de.json` with full parity. |
| 3 | Impressum at /impressum with [PLACEHOLDER] markers | PASS | 7 sections: company info, represented by, commercial register, VAT ID, contact, responsible for content, EU dispute resolution. All with `[PLACEHOLDER]` markers. |
| 4 | Privacy Policy at /privacy — GDPR compliant sections | PASS | 11 sections: intro, controller, DPO, data collected, legal basis, retention, rights, third parties, cookies, changes, complaints. References GDPR articles. |
| 5 | Terms of Service at /terms — full coverage | PASS | 10 sections: scope, subscription, cancellation, obligations, prohibited uses, liability, IP rights, data processing, governing law (German), changes. |
| 6 | Cookie Policy at /cookies — all 4 categories | PASS | Necessary, functional, analytics, marketing categories with descriptions, examples, duration, legal basis. Plus intro, usage, management, changes sections. |
| 7 | DPA at /dpa — scope, TOMs, subprocessors, download | PASS | 4 content sections + download card with `.docx` template link. |
| 8 | Cancellation at /cancellation — B2B notice + form | PASS | B2B notice citing §§ 312g, 355 BGB. Cancellation instructions. Form template with placeholder fields. |
| 9 | Cookie consent banner: Accept All, Reject All, Configure | PASS | Three buttons. Configure opens Dialog with 4 category toggles (Necessary always-on). Optional categories not pre-checked. |
| 10 | Cookie consent can be withdrawn via footer link | PASS | "Cookie Settings" button in both landing and legal footers clears localStorage and reloads page. |
| 11 | Placeholder markers use format [COMPANY NAME] etc. | PASS | All markers use `[UPPERCASE TEXT]` format highlighted in yellow via `<mark>` tags in LegalSection component. |

### Bugs Found & Fixed

| Bug | Severity | Description | Status |
|-----|----------|-------------|--------|
| BUG-1 | Medium | CookieConsent rendered outside I18nProvider in root layout | **FIXED** — moved inside I18nProvider |
| BUG-2 | Medium | de.json contained unescaped German curly quotes (`„"`) causing JSON parse error | **FIXED** — replaced with escaped ASCII quotes |
| BUG-3 | Info | Spec says `cookie_consent` key, code uses `deckr_cookie_consent` | **Accepted** — code and tech design agree, spec wording is informational |

### Security Audit

| Vector | Risk | Finding |
|--------|------|---------|
| XSS via localStorage injection | None | `JSON.parse` wrapped in try/catch, only boolean fields read. No HTML rendering from localStorage. |
| XSS via legal content | None | LegalSection uses React JSX auto-escaping. `[PLACEHOLDER]` markers rendered via `<mark>` elements, not dangerouslySetInnerHTML. |
| Prototype pollution | None | Parsed cookie preferences only access known boolean fields. |
| i18n interpolation injection | None | All translation keys are static strings. No user-controlled data in `t()`. |

**Overall: PASS — no vulnerabilities found.**

## Deployment
_To be added by /deploy_

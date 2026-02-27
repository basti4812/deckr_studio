# PROJ-41: German/English Internationalisation

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-8 (User Profile) — language preference stored per user
- Requires: PROJ-1 (Multi-tenancy) — default language stored per tenant

## User Stories
- As a user, I want to switch the app language between German and English at any time so that I can use the language I'm most comfortable with
- As an admin, I want to set the default language for my tenant so that new users start in the right language
- As a user, I want all interface elements, warnings, labels, and system messages to be in my chosen language so that the experience is fully localized
- As a user, I want my language preference to persist across sessions so that I don't have to set it on every login

## Acceptance Criteria
- [ ] Language toggle visible in the navigation bar for all authenticated users: "DE" / "EN"
- [ ] Switching language immediately re-renders the UI in the selected language (no page reload required)
- [ ] Language preference is saved to the user's profile (PROJ-8) and persists across sessions
- [ ] Default language is read from the tenant setting on first login; user can override it
- [ ] All UI strings are translated: navigation labels, buttons, error messages, warnings, tooltips, empty states, form labels, confirmation dialogs
- [ ] Legal pages (PROJ-12) are available in both German and English
- [ ] Notification messages (PROJ-13, PROJ-14) are sent in the user's preferred language
- [ ] Language files are structured as key-value translation dictionaries (e.g., JSON files per language)
- [ ] All untranslated keys fall back to English

## Edge Cases
- What if a translation key is missing in German? → Fall back to the English string (no visible error)
- What if the user changes language mid-form? → Form fields retain their values; only labels and placeholders re-render
- What if the tenant default language changes after users have set their own preference? → User's individual preference takes priority; tenant default only applies on first login

## Technical Requirements
- i18n library: `next-intl` or `react-i18next` (defined in /architecture)
- Translation files: `public/locales/en.json`, `public/locales/de.json`
- Language detection order: user preference → tenant default → browser language → 'en'
- All translation strings accessed via a `t('key')` function; no hardcoded UI strings in components

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

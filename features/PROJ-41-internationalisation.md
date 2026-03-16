# PROJ-41: German/English Internationalisation

## Status: Deployed

**Created:** 2026-02-25
**Last Updated:** 2026-03-03

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

### What's already built (no new backend work needed)

- `preferred_language` stored per user in `profiles` table — API reads and writes it
- `default_language` stored per tenant in `tenants` table
- `TenantProvider` already exposes both `preferredLanguage` and `defaultLanguage` to all client components
- Profile page already has a language switcher that calls `PATCH /api/profile`

### Component Structure

```
App Shell (already exists)
│
├── I18nProvider  (NEW — wraps the app, reads language from TenantProvider)
│   └── Initialises i18n engine with correct language on mount
│       └── Re-initialises instantly when user switches language
│
├── LanguageToggle (NEW — "DE" / "EN" pill in app header)
│   ├── Calls PATCH /api/profile to persist choice
│   └── Immediately switches UI language without page reload
│
└── All existing components (UPDATED — strings replaced with t('key') calls)
    ├── app-sidebar.tsx — nav labels
    ├── board/page.tsx — toolbar, filters, tray labels
    ├── projects/page.tsx — headings, buttons
    ├── profile/page.tsx — form labels
    ├── admin/* — all admin page labels
    ├── dialogs/* — confirmation text, warnings
    ├── error/empty states
    └── all other UI strings
```

### Translation File Structure

```
public/
  locales/
    en.json   ← English (the fallback — always complete)
    de.json   ← German translations (missing keys fall back to en.json)
```

Keys organised by feature area:

```
{
  "nav": { "home": "Home", "projects": "Projects", ... },
  "board": { "addToTray": "Add to tray", "export": "Export", ... },
  "common": { "save": "Save", "cancel": "Cancel", "loading": "Loading...", ... },
  "errors": { "notFound": "Not found", "forbidden": "Access denied", ... }
}
```

### Tech Decision: Why `react-i18next` instead of `next-intl`?

`next-intl` requires adding the language to every URL (`/en/dashboard`, `/de/dashboard`) — a structural change that would break all existing links, middleware, and share links. `react-i18next` works with the user-preference approach already built: language stored in DB, read from context, applied at runtime. No URL changes. Matches spec requirement "no page reload required."

### Language Resolution Order

```
1. User's personal preference (profiles.preferred_language) — highest priority
2. Tenant's default language (tenants.default_language)
3. Browser's Accept-Language header
4. English — ultimate fallback
```

Both #1 and #2 are already available via `TenantProvider`.

### New Files

| File                                 | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `public/locales/en.json`             | English translation dictionary (~300-400 keys)             |
| `public/locales/de.json`             | German translation dictionary (same keys)                  |
| `src/providers/i18n-provider.tsx`    | Wraps app; initialises react-i18next with correct language |
| `src/hooks/use-translation.ts`       | Re-exports `useTranslation` for convenience                |
| `src/components/language-toggle.tsx` | "DE" / "EN" toggle in app header                           |

### Modified Files

| File                                          | Change                                          |
| --------------------------------------------- | ----------------------------------------------- |
| `src/app/(app)/layout.tsx`                    | Wrap children with `I18nProvider`               |
| `src/app/(auth)/layout.tsx`                   | Wrap with `I18nProvider` (login/register pages) |
| `src/components/app-sidebar.tsx`              | Replace nav labels with `t('nav.*')`            |
| All board, admin, project, profile components | Replace UI strings with `t('key')`              |

### Packages to Install

| Package                | Purpose                                                  |
| ---------------------- | -------------------------------------------------------- |
| `react-i18next`        | i18n engine for React — provides `useTranslation()` hook |
| `i18next`              | Core i18n library (required by react-i18next)            |
| `i18next-http-backend` | Loads translation JSON files from `public/locales/`      |

### Scale Note

This feature touches every component in the app (~40 files). The bulk of the work is mechanical string extraction — identifying each hardcoded UI string, assigning it a translation key, adding it to both JSON files, and replacing the string with `t('key')`. No backend changes needed.

## QA Test Results

_To be added by /qa_

## Deployment

_To be added by /deploy_

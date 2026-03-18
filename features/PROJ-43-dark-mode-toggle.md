# PROJ-43: Dark Mode Toggle

**Priority:** P2
**Status:** Planned
**Created:** 2026-03-17

## Summary

Add a user-facing dark mode toggle that allows users to switch between light, dark, and system-preference themes. The app already uses Tailwind's `dark:` variant and CSS variables — this feature adds the UI toggle and persistence.

## User Stories

1. As a user, I want to switch between light and dark mode so I can use the app comfortably at any time of day.
2. As a user, I want my theme preference to persist across sessions.
3. As a user, I want a "System" option that follows my OS preference.

## Acceptance Criteria

- [ ] Theme toggle visible in header and/or profile settings
- [ ] Three options: Light, Dark, System
- [ ] Preference stored per-user (localStorage + optional profile field)
- [ ] All pages render correctly in dark mode (no hardcoded light colors)
- [ ] Landing page and legal pages also support dark mode
- [ ] Smooth transition when switching themes

## Dependencies

- Requires: Tailwind `darkMode: 'class'` configuration
- Uses: `next-themes` package (recommended)

## Notes

- Several dark mode CSS variable gaps were already fixed in Sprint 5 (F3)
- Presentation/viewer pages intentionally use dark cinema backgrounds — these should remain unaffected

---

## Tech Design (Solution Architect)

### Infrastruktur-Status

Die Infrastruktur ist zu **90% fertig** — kein Backend nötig:

| Was                                          | Status           | Datei                                    |
| -------------------------------------------- | ---------------- | ---------------------------------------- |
| `tailwind.config.ts` — `darkMode: ['class']` | ✅ fertig        | `tailwind.config.ts`                     |
| CSS-Variablen für Light + Dark               | ✅ fertig        | `src/app/globals.css`                    |
| `next-themes` Package (v0.4.6)               | ✅ installiert   | `package.json`                           |
| ThemeProvider im Root-Layout                 | ❌ fehlt         | `src/app/layout.tsx`                     |
| ThemeToggle Komponente                       | ❌ fehlt         | neu erstellen                            |
| Toggle-Platzierung im Header                 | ✅ identifiziert | `src/components/app-layout-inner.tsx:46` |

### Komponentenstruktur

```
src/app/layout.tsx
└── ThemeProvider (next-themes)  ← NEU: wraps alles
    └── I18nProvider
        └── (app)/layout.tsx
            └── app-layout-inner.tsx
                └── Header
                    ├── LanguageToggle
                    └── ThemeToggle  ← NEU: daneben platziert
```

### ThemeToggle Komponente

- **Datei:** `src/components/theme-toggle.tsx` (neu)
- **Muster:** identisch zum bestehenden `src/components/language-toggle.tsx`
- **UI:** Dropdown mit drei Optionen — Sonne (Hell), Mond (Dunkel), Monitor (System)
- **Logik:** `useTheme()` aus `next-themes` → setzt `theme` auf `'light'` / `'dark'` / `'system'`
- Icon im Header wechselt je nach aktivem Theme (Sonne oder Mond)

### Persistenz

- `next-themes` speichert die Auswahl automatisch in **localStorage** (`theme` Key)
- Beim nächsten Besuch wird das Theme sofort beim Laden angewendet (kein Flicker durch `suppressHydrationWarning` am `<html>` Tag)
- Kein Datenbank-Eintrag nötig — localStorage reicht für die UX

### Spezieller Umgang mit bestimmten Seiten

| Seite                        | Verhalten                                               |
| ---------------------------- | ------------------------------------------------------- |
| Board / Dashboard / Projekte | Dark Mode aktiv                                         |
| Landing Page                 | Dark Mode aktiv                                         |
| Viewer (`/view/[token]`)     | Cinema-Background bleibt schwarz — keine Änderung nötig |
| Präsentationsmodus           | Dark overlay bleibt — keine Änderung nötig              |

### Dateien die geändert werden

| Datei                                 | Aktion                                    |
| ------------------------------------- | ----------------------------------------- |
| `src/app/layout.tsx`                  | ThemeProvider hinzufügen                  |
| `src/components/theme-toggle.tsx`     | Neu erstellen                             |
| `src/components/app-layout-inner.tsx` | ThemeToggle neben LanguageToggle einfügen |

### Keine neuen Dependencies

`next-themes` ist bereits installiert — kein `npm install` nötig.

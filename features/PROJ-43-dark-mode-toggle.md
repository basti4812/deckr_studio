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

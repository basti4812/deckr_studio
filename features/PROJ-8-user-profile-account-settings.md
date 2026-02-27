# PROJ-8: User Profile & Account Settings

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-2 (Authentication & User Sessions)
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories
- As a user, I want to update my display name so that colleagues see my correct name throughout the app
- As a user, I want to upload a profile picture so that I am visually identifiable in comments, sharing, and team lists
- As a user, I want to change my preferred language (German or English) so that the app displays in my language
- As a user, I want to change my password so that I can keep my account secure
- As a user, I want changes to take effect immediately without needing to reload the page

## Acceptance Criteria
- [ ] Profile page is accessible at `/profile` for all authenticated users
- [ ] Display name field: editable, required, min 1 character, max 80 characters
- [ ] Profile picture upload: accepts JPEG, PNG, WebP; max 5MB; stored in Supabase Storage
- [ ] Profile picture is displayed in: comments, project sharing panel, team management list, top navigation avatar
- [ ] Language preference: dropdown with 'Deutsch' and 'English'; saved to user record; triggers immediate UI language switch
- [ ] Password change: current password, new password, confirm new password; validation that new ≠ current
- [ ] Success/error feedback shown inline for each section (not a full page reload)
- [ ] Profile picture can be removed (reverts to generated avatar/initials fallback)
- [ ] All changes are saved immediately on submit (not all at once)

## Edge Cases
- What if the profile picture upload fails? → Show error, keep existing picture
- What if the display name is empty on save? → Blocked, validation error shown
- What if the current password entered is incorrect during password change? → Error: "Current password is incorrect"
- What if the new password doesn't meet minimum requirements? → Error with requirements listed (min 8 chars)
- What if the user uploads a profile picture larger than 5MB? → Error before upload: "Image must be smaller than 5MB"
- What if the user changes language — does it persist across sessions? → Yes, stored in user record and loaded on login

## Technical Requirements
- Profile picture stored in Supabase Storage at path: `avatars/{tenant_id}/{user_id}/{filename}`
- Old profile picture is deleted from storage when a new one is uploaded
- Password change delegated to Supabase Auth (`updateUser` method)
- Language preference stored in `users.preferred_language` column

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

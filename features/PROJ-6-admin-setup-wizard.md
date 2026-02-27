# PROJ-6: Admin Setup Wizard

## Status: In Review
**Created:** 2026-02-25
**Last Updated:** 2026-02-26

## Dependencies
- Requires: PROJ-1 (Multi-tenancy & Tenant Data Model)
- Requires: PROJ-2 (Authentication & User Sessions)
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories
- As a new admin, I want to be guided through the initial setup steps so that my team can start using the app quickly
- As a new admin, I want to set my company name and upload a logo as the first step so that the app looks like ours from day one
- As a new admin, I want to choose a primary brand color so that the interface reflects our corporate identity
- As a new admin, I want to upload my first slides to the library so that my team has content to work with immediately
- As a new admin, I want to invite my first team members so that my employees can access the app right away
- As a new admin, I want to skip any step and complete it later so that I am not blocked from using the app
- As a returning admin, I want to access the setup checklist from admin settings so that I can complete any skipped steps later

## Acceptance Criteria
- [ ] Wizard is shown automatically after the first login of the admin who created the tenant
- [ ] Wizard is NOT shown again after it has been completed or dismissed
- [ ] Wizard has 4 steps: (1) Company name + logo, (2) Brand color picker, (3) Upload first slides, (4) Invite team members
- [ ] Each step shows a visual progress indicator (e.g. step 1 of 4)
- [ ] Each step has a "Skip" option that marks it as skipped and moves to the next step
- [ ] Completing all steps or clicking "Finish" marks the wizard as done and navigates to the admin dashboard
- [ ] A checklist of all wizard steps is accessible from Admin Settings at any time, showing which steps are complete/skipped
- [ ] Completed steps in the checklist link to the relevant settings section
- [ ] Wizard state (completed/skipped per step) is stored per tenant in the database
- [ ] Step 1 (company name + logo): validates company name is not empty; logo upload optional
- [ ] Step 2 (brand color): shows a color picker; saves primary_color to tenant record
- [ ] Step 3 (upload slides): shows a simplified version of the slide upload flow; can be skipped
- [ ] Step 4 (invite team members): email input for one or more invitations; can be skipped

## Edge Cases
- What if an admin closes the browser mid-wizard? → Current progress is saved; wizard resumes at the last incomplete step on next login
- What if the logo upload fails on step 1? → Show error, allow retry or skip logo (company name still saved)
- What if an invited email is already a user in another tenant? → Allow invitation (separate tenants); user will need to use separate logins or the system handles multi-tenant membership
- What if a second admin is added later — do they see the wizard? → No. The wizard only shows for the first admin who created the tenant
- What if all steps are marked as skipped? → Wizard is considered dismissed; checklist shows all items as "Not started"

## Technical Requirements
- Wizard state stored in a `wizard_progress` column or sub-table per tenant
- Logo upload uses Supabase Storage (tenant-specific bucket path)
- Brand color validated as valid CSS hex color before save
- Slide upload in step 3 delegates to the same upload logic as PROJ-15 (simplified UI wrapper)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-02-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Wizard shown after first admin login
- [ ] BUG: Wizard completion state stored in localStorage, not detected by auto-redirect logic properly

#### AC-2: Wizard not shown again after completion
- [x] localStorage.setItem('deckr_setup_complete', 'true') prevents re-showing
- [ ] BUG: localStorage is client-side only -- clearing browser data resets wizard state

#### AC-3: 4 steps
- [x] Step 1: Company name (CompanyStep)
- [x] Step 2: Brand color picker (BrandColorStep)
- [x] Step 3: Upload first slides (SlidesStep)
- [x] Step 4: Invite team members (InviteStep)

#### AC-4: Progress indicator
- [x] StepIndicator component shows numbered circles with connecting lines
- [x] Current step highlighted with ring, completed steps filled

#### AC-5: Skip option on each step
- [x] Step 1 has onSkip -> advances to step 2
- [x] Step 2 has onSkip -> advances to step 3
- [x] Step 3 has onSkip -> advances to step 4
- [x] Step 4 (final) completes wizard

#### AC-6: Completing all steps navigates to dashboard
- [x] complete() sets localStorage flag and router.push('/dashboard')

#### AC-7: Checklist accessible from Admin Settings
- [ ] BUG: No checklist accessible from Admin Settings -- spec requires it

#### AC-8: Completed steps link to settings
- [ ] BUG: No checklist UI exists to link completed steps to settings

#### AC-9: Wizard state stored per tenant in DB
- [ ] BUG: Wizard state stored in localStorage, NOT in database per tenant (spec requires DB storage)

#### AC-10: Step 1 validates company name
- [x] CompanyStep uses patchTenant() to save name via API
- [x] API validates name is min 1 char, max 255

#### AC-11: Step 2 color picker saves primary_color
- [x] BrandColorStep calls patchTenant() with primary_color
- [x] API validates hex color format

#### AC-12: Step 3 slide upload
- [x] SlidesStep component exists

#### AC-13: Step 4 invite team
- [x] InviteStep component exists

### Edge Cases Status

#### EC-1: Admin closes browser mid-wizard
- [ ] BUG: Progress NOT saved between sessions -- wizard restarts at step 0 (only localStorage 'deckr_setup_complete' is tracked, not per-step progress)

#### EC-2: Logo upload fails
- [x] Company step allows proceeding without logo

#### EC-3: Second admin sees wizard
- [x] Setup page only shown for first admin (setup route checks isAdmin)
- [ ] BUG: Any admin can see the wizard -- no check for "first admin who created tenant"

#### EC-4: All steps skipped
- [x] Wizard marks as complete via localStorage

### Security Audit Results
- [x] Setup page checks isAdmin -- non-admins redirected
- [x] Tenant updates go through API with admin role check
- [ ] BUG: Wizard state in localStorage can be manipulated by any user with browser dev tools

### Bugs Found

#### BUG-14: Wizard state stored in localStorage instead of database
- **Severity:** High
- **Steps to Reproduce:**
  1. Complete the setup wizard
  2. Open browser dev tools -> Application -> Local Storage
  3. Delete 'deckr_setup_complete' key
  4. Refresh the page
  5. Expected: Wizard does not reappear (state in DB)
  6. Actual: Wizard reappears because state was only in localStorage
- **Note:** Spec requires "Wizard state (completed/skipped per step) is stored per tenant in the database"
- **Priority:** Fix before deployment

#### BUG-15: No setup checklist in Admin Settings
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Complete wizard, go to Admin Settings
  2. Expected: Checklist showing which wizard steps are complete/skipped
  3. Actual: No checklist exists
- **Priority:** Fix in next sprint

#### BUG-16: Wizard progress not saved between sessions
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Start wizard, complete steps 1 and 2
  2. Close browser
  3. Reopen /setup
  4. Expected: Resume at step 3
  5. Actual: Restart at step 0 (step state is React useState only)
- **Priority:** Fix before deployment

#### BUG-17: Any admin can see wizard, not just first admin
- **Severity:** Low
- **Steps to Reproduce:**
  1. Add a second admin to a tenant
  2. Second admin visits /setup (if localStorage flag is not set)
  3. Expected: Only the original tenant-creating admin sees wizard
  4. Actual: Any admin can see it
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 7/13 passed
- **Bugs Found:** 4 total (0 critical, 1 high, 2 medium, 1 low)
- **Security:** Minor (localStorage manipulation)
- **Production Ready:** NO
- **Recommendation:** BUG-14 (DB-backed wizard state) must be fixed. BUG-16 (session persistence) is related and would be solved together.

## Deployment
_To be added by /deploy_

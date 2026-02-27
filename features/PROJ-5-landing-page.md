# PROJ-5: Landing Page

## Status: In Review
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- None (fully public, no auth required)

## User Stories
- As a visitor, I want to immediately understand what deckr does and who it is for so that I can decide if it is relevant for me
- As a visitor, I want to see the pricing model clearly explained so that I know what I would pay
- As a visitor, I want to try the app without registering first so that I can evaluate it risk-free
- As a visitor, I want a clear call-to-action to start a free trial so that I can easily sign up
- As a visitor, I want to understand how the app solves the PowerPoint chaos problem so that I am motivated to try it
- As a visitor, I want to access legal pages from the footer so that I can review privacy policy and terms before signing up

## Acceptance Criteria
- [ ] Landing page is publicly accessible at `/` with no login required
- [ ] Hero section: headline, sub-headline, primary CTA (Start free trial), secondary CTA (Try the demo)
- [ ] Feature section: key benefits explained visually (slide library, board, export, corporate identity protection)
- [ ] How-it-works section: step-by-step explanation of the workflow (admin sets up library → employee assembles → exports)
- [ ] Pain-point section: addresses the PowerPoint chaos problem explicitly
- [ ] Pricing section: tiered pricing model explained (per user, different rates for team sizes), trial period highlighted
- [ ] Footer: links to Impressum, Privacy Policy, Terms of Service, Cookie Policy, AVV
- [ ] Footer: links to Login and Start Trial
- [ ] Cookie consent banner appears on first visit
- [ ] Page is fully responsive (mobile, tablet, desktop)
- [ ] Language: English (primary), with language toggle to German
- [ ] No app data is loaded or required for this page

## Edge Cases
- What if a logged-in user visits the landing page? → Show landing page normally; navigation has a link to "Open App"
- What if the CTA links are clicked? → "Start free trial" → /register; "Try the demo" → /demo
- What if the page is loaded on mobile? → Fully functional, responsive layout, no canvas-specific features needed

## Technical Requirements
- Statically rendered (Next.js static generation) for best performance
- No Supabase calls required for the landing page
- Lighthouse score ≥ 90 for performance, accessibility, SEO
- All CTAs open in same tab (no `target="_blank"` on primary actions)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results

**Tested:** 2026-02-27
**App URL:** http://localhost:3000
**Tester:** QA Engineer (AI)

### Acceptance Criteria Status

#### AC-1: Publicly accessible at /
- [x] Landing page at / is in PUBLIC_ROUTES list in proxy middleware
- [x] No auth required

#### AC-2: Hero section
- [x] Headline: "Stop copying slides. Start presenting."
- [x] Sub-headline present
- [x] Primary CTA: "Start your free 14-day trial" -> /register
- [x] Secondary CTA: "Try the demo" -> /demo

#### AC-3: Feature section
- [x] Four features: Centralized slide library, Visual board canvas, One-click export, Corporate identity protection
- [x] Each with icon, title, and description in Card components

#### AC-4: How-it-works section
- [x] Three steps: Admin builds library -> Employees assemble -> Export on-brand
- [x] Step numbers with visual progress line

#### AC-5: Pain-point section
- [x] Three pain points: Off-brand presentations, Wasted hours copying, Nobody knows version
- [x] Addresses PowerPoint chaos explicitly

#### AC-6: Pricing section
- [x] Three tiers: Starter (E9/user/month), Team (E7/user/month), Enterprise (Custom)
- [x] Trial period highlighted: "14-day free trial. No credit card required."
- [x] "Most popular" badge on Team tier

#### AC-7: Footer links
- [x] Links to Impressum, Privacy, Terms present
- [ ] BUG: Missing links to Cookie Policy and AVV (spec requires both)
- [x] Links to Login and Start Free Trial present

#### AC-8: Cookie consent banner
- [ ] BUG: No cookie consent banner implemented on the landing page

#### AC-9: Fully responsive
- [x] Mobile: LandingNav has hamburger menu with Sheet component for mobile
- [x] Responsive grid layouts: grid-cols-1 to grid-cols-3/4 with sm/lg breakpoints
- [x] Pricing cards stack on mobile

#### AC-10: Language toggle (EN/DE)
- [ ] BUG: No language toggle implemented on the landing page

#### AC-11: No app data loaded
- [x] Page is a static component with hardcoded data arrays -- no API calls

### Edge Cases Status

#### EC-1: Logged-in user visits landing page
- [x] Proxy middleware does NOT redirect logged-in users away from / (it is a public route)
- [ ] BUG: No "Open App" link shown for logged-in users (spec requires this)

#### EC-2: CTA links
- [x] "Start free trial" -> /register (verified)
- [x] "Try the demo" -> /demo (verified, page may not exist yet)

#### EC-3: Mobile layout
- [x] Mobile hamburger menu with Sheet component
- [x] Responsive grid layouts verified in code

### Security Audit Results
- [x] No sensitive data exposed on public page
- [x] No API calls -- fully static
- [x] External links use same tab (no target="_blank" on CTAs)

### Bugs Found

#### BUG-10: Missing Cookie Policy and AVV links in footer
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Scroll to footer on landing page
  2. Links present: Impressum, Privacy, Terms
  3. Expected: Also Cookie Policy and AVV (as specified in AC-7)
  4. Actual: Missing Cookie Policy and AVV links
- **Priority:** Fix before deployment (legal requirement for EU)

#### BUG-11: No cookie consent banner
- **Severity:** High
- **Steps to Reproduce:**
  1. Visit / for the first time
  2. Expected: Cookie consent banner appears
  3. Actual: No cookie consent banner
- **Note:** This is a legal requirement for EU (GDPR/ePrivacy Directive). However, PROJ-12 (Legal Pages & Cookie Consent) is a separate planned feature.
- **Priority:** Fix before deployment (may be deferred to PROJ-12)

#### BUG-12: No language toggle on landing page
- **Severity:** Medium
- **Steps to Reproduce:**
  1. Visit /
  2. Expected: Language toggle to switch between English and German
  3. Actual: No toggle present, page only in English
- **Note:** PROJ-41 (Internationalisation) is planned separately.
- **Priority:** Fix in next sprint (can be deferred to PROJ-41)

#### BUG-13: No "Open App" link for logged-in users
- **Severity:** Low
- **Steps to Reproduce:**
  1. Log in, then navigate to /
  2. Expected: Navigation shows "Open App" link
  3. Actual: LandingNav always shows "Log in" and "Start free trial"
- **Priority:** Nice to have

### Summary
- **Acceptance Criteria:** 8/11 passed
- **Bugs Found:** 4 total (0 critical, 1 high, 2 medium, 1 low)
- **Security:** Pass
- **Production Ready:** NO (cookie consent is a legal requirement)
- **Recommendation:** Cookie consent (BUG-11) blocks production launch for EU. Can be addressed as part of PROJ-12. Footer links (BUG-10) should be added. Language toggle can wait for PROJ-41.

## Deployment
_To be added by /deploy_

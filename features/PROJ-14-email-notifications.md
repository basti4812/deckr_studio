# PROJ-14: Email Notifications

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-13 (In-app Notifications) — same events trigger email
- Requires: PROJ-8 (User Profile) — notification preferences stored per user

## User Stories
- As a user, I want to receive an email when someone shares a project with me so that I don't miss it even if I'm not in the app
- As a user, I want to manage which email notifications I receive so that my inbox doesn't get noisy
- As a user, I want trial expiry and payment failure notifications to always be sent by email so that I can't miss critical account events
- As an admin, I want payment failure notifications sent to my email so that I can fix billing issues promptly

## Acceptance Criteria
- [ ] Email notifications are sent for the same events as in-app notifications (PROJ-13)
- [ ] Email preference management in user profile settings: toggles per notification type to opt out
- [ ] Trial expiry (7 days, 1 day) and payment failure notifications CANNOT be opted out of
- [ ] Emails are sent asynchronously (do not block the triggering action)
- [ ] Email templates are HTML with the tenant's company name in the sender name and subject
- [ ] Each email includes: notification message, a direct link to the relevant resource, and an "Unsubscribe from this notification type" link
- [ ] Unsubscribe link in the email updates the user's notification preferences directly (one-click)
- [ ] `notification_preferences` table or JSONB column on `users`: per notification type, opt-in/out flag
- [ ] Default: all notification types are opted in

## Edge Cases
- What if the email delivery fails? → Log the failure; do not retry automatically; in-app notification is still created
- What if a user unsubscribes from all notification types? → Trial and payment notifications still get sent (cannot be disabled)
- What if the tenant has no logo configured? → Email uses a text-only header with the company name
- What if a user has no email address in their profile? → Skip email notification; in-app notification still created
- What if the unsubscribe link is clicked after the user has been removed from the team? → Show a "You are no longer a member" message; no error

## Technical Requirements
- Email sending via a transactional email service (e.g. Resend, SendGrid); provider configured via environment variable
- Email templates stored as React Email components or HTML strings
- Sending triggered via Next.js API route or Supabase Edge Function
- All emails sent from a configured `FROM_EMAIL` environment variable
- Rate limiting: max 1 email per event per user per hour to prevent flooding

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

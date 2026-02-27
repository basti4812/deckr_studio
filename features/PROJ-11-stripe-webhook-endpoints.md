# PROJ-11: Stripe Webhook Endpoints & Payment Integration Points

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-4 (Subscription Data Model & Access Control)
- Requires: PROJ-10 (Billing Portal Admin)

## User Stories
- As a developer, I want clearly named webhook endpoints so that connecting a real payment provider requires only filling in logic, not restructuring
- As a developer, I want the subscription data model to include payment provider fields so that no migration is needed when Stripe is connected
- As a developer, I want placeholder comments in every webhook handler so that the integration points are self-documenting

## Acceptance Criteria
- [ ] API route exists: `POST /api/webhooks/subscription-created` — logs event, returns 200
- [ ] API route exists: `POST /api/webhooks/subscription-updated` — logs event, returns 200
- [ ] API route exists: `POST /api/webhooks/subscription-cancelled` — logs event, returns 200
- [ ] API route exists: `POST /api/webhooks/payment-succeeded` — logs event, returns 200
- [ ] API route exists: `POST /api/webhooks/payment-failed` — logs event, returns 200
- [ ] Each handler has a comment: `// TODO: verify Stripe webhook signature (stripe.webhooks.constructEvent)`
- [ ] Each handler has a comment: `// TODO: update subscription record based on event payload`
- [ ] `subscriptions` table includes: `payment_provider_customer_id` (nullable text), `payment_provider_price_id` (nullable text)
- [ ] `invoices` table exists with: id, tenant_id, amount, currency, status, invoice_date, pdf_url (nullable), payment_provider_invoice_id (nullable)
- [ ] Webhook routes are NOT protected by Supabase Auth middleware (they are called by Stripe, not a logged-in user)

## Edge Cases
- What if a webhook arrives with a malformed body? → Return 400 with error message; do not crash
- What if the same webhook event is received twice (Stripe retry)? → Idempotency key handling comment in each handler; placeholder for now
- What if the `tenant_id` in the webhook payload doesn't match any tenant? → Log warning, return 200 (don't reveal internal errors to provider)

## Technical Requirements
- Webhook endpoints are in `src/app/api/webhooks/` directory
- Each route file exports only a `POST` handler
- No authentication middleware applied to webhook routes
- Console.log of event type and tenant_id in each handler for debugging (removed before production Stripe connection)
- All comments use the format `// STRIPE_INTEGRATION: {description}` for easy grep

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

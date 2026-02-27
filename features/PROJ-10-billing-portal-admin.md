# PROJ-10: Billing Portal (Admin)

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-4 (Subscription Data Model & Access Control)
- Requires: PROJ-3 (User Roles & Permissions)

## User Stories
- As an admin, I want to see my current plan, price per user, and billing cycle so that I know what I am paying
- As an admin, I want to see how many seats are licensed vs used so that I know if I need to add more
- As an admin, I want to see the next billing date so that I can plan cash flow
- As an admin, I want to see a list of past invoices with date, amount, and status so that I can track billing history
- As an admin, I want to store billing contact information (company name, address, VAT ID) so that invoices are correctly addressed
- As an admin, I want to see the current payment method displayed so that I know which card is on file
- As an admin, I want upgrade, downgrade, and cancel buttons so that I can manage my subscription (even if real logic comes later)

## Acceptance Criteria
- [ ] Billing portal accessible in admin workspace at `/admin/billing`
- [ ] Accessible regardless of subscription status (even cancelled/expired)
- [ ] Plan overview card: plan name, price per user, billing cycle (monthly/annual), next renewal date
- [ ] Trial countdown shown if status is 'trialing': "X days remaining in your free trial"
- [ ] Seat usage: "{used} of {licensed} seats used" with a progress bar; shows "Unlimited" if no seat limit
- [ ] Invoice list: date, amount, status (paid/pending/failed), download button (PDF) — button shows as disabled with tooltip "Available once payment is connected"
- [ ] Payment method placeholder: "No payment method connected yet" or card type + last 4 digits once provider is connected (UI placeholder)
- [ ] Billing contact form: company name, billing address, VAT ID — saved to tenant record
- [ ] "Upgrade plan" button: navigates to a pricing comparison page (placeholder route `/admin/billing/upgrade`)
- [ ] "Downgrade plan" button: navigates to downgrade flow (placeholder)
- [ ] "Cancel subscription" button: opens confirmation dialog; placeholder action with success message
- [ ] All billing action buttons are functional UI but note "Payment provider will be connected soon" in placeholder flows

## Edge Cases
- What if licensed_seats is null? → Show "Unlimited seats" in the seat usage card
- What if there are no invoices yet? → Show empty state: "No invoices yet. Your first invoice will appear here after your first billing cycle."
- What if the billing contact form is empty? → Save is still valid; fields are optional for the placeholder phase
- What if the admin clicks "Cancel subscription" and confirms? → Placeholder: show success toast "Cancellation requested"; status does not actually change until real provider is connected

## Technical Requirements
- All billing action routes (upgrade, downgrade, cancel) are prepared as Next.js API routes with placeholder handlers
- Billing contact data stored in the `tenants` table: billing_company_name, billing_address, billing_vat_id
- Invoice list UI reads from a `invoices` table per tenant (initially empty; populated by Stripe webhooks later)

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

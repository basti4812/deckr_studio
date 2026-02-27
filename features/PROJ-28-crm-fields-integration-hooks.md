# PROJ-28: CRM Fields & Integration Hook Points

## Status: Planned
**Created:** 2026-02-25
**Last Updated:** 2026-02-25

## Dependencies
- Requires: PROJ-24 (Project Creation & Management)
- Requires: PROJ-1 (Multi-tenancy) — crm_provider stored per tenant

## User Stories
- As a user, I want to associate a project with a customer name, company name, and CRM deal ID so that I can link presentations to sales opportunities
- As a developer, I want named integration hook points in the codebase so that connecting a real CRM requires only filling in API calls, not restructuring
- As an admin, I want the CRM provider field in the tenant settings so that activating a CRM connection later requires no schema changes

## Acceptance Criteria
- [ ] Project settings panel shows three optional fields: Customer Name, Company Name, CRM Deal/Opportunity ID
- [ ] Fields are optional; project creation and export work without them
- [ ] Fields are saved to the project record: crm_customer_name, crm_company_name, crm_deal_id
- [ ] `tenants` table has a `crm_provider` field (nullable text: 'hubspot', 'salesforce', 'pipedrive', or null)
- [ ] Code contains named hook functions that are called on: project creation, project export, share link generation
- [ ] Each hook function has a clear comment: `// CRM_INTEGRATION: call {{provider}} API here`
- [ ] Hook functions are no-ops (do nothing) when crm_provider is null
- [ ] Admin settings page shows a "CRM Integration" section with a provider dropdown (placeholder: "Coming soon")

## Edge Cases
- What if the CRM deal ID format is invalid for the configured provider? → No validation at this stage; the field accepts any string
- What if crm_provider is set but no API credentials are configured? → Hooks are called but return immediately (no credentials → no-op with a warning log)

## Technical Requirements
- Hook functions live in `src/lib/crm-hooks.ts`
- Hook function signatures: `onProjectCreated(project)`, `onProjectExported(project)`, `onShareLinkGenerated(project, link)`
- All hooks are async and awaited at call sites so real async CRM calls can be added without signature changes
- Comments use the format `// CRM_INTEGRATION: {description}` for easy grep

---
<!-- Sections below are added by subsequent skills -->

## Tech Design (Solution Architect)
_To be added by /architecture_

## QA Test Results
_To be added by /qa_

## Deployment
_To be added by /deploy_

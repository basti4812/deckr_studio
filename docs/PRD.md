# Product Requirements Document

## Vision

onslide Studio is a browser-based presentation management platform for B2B teams. It replaces the chaos of copying slides between PowerPoint files with a centralized, admin-controlled slide library that enforces corporate identity while giving employees a fast, intuitive way to assemble, customize, and present on-brand presentations — without ever opening PowerPoint.

## Target Users

### Admins

Company-side power users responsible for brand and content quality. They maintain the slide library, define what employees can and cannot edit, create template sets for common presentation types, and manage the team subscription. They operate in a dual workspace: admin controls + their own personal user workspace identical to what employees see.

**Pain points:** Employees create off-brand presentations, slides get outdated, no centralized source of truth, no visibility into what is being presented to customers.

### Employees (Regular Users)

Sales reps, consultants, founders, marketing managers — anyone who regularly pitches or presents. They assemble presentations from approved slides, fill in customer-specific text fields, and export or present directly from the browser.

**Pain points:** Can't find the right slides, waste time copying between files, unsure which slide version is current, don't know how to use PowerPoint properly.

## Core Features (Roadmap)

| Priority | Feature                                               | Status  |
| -------- | ----------------------------------------------------- | ------- |
| P0       | Multi-tenancy & Tenant Data Model                     | Planned |
| P0       | Authentication & User Sessions                        | Planned |
| P0       | User Roles & Permissions                              | Planned |
| P0       | Subscription Data Model & Access Control              | Planned |
| P0       | Slide Library Management (Admin)                      | Planned |
| P0       | Board Canvas                                          | Planned |
| P0       | Slide Groups & Admin Board Layout                     | Planned |
| P0       | Project Tray & Drag-and-Drop Assembly                 | Planned |
| P0       | Project Creation & Management                         | Planned |
| P0       | Text Editing & Fill Warnings                          | Planned |
| P0       | PowerPoint Export (.pptx)                             | Planned |
| P0       | PDF Export                                            | Planned |
| P0       | Fullscreen Presentation Mode                          | Planned |
| P0       | Admin Setup Wizard                                    | Planned |
| P0       | Landing Page                                          | Planned |
| P1       | Public Interactive Demo                               | Planned |
| P1       | Template Set Management (Admin)                       | Planned |
| P1       | Template Set Picker                                   | Planned |
| P1       | Slide Tags & Search/Filter                            | Planned |
| P1       | Automatic Slide Updates across Projects               | Planned |
| P1       | User Canvas Layout (personal)                         | Planned |
| P1       | External Share Links & Branded Viewer                 | Planned |
| P1       | Share Link Tracking                                   | Planned |
| P1       | Project Sharing (within tenant)                       | Planned |
| P1       | Project Duplication                                   | Planned |
| P1       | Project Archive                                       | Planned |
| P1       | Slide Comments (threaded)                             | Planned |
| P1       | Slide Notes (private)                                 | Planned |
| P1       | Personal Slides Upload                                | Planned |
| P1       | Version History & Named Snapshots                     | Planned |
| P1       | In-app Notifications                                  | Planned |
| P1       | Email Notifications                                   | Planned |
| P1       | User Profile & Account Settings                       | Planned |
| P1       | Team Management (Admin)                               | Planned |
| P1       | Billing Portal (Admin)                                | Planned |
| P1       | Stripe Webhook Endpoints & Payment Integration Points | Planned |
| P1       | German/English Internationalization                   | Planned |
| P1       | Mobile View & Responsive Layout                       | Planned |
| P2       | Activity Log (Admin)                                  | Planned |
| P2       | Analytics Dashboard (Admin)                           | Planned |
| P2       | CRM Fields & Integration Hook Points                  | Planned |
| P2       | Legal Pages & Cookie Consent                          | Planned |

## Success Metrics

- Time to first export < 10 minutes for new users after onboarding
- 0 off-brand slides in exported presentations (mandatory slide enforcement)
- Admin slide update propagation: < 5 seconds across all active projects
- Presentation share link opens < 2 seconds
- Employee NPS > 40 (presentations assembled faster, less friction)

## Constraints

- B2B only — no consumer sign-up, no individual free plans
- Desktop-first (1440px primary), mobile with reduced feature set
- No real payment provider connected at launch — full structural prep for Stripe
- No real CRM connected at launch — integration hook points prepared
- No real SSO at launch — architecture prepared per tenant
- Authentication via Supabase Auth (email/password; SSO provider fields stored but not activated)
- Multi-tenancy with full data isolation between tenants

## Non-Goals

- Native mobile apps (iOS/Android)
- Real-time collaborative editing (Google Docs-style simultaneous editing)
- Video or audio in presentations
- AI-generated slide content
- Direct Stripe payment processing at launch
- Live CRM sync at launch
- Activated SSO at launch

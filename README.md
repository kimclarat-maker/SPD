# RPCMS — public site, OPM Oversight Portal, Partner Portal and Field Operations Portal (frontend prototype)

This is the frontend prototype of the Refugee Partnership Coordination and Monitoring System (RPCMS), built with Next.js (App Router), React, and TypeScript. It has a public site and two authenticated workspaces:

- the **OPM Oversight Portal** (`/portal`), for staff of the Office of the Prime Minister, Department of Refugees;
- the **Partner Portal** (`/partner`), for authorised staff of NGOs, humanitarian agencies and development partners. Each partner user sees only their own organisation's records;
- the **Field Operations Portal** (`/field`), a mobile-first, installable, offline-capable workspace for authorised field officers and settlement supervisors.

All workspaces read and write the same records, so a decision in one appears in the others.

> **Prototype only.** All records are fictional. The demonstration sign-in is not real authentication and provides no security. Registry checks (URSB, NGO Bureau), UNHCR ProGres v4 verification, AMP and NIMES submissions, SMS and email, and electronic signatures are **simulated**, and the interface labels them that way. There is no backend.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

The demonstration accounts work only when `NEXT_PUBLIC_RPCMS_DEMO=true` (set in `.env`). With the flag off, the accounts do not exist and the sign-in screen shows no demonstration panel.

## Demonstration accounts

| Account | Password | Role | What it shows |
| --- | --- | --- | --- |
| `coordinator.demo` | `Demo-Coordinator-2026` | OPM coordinator, national scope | Every workflow and decision. Security settings are deliberately locked (separate permission). |
| `analyst.demo` | `Demo-Analyst-2026` | M&E officer, West Nile only | Read-only, region-scoped data, locked actions and permission-denied screens. |
| `partner.admin.demo` | `Demo-Partner-2026` | Partner administrator, Ubuntu Community Health Initiative (fictional) | The Partner Portal journey below, from a draft profile. Also the organisation's authorised signatory. |
| `partner.staff.demo` | `Demo-Staff-2026` | Partner staff (field officer), same organisation | Only assigned interventions; field reports and surveys; no beneficiary or profile permissions until the administrator grants them. |
| `partner.suspended.demo` | `Demo-Suspended-2026` | Partner administrator, Upland Shelter Collective (suspended) | The suspension reason and next steps; new proposals blocked. |
| `field.officer.demo` | `Demo-Field-2026` | Field officer, Mwangaza Health Services, Nakivale (authorised to deliver assistance) | The Field Operations Portal walkthrough: offline work, sync, a validation failure, a conflict, a correction. |
| `field.supervisor.demo` | `Demo-Supervisor-2026` | Settlement supervisor, same organisation and settlement | Assigning and changing tasks, first-line review (return with a field comment, or endorse), team issues. |

Sign-in sends each account to its own workspace, and each workspace sends other accounts back to theirs (for example, a field account that opens `/portal` or `/partner` lands on `/field`).

## Checks

```bash
npm run typecheck
npm run check:i18n       # translation coverage and unknown keys
npx playwright test      # end-to-end scenarios (OPM, partner, field) + axe WCAG 2.2 AA scans
```

Playwright uses the installed Microsoft Edge by default (`PW_CHANNEL=chrome` to use Chrome). It starts its own server on port 3100 from the last `npm run build`.

## The walkthrough

The overview's **Demonstration walkthrough** panel tracks one connected fictional scenario. Each step links to the record where it is completed.

1. **Partner** Kagera Community Health Alliance (`/portal/partners/p-kcha`): verify the two pending documents, run the simulated URSB check (match) and NGO Bureau check (times out, then matches on retry), then approve with a reason.
2. **Overlap** on intervention INT-2026-0147: it overlaps Mwangaza Health Services' clinic in Nakivale. Record how the work is divided.
3. **Approve** INT-2026-0147. Field reporting opens and forms are deployed (simulated).
4. **Field report** FR-2026-0932 was collected offline and is awaiting sync: simulate the device sync, then accept it.
5. **See the update**: the intervention becomes Active, indicator HLT-02 traces to FR-2026-0932, and the GIS map and reports include it.
6. **Possible duplicate** BR-2026-0311: view restricted details with a reason (logged), request ProGres (unavailable, then verified on retry), and record a human decision. Assistance is never blocked.
7. **Service case** SRV-2026-1184: request case-level access, assign a team, start, request information, simulate the reply, resolve, close.
8. **National report** NR-…-Q3: generate (figures freeze), export, then prepare and submit to AMP (accepted) and NIMES (partly accepted, then accepted on resubmission).
9. **Audit trail**: every step above is in the read-only history.

Changes persist in `localStorage` and survive a refresh.

## Portal routes

| Route | Screen |
| --- | --- |
| `/portal` | Overview: filtered metrics, Needs attention queue, walkthrough, coverage map, sector progress, recent activity |
| `/portal/notifications` | Notification centre |
| `/portal/partners`, `/portal/partners/[id]` | Partner directory; application review (completeness, URSB/NGO Bureau verification, decision, suspension, renewal) |
| `/portal/interventions`, `/portal/interventions/[id]` | Intervention register; proposal review, overlap resolution, approval through closure |
| `/portal/field-reports`, `/portal/field-reports/[id]` | Field monitoring: sync states, validation, evidence, indicator changes, sync-conflict resolution |
| `/portal/surveys`, `/portal/surveys/forms/[id]`, `/portal/surveys/indicators/[id]` | Versioned forms (draft, preview, publish, retire); indicators traced to accepted records |
| `/portal/beneficiaries`, `/portal/beneficiaries/reviews/[id]` | Aggregate assistance; restricted review queue with ProGres (simulated) |
| `/portal/cases`, `/portal/cases/[id]` | Refugee services cases with masking, case-level access, messages vs internal notes, escalation |
| `/portal/documents`, `/portal/documents/[id]` | Documents, versions, approval routes, e-signature (simulated) |
| `/portal/gis` | Map with coverage, service-gap and progress views, layers, filters, and a list alternative |
| `/portal/reports`, `/portal/reports/new`, `/portal/reports/[id]` | Report builder, preview with contributing records, PDF/Excel/CSV export, AMP/NIMES status |
| `/portal/integrations`, `/portal/integrations/[id]` | Health and run history for ProGres, AMP, URSB, NGO Bureau, NIMES, with retries |
| `/portal/audit` | Searchable, read-only audit timeline |
| `/portal/admin` | Users, roles and scopes, reference data, indicators, approval routes, templates, security settings |

Lists accept the same filter query string as the overview (`?period=…&district=…&settlement=…&sector=…&partner=…&status=…`), so every overview count opens the list that produces it.

The OPM workspace also receives Partner Portal work: partner applications and document uploads in **Partners**, proposals and resubmissions in **Interventions**, change requests, progress updates, delay/risk flags and expenditure updates in a **Partner updates** tab on each intervention, profile change requests in a **Profile change requests** tab on each partner, partner field reports and survey responses in **Field monitoring**, possible-duplicate assistance flags in the **Beneficiaries** review queue, and MoU signatures in **Documents**. Partner submissions awaiting a decision appear in the **Needs attention** queue. When requesting changes to an application, a coordinator can also request a specific document.

## Partner Portal

Sign in as `partner.admin.demo`. The dashboard's **Demonstration journey** tracks one connected, fictional journey for Ubuntu Community Health Initiative, which starts as a draft profile that OPM cannot see yet:

1. **Complete the profile** (`/partner/profile`), upload the missing documents, and **submit the accreditation application** (`/partner/accreditation`).
2. **OPM requests a missing document** (tax compliance certificate). Upload it and resubmit with a response.
3. **OPM approves**: accreditation, operating permissions and the MoU draft appear on the dashboard.
4. **Draft and submit a proposal** (`/partner/proposals/new` — *Use example proposal* fills a complete one). It overlaps health interventions already running in Nakivale.
5. **OPM asks how the overlap will be handled.** Explain the coordination, resubmit (a new version), and see the approval; the proposal becomes an intervention workspace.
6. **Submit a field activity report**; OPM returns it with a comment; correct and resubmit (both versions are kept); OPM accepts it and the intervention becomes active.
7. **Verify a beneficiary** with ProGres v4 (simulated; use `UG-NKV-0418-72`) and **record a dignity kit**. An earlier entry by another partner makes it a possible duplicate: a review opens in the OPM queue, nobody is labelled fraudulent, and assistance continues.
8. **Submit an expenditure update**, **sign the MoU** (simulated e-signature), and **generate a partner report** with PDF, Excel and CSV exports.

Where the next move is OPM's, the step shows a **Demonstration control** that applies the same OPM decision rules and records the decision as simulated. The same decisions can be made for real in the OPM workspace by signing in as `coordinator.demo`; both paths update the same records.

**Access rules (enforced in the service layer, `src/lib/services/partnerContext.ts`):** a partner user sees only their organisation's records; staff see only interventions assigned to them; administrator-only permissions (profile, documents, proposals, team) cannot be delegated; a partner administrator can assign only partner roles and cannot grant OPM permissions; drafts stay private until submitted; approved scope, location, dates and budget change only through an OPM-approved change request; only accepted field reports and expenditure count as official figures; other organisations' assistance records and the national beneficiary database are never exposed; exports contain the same aggregate tables as the screen.

| Route | Screen |
| --- | --- |
| `/partner` | Dashboard: accreditation status, key figures, **Next actions** (each opens its exact record), demonstration journey, recent messages, intervention progress |
| `/partner/profile` | Organisation profile with field states (editable, under review, verified, locked); draft editing or change requests for OPM review |
| `/partner/accreditation` | Workflow, checklist, submit/resubmit, simulated URSB and NGO Bureau outcomes (read-only), suspension reason and next steps, renewal, decision history |
| `/partner/documents`, `/partner/documents/[id]` | Documents with expiry warnings, OPM review comments, simulated upload and replace, full version history |
| `/partner/proposals`, `/partner/proposals/new`, `/partner/proposals/[id]` | Proposal list, guided form with validation, OPM review status, overlap warnings, versions, change requests |
| `/partner/interventions`, `/partner/interventions/[id]` | Workspace: planned vs actual, activities and milestones, progress updates, delays and risks, map, assigned staff, reporting schedule, indicators, budget, documents, correspondence |
| `/partner/field-reports`, `/partner/field-reports/new`, `/partner/field-reports/[id]` | Field reports (draft, submitted, needs correction, accepted), field-application records saved offline or awaiting sync (simulated), version history |
| `/partner/surveys`, `/partner/surveys/[id]`, `/partner/surveys/responses/[id]` | Assigned forms, collection periods, versions, counts; responses keep the form version they were collected on |
| `/partner/beneficiaries`, `/partner/beneficiaries/[id]` | Verification requests (ProGres v4, simulated) and assistance entries with possible-duplicate review status |
| `/partner/finance` | Approved budget, funding source, expenditure updates, variance; AMP exchange explained and simulated |
| `/partner/agreements`, `/partner/agreements/[id]` | MoUs and approvals: versions, OPM comments, approval stage, simulated signature response |
| `/partner/reports` | Partner report builder, live preview, frozen figures, PDF/Excel/CSV export |
| `/partner/messages` | Inbox (every item links to its record), formal correspondence visible to OPM, internal notes visible only to the organisation |
| `/partner/team` | Invite, edit, deactivate users; roles, delegated permissions, assigned interventions; organisation activity history |

## Field Operations Portal

Sign in as `field.officer.demo`. The portal is built for a phone first (bottom tab bar, 48px touch targets, one column; a sidebar from 960px wide) and works in English, Kiswahili, French and Arabic (right-to-left).

**My work** shows today's and overdue tasks (visits, activity reports, surveys, assistance tasks, follow-ups) with location, due time, priority and status, and counts of **Drafts**, **Ready to sync**, **Sync errors** and **Submitted for review**. Every task opens its record. The **Demonstration walkthrough** panel tracks the connected scenario; each step is worked out from what is really on the device and in the central store:

1. Open INT-2026-0138 while online (the device saves the assigned work).
2. **Go offline (simulated)**. At the same moment, two changes are made centrally by other people (simulated): OPM publishes version 3 of the antenatal survey (retiring version 2), and the supervisor reduces the dignity-kit allocation on task FT-2026-0414 from 2 to 1.
3. Complete the GPS-tagged visit report (capture a real position, use the simulated service-point position, or record why GPS is unavailable), the survey (collected on version 2 from the device cache) and the assistance delivery (2 kits, task version 1). Each is saved offline.
4. The sync centre shows all three as saved offline; no central record exists yet (the e2e test checks the central store directly).
5. **Go back online** and press **Sync now**.
6. Result: the visit report is received; the survey is **rejected by validation** (its form version was retired before it was collected); the delivery is a **version conflict** with the supervisor's change.
7. **Move answers to version 3** (unchanged answers carry over; answer the one new question) and resubmit. Resolve the conflict with **Keep my record as delivered** or **Use the central version**, giving a reason. Both versions are kept: the central task keeps every version, the device keeps the original under *Earlier versions*, and a difference from the allocation goes to the supervisor to check.
8. **OPM returns the report** (demonstration control, or for real in `/portal/field-reports` as `coordinator.demo`, where the return action now lets the reviewer name the field that needs attention). The comment appears beside *People reached*.
9. Correct and resubmit (a correction note is required; version 1 stays in the central history), then **OPM accepts**. The intervention's accepted indicators, the OPM map and reports now include it.

| Route | Screen |
| --- | --- |
| `/field` | My work: counts, walkthrough, today / coming up / done, filters by task type |
| `/field/task?id=` | Task details, versions of the task, the officer's record for it, start or continue |
| `/field/interventions`, `/field/intervention?id=` | Assigned approved interventions (read-only scope and budget), activities, milestones, reporting instructions, forms, accepted indicators; start a visit, activity report or survey |
| `/field/reports`, `/field/report?id=` / `?central=` | Guided six-step visit/activity report with autosave, GPS review, compressed photos and validation; Draft → Saved offline → Ready to sync → Synced → Under review → Accepted / Returned for correction; field-level review comments; correction and central version history |
| `/field/surveys`, `/field/survey?id=` | Forms by intervention, settlement, collection period and version; question-by-question collection with required checks, progress and save-and-resume; each response keeps its exact form version |
| `/field/verify` | Restricted verification: minimum reference (typed, or scanned with the camera where the browser supports it), purpose and consent; Verified / Inconclusive / Unavailable / Pending sync / Needs review, labelled **Simulated** |
| `/field/assistance`, `/field/assistance/record?id=` | Delivery against an approved intervention with evidence; own-organisation history before submission; Recorded locally → Synced → Reviewed; possible duplicates go to human review, never a refusal |
| `/field/map` | Assigned settlement, service points, intervention locations and scheduled visits; Leaflet map online, a plan drawn from cached coordinates offline, and a list view |
| `/field/issues`, `/field/issue?id=` | Service gaps, safeguarding (restricted), infrastructure, failed distributions, follow-ups, and referrals to the caseworker workflow (the officer sees only the referral status) |
| `/field/sync` | Connection, last successful sync, device-only drafts, queue, syncing, failed (with reasons and fixes), conflicts (side by side), synced; safe retry; what is stored on the device |
| `/field/notifications` | Assignments, task changes, deadlines, returned reports with review comments, sync failures |
| `/field/account` | Organisation, settlement, permissions, language, install, sign-out (warns about unsynced records and keeps them) |
| `/field/team` | Supervisors: assign, change (new version) or cancel tasks; return a report with a field comment or endorse it; team issues |

Record ids are in the query string so that one cached page serves every record offline.

**Access rules (service layer, `src/lib/services/fieldContext.ts`):** field users see only their organisation's approved interventions in their assigned settlement, and officers only the ones assigned to them; tasks, forms and service points follow the same scope; supervisor permissions have no effect on an officer account; nobody in the field portal can browse the national beneficiary database or other organisations' records (assistance history shows only the officer's organisation; the central duplicate check compares the rest); approved scope and budget are read-only.

### Offline: what genuinely works in the browser

- **Device store.** Drafts, the upload queue, sync results and a cache of assigned work are kept in `localStorage` per user (`src/lib/field/device.ts`); photos and files in IndexedDB (`src/lib/field/files.ts`). They survive closing and reopening the browser, sign-out (with a warning) and reloads with no network. The browser is asked for persistent storage.
- **Offline really means offline.** While offline (no network, or *Simulate offline* switched on), field screens read only the device cache and write only the device store, and say when the cache was taken. Only `syncNow` reaches the central store, and it refuses to run offline.
- **Installable app and offline start** (production builds only): `public/field.webmanifest` and `public/field-sw.js`. The service worker caches every field screen with its scripts, styles and fonts, serves them when the network is gone, and re-caches when the language changes. A failed in-app navigation falls back to a full page load, which the worker serves. The e2e test disconnects the browser, reloads, navigates and writes a draft.
- **Sync engine** (`src/lib/field/client.ts`): one record at a time with progress messages; every upload carries the device record id, so a retry after a lost reply never creates a duplicate (*Simulate an unstable connection* shows this); validation rejections keep the record with the reason and the fields to fix; conflicts are detected against task versions and never overwrite; a record interrupted mid-upload returns to the queue.
- **Minimum data on the device.** Photos are resized and re-encoded before storage (sizes before and after are shown) and deleted once uploaded; household references are masked and safeguarding or referral descriptions removed after upload; supervisor team data is never cached. GPS and the camera are requested only when the officer presses the button, after an explanation.

### What still needs a production backend or external API

- The **central system** is simulated: `src/lib/services/fieldSync.ts` stands in for the API the device uploads to and writes to the shared browser store. Production needs real endpoints with the same idempotency (client record ids), validation and version checks, and authentication.
- **ProGres v4** verification and the other people's actions in the walkthrough (OPM form publication, the supervisor's change, OPM's return and acceptance) are simulated and labelled.
- **Files** are not uploaded anywhere; the central record keeps only names and sizes.
- **Background sync and push notifications** need a server; here syncing happens while the app is open (by hand, or on reconnect if enabled).
- **Security**: device data is not encrypted and sign-in is a demonstration. Production needs encrypted storage, device management, remote wipe and real authentication. Map tiles are not cached (the portal draws a plan from cached coordinates instead).
- The service worker is registered only by `npm run build && npm start`; bump `VERSION` in `field-sw.js` with each deployment.

## Functional versus simulated

**Functional in the browser:** every workflow transition, validation rule, permission check, geographic scope filter, reason requirement, assignment, filter, sort, notification, the audit trail, report computation and snapshots, CSV and Excel (`.xlsx`) export, PDF via the browser's print dialog, and persistence across refreshes.

**Simulated (labelled in the interface):** URSB and NGO Bureau registry checks, UNHCR ProGres v4 verification, AMP and NIMES submissions, integration retries and connection tests, field-device sync, partner resubmission, requester replies, SMS and email delivery, electronic signatures and signer authentication, file uploads (versions are recorded; no file is stored), and the sign-in itself. Outcomes are scripted so the demonstration shows success, timeout, mismatch, unavailable, inconclusive and partial-failure cases. None of these results is a real government or UNHCR verification.

**Privacy rules shown:** maps plot only settlement centres and public facilities; beneficiary details are masked in queues and revealed one record at a time with a logged reason; requester details on service cases need per-case access with a logged reason; exports contain aggregate tables and record references only; a possible duplicate creates a human review task and never blocks assistance.

## Structure

```
src/app/(public)/      landing, about, privacy, accessibility (server-rendered)
src/app/(auth)/        sign-in, forgot-password, reset-password
src/app/portal/        OPM Oversight Portal routes (thin server pages passing URL filters to client views)
src/app/partner/       Partner Portal routes
src/components/partner/ Partner Portal shell, shared partner components, one view file per area
src/components/ui/     design-system primitives (Button, Badge, Field, Notice, Icon, LanguageSwitcher…)
src/components/portal/ shell, filter bar, record table, record page (stepper, actions, timeline), dialogs, maps, one view file per area
src/lib/types.ts       domain model shared by every screen and future portals
src/lib/services/      typed async services: the only layer the UI calls; permission and scope checks live here
src/lib/services/external.ts   SIMULATED integrations (registries, ProGres, AMP/NIMES, signatures, messages)
src/lib/services/filters.ts    shared record predicates, so overview counts and lists always agree
src/lib/services/partner*.ts   Partner Portal services (context and access rules, account, work, field, insights, demo controls)
src/lib/services/field*.ts     Field Operations Portal: access rules, assigned-work snapshot, supervisor actions, simulated central sync endpoints, demo controls
src/lib/field/         Field device side: connectivity, device store (drafts, outbox, cache), IndexedDB files, sync engine, install prompt
src/components/field/  Field Operations shell, shared parts, one view file per area
public/field-sw.js, field.webmanifest, field-icons/   offline service worker and installable-app manifest
src/lib/services/partnerReview.ts  OPM decisions on partner submissions (change requests, progress, risks, expenditure, profile changes)
src/lib/demo/          fictional seed data, reference data, role permissions, browser store
src/lib/export.ts      CSV and .xlsx builders (no dependencies)
src/i18n/              locale config, translator, message files (en, sw, fr, ar)
```

To connect a real API, reimplement the functions in `src/lib/services/*` against it. The screens depend only on those function signatures and the types in `src/lib/types.ts`. Future partner, field operations, caseworker, refugee and M&E portals can call the same services; their roles already exist in the permission matrix (`src/lib/demo/reference.ts`).

## GIS

`/portal/gis` uses `react-leaflet` with OpenStreetMap tiles. Settlement coordinates are approximate and settlement-level only; service points are public facilities. Loading the map fetches tiles from `tile.openstreetmap.org`, the only outbound network call in the prototype.

## Languages

English is the default, with Kiswahili, French and Arabic. Arabic sets `dir="rtl"`, and layouts use logical CSS properties. Portal navigation, buttons, labels, statuses, validation messages, notifications and audit wording are translated. Fictional record data (organisation names, titles, narratives, indicator and sector names) stays in English, as it would come from the API.

Translations are **drafts that qualified translators must review before launch**. A key missing from a locale file, or listed under `_unreviewed`, falls back to English. `npm run check:i18n` reports coverage.

## Before launch (not done in this phase)

- Replace the demonstration sign-in with the institution's identity provider and multi-factor authentication.
- Build the backend and the real integrations with URSB, the NGO Bureau, UNHCR ProGres v4, AMP and NIMES, an approved e-signature service, and SMS/email delivery.
- Replace the placeholder privacy notice and have all translations reviewed.
- Build the caseworker and refugee portals, which are marked **Planned**, and the production backend for field sync (see *What still needs a production backend or external API*).
- Replace simulated file uploads with real document storage and malware scanning, and the Partner Portal's demonstration controls with real OPM decisions only.

# RPCMS — public site and OPM National Coordinator portal (frontend prototype)

This is the frontend prototype of the Refugee Partnership Coordination and Monitoring System (RPCMS), built with Next.js (App Router), React, and TypeScript.

> **Prototype only.** All records are fictional. The demonstration sign-in is not real authentication and provides no security. Verification, notifications, electronic signatures, and data exchanges are **simulated**, and the interface labels them that way. There is no backend.

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
```

The demonstration account works only when `NEXT_PUBLIC_RPCMS_DEMO=true` (set in `.env`). With the flag off, the account does not exist and the sign-in screen shows no demonstration panel. When the flag is on, the sign-in screen shows the credentials.

## Checks

```bash
npm run typecheck
npm run check:i18n       # translation coverage and unknown keys
npx playwright test      # end-to-end journey + axe WCAG 2.2 AA scans
```

Playwright uses the installed Microsoft Edge by default (`PW_CHANNEL=chrome` to use Chrome). It starts its own server on port 3100 from the last `npm run build`.

## The walkthrough

After signing in, the dashboard's **Coordination flow** panel tracks these steps. Every alert on the dashboard links to the record that clears it.

1. **Partner**: Kagera Community Health Alliance. Verify two documents, request the simulated e-signature, then approve.
2. **Intervention** INT-2026-0147. It is blocked until the partner is approved. Approving it releases the held field report.
3. **Field report** FR-2026-0932. Accepting it runs the simulated assistance-history check, which opens exception AEX-2026-0311.
4. **Assistance exception** AEX-2026-0311. Record a decision; a note is required.
5. **Service case** SRV-2026-1184. Assign it to the newly approved partner, optionally send the simulated requester notification, then resolve it.
6. **National report** NR-2026-Q3. When the readiness checks pass, sign it (simulated) and share it (simulated). The figures freeze at sign-off.

Changes persist in `localStorage` and survive a refresh. **Reset demonstration data** in the top bar restores the starting state.

## Structure

```
src/app/(public)/      landing, about, privacy, accessibility (server-rendered; shared header/footer layout)
src/app/(auth)/        sign-in, forgot-password (+ requested), reset-password (expired state)
src/app/portal/        coordinator portal; layout = sidebar + top bar (client, session-guarded)
src/components/ui/     design-system primitives (Button, Badge, Field, Notice, Icon, LanguageSwitcher…)
src/components/site/   public header, footer, product preview
src/components/portal/ shell, tables, decision panel, audit timeline, coverage map, GIS map, and one view file per screen
src/lib/services/      typed async service functions: the only layer the UI calls
src/lib/services/external.ts   SIMULATED integrations (verification, SMS/email, e-signature, data exchange)
src/lib/demo/          fictional seed data + browser store (replace with API calls later)
src/i18n/              locale config, translator, message files (en, sw, fr, ar)
src/styles/globals.css design tokens (colours, type, 8px spacing, radii) shared by site and portal
```

To connect a real API, reimplement the functions in `src/lib/services/*` against it. The screens depend only on those function signatures and the types in `src/lib/types.ts`.

## GIS tracking & monitoring

`/portal/gis` plots live, computed status per settlement (partners, interventions, field reports, open/overdue cases, open exceptions, people reached) on an interactive map (`react-leaflet` + OpenStreetMap tiles). Settlement coordinates in `src/lib/demo/reference.ts` are approximate and settlement-level only — never an individual location, matching the existing schematic coverage map on the dashboard. Loading the page fetches map tiles from `tile.openstreetmap.org`, the only outbound network call in the prototype; every other screen works fully offline.

## Languages

English is the default. The language choice is saved in a cookie, so server-rendered pages come back in the saved language, and a copy is kept in `localStorage`. Arabic sets `dir="rtl"`, and layouts use logical CSS properties.

Kiswahili, French, and Arabic translations are **drafts that qualified translators must review before launch**. A key that is missing from a locale file, or that is listed under `_unreviewed` in it, falls back to English rather than showing unreviewed wording. The privacy notice, which is legal placeholder text, is held back in all three languages. `npm run check:i18n` reports coverage for each language.

## Before launch (not done in this phase)

- Replace the demonstration sign-in with the institution's identity provider and multi-factor authentication.
- Replace the placeholder privacy notice and institutional contact with reviewed content.
- Have translations reviewed, and remove the `_unreviewed` entries once they are.
- Build the backend, the real integrations, and the partner, field-team, and refugee portals, all of which are marked **Planned**.

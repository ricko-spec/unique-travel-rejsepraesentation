# ROADMAP

Prioriteret. **GitHub issues er backlog-sandheden** — ikke en ekstern fil. Lukkede punkter og
deres begrundelse står i merged PR'er (se `docs/STATUS.md` for links), ikke gengivet her.

## Lukket (seneste)

- Sikkerhedsbatch, password-flow, destinations-upload, DB-versionering (migrationer 001-008)
  + mekanisk schema-drift-check — se `docs/SYSTEM-ARKITEKTUR.md`
- `trips.created_by` ved oprettelse + `parse_failures` dead-letter-logging (PR #5)
- Egentlig test-suite (Vitest, `npm test`, >130 tests) — se `docs/TESTING.md`
- Pæn dansk fejlbesked ved ugyldig PDF (PR #23)
- Vision 2.0 fase 1-3: hero, timeline, hoteller (PR #27, #29, #31)
- README nævner nu AGENTS.md/CLAUDE.md-strukturen (var åbent punkt, løst)
- **Projekt-refresh — GitHub som sandhed, kortere docs**
  ([Issue #30](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/30), PR #33)
- **Vision 2.0 fase 4** — billeder: galleri-polish + `next/image`, lukker PERF-3
  ([Issue #34](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/34), PR #35)
- **Vision 2.0 fase 5 — pris, praktisk info, CTA og mobil-polish. Vision 2.0 afsluttet
  (fase 1-5 alle live)**
  ([Issue #36](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/36), PR #37)
- **[Issue #38](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/38) —
  Brugsoverblik / 100% upload-tracking pr. sælger.** Migration 009 kørt og verificeret i
  production, kode merget/deployet (PR #39).
- **[Issue #40](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/40) —
  Vision 2.0 finishing touch: desktop progress navigation (≥1180px).** Merget til main
  (PR #42). Rent frontend/CSS, ingen DB/migration involveret.
- **[Issue #43](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/43) —
  Vision 3.0 fase 1: design af eventmodellen (oprindelig cookie-baseret model).** Docs-only,
  merget (PR #44). **Revideret af [Issue #63](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/63)
  — se punktet under "Skal besluttes af Ricko".**
- **[Issue #45](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/45) —
  Vision 3.0: Analytics Bridge API til Marketing Dashboard.** Merget (PR #46). Read-only,
  server-to-server-endpoint (`GET /api/internal/analytics/travel-plans`) der eksponerer
  eksisterende online rejseplaner — ingen kundedata, intet bookingnummer i klartekst, ingen
  HubSpot-afhængighed i dette repo. Se `docs/ANALYTICS-BRIDGE-API.md`.
- **[Issue #47](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/47) —
  Hotel website-links på trip-detaljesiden.** Merget.
- **[Issue #48](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/48) —
  Vandflyver-markør på transfers.** Merget.
- **[Issue #49](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/49) —
  Reliability hardening: ERR-1 (max_tokens-detektion), ERR-3 (fejltilstand i
  trips-listen), SEC-6 (envDiagnostics ud af klientsvar).** Merget.
- **[Issue #53](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/53) —
  Storage bucket-config i drift-tjekket.** Merget. Lukker den tidligere kendte blinde vinkel
  — se `scripts/check-storage-drift.mjs`.
- **[Issue #54](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/54) —
  SEC-4: rate-limit på PDF parse-endpointet.** Merget.
- **[Issue #56](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/56) —
  Security regression suite for kundens adgangskontrol/cookies.** Merget
  (`src/lib/trip-access.ts` + tests).
- **[Issue #57](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/57) —
  PAIN-1: deploy/version-SHA i admin.** Merget (`src/app/admin/VersionBadge.tsx`).

## Næste

1. **[Issue #63](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/63) —
   Vision 3.0 Fase 1B0: cookie-fri visit-model, docs-only revision af Fase 1-designet.**
   Merget (PR #64). Model B (cookie-fri, server-side rolling visit-aggregation) er
   sidenhen **valgt** af Ricko via Issue #65 — se punkt 2.
2. **[Issue #65](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/65) —
   Fase 1B: selve opsamlingen. Teknisk klar, DB-fundamentet er live.** Implementeret i
   PR #66: `supabase/010_trip_visits.sql` (tabel + RLS + index + `record_trip_visit`-RPC,
   race-sikker efter mønsteret fra `increment_rate_limit`), separat
   `010b_trip_visits_retention.sql` (12 mdr. retention, pg_cron IKKE aktiveret — kræver
   egen godkendelse), `src/lib/trip-visit.ts` + `trip-visit-write.ts` + tests, ét
   best-effort `scheduleTripVisit()`-kald (waitUntil indeni) i
   `src/app/[bookingId]/page.tsx`, diskret transparens-linje i `AccessGate`. Ingen
   middleware-udvidelse. **Migration 010 er kørt og verificeret i production
   2026-09-18T11:31:14Z** (`20260918113114_trip_visits_usage_tracking`) —
   DB-infrastrukturen er klar, men koden er endnu ikke merget/deployet, så ingen reel
   tracking sker endnu. Næste gate: release-cutover (`TRACKING_SINCE` sættes til det
   faktiske deploy-tidspunkt i én separat commit) + Rickos endelige
   merge-godkendelse — se PR #66 for eksakt rækkefølge og rollback. Visning i admin er
   fase 1C/4 og starter IKKE automatisk her.
3. **[Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) —
   Vision 3.0: Customer Engagement & Sales Intelligence.** Master-issue — IKKE én stor PR.
   Fase 2-4 (sektionsengagement, kontakt-intent, salgsoversigt) tages ét PR ad gangen efter
   fase 1B.
4. **Drift, ingen kode:** Mille opretter Japan/Kenya/Mauritius + uploader billeder i production

Herudover intet forudbestemt. Punkter efter dette vælges af Ricko fra backloggen nedenfor
eller GitHub Issues.

## Backlog (uprioriteret — se GitHub Issues for fuld liste)

- **Supabase custom SMTP** — fjerner Supabase' delte mail-rate-limit på recovery-/system-mails
- **`parse_failures`-oprydning** — pg_cron-job der sletter rækker > 30 dage
- **PERF-1** — trim dashboard-select
- **Staging-oprydning som rigtig cron** (i dag opportunistisk ved hver ny upload-URL)

## Skal besluttes af Ricko

- **Vision 3.0 Fase 1B — release-cutover + merge-godkendelse af PR #66.** Model B,
  transparens og 12 mdr. retention er besluttet (se `docs/DECISIONS.md`). Migration 010
  er kørt og verificeret i production (2026-09-18T11:31:14Z) — det resterende er
  release-cutover: fastlægge `TRACKING_SINCE` (`src/lib/trip-visit.ts`) til det faktiske
  deploy-tidspunkt i én separat commit umiddelbart før merge, opdatere testen i samme
  ombæring, køre checks igen, én sidste review, derefter Rickos merge-godkendelse —
  merge-blokerende tjekliste i `supabase/README.md` ("Driftsnote: trip_visits"). Retention
  (`010b_trip_visits_retention.sql`/pg_cron) kræver en separat, senere godkendelse og er
  IKKE en del af denne release. Se PR #66 for eksakt rækkefølge og rollback.
- **Unlock-kode ≠ booking_no?** — sikkerheds-/UX-afvejning. Designet er færdigt og merget
  (2-3 modeller, trusselsmodel og en konkret anbefaling — Model B, separat hashet
  access_code) i `docs/UNLOCK-CODE-DESIGN.md`
  ([Issue #55](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/55)).
  **Selve beslutningen om at implementere er stadig Rickos** — ingen kode er skrevet.
- **Slug-override-feltet i admin** — har aldrig virket (serveren ignorerer det); fjern eller
  gør funktionelt
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop

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
- **[Issue #63](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/63) —
  Vision 3.0 Fase 1B0: cookie-fri visit-model, docs-only revision af Fase 1-designet.**
  Merget (PR #64). Model B (cookie-fri, server-side rolling visit-aggregation) blev
  sidenhen **valgt** af Ricko via Issue #65.
- **[Issue #65](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/65) —
  Vision 3.0 Fase 1B: cookie-fri kundeåbninger, live i production.** Merget (PR #66).
  `supabase/010_trip_visits.sql` (tabel + RLS + index + `record_trip_visit`-RPC,
  race-sikker efter mønsteret fra `increment_rate_limit`, migration kørt og verificeret
  2026-09-18T11:31:14Z), `src/lib/trip-visit.ts` + `trip-visit-write.ts` + tests, ét
  best-effort `scheduleTripVisit()`-kald i `src/app/[bookingId]/page.tsx`, diskret
  transparens-linje i `AccessGate`. `TRACKING_SINCE = 2026-09-18T12:20:18Z`. Ingen
  middleware-udvidelse, ingen ny cookie. **Production-smoketest bestået** (se
  `docs/STATUS.md`). Retention (`010b_trip_visits_retention.sql`, pg_cron) IKKE
  aktiveret — kræver egen, senere godkendelse.
- **[Issue #67](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/67) —
  Admin: "Oprettet af" i rejsepræsentationslisten.** Merget (PR #68).
- **[Issue #69](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/69) —
  Vision 3.0 Fase 1C: vis kundeåbninger i admin.** Merget (PR #70). "Kundeaktivitet"-kolonne
  i **Alle præsentationer** + detaljekort, ren testet klassifikator
  (`src/lib/trip-engagement.ts`), retention-safe no-row-semantik. Ét ufiltreret
  `trip_visits`-opslag (review-fund: ingen voksende `.in()`-URL), kompakt admin-DTO.
  **Production UI-smoketest er udsat** (Ricko kan ikke teste lige nu) — driftsopfølgning,
  ikke en blocker.
- **[Issue #71](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/71) —
  Vision 3.0 Fase 2: sektionsengagement end-to-end.** Merget (PR #72). Ny
  `trip_section_engagement`-tabel + RPC (migration 011, `20260918184105_trip_section_engagement`,
  kørt og read-only verificeret i production, schema-baseline opdateret), `POST
  /[bookingId]/engagement`, klient-tracker, "Set i rejseplanen" i admin, server-side
  eligibility. **Production UI-smoketest er udsat** — driftsopfølgning, ikke en blocker.
- **[Issue #73](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/73) —
  Vision 3.0 Fase 3: kontakt-intent end-to-end.** Merget (PR #74). `trip_contact_intent` + RPC (migration 012,
  `20260919074341_trip_contact_intent`, kørt og read-only verificeret, baseline opdateret), `POST /[bookingId]/intent`,
  tracked links, "Kontakt-intent" i admin. Live i production 2026-09-19T08:21:19Z. **Production UI-smoketest er udsat**
  — driftsopfølgning, ikke en blocker.
- **[Issue #76](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/76) —
  Vision 3.0 Fase 4: salgsoversigt med målt kundeaktivitet.** Merget
  ([PR #77](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/77),
  2026-09-19T09:24:56Z, merge-commit `c407d626`). Kompakt server-side DTO (ingen
  `data`/`raw_pdf_text`/`created_by`), pagineret læsehjælper, seks set-baserede læsninger, kolonnerne
  Åbnet/Set/Kontakt/Seneste aktivitet, filtre + sortering + klient-side pagination, `not-measured`, delt
  `resolveEligibleSections`, `CONTACT_INTENT_TRACKING_SINCE = 2026-09-19T08:21:19Z`. Ingen migration. Se
  `docs/VISION-3.0-PHASE-4-PLAN.md`. **Rettelse (2026-09-24):** denne fil sagde tidligere "PR åben, ikke
  merget" — verificeret forkert mod GitHub, PR #77 er merget og live.
- **[Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78) —
  Vision 3.0 Fase 5, Gate A: read-only datagrundlagsverifikation.** Merget
  ([PR #79](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/79),
  merge-commit `644269a`). Afgjort `GO MED FORBEHOLD` — kun til Gate B-designarbejde, historisk
  backfill forbliver blokeret. Se `docs/VISION-3.0-PHASE-5-GATE-A.md`.

## Næste

1. **[Issue #80](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/80) —
   Vision 3.0 Fase 5, Gate B: prospektiv konverteringsmåling uden aktivering** (barn af Gate A/
   Issue #78, som igen er barn af [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)).
   **Gate B0 (arkitektur A valgt) + Gate B1 (implementering uden aktivering) leveret som ét kapitel**
   — branch `feat/gate-b0-b1-conversion-measurement-80`, PR reviewklar (se `docs/STATUS.md` for
   PR-link/head-SHA). Migration `013_conversion_measurement.sql` bygget som fil, **ikke anvendt**.
   Ren sync-/klassifikationsmotor, persistence-adaptere (Supabase + fixture), admin-API/-UI i
   fail-closed "ikke startet"-tilstand, small-cell + komplementær privacy-undertrykkelse, 75 nye
   tests. Se `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md` (arkitektur) og
   `docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md` (Gate B2/C/D-procedure). **Ingen migration/secrets/
   scheduler/live HubSpot-kald/merge i denne leverance** — stopper ved review-/migrationsgaten.
2. **[Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) —
   Vision 3.0: Customer Engagement & Sales Intelligence.** Master-issue — IKKE én stor PR.
   Fase 4 (salgsoversigt) er live (#76/PR #77); Fase 5 Gate A er live (#78/PR #79); **Fase 5 Gate B
   (#80) er placeret i dette repo** (server-side, ingen HubSpot i browseren) — se `docs/DECISIONS.md`.
3. **Drift, ingen kode:** Mille opretter Japan/Kenya/Mauritius + uploader billeder i production

Herudover intet forudbestemt. Punkter efter dette vælges af Ricko fra backloggen nedenfor
eller GitHub Issues.

## Backlog (uprioriteret — se GitHub Issues for fuld liste)

- **Supabase custom SMTP** — fjerner Supabase' delte mail-rate-limit på recovery-/system-mails
- **`parse_failures`-oprydning** — pg_cron-job der sletter rækker > 30 dage
- **PERF-1** — trim dashboard-select
- **Staging-oprydning som rigtig cron** (i dag opportunistisk ved hver ny upload-URL)

## Skal besluttes af Ricko

- **Vision 3.0 Fase 5 — review og Gate B2-godkendelse (Issue #80).** Gate B0 (arkitektur A) + Gate
  B1 (implementering uden aktivering) er leveret som PR. Beslutninger, se
  `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md` + `docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md`: (1)
  bekræft arkitektur A, (2) review og merge-godkendelse af PR'en, (3) derefter Gate B2 (kør
  migration 013 i production — separat godkendelse), (4) bekræft outcome-fortolkningen
  (`unique_travel_dealstatus`/`hs_is_closed_won` ⇒ Booket) med en domæneansvarlig før Gate C.
- **Vision 3.0 retention — aktivering af `010b_trip_visits_retention.sql`/pg_cron.**
  Separat fra Fase 1B/1C/2; kræver egen, eksplicit godkendelse (inkl. evt. aktivering af
  `pg_cron`-extensionen). Ingen tidsfrist — hverken `trip_visits`, `trip_section_engagement`
  eller `trip_contact_intent` (max 2 rækker/trip) kræver retention for at fungere korrekt.
- **Unlock-kode ≠ booking_no?** — sikkerheds-/UX-afvejning. Designet er færdigt og merget
  (2-3 modeller, trusselsmodel og en konkret anbefaling — Model B, separat hashet
  access_code) i `docs/UNLOCK-CODE-DESIGN.md`
  ([Issue #55](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/55)).
  **Selve beslutningen om at implementere er stadig Rickos** — ingen kode er skrevet.
- **Slug-override-feltet i admin** — har aldrig virket (serveren ignorerer det); fjern eller
  gør funktionelt
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop

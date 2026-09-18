# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-18**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 (brugsoverblik/upload-tracking) +
  **Vision 3.0 Fase 1B (cookie-fri kundeåbninger, Issue #65/PR #66), Fase 1C ("Kundeaktivitet"
  i admin, Issue #69/PR #70) og Fase 2 (sektionsengagement, Issue #71/PR #72, migration 011)
  live.** Aktuel main/deploy verificeres i GitHub/Vercel (denne fil hardcoder bevidst ikke en
  SHA — den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Aktivt kapitel:** [Issue #73](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/73) — Vision 3.0 Fase 3: kontakt-intent
  end-to-end (barn af [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)). Branch `feat/contact-intent-73`; PR: se
  Issue #73/GitHub. Én samlet work package: ny aggregeret `trip_contact_intent`-tabel (max 2
  rækker pr. trip — email/phone; ingen click_count) + `record_trip_contact_intent`-RPC,
  `POST /[bookingId]/intent` under kundens egen slug-path, `ContactIntentLink` på ContactCTA
  (email + rådgiver-tel) og ActionBar "Ring" (**"Kontakt os" → #kontakt tracker IKKE**), en
  separat "Kontakt-intent"-blok i Kundeaktivitet på admin og opdateret `TRACKING_NOTICE`.
  Se `docs/VISION-3.0-PHASE-3.md`.
  - **Migration 012 (`supabase/012_trip_contact_intent.sql`): versioneret, IKKE kørt i
    production** — kræver Rickos særskilte godkendelse. **`schema-baseline.json` er IKKE
    opdateret** (opdateres først efter en live-kørsel). `check-schema-drift.mjs` mod production
    viser "Ingen drift", fordi både production og baseline endnu er uden 012.
  - **Release-rækkefølge:** migration 012 køres FØR kode-deploy. Uden tabellen fejler intet for
    kunden (klienten ignorerer 500), men klik registreres ikke, og admin viser "Kontaktaktivitet
    kunne ikke hentes".
  - **Fase 3 tracking-cutover:** `CONTACT_INTENT_TRACKING_SINCE` (`src/lib/contact-intent-tracking.ts`) er
    **`null`** indtil den afsluttende release-cutover commit (efter migration 012 er live, lige før
    merge/deploy). Fase 1B's `TRACKING_SINCE` gælder kun åbninger og vises som "Åbningsmåling fra …".
  - Admin-eligibility for kontakt-intent afledes via `tripSchema` + `normalizeTrip` (samme som kunde +
    endpoint); ugyldig trip-data ⇒ "Kontaktaktivitet kunne ikke vurderes", aldrig et falsk "—".
  - `010b`/`pg_cron`: ikke kørt/aktiveret. Fase 4: ikke startet. Ingen merge.
- **Kendt driftsopfølgning (ikke en blocker):** production UI-smoketest af Fase 1C og Fase 2 er
  udsat (Ricko kan ikke teste lige nu).

## Seneste 3 relevante ændringer

1. **[PR #72](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/72) — Issue #71: Vision 3.0 Fase 2, sektionsengagement,
   2026-09-18.** Ny `trip_section_engagement`-tabel + RPC (migration 011, kørt/verificeret i
   production, schema-baseline opdateret), `POST /[bookingId]/engagement`, klient-tracker
   (IntersectionObserver + 750 ms dwell), "Set i rejseplanen" i admin, server-side eligibility,
   transparens i `Footer`.
2. **[PR #70](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/70) — Issue #69: Vision 3.0 Fase 1C, "Kundeaktivitet" i admin,
   2026-09-18.** Sælgervendt visningslag oven på Fase 1B's data — ingen ny tracking, ingen
   migration.
3. **[PR #66](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/66) — Issue #65: Vision 3.0 Fase 1B, cookie-fri kundeåbninger,
   2026-09-18.** Ny `trip_visits`-tabel + `record_trip_visit`-RPC (migration 010), server-side
   gate + fail-open skrivevej, ingen ny cookie, ingen middleware-ændring.

Fuld historik: [lukkede/merged PR'er på GitHub](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls?q=is%3Apr+is%3Amerged).

## Åbne beslutninger / risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data.
- **Vercel preview er bag Vercel Authentication (SSO)** — render-verifikation sker lokalt
  (mod prod-DB) eller på production efter merge.
- **Storage bucket-config uden for drift-tjekket** (kendt blind vinkel).
- Repo er public — secrets/kundedata-disciplin er procesbåret, ikke teknisk håndhævet.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**ChatGPT architecture/security-review af Fase 3-PR'en (Issue #73)**, dernæst Rickos konkrete
godkendelse af migration 012 → migration køres + read-only verificeres → `--update-baseline` →
release-cutover commit (`CONTACT_INTENT_TRACKING_SINCE`) → fulde checks/Vercel → ChatGPT final HEAD-review → Rickos merge-godkendelse → merge/deploy →
production-smoketest når Ricko har mulighed (blokerer ikke merge). Se
`docs/VISION-3.0-PHASE-3.md` for eksakt rækkefølge.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales
Intelligence. Master-issue/produktkapitel, IKKE én stor PR. Fase 4 (salgsoversigt/
sortering-efter-besøg/-sektion/-kontakt-intent) og fase 5 (HubSpot-kobling, i Marketing
Dashboard-projektet, ikke her) er stadig fremtidige, ikke påbegyndte kapitler.

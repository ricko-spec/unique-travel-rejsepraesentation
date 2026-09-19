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
  - **Production migration 012: kørt** — Supabase-migration `20260919074341_trip_contact_intent` (2026-09-19T07:43:41Z,
    `iunixfpthdftmkgpugex`), efter Rickos godkendelse. Read-only verificeret 2026-09-19: tabel med 0
    rækker, RLS enabled, PK `(trip_id, channel)`, FK → `trips(id)` ON DELETE CASCADE, CHECK
    (`email`/`phone`), table privileges kun `service_role` SELECT/INSERT/UPDATE (PUBLIC/anon/
    authenticated: ingen), RPC `SECURITY INVOKER` med `search_path = public, pg_catalog` og EXECUTE kun for
    `service_role`; `pg_cron` ikke installeret. Live-kommentarer og RPC-krop er identiske med migrationsfilen.
  - **`schema-baseline.json` er opdateret EFTER live-migrationen** (kun `trip_contact_intent`-objekter,
    +84/−0 linjer); drift-tjek = "Ingen drift". **Production synthetic contact-intent events: 0** — kun
    skemaet er skrevet; koden (endpoint/links/admin) er endnu ikke merget eller deployet.
  - **Tracking-start (Fase 3):** Migrationstidspunktet (2026-09-19T07:43:41Z) er kun DB-parathed, IKKE tracking-start: ingen kode skriver til
    tabellen, før PR #74 er merget og deployet. `CONTACT_INTENT_TRACKING_SINCE` skal være ≥ det tidspunkt, hvor
    Fase 3-koden er live i production — en dato der ligger FØR ville lade et "—" påstå dækning for en periode uden
    tracking (falsk negativt signal); en dato der ligger EFTER er sikker (et klik før datoen vises stadig som ✓).
    `CONTACT_INTENT_TRACKING_SINCE` (`src/lib/contact-intent-tracking.ts`) er derfor stadig **`null`** — der er
    ikke opfundet et go-live-tidspunkt. Indtil den sættes viser admin "Kontaktklik registreres fra det
    tidspunkt funktionen sættes i drift." (ærligt og dato-løst). Fase 1B's `TRACKING_SINCE` gælder kun åbninger
    ("Åbningsmåling fra …").
  - **Eneste resterende releasetrin (ud over godkendelser og checks): fastlæg
    `CONTACT_INTENT_TRACKING_SINCE`** — afventer Rickos valg af metode, se `docs/VISION-3.0-PHASE-3.md`
    § "Tracking-cutover".
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

**ChatGPT final HEAD-review af Fase 3-PR'en (#74)** (baseline og status er opdateret efter live-migrationen),
dernæst Rickos beslutning om cutover-metode for `CONTACT_INTENT_TRACKING_SINCE` og eksplicitte
merge-godkendelse → merge/deploy → cutover-trinnet → production-smoketest når Ricko har mulighed
(blokerer ikke merge). Se `docs/VISION-3.0-PHASE-3.md` for eksakt rækkefølge.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales
Intelligence. Master-issue/produktkapitel, IKKE én stor PR. Fase 4 (salgsoversigt/
sortering-efter-besøg/-sektion/-kontakt-intent) og fase 5 (HubSpot-kobling, i Marketing
Dashboard-projektet, ikke her) er stadig fremtidige, ikke påbegyndte kapitler.

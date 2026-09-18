# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-18**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 (brugsoverblik/upload-tracking) +
  **Vision 3.0 Fase 1B (cookie-fri kundeåbninger, Issue #65/PR #66) live.**
  Aktuel main/deploy verificeres i GitHub/Vercel (denne fil hardcoder bevidst ikke en SHA —
  den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Landet siden sidst:** [Issue #65](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/65)/[PR #66](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/66)
  — Vision 3.0 Fase 1B er merget og live: `public.trip_visits` + `record_trip_visit`-RPC
  (migration 010, kørt 2026-09-18T11:31:14Z), `TRACKING_SINCE = 2026-09-18T12:20:18Z`.
  **Production-smoketest bestået:** en rigtig kundeåbning oprettede én `trip_visits`-række;
  et refresh inden for 30 min. øgede `open_count` uden at øge `visit_count`. Retention
  (`010b_trip_visits_retention.sql`, pg_cron) er fortsat IKKE aktiveret.
- **Aktivt kapitel:** [Issue #69](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/69)
  — Vision 3.0 Fase 1C: vis kundeåbninger i admin (barn af
  [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)).
  Sælgervendt visningslag oven på Fase 1B's allerede indsamlede data — ingen ny tracking,
  ingen migration. Ny "Kundeaktivitet"-kolonne i **Alle præsentationer** + et
  "Kundeaktivitet"-kort på trip-detaljesiden, drevet af en ren, testet klassifikator
  (`src/lib/trip-engagement.ts`) med retention-safe no-row-semantik. Se PR for status.

## Seneste 3 relevante ændringer

1. **[PR #66](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/66) —
   Issue #65: Vision 3.0 Fase 1B, cookie-fri kundeåbninger, 2026-09-18.** Ny
   `trip_visits`-tabel + `record_trip_visit`-RPC (migration 010, kørt/verificeret i
   production), server-side gate + fail-open skrivevej i `src/app/[bookingId]/page.tsx`,
   ingen ny cookie, ingen middleware-ændring. `TRACKING_SINCE` sat i separat
   release-cutover-commit. Smoketest bestået.
2. **[PR #68](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/68) —
   Issue #67: "Oprettet af" i admin-rejsepræsentationslisten, 2026-09-18.** `GET
   /admin/api/trips` udvidet med `created_by_name` (ét samlet profiles-opslag, ingen N+1).
3. **[PR #44](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/44) —
   Issue #43: Vision 3.0 fase 1-design (eventmodel/sessions/privacy), 2026-09-16.** Docs-only:
   `docs/VISION-3.0-EVENT-MODEL.md` — sessiondefinition, `customer_sessions`-skitse,
   `waitUntil()`-baseret fail-open skrivning, hard cookie-consent-release-gate. Ingen kode,
   ingen migration.

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

**Afvent Rickos review af Issue #69-PR'en** (Vision 3.0 Fase 1C: "Kundeaktivitet" i
admin). Rent visningslag oven på allerede-live Fase 1B-data — ingen ny tracking, ingen
migration, ingen writes. `GET /admin/api/trips` udvidet med ét samlet
`trip_visits`-opslag (ingen N+1); trip-detaljesiden læser sin egen række server-side.
Fail-open, aldrig som falsk "Ikke åbnet endnu": en fejlet forespørgsel viser
"Aktivitet kunne ikke hentes". Retention-safe no-row-semantik
(`cutoff = max(trip.created_at, TRACKING_SINCE)`, 12-måneders-grænse) implementeret nu,
selvom `010b_trip_visits_retention.sql`/pg_cron fortsat IKKE er aktiveret.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)
— Vision 3.0: Customer Engagement & Sales Intelligence. Master-issue/produktkapitel, IKKE én
stor PR. Fase 1C (#69) er visningslaget for Fase 1B's data; fase 2 sektionsengagement,
fase 3 kontakt-intent, fase 4 salgsoversigt/sortering-efter-besøg, fase 5
HubSpot-kobling (i Marketing Dashboard-projektet, ikke her) er alle stadig fremtidige,
ikke påbegyndte kapitler.

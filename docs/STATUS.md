# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-18**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 (brugsoverblik/upload-tracking) +
  **Vision 3.0 Fase 1B (cookie-fri kundeåbninger, Issue #65/PR #66) og Fase 1C
  ("Kundeaktivitet" i admin, Issue #69/PR #70) live.**
  Aktuel main/deploy verificeres i GitHub/Vercel (denne fil hardcoder bevidst ikke en SHA —
  den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Landet siden sidst:** [Issue #69](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/69)/[PR #70](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/70)
  — Vision 3.0 Fase 1C er merget og deployet: "Kundeaktivitet"-kolonne i **Alle
  præsentationer** + detaljekort, drevet af `src/lib/trip-engagement.ts`. **Production
  UI-smoketest er udsat** (Ricko kan ikke teste lige nu) — det er en driftsopfølgning, ikke
  en blocker, og har ikke stoppet Fase 2 (se Issue #71 nedenfor).
- **Aktivt kapitel:** [Issue #71](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/71)
  — Vision 3.0 Fase 2: sektionsengagement end-to-end (barn af
  [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)).
  Én samlet work package: ny `trip_section_engagement`-tabel (migration 011, IKKE kørt i
  production), sikkert write-endpoint under kundens egen slug-path
  (`POST /[bookingId]/engagement`), klient-tracker med IntersectionObserver + 750 ms dwell
  for de fem hovedafsnit (rejseplan/billeder/hoteller/pris/kontakt — ALDRIG intro), og en
  minimal "Set i rejseplanen"-visning i admin. Se `docs/VISION-3.0-PHASE-2.md` og PR for
  fuld status. **PR #72 er rettet efter ChatGPT's architecture/security-review** (eksplicitte
  table grants/revokes, server-side sektions-eligibility, transparens i Footer også for
  returning customers, orkestrerings-tests) og afventer ChatGPT re-review. **Migration 011
  er IKKE kørt i production; production-writes = 0; ingen merge.**

## Seneste 3 relevante ændringer

1. **[PR #70](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/70) —
   Issue #69: Vision 3.0 Fase 1C, "Kundeaktivitet" i admin, 2026-09-18.** Sælgervendt
   visningslag oven på Fase 1B's data — ingen ny tracking, ingen migration. Ét ufiltreret
   `trip_visits`-opslag (ingen `.in()`-URL-vækstproblem), kompakt admin-DTO.
2. **[PR #66](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/66) —
   Issue #65: Vision 3.0 Fase 1B, cookie-fri kundeåbninger, 2026-09-18.** Ny
   `trip_visits`-tabel + `record_trip_visit`-RPC (migration 010, kørt/verificeret i
   production), server-side gate + fail-open skrivevej i `src/app/[bookingId]/page.tsx`,
   ingen ny cookie, ingen middleware-ændring. Smoketest bestået.
3. **[PR #68](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/68) —
   Issue #67: "Oprettet af" i admin-rejsepræsentationslisten, 2026-09-18.** `GET
   /admin/api/trips` udvidet med `created_by_name` (ét samlet profiles-opslag, ingen N+1).

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

**Afvent ChatGPT architecture/security-review + Rickos godkendelse af Issue #71-PR'en**
(Vision 3.0 Fase 2: sektionsengagement end-to-end). Migration 011 er versioneret men
**IKKE kørt i production** — kræver Rickos separate godkendelse, akkurat som migration 010
var. Release-rækkefølgen (`docs/VISION-3.0-PHASE-2.md`) følger samme mønster som Fase 1B:
migration køres og verificeres read-only FØR merge, `010b`/pg_cron rører intet af dette.

Herudover: production-smoketest af Fase 1C's UI (Issue #69/PR #70) er stadig udsat, se
punktet ovenfor — ingen ny handling krævet, kun en kendt, åben opfølgning.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)
— Vision 3.0: Customer Engagement & Sales Intelligence. Master-issue/produktkapitel, IKKE én
stor PR. Fase 3 (kontaktklik-intent), fase 4 (salgsoversigt/sortering-efter-besøg/-sektion)
og fase 5 (HubSpot-kobling, i Marketing Dashboard-projektet, ikke her) er alle stadig
fremtidige, ikke påbegyndte kapitler.

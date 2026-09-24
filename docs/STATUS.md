# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-24**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 + **Vision 3.0 Fase 1B (kundeåbninger), 1C
  ("Kundeaktivitet"), Fase 2 (sektionsengagement, migration 011), Fase 3 (kontakt-intent, migration
  012) og Fase 4 (salgsoversigt, Issue #76) live.** Aktuel main/deploy verificeres i GitHub/Vercel
  (denne fil hardcoder bevidst ikke en SHA løbende — den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Gate A afsluttet og merget:** [Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78)
  (nu **lukket**) — [PR #79](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/79)
  merget til `main` (merge-commit `644269a`). Gate A-afgørelse: **`GO MED FORBEHOLD`** — kun til
  Gate B-designarbejde af den PROSPEKTIVE måling; historisk backfill forbliver blokeret. Pipeline
  `754595640` + stage-kontrakten (`1098732868` "Tilbud sendt", `1169407502` "Opdateret tilbud") er
  live bekræftet. Historisk rekonstruktion er `UNUSABLE` (dokumenteret dataartefakt i ældre deals),
  men blokerer ikke den prospektive løsning. Se `docs/VISION-3.0-PHASE-5-GATE-A.md`.
- **Aktivt kapitel:** [Issue #80](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/80) —
  **Vision 3.0 Fase 5, Gate B: prospektiv konverteringsmåling uden aktivering** (barn af Gate A).
  Branch `feat/gate-b0-b1-conversion-measurement-80`; PR
  [#81](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/81) — denne fil
  hardcoder bevidst IKKE PR'ens løbende head-SHA (den bliver stale ved hvert nyt commit på
  branchen, inkl. rene docs-opdateringer som denne selv — se GitHub for det aktuelle head).
  **Reviewklar, ikke merget** — stopper bevidst ved review-/migrationsgaten.
  - **Gate B0 (ADR):** arkitektur **A** valgt — direkte, read-only HubSpot-læsning i dette projekt,
    ingen Marketing Dashboard-afhængighed. Se `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md`.
  - **Gate B1 (implementering uden aktivering):** `supabase/013_conversion_measurement.sql`
    (tre tabeller, **bygget som fil, IKKE anvendt**), ren klassifikationsmotor
    (`src/lib/conversion/classify.ts`), fail-closed sync-motor (`syncEngine.ts`, "fuld kilde eller
    ingen commit af kørslen"), HubSpot-adapter-KONTRAKT + fixture (ingen live klient/kald),
    small-cell + komplementær privacy-undertrykkelse (`aggregate.ts`), admin-API/-UI i fail-closed
    "ikke startet"-tilstand (`/admin/api/conversion`, `ConversionMeasurement.tsx`).
  - **Verificeret på det kode-komplette commit `a5f5e11d8e0aad033961aab52cc1e03ade01c012`**
    (denne SHA ændrer sig aldrig — efterfølgende commits på branchen er kun docs-opdateringer, som
    ikke rører kode/tests): `npm test` 836/836 (761 eksisterende + 75 nye) · `npm run
    typecheck` 0 fejl · `npm run lint` 0 fejl (2 kendte `<img>`-advarsler, uændret) · `npm run
    build` success · `git diff --check` ren · Vercel preview-check **pass** på eksakt head-SHA.
  - **Ingen migration anvendt, ingen secrets oprettet/ændret, ingen scheduler, ingen live
    HubSpot-kald, ikke merget.** Runbook til Gate B2/C/D:
    `docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md`.
- **Kendt driftsopfølgning (ikke en blocker):** production UI-smoketest af Fase 1C, 2, 3 og 4 er
  udsat (Ricko kan ikke teste lige nu).

## Seneste 3 relevante ændringer

1. **[PR #79](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/79) — Issue #78: Vision 3.0 Fase 5, Gate A, 2026-09-24.**
   Read-only datagrundlagsverifikation, afgjort `GO MED FORBEHOLD`. Merge-commit `644269a`. Docs-only.
2. **[PR #77](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/77) — Issue #76: Vision 3.0 Fase 4, salgsoversigt med målt kundeaktivitet, 2026-09-19.**
   Kompakt server-side DTO (`GET /admin/api/trips`), seks set-baserede pagineredes læsninger, kolonnerne
   Åbnet/Set/Kontakt/Seneste aktivitet, filtre/sortering/klient-side pagination, `not-measured`-tilstand.
   Ingen migration.
3. **[PR #75](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/75) — Docs: fast arbejdsform (`docs/WORKING_MODE.md`), checkpoint og Fase 4-beslutningsgrundlag,
   2026-09-19.** Docs-only.

Fuld historik: [lukkede/merged PR'er på GitHub](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls?q=is%3Apr+is%3Amerged).

## Åbne beslutninger / risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data.
- **Vercel preview er bag Vercel Authentication (SSO)** — render-verifikation sker lokalt
  (mod prod-DB) eller på production efter merge.
- **Storage bucket-config uden for drift-tjekket** (kendt blind vinkel).
- Repo er public — secrets/kundedata-disciplin er procesbåret, ikke teknisk håndhævet.
- **PR #81 (Gate B0+B1, Issue #80) afventer review og merge-godkendelse.** Se åbne beslutninger i
  PR-beskrivelsen og `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md`/`-GATE-B1-RUNBOOK.md`.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**Review og merge-godkendelse af PR #81** (Gate B0+B1, Issue #80). Derefter, separat: Gate B2
(kør migration 013 i production, Rickos eksplicitte godkendelse) → Gate C (aktivering: HubSpot-
secrets + scheduler) → Gate D (officiel målingsstart). Ingen produktkode/migration/secrets/
scheduler før hver gate er eksplicit godkendt — se `docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md`.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales Intelligence.
Master-issue/produktkapitel, IKKE én stor PR. Fase 5 (prospektiv konverteringsmåling) er placeret i
dette repo — server-side, ingen HubSpot i browseren; se `docs/DECISIONS.md` for begrundelsen.

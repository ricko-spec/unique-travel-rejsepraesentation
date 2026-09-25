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
  PR [#81](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/81) (Gate B0+B1)
  er **merget** (`c140e68`, production-deploy READY).
  - **Gate B2 gennemført** ([Issue #82](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/82)):
    migration 013 kørt i production 2026-09-24T19:34:06Z (`20260924193406_conversion_measurement`), fuld post-verifikation grøn, **0 rækker i alle
    tre tabeller**, schema-baseline opdateret (kun 013-objekter). **Intet aktiveret:** ingen singleton-
    seed, ingen secrets, ingen scheduler, ingen HubSpot-kald, ingen sync — admin viser fortsat
    "ikke startet". **Næste gate: Gate C** (se runbooken; forudsætter bl.a. stage-klassifikationen).
  - **Gate B0 (ADR):** arkitektur **A** valgt — direkte, read-only HubSpot-læsning i dette projekt,
    ingen Marketing Dashboard-afhængighed. Se `docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md`.
  - **Gate B1 (implementering uden aktivering):** `supabase/013_conversion_measurement.sql`
    (tre tabeller, anvendt ved Gate B2), ren klassifikationsmotor
    (`src/lib/conversion/classify.ts`), fail-closed sync-motor (`syncEngine.ts`, "fuld kilde eller
    ingen commit af kørslen"), HubSpot-adapter-KONTRAKT + fixture (ingen live klient/kald),
    small-cell + komplementær privacy-undertrykkelse (`aggregate.ts`), admin-API/-UI i fail-closed
    "ikke startet"-tilstand (`/admin/api/conversion`, `ConversionMeasurement.tsx`).
  - **Review-runde 1 (Codex, 7 fund, DO NOT MERGE på `a8f08fc`) rettet samlet** — se PR-kommentaren
    og ADR rev. 2: (1) prospektiv snapshot-kvalifikation uden historik + versioneret stage-kontrakt
    (fail-closed `CONTRACT_INCOMPLETE` indtil Gate C), (2) transaktionelle sync-RPC'er med lease,
    generation og DB-håndhævede frys-regler, (3) blok-baseret privacy (ingen lille celle/komplement
    kan udledes, heller ikke dag-for-dag), (4) komplet paginerede Supabase-læsninger, (5)
    konflikt-reconciliation for delte bookingreferencer, (6) wire-DTO med ISO-strenge, (7) én
    udfaldssandhedstabel. Testresultater og head-SHA: se PR #81 (hardkodes ikke her).
  - **Review-runde 2 (Codex-review 5308506532 på `198101b`) rettet:** booking før første
    kvalificerede observation udelukkes fail-closed (reducer + DB-CHECK + aggregering);
    30/60/90-undertrykkelse koordineret via hierarkiske publiceringsblokke; modning er igen pr. deal
    (Issue #80) — privacy ligger kun i publiceringslaget (ADR rev. 3).
  - **Ingen secrets oprettet/ændret, ingen scheduler, ingen live HubSpot-kald, ingen sync.**
    Runbook til Gate C/D: `docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md`.
- **Kendt driftsopfølgning (ikke en blocker):** production UI-smoketest af Fase 1C, 2, 3 og 4 er
  udsat (Ricko kan ikke teste lige nu).

## Seneste 3 relevante ændringer

1. **Gate B2 (Issue #82), 2026-09-24:** migration 013 anvendt i production (`20260924193406_conversion_measurement`), 0 rækker, intet
   aktiveret; baseline + docs i separat PR.
2. **[PR #81](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/81) — Issue #80: Gate B0+B1, 2026-09-24.**
   Prospektiv konverteringsmåling uden aktivering (kode, migrationsfil, tests, CI). Merge-commit `c140e68`.
3. **[PR #79](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/79) — Issue #78: Vision 3.0 Fase 5, Gate A, 2026-09-24.**
   Read-only datagrundlagsverifikation, afgjort `GO MED FORBEHOLD`. Merge-commit `644269a`. Docs-only.

Fuld historik: [lukkede/merged PR'er på GitHub](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls?q=is%3Apr+is%3Amerged).

## Åbne beslutninger / risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data.
- **Vercel preview er bag Vercel Authentication (SSO)** — render-verifikation sker lokalt
  (mod prod-DB) eller på production efter merge.
- **Storage bucket-config uden for drift-tjekket** (kendt blind vinkel).
- Repo er public — secrets/kundedata-disciplin er procesbåret, ikke teknisk håndhævet.
- **Gate B2-PR (Issue #82) afventer review og merge-godkendelse.** DB-migrationen er allerede
  anvendt; PR'en indeholder kun baseline og docs. Backup/PITR-status var ikke synlig for agenten
  (accepteret forbehold for den additive migration).
- **GitHub Actions (PR #81):** `.github/workflows/ci.yml` kører test, typecheck, lint og build på
  pull requests (`contents: read`, ingen secrets, ingen deploy). Findes på `main` siden PR #81.
- **Privacy-beslutning (Ricko, 2026-09-24):** risikoen ved sent opdagede delte bookingreferencer i
  konverteringsmålingen er accepteret for den interne admin-visning — se `docs/DECISIONS.md`.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**Gate B2 er gennemført og merget** (PR #83). **Aktivt: Gate C1** ([Issue #84](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/84)) —
stagekontrakt v3 (alle 18 live-stages), snæver read-only HubSpot-adapter og én write-free
operatør-dry-run; se `docs/VISION-3.0-PHASE-5-GATE-C1.md`. Live-forsøg 1 fejlede sikkert
(`PRECHECK_FAILED`, 0 skrivninger); tællingen er nu kategorisk. Live-forsøg 2 er **PASS** (2.652
observeret, 0 skrivninger, DB uændret — se gate-dokumentet §5). Næste: review
af Gate C1-PR'en. Permanent aktivering (secrets, seed, cron, versionsløft, Gate D) kræver
separate godkendelser.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales Intelligence.
Master-issue/produktkapitel, IKKE én stor PR. Fase 5 (prospektiv konverteringsmåling) er placeret i
dette repo — server-side, ingen HubSpot i browseren; se `docs/DECISIONS.md` for begrundelsen.

# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-25 (Gate C1 — stagekontrakt v3 + write-free dry-run, Issue #84)

## Gate C1 (Issue #84) — branch `feat/gate-c1-hubspot-dry-run-84`

- Live read-only stage-metadata (18 stages) hentet af Ricko; kontrakt v3 komplet (se
  `docs/VISION-3.0-PHASE-5-GATE-C1.md`). Snæver adapter, write-free operatør-dry-run, tests og
  mutationstest grønne. **Udestående:** Rickos live dry-run, review; intet aktiveret, ikke merget.

## Branch / HEAD

- **Production `main`:** `c140e681ff333204f7addf58b068d29d294159ed` (merge af PR #81 — Gate B0+B1),
  production-deploy READY.
- **Gate B2 (Issue #82):** branch `chore/gate-b2-migration-013-82` fra `c140e68` — kun baseline + docs.
  Head-SHA og CI står i PR'en. **Ikke merget.**

## Færdigt (Gate B2)

- Preflight PASS: ingen drift, ingen 013-objekter, migrationshistorik 010–012 1:1, deploy READY.
- Migration 013 anvendt præcis én gang: `20260924193406_conversion_measurement`, SQL byte-identisk med filen.
- Post-verifikation grøn (skema, RLS, policies, grants, RPC'er, triggere, indekser), **0 rækker**.
- Advisors: ingen nye sikkerhedsfund; 3 nye INFO "unused index" på de tomme 013-tabeller (forventet).
- Schema-baseline opdateret fra live (kun 013-objekter, +606/−0); drift-tjek bagefter: ingen drift.
- Forbehold: backup/PITR-status ikke synlig for agenten (accepteret af Ricko); drift-tjek kørt som
  dokumenteret MCP-ækvivalent (ingen service-role-nøgle i worktree).

## Færdigt (review-runde 3, Codex-review 5308827224)

- Rickos eksplicitte accept af den begrænsede konflikt-differensrisiko dokumenteret (DECISIONS,
  ADR, runbook) — ingen snapshots.
- Trendtabellen: unik, stabil `periodIndex` som React-nøgle og etiket ("Periode n"); regressionstest
  med to lukkede blokke i samme måned.
- Minimal GitHub Actions-workflow (`.github/workflows/ci.yml`); status på eksakt head står i PR'en.

## Færdigt (review-runde 2)

- Booking før første kvalificerede observation ⇒ `BOOKED_BEFORE_QUALIFIED_OBSERVATION` (reducer,
  DB-CHECK, aggregering), med røde→grønne regressionstests og pglite 90/90.
- Koordineret 30/60/90-undertrykkelse via hierarkiske publiceringsblokke; egenskabstest på tværs af
  vinduer og dage.
- Modning igen pr. deal (Issue #80); månedsmodning trukket tilbage efter Rickos instruks.

## Færdigt (review-runde 1)

1. **Prospektiv kvalifikation uden historik:** adapteren leverer kun aktuelt snapshot; versioneret
   stage-kontrakt (`CONTRACT_VERSION` 2); baseline ⇒ PRE_START/PENDING; kohortestart = `observedAt`.
2. **Atomisk persistence:** tre RPC'er i migration 013 (begin/commit/fail) med lease, unikt
   RUNNING-indeks, advisory lock, `sync_generation`; DB-triggere håndhæver frosne felter og
   "kun skrivning i commit". Verificeret mod pglite (87/87 + SQL-mutationer).
3. **Privacy:** blok-baseret (månedsmodningen herfra er erstattet af modning pr. deal i runde 2); ingen lille celle/komplement kan udledes (egenskabstest
   over 150 dage); sekundær undertrykkelse af tælletal.
4. **Komplette læsninger:** `trips` og hele kohorten via `paged-read.ts`; ingen `.in(...)`.
5. **Delte bookingreferencer:** konflikt-reconciliation (`booking_conflict_detected_at`), alle
   berørte deals ude af publicerbare tal.
6. **Wire-DTO** (ISO-strenge + zod) + komponent/route-test af de fire UI-tilstande.
7. **Én udfaldssandhedstabel** (kun `unique_travel_dealstatus` ⇒ BOOKED).
- Docs: ADR rev. 2, runbook, STATUS, DECISIONS, ROADMAP, SYSTEM-ARKITEKTUR, TESTING, supabase/README.

## Udestående

0. **Review og merge af Gate B2-PR'en** (kun baseline/docs). Derefter **Gate C**.

1. ~~Merge af PR #81~~ — merget (`c140e68`).
2. ~~Gate B2~~ — gennemført (Issue #82).
3. **Gate C-forudsætning:** klassificér pipelinens øvrige stages fra live-metadata (Ricko), udfyld
   `PIPELINE_STAGE_CONTRACT`, `complete: true`, bump kontraktversion. Byg rigtig HubSpot-adapter.
4. **Gate C/D** — secrets, cron, dry-run, officiel baseline. Ikke startet.
5. CI-workflowet kører på pull requests; det bliver en del af `main` ved merge af PR #81.

## Næste handling

Afvent Rickos re-review af PR #81. Ingen merge, migration, secrets, scheduler eller live
HubSpot-kald før hver er eksplicit godkendt.

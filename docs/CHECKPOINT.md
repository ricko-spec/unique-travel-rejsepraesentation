# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-24 (PR #81 review-runde 2 — Codex-review 5308506532 rettet)

## Branch / HEAD

- **Production `main`:** `644269aaf4d534ae3f21379df940a4f822a55c7c` (merge af PR #79 — Gate A).
- **Gate B0+B1 (Issue #80):** branch `feat/gate-b0-b1-conversion-measurement-80`; PR
  [#81](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/81). Reviewet head
  var `a8f08fc` (runde 1: 7 fund) og `198101b` (runde 2: 2 blokerende + 1 designfund). Rettelserne ligger i efterfølgende commits — den
  aktuelle head-SHA og testresultater står i PR-beskrivelsen (hardkodes bevidst ikke her).
  **Reviewklar igen, ikke merget.**

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

1. **Re-review og merge-godkendelse af PR #81** — Rickos eksplicitte OK.
2. **Gate B2** — migration 013 i production + schema-baseline (separat godkendelse).
3. **Gate C-forudsætning:** klassificér pipelinens øvrige stages fra live-metadata (Ricko), udfyld
   `PIPELINE_STAGE_CONTRACT`, `complete: true`, bump kontraktversion. Byg rigtig HubSpot-adapter.
4. **Gate C/D** — secrets, cron, dry-run, officiel baseline. Ikke startet.
5. GitHub Actions findes ikke i repoet — kun Vercel-check på GitHub. Evt. separat beslutning.

## Næste handling

Afvent Rickos re-review af PR #81. Ingen merge, migration, secrets, scheduler eller live
HubSpot-kald før hver er eksplicit godkendt.

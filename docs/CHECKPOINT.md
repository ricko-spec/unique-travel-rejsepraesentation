# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-28 (Gate D forberedt, Issue #89)

## Branch / HEAD

- **Production `main`:** `a1dd164509700d7d692ceffeadaba0105e21a5f6` (merge af PR #88), deploy success.
- **Gate D:** branch `feat/gate-d-activation-89` fra `a1dd164`. Head-SHA og CI står i PR'en. **Ikke merget.**

## Production-tilstand (uændret i Gate D)

Migration 013 + 014 anvendt; 0/0/0 rækker; ingen singleton-række; `contract_version`-default 3;
ingen conversion-secrets, ingen cron. Admin viser "Målingen er ikke startet".

## Færdigt (Gate D, kode + docs)

- `src/lib/conversion/syncRoute.ts` + `src/app/api/internal/conversion/sync/route.ts`: GET, Bearer
  `CRON_SECRET` (genbrugt konstant-tids-helper fra Analytics Bridge), kun `VERCEL_ENV=production`,
  secrets før I/O, `runConversionSync`, kun kategorisk svar/log, `maxDuration` 300.
- `scripts/operator/Invoke-ConversionSync.ps1`: SecureString, ét kald, kun kategorisk output.
- Admin: `lastRun` i wire-DTO'en (status, tider, fejlkode, observeret total — 1–9 skjult) og
  `LastRunNotice` (fejlboks ved FAILED, også mens målingen afventer baseline).
- Tests: `syncRoute.test.ts` (36), admin-tests for seneste kørsel, pglite-test af hele
  aktiveringssekvensen (seed → ACTIVE → mislykket baseline → dobbelt begin → baseline → PAUSED).
- Runbook § Gate D (D0–D6, stopbetingelser, rollback, forventet admin, 30/60/90 + privacy).

## Udestående (KRÆVER RICKO, i rækkefølge)

D0 merge → D1 secrets (Production) → D2 preflight → D3 seed → D4 `ACTIVE` → D5 baseline via
wrapperen → D6 cron-PR (`vercel.json`). Se runbooken.

## Næste handling

Afvent Rickos review af Gate D-PR'en. Ingen secrets, seed, `ACTIVE`, baseline, cron, production-write
eller merge før hvert trin er eksplicit godkendt.

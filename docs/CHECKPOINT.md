# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-28 (Gate D: D0–D5 gennemført, D6 cron-PR i review — Issue #89)

## Branch / HEAD

- **Production `main`:** `0722653d022bfbf3c0c739c1f497064df0aeb379` (merge af PR #90), deploy success.
- **D6:** branch `feat/gate-d6-cron-89` fra `0722653`. Head-SHA og CI står i PR'en. **Ikke merget.**

## Production-tilstand (efter D5)

`conversion_measurement_state`: `ACTIVE`, kontrakt 3, `measurement_started_at` = `last_successful_sync_at`
= 2026-09-28T15:36:05.111Z, `sync_generation` 1. Én `SUCCEEDED` baseline-kørsel (2.690 observeret,
0 optaget). Kohorte 2.690 rækker (2.522 `PRE_START_EXISTING`, 168 `ELIGIBLE_PENDING`). Ingen cron endnu.
Detaljer og verifikation: kommentarerne på Issue #89.

## D6 (denne PR)

- `vercel.json`: én cron, GET `/api/internal/conversion/sync`, `0 3 * * *` (UTC; Hobby: 03:00–03:59).
- `cronConfig.test.ts`: kun én cron, rigtig route med CRON_SECRET-handler, Hobby-gyldigt dagligt udtryk,
  STALE (36 t) > værste rettidige afstand (25 t) og < én udeblevet kørsel (48 t).
- `syncRoute.test.ts`: dublet-levering efter hinanden er idempotent.
- Runbook D6: Vercel-fakta, kontrol efter merge, overvågning, opdagelse af manglende sync, pause
  (Disable Cron Jobs / `PAUSED`; Instant Rollback stopper ikke cron).

## Næste handling

Afvent Rickos review af D6-PR'en. Efter merge: read-only kontrol af Cron Jobs i Vercel og af første
daglige kørsel næste morgen. Ingen manuel sync, ingen dataændring uden eksplicit godkendelse.

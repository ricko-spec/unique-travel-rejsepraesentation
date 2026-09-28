# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-28 (migration 014 anvendt i production, Issue #86)

## Branch / HEAD

- **Production `main`:** `a11516aae749dc50263219bebd97a671144d3079` (merge af PR #87 — Gate C2),
  Vercel production-deploy success (deployment `6707427534`).
- **Denne ombæring:** branch `chore/gate-c2-apply-014-86` fra `a11516a` — kun baseline + docs.
  **Ikke merget.**

## Færdigt (anvendelse af 014)

1. Drift-kontrol (MCP-ækvivalent, Rickos godkendelse) 2026-09-28 10:24:03 UTC: 287/287 elementer
   identiske med baseline `d672a22…` på `a11516a`; fingerprint `453e5ad9c9d4…1777`. Kommentar på Issue #86.
2. Preflight 10:30 UTC: samme fingerprint, 0/0/0 rækker, 14 migrationer (senest 013), ingen cron.
3. Anvendt præcis én gang: `20260928103248_conversion_post_enrollment_v3` via MCP `apply_migration`. Lagret SQL sha256 =
   filens sha256 `291ead2e9ff2e26a1ecbcd8a858522df1bda9350142491ef839b19c7fbad164c`.
4. Post-verifikation (10:33 UTC) grøn: 15 migrationer; to nullable kolonner; 5 CHECKs validerede;
   triggere `conversion_deal_cohort_post_enrollment_guard` (BEFORE DELETE OR UPDATE) og
   `conversion_deal_cohort_truncate_guard` (BEFORE TRUNCATE) aktive; `conversion_commit_sync_run_v3`/
   `conversion_parse_batch_v3` SECURITY INVOKER, fast `search_path`, EXECUTE kun `service_role`;
   013's `conversion_commit_sync_run`/`conversion_parse_batch` uden EXECUTE for `service_role` (og
   anon/authenticated); nye triggerfunktioner uden EXECUTE for nogen API-rolle; table grants og RLS
   uændrede (kun `service_role` SELECT/INSERT/UPDATE, én policy pr. tabel); default
   `contract_version` = 3; rækker 0/0/0 (ingen singleton-række), trips 294 og profiles 8 uændrede;
   intet `cron`-schema.
5. Baseline regenereret fra det verificerede skema (+78/−3: kun 014-objekter, to ændrede kommentarer
   og default 2 → 3); drift-tjek mod den nye baseline: ingen drift, fingerprint `939d1c9014de…41d6`.

## Udestående

1. Review og merge af baseline-/docs-PR'en.
2. Aktivering (secrets, singleton-seed, cron, `ACTIVE`) og Gate D — separate godkendelser.
3. Den write-free operatør-dry-run kan igen køres (skemaet matcher nu koden), men kræver ny godkendelse.

## Næste handling

Afvent Rickos review af PR'en. Ingen merge, seed, secrets, scheduler, sync, `ACTIVE`, HubSpot-kald
eller Gate D før hver er eksplicit godkendt.

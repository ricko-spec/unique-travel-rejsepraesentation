# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-28 (Gate C2 — migration 014 og databasekontrakt v3, Issue #86)

## Gate C2 ([Issue #86](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/86)) — branch `feat/gate-c2-migration-014-86`

- Grundlag: `main` = `487fa64` (merge af PR #85, Gate C1). Issue #84 er fortsat åben (lukkes ikke i C2).
- `supabase/014_conversion_post_enrollment_v3.sql` — **fil, IKKE anvendt**: kolonnerne
  `post_enrollment_exclusion_reason`/`post_enrollment_excluded_at`, 5 CHECKs, frys-/slet-/truncate-
  triggere, `conversion_commit_sync_run_v3` + `conversion_parse_batch_v3`, 013-skrivevejen mister
  EXECUTE for service_role, kontraktløft 2 → 3 (default + kun en ikke-startet singleton; startet
  måling under anden version ⇒ tydelig fejl, intet ændres).
- `supabase/rollback/014_conversion_post_enrollment_v3_rollback.sql` — verificeret rollback
  (katalog = ren 013); afbryder ved markerede rækker eller startet måling.
- App: `persistence.ts`/`adminServer.ts` deler `COHORT_COLUMNS` (inkl. markering), v3-RPC,
  fail-closed mod et 013-skema. Fail-closed-værnet fra C1 (afvis enhver markering) er erstattet.
- Tests: `migration014.sql.test.ts` (pglite 0.5.8, ny devDependency, kører i CI), SQL- og
  TS-mutationstest — tal i `docs/TESTING.md` og PR'en.

## Udestående

1. Review af Gate C2-PR'en (ikke merget).
2. **Fuld schema-drift-kontrol mod production** (kræver `.env.local`/production-adgang) — SKAL være
   bestået før 014 anvendes. Agentens ene read-only opslag 2026-09-28: 0/0/0 rækker, 14 migrationer,
   intet `cron`-schema.
3. Anvendelse af 014 i production + `--update-baseline` (separat godkendelse).
4. Aktivering (secrets, seed, cron, `ACTIVE`, baseline-sync, Gate D) — separate godkendelser.

## Næste handling

Afvent Rickos review af Gate C2-PR'en. Ingen merge, migration, Supabase-write, secrets, seed,
scheduler, `ACTIVE` eller live HubSpot-kald før hver er eksplicit godkendt.

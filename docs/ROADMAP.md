# ROADMAP

Prioriteret. **GitHub issues er backlog-sandheden** — ikke en ekstern fil. Lukkede punkter og
deres begrundelse står i merged PR'er (se `docs/STATUS.md` for links), ikke gengivet her.

## Lukket (seneste)

- Sikkerhedsbatch, password-flow, destinations-upload, DB-versionering (migrationer 001-008)
  + mekanisk schema-drift-check — se `docs/SYSTEM-ARKITEKTUR.md`
- `trips.created_by` ved oprettelse + `parse_failures` dead-letter-logging (PR #5)
- Egentlig test-suite (Vitest, `npm test`, >130 tests) — se `docs/TESTING.md`
- Pæn dansk fejlbesked ved ugyldig PDF (PR #23)
- Vision 2.0 fase 1-3: hero, timeline, hoteller (PR #27, #29, #31)
- README nævner nu AGENTS.md/CLAUDE.md-strukturen (var åbent punkt, løst)

## Næste

1. **[Issue #30](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/30) —
   projekt-refresh** (denne PR): GitHub som sandhed, kortere docs, AI-workflow-opstramning
2. **Vision 2.0 fase 4** — billeder: galleri-polish + `next/image` (lukker PERF-3)
3. **Drift, ingen kode:** Mille opretter Japan/Kenya/Mauritius + uploader billeder i production

## Senere

**Vision 2.0 fase 5** — pris, praktisk info, CTA og mobil-polish. Detaljer: `docs/VISION-2.0-PLAN.md`.

## Backlog (uprioriteret — se GitHub Issues for fuld liste)

- **Hotel-website-links** på trip-detalje-siden — handoff klar (`handoff-hotel-links.md`)
- **Vandflyver-tag** — dedikeret markør/ikon for vandflyver-transfers (transport-chips blev
  bevidst fjernet fra hotel-elementer i PR #24; ønsket er et visuelt løft, ikke ny information)
- **Storage bucket-config i drift-tjekket** — udvid drift-scriptet til `storage.buckets`
  (kendt blind vinkel)
- **Supabase custom SMTP** — fjerner Supabase' delte mail-rate-limit på recovery-/system-mails
- **`parse_failures`-oprydning** — pg_cron-job der sletter rækker > 30 dage
- Småting: ERR-1 (max_tokens-detektion), ERR-3 (fejltilstand i trips-listen),
  PERF-1 (trim dashboard-select), SEC-4 (rate-limit + magic bytes på parse),
  SEC-6 (envDiagnostics ud af fejlsvar), PAIN-1 (deploy-SHA i admin-footer),
  staging-oprydning som rigtig cron

## Skal besluttes af Ricko

- **Unlock-kode ≠ booking_no?** — sikkerheds-/UX-afvejning
- **Slug-override-feltet i admin** — har aldrig virket (serveren ignorerer det); fjern eller
  gør funktionelt
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop

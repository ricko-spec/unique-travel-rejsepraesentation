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
- **Projekt-refresh — GitHub som sandhed, kortere docs**
  ([Issue #30](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/30), PR #33)
- **Vision 2.0 fase 4** — billeder: galleri-polish + `next/image`, lukker PERF-3
  ([Issue #34](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/34), PR #35)
- **Vision 2.0 fase 5 — pris, praktisk info, CTA og mobil-polish. Vision 2.0 afsluttet
  (fase 1-5 alle live)**
  ([Issue #36](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/36), PR #37)
- **[Issue #38](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/38) —
  Brugsoverblik / 100% upload-tracking pr. sælger.** Migration 009 kørt og verificeret i
  production, kode merget/deployet (PR #39).
- **[Issue #40](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/40) —
  Vision 2.0 finishing touch: desktop progress navigation (≥1180px).** Merget til main
  (PR #42). Rent frontend/CSS, ingen DB/migration involveret.

## Næste

1. **[Issue #43](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/43) —
   Vision 3.0 fase 1: design af eventmodellen.** **Docs-only PR** — designet ligger i
   `docs/VISION-3.0-EVENT-MODEL.md` (sessiondefinition, datamodel-skitse, privacy-grænser,
   admin/preview/bot-gate, concurrency, retention, fase 1B-plan). Ingen migration, ingen kode.
   Afventer Rickos review + de fem KRÆVER RICKO-punkter i dokumentets §14.
2. **Fase 1B — opsamlingen bygges.** `supabase/010_customer_sessions.sql` (tabel + RLS +
   indexes + `record_customer_session`/`trip_session_summary` + pg_cron-retention),
   `src/lib/customer-session.ts` + tests, udvidet middleware-matcher til kundesider, ét
   best-effort kald i `src/app/[bookingId]/page.tsx`. Fail-open: kode og migration kan
   deployes i vilkårlig rækkefølge (modsat #38). Visning i admin er fase 1C/4.
3. **[Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) —
   Vision 3.0: Customer Engagement & Sales Intelligence.** Master-issue — IKKE én stor PR.
   Fase 2-4 (sektionsengagement, kontakt-intent, salgsoversigt) tages ét PR ad gangen efter
   fase 1B.
4. **Drift, ingen kode:** Mille opretter Japan/Kenya/Mauritius + uploader billeder i production

Herudover intet forudbestemt. Punkter efter #41-fase 1 vælges af Ricko fra backloggen nedenfor
eller GitHub Issues.

## Backlog (uprioriteret — se GitHub Issues for fuld liste)

- **Hotel-website-links** på trip-detalje-siden — handoff klar (`handoff-hotel-links.md`)
- **Vandflyver-tag** — dedikeret markør/ikon for vandflyver-transfers (transport-chips blev
  bevidst fjernet fra hotel-elementer i PR #24; ønsket er et visuelt løft, ikke ny information)
- **Storage bucket-config i drift-tjekket** — udvid drift-scriptet til `storage.buckets`
  (kendt blind vinkel)
- **Supabase custom SMTP** — fjerner Supabase' delte mail-rate-limit på recovery-/system-mails
- **`parse_failures`-oprydning** — pg_cron-job der sletter rækker > 30 dage
- Småting: ERR-1 (max_tokens-detektion), ERR-3 (fejltilstand i trips-listen),
  PERF-1 (trim dashboard-select), SEC-4 (rate-limit på parse — magic-byte-delen
  landet i Issue #38-PR'en: `isPdf()` i `src/lib/file-sniff.ts`),
  SEC-6 (envDiagnostics ud af fejlsvar), PAIN-1 (deploy-SHA i admin-footer),
  staging-oprydning som rigtig cron

## Skal besluttes af Ricko

- **Unlock-kode ≠ booking_no?** — sikkerheds-/UX-afvejning
- **Slug-override-feltet i admin** — har aldrig virket (serveren ignorerer det); fjern eller
  gør funktionelt
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop

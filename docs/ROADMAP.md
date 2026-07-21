# ROADMAP

Prioriteret. Fuld backlog-detalje med severity/estimat: `OPGAVER-TIL-CLAUDE-CODE.md`
(Cowork-mappen, uden for repo). Numre (#N) refererer dertil.

## Lukket (2026-06/07)

- Sikkerhedsbatch SEC-1/SEC-2/SEC-3/DATA-1 + central writeAudit
- Password-skift med nuværende-kode-verifikation, rate-limit og audit
- Destinations-upload: signed URL, `_staging`, finalize, 50 MB, WebP (sharp)
- "Opret destination" i admin + rettet hjælpetekst
- DB-versionering (migrationer 001-008) + mekanisk schema-drift-check
- `docs/SYSTEM-ARKITEKTUR.md` (komplet + ajourført)

## Næste

1. **AI Project Automation Kit-dokumentation** — denne branch (`docs/ai-operating-model`);
   godkendelse + merge er sidste skridt
2. **Drift, ingen kode:** Mille opretter Japan/Kenya/Mauritius + uploader billeder i production
3. **Vision 2.0 PLAN** — scope-afklaring med Ricko (KRÆVER RICKO), derefter plan-dokument

## Senere (afventer Vision 2.0-planen)

- **Vision 2.0 PREVIEW** — implementering på preview-branch, testes af Ricko/sælgere før merge
  (jf. beslutning 2026-07-21)

## Backlog (klar til at tage, prioriteret bud)

- **#5 `created_by` ved trip-oprettelse** — DB-siden klar (migration 006); én linje i upsert + UI senere
- **#6 `parse_failures`-integration** — dead-letter-tabellen (007) er klar; insert i parse-routens fejlgrene + oprydnings-job
- **Hotel-website-links** på trip-detalje-siden — handoff klar (`handoff-hotel-links.md`)
- **TEST-1: egentlig test-suite** — Vitest + JSON-salvage/Zanzibar-routing/dato-tests; kendt hul (ingen tests overhovedet)
- **PERF-3: billed-performance** — `next/image` på hero/galleri (de 4 kendte lint-warnings)
- **Storage bucket-config i drift-tjekket** — udvid `schema_snapshot()`/scriptet til `storage.buckets` (lukker den kendte blinde vinkel)
- Småting: ERR-1 (max_tokens-detektion), ERR-3 (fejltilstand i trips-listen), PERF-1 (trim dashboard-select), SEC-4 (rate-limit + magic bytes på parse), SEC-6 (envDiagnostics ud af fejlsvar), PAIN-1 (deploy-SHA i admin-footer), staging-oprydning som rigtig cron

## Skal besluttes af Ricko (blokerer det de står foran)

- **Vision 2.0 scope/indhold** — blokerer plan og preview
- **Unlock-kode ≠ booking_no?** (#21) — sikkerheds-/UX-afvejning
- **Slug-override-feltet** — fjern eller gør funktionelt (har aldrig virket)
- **`stash@{0}` image-library WIP** — genoptag, flyt til branch, eller drop
- **Sletning af merged branches** — oprydning afventer OK
- **README-opdatering** — README nævner ikke AGENTS/kit-strukturen endnu (forslag, se STATUS)

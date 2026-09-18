# TESTING — strategi og kommandoer

## Automatiske checks

```bash
npm ci                                 # ALTID først på frisk checkout (sharp er dependency)
npm test                               # vitest run — >300 tests i src/lib/*.test.ts
npm run typecheck                      # tsc --noEmit — skal være grøn før push
npm run lint                           # 0 fejl kræves; 6 kendte no-img-element-warnings er OK (PERF-3)
npm run build                          # ved ændringer i routes/config/deps (skriver .next lokalt)
node scripts/check-schema-drift.mjs    # ved alt DB-arbejde; exit 0 = ingen drift (kræver .env.local)
```

Vitest-suiten dækker bl.a. JSON-salvage/normalisering (`normalize-trip`), dato-formatering,
hotel-alternativer, room-allocations, transport-chips, destination-matching og
parse-fejl-klassificering — se `src/lib/*.test.ts`.

## Testniveau efter ændringstype

Kør ikke mere end ændringen kræver:

- **Docs-only:** ingen af ovenstående — `git diff --check` er nok.
- **Ren lib/logik** (`src/lib/*.ts`): `npm test` + `npm run typecheck`.
- **Komponent/route:** + `npm run lint` + `npm run build`.
- **DB-arbejde:** + `node scripts/check-schema-drift.mjs`.
- **Visuel ændring på kundesiden:** targeted browsermåling på de testbookinger opgaven
  navngiver — ikke hele viewport-/bookingsmatrixen, medmindre opgaven eksplicit kræver det.

## Hvornår testes hvor

- **Preview (branch-push):** al funktionel test af nye ændringer sker HER, før Rickos merge-OK.
  Kræver Vercel-login (deployment protection).
- **Production:** kun røgtest efter merge (login, én sidevisning) + ren drift (Milles billeduploads,
  rigtige præsentationer). Aldrig eksperimenter.
- ⚠️ **Preview = production-data.** Preview-deploys peger på produktions-DB og -Storage.
  En trip/destination/et billede oprettet under test er ÆGTE. Ryd op efter test (deaktivér test-trips),
  og husk: et password-skift i preview er et rigtigt password-skift.
- Rate-limit-tests (11+ forsøg) låser den fælles kontor-IP i op til 15 min — test til sidst
  eller fra andet netværk.

## Manuel testliste pr. område

**Admin generelt:** login (audit: `login_success`) · log ud/ind · forkert kode afvises.
**PDF-upload/parse:** upload TravelWire-PDF → parse-preview vises → Opret → link-boks + mail-tekst →
re-upload af samme booking varsler "opdateres" og genbruger slug. QA-siden (`/admin/qa/{slug}`)
viser råtekst vs. JSON.
**Kundeside:** `/{slug}` → AccessGate → forkert kode afvises (audit) → korrekt kode åbner →
hero/tidslinje/hoteller/pris/CTA renderer · deaktiveret trip giver not-found · manglende
billeder falder pænt tilbage (gradient / skjult galleri).
**Intro-editor:** redigér → gem → vises på kundesiden · "Gendan AI-tekst" · to faner samtidig →
409 + "Genindlæs siden"-knap · audit-rækken indeholder kun længder/fingerprints.
**Password-flow:** forkert nuværende kode afvises · korrekt skift → log ind med ny kode ·
audit `password_changed` uden kode-værdier.
**Destinations-upload:** opret destination (dublet afvises case-insensitivt) · upload stort
original-JPEG (8-15 MB) → "Behandler billede..." → WebP vises · galleri-slot · ikke-billede
afvises med klar fejl · `_staging/` er tom bagefter.
**Kundeåbning/trip_visits (Issue #65):** `src/lib/trip-visit.ts` er dækket af unit-tests
(gate-logik: env, host, bot-UA, admin-cookie).

**Production-schema-verifikation efter migration 010 (2026-09-18, read-only, ingen
writes/RPC-kald):** `public.trip_visits` findes med de seks forventede kolonner (typer,
nullability og defaults matcher migrationen), primærnøgle `trip_id`, FK til
`trips(id) on delete cascade`, RLS aktiveret (`pg_class.relrowsecurity = true`), én
policy (`service_role full access trip_visits`, `cmd=ALL`), index
`trip_visits_last_opened_idx` + PK-index, `record_trip_visit(uuid)` findes med
`prosecdef = false` (bekræfter `SECURITY INVOKER`) og `EXECUTE` kun grantet til
`service_role` (+ ejeren `postgres` — ingen `anon`/`authenticated`/`PUBLIC`). Row count:
0 (ingen kunstige testevents oprettet, ingen reel trafik endnu da koden ikke er
deployet). Selve RPC'en er stadig ALDRIG kaldt — hverken lokalt eller i production.

**Manuel smoke-test EFTER release-cutover + deploy (plan, IKKE udført endnu):**
1. Åbn en eksisterende rejseplan som kunde med korrekt adgang.
2. Vent 1-2 minutter.
3. Verificér read-only i `trip_visits`: rækken findes for trippens `trip_id`,
   `first_opened_at`/`last_opened_at` er sat, `visit_count = 1`, `open_count >= 1`.
4. Genindlæs siden inden for 30 minutter: `visit_count` forbliver 1, `open_count` stiger.
5. Ingen synlig fejl eller ekstra latens på kundesiden under nogen af trinene.

## Efter enhver testrunde

Rapportér resultater ærligt (også røde), opdatér `docs/STATUS.md`, og ryd test-data op.

# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-19**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 + **Vision 3.0 Fase 1B (kundeåbninger), 1C ("Kundeaktivitet"), Fase 2
  (sektionsengagement, migration 011) og Fase 3 (kontakt-intent, migration 012, PR #74) live.** Fase 3-koden blev
  live i production 2026-09-19T08:21:19Z. Aktuel main/deploy verificeres i GitHub/Vercel (denne fil hardcoder
  bevidst ikke en SHA — den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Aktivt kapitel:** [Issue #76](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/76) — **Vision 3.0 Fase 4: salgsoversigt med målt kundeaktivitet**
  (barn af [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)). Branch `feat/sales-overview-76`; PR: se Issue #76/GitHub. **Ikke merget.**
  Sælgeren kan på under ét minut se, hvilke aktive rejseforslag der har *målt* kundeaktivitet (åbnet, sektioner nået,
  telefon/email klikket) og sortere/filtrere til opfølgning — uden at systemet fortolker aktiviteten. Se
  `docs/VISION-3.0-PHASE-4-PLAN.md` (godkendt af Ricko 2026-09-19) og `docs/SYSTEM-ARKITEKTUR.md` § "Salgsoversigten".
  - **Kompakt server-side DTO** (`GET /admin/api/trips`): browseren modtager aldrig `data`, `raw_pdf_text` eller
    `created_by`. Målt mod produktion (read-only, 2026-09-19): 267 rejseplaner ⇒ **≈ 112 KB** (≈ 125 KB ved 300) mod
    ≈ 3,1 MB før; **6 HTTP-læsninger** (én pr. kilde), ≈ 0,7 s; 0 ugyldige rejseplaner.
  - **Pagineret læsehjælper** (`paged-read.ts`, count-baseret): PostgRESTs 1000-rækkers grænse kan aldrig afkorte tavst;
    fejl/afkortning ⇒ "kunne ikke hentes", aldrig "ingen aktivitet".
  - **Kolonnerne Åbnet / Set / Kontakt / Seneste aktivitet**; filtre (Aktivitet, Mine/Alle, Vis deaktiverede) + den
    eksisterende søgning; default = aktive, seneste aktivitet først. **`not-measured`**: rejseplaner oprettet før
    åbningsmålingen viser "Ingen åbning målt siden 18. september 2026" (ikke "Ikke åbnet endnu").
  - **Delt runtime-valideret `resolveEligibleSections`** (tripSchema → normalizeTrip) bruges af salgsoversigten, admin-
    detaljen og Fase 2-endpointet; ugyldig trip-data ⇒ "kunne ikke vurderes".
  - **`CONTACT_INTENT_TRACKING_SINCE = "2026-09-19T08:21:19Z"`** (Fase 3 production READY; cutover-metode B) sættes i denne PR og
    er aktiv i production først når PR'en er merget/deployet.
  - **Ingen migration, ingen nye tabeller, ingen ny tracking, ingen production-data oprettet.** `010b`/`pg_cron`: ikke
    kørt/aktiveret. Ingen ny adgangsmodel: alle indloggede sælgere ser fortsat alle rejseforslag ("Mine" er kun et filter).
  - **Release-gates:** Rickos PR-specifikke merge-godkendelse (ikke givet). Efter merge/deploy: autentificeret
    production-smoketest af listen (plan i `docs/TESTING.md`) — må ikke oprette kunstige events.
- **Kendt driftsopfølgning (ikke en blocker):** production UI-smoketest af Fase 1C, 2 og 3 er udsat (Ricko kan ikke teste
  lige nu).

## Seneste 3 relevante ændringer

1. **[PR #75](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/75) — Docs: fast arbejdsform (`docs/WORKING_MODE.md`), checkpoint og Fase 4-beslutningsgrundlag,
   2026-09-19.** Docs-only.
2. **[PR #74](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/74) — Issue #73: Vision 3.0 Fase 3, kontakt-intent, 2026-09-19.** Ny `trip_contact_intent`-tabel
   + RPC (migration 012, kørt/verificeret, baseline opdateret), `POST /[bookingId]/intent`, tracked mailto:/tel:-links,
   "Kontakt-intent" i admin, opdateret transparenstekst.
3. **[PR #72](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/72) — Issue #71: Vision 3.0 Fase 2, sektionsengagement, 2026-09-18.** Ny
   `trip_section_engagement`-tabel + RPC (migration 011), `POST /[bookingId]/engagement`, klient-tracker, "Set i
   rejseplanen" i admin.

Fuld historik: [lukkede/merged PR'er på GitHub](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls?q=is%3Apr+is%3Amerged).

## Åbne beslutninger / risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data.
- **Vercel preview er bag Vercel Authentication (SSO)** — render-verifikation sker lokalt
  (mod prod-DB) eller på production efter merge.
- **Storage bucket-config uden for drift-tjekket** (kendt blind vinkel).
- Repo er public — secrets/kundedata-disciplin er procesbåret, ikke teknisk håndhævet.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**Review af Fase 4-PR'en (Issue #76)** og Rickos PR-specifikke merge-godkendelse → merge/deploy → autentificeret
production-smoketest af salgsoversigten (blokerer ikke merge, hvis kode/checks er grønne). Ingen migration er nødvendig.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales Intelligence.
Master-issue/produktkapitel, IKKE én stor PR. Fase 5 (HubSpot-kobling, i Marketing Dashboard-projektet, ikke her) er
fortsat et fremtidigt, ikke påbegyndt kapitel.

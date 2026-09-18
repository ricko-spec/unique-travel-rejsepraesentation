# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-18**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 (brugsoverblik/upload-tracking) live.
  Aktuel main/deploy verificeres i GitHub/Vercel (denne fil hardcoder bevidst ikke en SHA —
  den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Landet siden sidst:** [Issue #40](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/40)
  — desktop progress navigation (≥1180px) er merget til main (PR #42, `94c561f` + review-fix
  `8097be1`). [Issue #43](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/43)
  — Vision 3.0 fase 1-design er merget (PR #44, `391bf42`), docs-only:
  `docs/VISION-3.0-EVENT-MODEL.md`. [Issue #63](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/63)/PR #64
  reviderede designet til Model B (cookie-fri), og Model B er sidenhen **valgt** af Ricko
  via Issue #65 — se punktet herunder, den gamle "afventer fem KRÆVER RICKO-punkter"-status
  er ikke længere gældende.
- **Aktivt kapitel:** [Issue #65](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/65)
  — Vision 3.0 Fase 1B: cookie-fri kundeåbninger (Model B, valgt via Issue #63/PR #64).
  Kode implementeret i PR #66 — `supabase/010_trip_visits.sql` (tabel +
  `record_trip_visit`-RPC), `src/lib/trip-visit*.ts`, `scheduleTripVisit()`-kald
  (waitUntil indeni) i `src/app/[bookingId]/page.tsx`, diskret transparens-linje i
  `AccessGate`. **Migration 010 er kørt og verificeret i production 2026-09-18T11:31:14Z**
  (migration `20260918113114_trip_visits_usage_tracking`, `iunixfpthdftmkgpugex`) —
  `schema-baseline.json` opdateret til at matche. Dét tidspunkt er kun
  DB-infrastrukturen; PR #66 er endnu ikke merget/deployet, så `TRACKING_SINCE`
  (`src/lib/trip-visit.ts`) forbliver bevidst `null` indtil en separat
  release-cutover-commit umiddelbart før merge. PR #66 afventer nu kun
  release-cutover + Rickos endelige merge-godkendelse. Retention
  (`010b_trip_visits_retention.sql`, pg_cron) er fortsat IKKE aktiveret og er ikke en
  del af denne release.
  [Issue #45](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/45)
  (Analytics Bridge API) er uafhængigt afsluttet, se punkt herunder.

## Seneste 3 relevante ændringer

1. **[PR #44](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/44) —
   Issue #43: Vision 3.0 fase 1-design (eventmodel/sessions/privacy), 2026-09-16.** Docs-only:
   `docs/VISION-3.0-EVENT-MODEL.md` — sessiondefinition, `customer_sessions`-skitse,
   `waitUntil()`-baseret fail-open skrivning, hard cookie-consent-release-gate. Ingen kode,
   ingen migration.
2. **[PR #42](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/42) —
   Issue #40: desktop progress navigation, 2026-09-16.** Fixed nav ≥1180px efter
   designkontrakten; `src/lib/progress-nav.ts` + `ProgressNav.tsx`. Rent frontend/CSS.
3. **[PR #39](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/39) —
   Issue #38: Brugsoverblik / 100% upload-tracking pr. sælger, 2026-09-16.** Ny
   `upload_events`-tabel + `usage_period_summary`-RPC (migration 009, kørt og verificeret i
   production), fail-closed event-log på `/admin/api/parse` før Claude kaldes, ny
   `/admin/brug`-side. Migration kørt/verificeret **før** kode-deploy, som krævet.

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

**PR #66 (Vision 3.0 Fase 1B) afventer release-cutover + Rickos endelige
merge-godkendelse.** Migration `010_trip_visits.sql` er kørt og verificeret i production
(2026-09-18T11:31:14Z) — resterende trin: sæt `TRACKING_SINCE` til det faktiske
release-tidspunkt i én separat commit umiddelbart før merge, kør alle checks igen, én
sidste ChatGPT-review, derefter Rickos merge-godkendelse. Retention
(`010b_trip_visits_retention.sql`, pg_cron) kræver en separat, senere godkendelse og er
bevidst IKKE en del af denne release.

**Herudover:** [Issue #45](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/45)
(Analytics Bridge API) er merget og afsluttet — se `docs/ANALYTICS-BRIDGE-API.md`.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)
— Vision 3.0: Customer Engagement & Sales Intelligence. Master-issue/produktkapitel, IKKE én
stor PR. Se issuen for fuld faseplan (fase 2 sektionsengagement, fase 3 kontakt-intent,
fase 4 salgsoversigt, fase 5 HubSpot-kobling — i Marketing Dashboard-projektet, ikke her).

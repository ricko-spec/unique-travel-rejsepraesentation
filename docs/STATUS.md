# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-16**

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
  `docs/VISION-3.0-EVENT-MODEL.md`. Fase 1B (selve session-opsamlingen) afventer stadig
  Rickos afklaring af de fem KRÆVER RICKO-punkter i dokumentets §14.
- **Aktivt kapitel:** [Issue #45](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/45)
  — Vision 3.0: Analytics Bridge API til Marketing Dashboard. Read-only,
  server-to-server-endpoint der eksporterer eksisterende online rejseplaner (uafhængigt af
  fase 1B — bruger kun eksisterende `trips`-metadata). Se `docs/ANALYTICS-BRIDGE-API.md`.

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

**Afvent Rickos review af Issue #45-PR'en** (Analytics Bridge API,
`docs/ANALYTICS-BRIDGE-API.md`). Ny read-only route `GET
/api/internal/analytics/travel-plans` — server-to-server auth
(`ANALYTICS_BRIDGE_API_KEY`), HMAC-bookingmatch (`BOOKING_MATCH_SECRET`), ingen
kundedata/bookingnummer i output. Ingen migration, ingen HubSpot-afhængighed i dette
repo. To nye env-vars skal sættes i Vercel før første rigtige kald fra Marketing
Dashboard (se docs — ikke gjort her, ingen production writes).

**Parallelt/herefter:** Fase 1B (session-opsamling) afventer fortsat Rickos afklaring af
de fem KRÆVER RICKO-punkter i `docs/VISION-3.0-EVENT-MODEL.md` §14 — særligt
cookie-samtykke/ePrivacy, som er en hard release gate. De to spor (#45 og fase 1B) er
uafhængige af hinanden og kan godkendes i vilkårlig rækkefølge.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)
— Vision 3.0: Customer Engagement & Sales Intelligence. Master-issue/produktkapitel, IKKE én
stor PR. Se issuen for fuld faseplan (fase 2 sektionsengagement, fase 3 kontakt-intent,
fase 4 salgsoversigt, fase 5 HubSpot-kobling — i Marketing Dashboard-projektet, ikke her).

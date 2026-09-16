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
  `8097be1`). `src/lib/progress-nav.ts` og `ProgressNav.tsx` er i main.
- **Aktivt kapitel:** [Issue #43](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/43)
  — Vision 3.0 **fase 1: eventmodel-design** (under [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)).
  **Docs-only** — ingen migration, ingen kode, intet endpoint. Designet ligger i
  `docs/VISION-3.0-EVENT-MODEL.md`; implementeringen er fase 1B (migration 010 +
  middleware-matcher + ét kald i `page.tsx`).

## Seneste 3 relevante ændringer

1. **[PR #39](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/39) —
   Issue #38: Brugsoverblik / 100% upload-tracking pr. sælger, 2026-09-16.** Ny
   `upload_events`-tabel + `usage_period_summary`-RPC (migration 009, kørt og verificeret i
   production), fail-closed event-log på `/admin/api/parse` før Claude kaldes, ny
   `/admin/brug`-side. Migration kørt/verificeret **før** kode-deploy, som krævet.
2. **[PR #37](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/37) —
   Vision 2.0 fase 5 (pris/CTA/mobil-polish), 2026-09-15.** `.price`/`.cta`-radius 16px,
   `.note`-radius 12px, CTA-guldglød, `.action-bar`-topradius. Ny tom-pris-tilstand ud fra
   eksisterende `price.note`-data (21 af 237 aktive rejser har tom `price.total`). CTA skjules
   fortsat korrekt uden `advisorEmail`. **Sidste Vision 2.0-fase.**
3. **[PR #35](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/35) —
   Vision 2.0 fase 4 (billeder), 2026-09-15.** `DestinationGallery` ind i designkontrakten
   (1180px-bredde, 28/56/72px padding, 20/24px gap, 16px radius, 4:3-fliser, 1→3 kolonner
   fra 760px); hero-foto (LCP/priority) og hero-logo på `next/image`. Kundevendte
   `no-img-element`-warnings 0.

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

**Afvent Rickos review af Issue #43-design-PR'en** (`docs/VISION-3.0-EVENT-MODEL.md`).
Docs-only — ingen migration, ingen kode, ingen særlig release-rækkefølge for denne PR.
Dokumentets §14 lister de fem punkter der **KRÆVER RICKO** før fase 1B kan bygges:
cookie-samtykke på `AccessGate`, kørsel af migration 010 i production, pg_cron-extension,
udvidelse af middleware-matcheren til kundesider, og accept af de dokumenterede huller
(udlogget sælger tæller som kunde; fail-open ⇒ tal er tæt på eksakte, ikke garanteret komplette).

**Herefter:** fase 1B — opsamlingen bygges (migration 010, ren gate-logik + tests,
middleware-matcher, ét best-effort kald i `page.tsx`). Visning i admin er fase 1C/4.
Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)
— Vision 3.0: Customer Engagement & Sales Intelligence. Master-issue/produktkapitel, IKKE én
stor PR. Se issuen for fuld faseplan (fase 2 sektionsengagement, fase 3 kontakt-intent,
fase 4 salgsoversigt).

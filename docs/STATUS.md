# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-15**

## Nu

- **Production:** Vision 2.0 fase 1-3 live. Aktuel main/deploy verificeres i GitHub/Vercel
  (denne fil hardcoder bevidst ikke en SHA — den bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Aktivt kapitel:** Vision 2.0 fase 4 (billeder: galleri-polish + `next/image`),
  Issue #34 — implementeret på branchen `vision/v2-phase-4-images`, **under review**.
  Denne fil hardcoder bevidst intet PR-nummer/merget-tidspunkt (bliver forkert ved næste
  merge) — se [åbne PR'er](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls)
  for aktuel status. Scope: `DestinationGallery` ind i designkontrakten (1180px-bredde,
  28/56/72px padding, 20/24px gap, 16px radius, 4:3-fliser, 1→3 kolonner fra 760px);
  hero-foto (LCP/priority) og hero-logo på `next/image`. Kundevendte `no-img-element`-
  warnings 0 (2 tilbage, begge i admin — uden for scope). `npm test`/typecheck/lint/build
  grønne. Detaljer og faseplan: `docs/VISION-2.0-PLAN.md`.

## Seneste 3 relevante ændringer

1. **[PR #33](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/33) —
   projekt-refresh (Issue #30), 2026-09-15.** Docs/process only: `STATUS.md` kortet fra
   582 til ~50 linjer, GitHub (issues/PR'er) er nu backlog- og historik-sandheden i stedet
   for en ekstern Cowork-fil, flere stale udsagn rettet (test-suite, Vision 2.0-status,
   slug vs. bookingnummer). Ingen produktkode ændret.
2. **[PR #31](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/31) —
   Vision 2.0 fase 3 (hoteller), 2026-09-15.** Hotelkort løftet til designkontrakten
   (16px radius, lagdelt skygge, hover-løft, padding, typografi); `.hotel-sub` → `.hotel-loc`
   klassefejl rettet; sektionsheader flyttet uden for griddet.
3. **[PR #29](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/29) —
   Vision 2.0 fase 2 (timeline), 2026-09-14.** Rejseplanen restylet efter designkontrakten;
   fold-ud animeres uden højdeloft (rettede en klipningsfejl på lange programmer).

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

Rickos review af fase 4-PR'en (Issue #34) → merge når godkendt → production-verifikation
→ Vision 2.0 fase 5 (pris/praktisk/CTA/mobil-polish).

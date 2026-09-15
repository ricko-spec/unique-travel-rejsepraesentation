# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-15**

## Nu

- **main = production:** `b069880` — Vercel READY (`dpl_4NoCYaG3UGN7oKFTmdUkjiT54LuM`),
  `https://rejseplaner.uniquetravel.dk`
- **Aktivt kapitel:** [GitHub Issue #30](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/30)
  — projekt-refresh (docs/process only, denne PR). Ingen produktkode ændres.
- **Vision 2.0:** fase 1 (hero), 2 (timeline) og 3 (hoteller) er **live**. Fase 4
  (billeder + `next/image`) er næste produktkapitel — sat på pause til Issue #30 er landet.
  Detaljer og faseplan: `docs/VISION-2.0-PLAN.md`.

## Seneste 3 relevante ændringer

1. **[PR #31](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/31) —
   Vision 2.0 fase 3 (hoteller), 2026-09-15.** Hotelkort løftet til designkontrakten
   (16px radius, lagdelt skygge, hover-løft, padding, typografi); `.hotel-sub` → `.hotel-loc`
   klassefejl rettet; sektionsheader flyttet uden for griddet. `main c89dc62 → 8c7ce5f`.
2. **[PR #29](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/29) —
   Vision 2.0 fase 2 (timeline), 2026-09-14.** Rejseplanen restylet efter designkontrakten;
   fold-ud animeres uden højdeloft (rettede en klipningsfejl på lange programmer).
   `main 2480daf → 8c4e301`.
3. **[PR #27](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/27) —
   Vision 2.0 fase 1 (hero), 2026-09-14.** Hero + info-strip rettet efter Claude
   Design-handoffet, som blev source of truth for udtrykket (se `docs/DECISIONS.md`).
   `main 4b3e536 → 2480daf`.

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

Rickos OK på denne PR (Issue #30) → merge → Vision 2.0 fase 4 (billeder + `next/image`).

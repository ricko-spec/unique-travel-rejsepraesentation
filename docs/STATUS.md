# STATUS

> Læs denne før hver arbejdsrunde. Kort og operationel — fuld PR-historik står i GitHub
> (lukkede PR'er, commits, diffs), ikke her. Opdatér ved hvert milepæl.
> Sidst opdateret: **2026-09-24**

## Nu

- **Production:** Vision 2.0 fase 1-5 + Issue #38 + **Vision 3.0 Fase 1B (kundeåbninger), 1C
  ("Kundeaktivitet"), Fase 2 (sektionsengagement, migration 011), Fase 3 (kontakt-intent, migration
  012) og Fase 4 (salgsoversigt, Issue #76) live.** Fase 4-koden blev merget via
  [PR #77](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/77) **2026-09-19T09:24:56Z**
  (merge-commit `c407d626`) — **rettelse:** denne fil sagde tidligere fejlagtigt at PR #77 ikke var
  merget; verificeret mod GitHub 2026-09-24 at `c407d626` = `main`. Salgsoversigten
  (Åbnet/Set/Kontakt/Seneste aktivitet i `/admin`) er altså live, ikke kun implementeret. Aktuel
  main/deploy verificeres i GitHub/Vercel (denne fil hardcoder bevidst ikke en SHA løbende — den
  bliver stale ved næste merge):
  [commits på main](https://github.com/ricko-spec/unique-travel-rejsepraesentation/commits/main) ·
  [Vercel-deploys](https://vercel.com/unique-travel/unique-travel-rejsepraesentation/deployments).
- **Aktivt kapitel:** [Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78) —
  **Vision 3.0 Fase 5: prospektiv konverteringsmåling (online rejseplan mod kun PDF)** (barn af
  [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)). Branch
  `docs/gate-a-conversion-measurement-78`; docs-only PR [#79](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/79)
  (Gate A), **ikke merget, må ikke merges**.
  **Gate A-afgørelse: `GO MED FORBEHOLD`** — kun til Gate B-designarbejde af den PROSPEKTIVE måling;
  historisk backfill forbliver blokeret. Se `docs/VISION-3.0-PHASE-5-GATE-A.md`. Ricko kørte selv
  (Private App-token, read-only) `Invoke-QuoteSignalLiveEvidence.ps1` (dk-wanderlust-spy) 2026-09-24.
  Pipeline `754595640` + stage-kontrakten (`1098732868` "Tilbud sendt", `1169407502` "Opdateret
  tilbud") er live bekræftet uden uoverensstemmelser. Historisk rekonstruktion fra HubSpots
  dealstage-historik er `UNUSABLE` (6,2 % dækning; 0 % i ni sammenhængende måneder sep. 2025–maj
  2026 — et dokumenteret dataartefakt, ikke reel mangel på aktivitet), men blokerer **ikke**
  automatisk den prospektive løsning. 51,2 % af detekterede "Tilbud sendt"-events er tidsstemplet
  efter deal-udfaldet — **yderligere evidens mod historisk rekonstruktion, ikke en åben Gate
  B-opgave**. Nulpunkt for den officielle måling = første succesfulde daglige synkronisering (fast,
  dokumenteret dato, ikke bagudskuende). **Ingen produktkode/migration/HubSpot-integration før Gate
  B er eksplicit godkendt af Ricko** (se åbne beslutninger i Gate A-rapportens §6).
- **Kendt driftsopfølgning (ikke en blocker):** production UI-smoketest af Fase 1C, 2, 3 og 4 er
  udsat (Ricko kan ikke teste lige nu).

## Seneste 3 relevante ændringer

1. **[PR #77](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/77) — Issue #76: Vision 3.0 Fase 4, salgsoversigt med målt kundeaktivitet, 2026-09-19.**
   Kompakt server-side DTO (`GET /admin/api/trips`), seks set-baserede pagineredes læsninger, kolonnerne
   Åbnet/Set/Kontakt/Seneste aktivitet, filtre/sortering/klient-side pagination, `not-measured`-tilstand.
   Ingen migration.
2. **[PR #75](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/75) — Docs: fast arbejdsform (`docs/WORKING_MODE.md`), checkpoint og Fase 4-beslutningsgrundlag,
   2026-09-19.** Docs-only.
3. **[PR #74](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/74) — Issue #73: Vision 3.0 Fase 3, kontakt-intent, 2026-09-19.** Ny `trip_contact_intent`-tabel
   + RPC (migration 012, kørt/verificeret, baseline opdateret), `POST /[bookingId]/intent`, tracked mailto:/tel:-links,
   "Kontakt-intent" i admin, opdateret transparenstekst.

Fuld historik: [lukkede/merged PR'er på GitHub](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pulls?q=is%3Apr+is%3Amerged).

## Åbne beslutninger / risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data.
- **Vercel preview er bag Vercel Authentication (SSO)** — render-verifikation sker lokalt
  (mod prod-DB) eller på production efter merge.
- **Storage bucket-config uden for drift-tjekket** (kendt blind vinkel).
- Repo er public — secrets/kundedata-disciplin er procesbåret, ikke teknisk håndhævet.
- **Gate A (Issue #78) er `GO MED FORBEHOLD` — Gate B endnu ikke startet.** Et fast, dokumenteret
  nulpunkt for den prospektive måling skal fastlægges (første succesfulde daglige sync).
  `afterOutcomeRatio`-fundet (§3.2 i Gate A-rapporten) er afklaret som evidens mod historisk
  rekonstruktion, ikke en åben Gate B-opgave.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**Gate A er afsluttet `GO MED FORBEHOLD`.** Næste skridt (afventer Rickos beslutning, se Gate
A-rapportens §6): start Gate B som eget kapitel/issue — design af den prospektive daglige
synkronisering, migration og pseudonymiseret persistence, samt fastlæggelse af det formelle
nulpunkt (første succesfulde sync). `afterOutcomeRatio`-fundet er ikke en Gate B-reparationsopgave
— kun evidens mod historisk backfill. Ingen migration/produktkode før Gate B er godkendt.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales Intelligence.
Master-issue/produktkapitel, IKKE én stor PR. **Fase 5 (prospektiv konverteringsmåling / HubSpot-kobling)
er, per Issue #78, besluttet placeret i dette repo** — server-side, ingen HubSpot i browseren. Dette
opdaterer et tidligere notat her om at Fase 5 hørte hjemme i "Marketing Dashboard-projektet"; se
`docs/DECISIONS.md` for begrundelsen.

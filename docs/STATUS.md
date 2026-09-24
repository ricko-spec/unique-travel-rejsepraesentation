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
  `docs/gate-a-conversion-measurement-78`; docs-only PR (Gate A), **ikke merget, må ikke merges**.
  **Gate A-afgørelse: `MEASUREMENT_BLOCKED`** — se `docs/VISION-3.0-PHASE-5-GATE-A.md`. Ingen
  godkendt HubSpot-adgang er tilgængelig i dette projekt endnu (`docs/ACCESS_MATRIX.md` dækker ikke
  HubSpot); ingen af de HubSpot-afhængige verifikationspunkter (pipeline, stage-id'er,
  bookingnummer-felt, dækning/dubletter, startdato) er derfor bekræftet. Repo-siden af
  datagrundlaget (Analytics Bridge, `trips.booking_no`/`created_at`/`active`) er verificeret og
  peger ikke på nogen blokering herfra. To veje til at ophæve blokeringen (Rickos valg) er
  beskrevet i Gate A-rapportens §5. **Ingen produktkode/migration/HubSpot-integration før Gate A er
  ophævet med `GO`/`GO MED FORBEHOLD`.**
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
- **Ingen godkendt HubSpot-adgang i `docs/ACCESS_MATRIX.md`** — blokerer Gate A (Issue #78). Se
  `docs/VISION-3.0-PHASE-5-GATE-A.md` §5 for de to veje til at ophæve dette.
- Øvrige åbne beslutninger (KRÆVER RICKO): `docs/DECISIONS.md` § Åbne beslutninger.
  Prioriteret backlog: `docs/ROADMAP.md`.

## Drift (ingen kode)

- Mille: opret Japan/Kenya/Mauritius-destinationer + billeder i production.

## Næste handling

**Ophæv Gate A-blokeringen** (Issue #78): Ricko vælger en af de to veje i
`docs/VISION-3.0-PHASE-5-GATE-A.md` §5 (godkend HubSpot-MCP-adgang, eller kør det vedlagte
lokale read-only script og del kun aggregat-JSON'en). Når stage-kontrakt, bookingnummer-felt og
aggregater er verificeret, kan Gate A afsluttes med `GO`/`GO MED FORBEHOLD`, og Gate B
(migrations-/persistence-design) kan planlægges.

Kapitlet i øvrigt: [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41) — Vision 3.0: Customer Engagement & Sales Intelligence.
Master-issue/produktkapitel, IKKE én stor PR. **Fase 5 (prospektiv konverteringsmåling / HubSpot-kobling)
er, per Issue #78, besluttet placeret i dette repo** — server-side, ingen HubSpot i browseren. Dette
opdaterer et tidligere notat her om at Fase 5 hørte hjemme i "Marketing Dashboard-projektet"; se
`docs/DECISIONS.md` for begrundelsen.

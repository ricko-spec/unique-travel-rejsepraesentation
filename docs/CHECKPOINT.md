# CHECKPOINT

> Kort hand-off til næste session — **overskrives** ved meningsfulde milepæle (se `docs/WORKING_MODE.md` §5).
> Ikke en anmodning om godkendelse. Operationel status (hvad er live) står i `docs/STATUS.md`.

**Sidst opdateret:** 2026-09-24 (Gate A for Issue #78 afsluttet `GO MED FORBEHOLD`, kun til Gate B-design)

## Branch / HEAD

- **Production `main`:** `c407d6264b7c75848787c557e67d30a59a8f4c3b` (Fase 1B/1C/2/3/4 live; migration
  010–012 kørt; Fase 4-koden (salgsoversigt) live siden PR #77, 2026-09-19T09:24:56Z).
- **Fase 5, Gate A:** Issue [#78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78) —
  branch `docs/gate-a-conversion-measurement-78` fra frisk `main` (`c407d626`); docs-only PR
  [#79](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/79), **draft, må ikke
  merges**. HEAD = seneste commit på branchen (se PR).

## Færdigt

- **Gate A gennemført over tre runder, afsluttet `GO MED FORBEHOLD`** (kun til Gate B-designarbejde
  af den PROSPEKTIVE måling — ikke en godkendelse til at aktivere nogen live måling):
  1. Repo-/arkitekturgate; Fase 4/PR #77's stale "ikke merget"-status rettet i STATUS/ROADMAP/
     CHECKPOINT/DECISIONS.
  2. Adgangsvej ændret fra HubSpot-MCP/OAuth (droppet) til en IT-udstedt Private App-token, brugt
     udelukkende i Rickos eget shell; `docs/ACCESS_MATRIX.md` opdateret. Read-only reference-brug af
     `ricko-spec/dk-wanderlust-spy` (Marketing Dashboard, privat repo) godkendt af Ricko — kun de to
     navngivne PR'er/scripts, ingen ændringer dér.
  3. **Ricko kørte selv live, read-only** `Invoke-QuoteSignalLiveEvidence.ps1` (seneste mergede
     version) og delte det fulde aggregerede resultat. Pipeline `754595640` + stage-kontrakten
     (`1098732868` "Tilbud sendt", `1169407502` "Opdateret tilbud") bekræftet live uden
     uoverensstemmelser. Historisk rekonstruktion `UNUSABLE` (0 % dækning i ni sammenhængende
     måneder sep. 2025–maj 2026 — dokumenteret dataartefakt), men blokerer ikke den prospektive
     løsning (Rickos eksplicitte instruks). Se `docs/VISION-3.0-PHASE-5-GATE-A.md` for fuld rapport.
- **Ikke gjort (bevidst, inden for Gate A's read-only scope):** ingen HubSpot-kald fra en agent
  (kun Ricko selv, i eget shell), ingen ny agent-adgang til dk-wanderlust-spy ud over read-only
  reference, ingen Supabase-writes, ingen produktkode/migration.

## Udestående

1. **Gate B** — design af den prospektive daglige synkronisering, migration og pseudonymiseret
   persistence. Skal eksplicit adressere `afterOutcomeRatio`-fundet (51,2 %) og fastlægge det
   formelle nulpunkt (første succesfulde sync). Ikke startet — afventer Rickos beslutning om at
   oprette et eget Gate B-issue, se Gate A-rapportens §6.
2. Uafklaret: Booket/Ikke booket endnu vs. et separat, synligt tabt/afvist-udfald i
   datakvalitetsrapportering (Gate A-rapporten §5, note).
3. Valgfrit, ikke blokerende: frisk `--mode=join`-kørsel for at opdatere Marketing Dashboards 3+
   dage gamle match-/dæknings-tal (271 rejseplaner/197 matchet).
4. Separat opfølgning (uden detaljer i det offentlige repo): eksisterende sikkerhedsadvarsler uden
   for Fase 3/4/5 — uændret fra tidligere.

## Teststatus (denne branch)

Docs-only ⇒ `git diff --check` (jf. `docs/TESTING.md` "Testniveau efter ændringstype"). Ingen
kode-/DB-ændring ⇒ ingen `npm test`/`typecheck`/`lint`/`build`/schema-drift-kørsel nødvendig eller
udført.

## Næste handling

Afvent Rickos beslutning om at starte Gate B som eget kapitel/issue (Gate A-rapportens §6, punkt 5).
Ingen Gate B-kode, migration eller implementering før det er eksplicit godkendt.

# Vision 3.0 Fase 5 — Gate B0: Arkitekturbeslutning (ADR)

> [Issue #80](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/80), barn af
> Gate A ([Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78),
> PR #79, afsluttet `GO MED FORBEHOLD` 2026-09-24). Denne ADR er Gate B0 — arkitekturvalget skal
> være låst FØR Gate B1's implementering, jf. Issue #80's egen rækkefølge.

## Status: **VALGT — arkitektur A (direkte HubSpot-read i dette projekt)**

## Kontekst

Gate B skal bygge en prospektiv, automatisk, revisionssikker konverteringsmåling (online rejseplan
vs. kun PDF) i Online Rejseplan-projektet. Issue #80 stiller to arkitekturer op og kræver at
**præcis én** vælges:

- **A — direkte HubSpot-read i dette projekt** (foretrukket, per Issue #80): en server-side,
  read-only HubSpot-klient og en senere Vercel-cron, begge i `unique-travel-rejsepraesentation`.
- **B — levering fra Marketing Dashboard**: Marketing Dashboard læser HubSpot og sender
  pseudonymiserede observationer til et nyt, autentificeret endpoint her.

## Beslutning

**Arkitektur A.** Ingen Marketing Dashboard-afhængighed, intet nyt tværrepo-secret, intet nyt
autentificeret indgangspunkt der modtager data udefra.

## Begrundelse

1. **Mindst kompleks, som krævet.** Issue #80: "Vælg den mindst komplekse løsning." A kræver ét
   nyt server-side secret (`HUBSPOT_PRIVATE_APP_TOKEN`) i ét allerede eksisterende Vercel-projekt.
   B kræver et nyt secret HER (til at autentificere Marketing Dashboards kald), et nyt secret DÉR
   (samme HubSpot-token, i et andet Vercel-projekt), en ny cross-repo API-kontrakt, og to
   uafhængige deploy-/driftskæder der skal holdes i sync.
2. **Samme, allerede etablerede trust-model.** Dette repo har allerede server-side-only secrets
   (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `ANALYTICS_BRIDGE_API_KEY`,
   `BOOKING_MATCH_SECRET`) — alle valideret ved opstart, aldrig i klientkode, aldrig i repoet.
   `HUBSPOT_PRIVATE_APP_TOKEN` (Gate C) er endnu ét medlem af samme, velkendte klasse — ingen ny
   sikkerhedsmodel skal designes.
3. **Ét produktejerskab, enklere fejlsøgning.** Gate A's eget arbejde viste allerede at læsevejen
   (pipeline-/stage-kontrakt, dealstage-historik, HMAC-matchning) kan bygges og fejlsøges i ét
   sammenhængende kodebase (samme mønster som Marketing Dashboards `travelplan-join-dry-run.ts`,
   som Gate A brugte som reference). At sprede den samme logik over to repoer ville kun tilføje
   koordinationsomkostning, ikke sikkerhed.
4. **Mindre angrebsflade end B, ikke mere.** B's nye, autentificerede "modtag observationer
   udefra"-endpoint er i sig selv et nyt mål: det skal selv autentificere kaldet, validere
   payloaden, og forsvares mod misbrug — præcis den slags flade A undgår helt ved at holde hele
   læsevejen server-side i étt projekt.
5. **Konsistent med Analytics Bridge (Issue #45).** Dette repo eksporterer allerede
   `booking_match_key`/`created_at`/`active` til eksterne forbrugere via et read-only,
   Bearer-autentificeret API — men her er retningen omvendt (dette repo læser fra HubSpot, ikke
   omvendt). At vende retningen om (B) ville kræve at Online Rejseplan i stedet MODTAGER data —
   en ny, aldrig før brugt retning for dette projekt, uden en tilsvarende demonstreret grund.

## Trusselsmodel (kort)

| Risiko | Scope | Reduktion |
|---|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` lækket | Read-only scope (kun deals/pipelines — se runbook), kan læse HubSpot-deal-metadata, ALDRIG skrive | Server-side-only, aldrig i klientkode/repo/logs; samme opbevaringsdisciplin som øvrige secrets; roteres uafhængigt af `BOOKING_MATCH_SECRET`/`HUBSPOT_DEAL_KEY_SECRET` |
| Rå HubSpot deal-id eller bookingnummer lækket til admin-UI/DB | Ville afsløre kunde-/salgsdata | `conversion_deal_cohort` gemmer KUN pseudonymiserede HMAC-nøgler (egen, domæneadskilt secret pr. nøglerum) — se supabase/013 og src/lib/conversion/dealKey.ts. Aldrig `...row`-spredning noget sted i kæden |
| Admin-UI afslører en lille celle (fx "1 booket ud af 3 med online-rejseplan i en bestemt destination") | Kunne identificere en konkret kunde/sag indirekte | Small-cell (<10) + KOMPLEMENTÆR undertrykkelse på hver eneste offentliggjorte celle (tæller, nævner og procent skjules sammen) — se src/lib/conversion/aggregate.ts, bevist med tests |
| Sync-motoren skriver en delvist opdateret kohorte ved en fejl midtvejs | Ville kunne give inkonsistente/misvisende tal | "Fuld kilde eller ingen commit af kørslen" — hele HubSpot-læsningen skal lykkes FØR nogen klassifikation/skrivning sker; ét atomart upsert-kald; fejl giver et FAILED sync-run og INGEN ændring af `conversion_deal_cohort` — se src/lib/conversion/syncEngine.ts, bevist med tests |
| Skjult historisk backfill (kohorten "husker" deals fra før målingsstart) | Ville modsige Gate A's bindende konklusion | `measurement_started_at` er uforanderlig (håndhævet af en Postgres-trigger, ikke kun applikationskode); PRE_START_EXISTING-klassifikation forhindrer at allerede-kvalificerede deals nogensinde tælles med |

## Konsekvenser

- **Gate C** skal senere oprette `HUBSPOT_PRIVATE_APP_TOKEN` som production-secret i DETTE Vercel-
  projekt (`unique-travel-rejsepraesentation`), samt en ny secret `HUBSPOT_DEAL_KEY_SECRET` til
  deal-key-pseudonymiseringen (uafhængig af `BOOKING_MATCH_SECRET`).
- **Gate C** skal aktivere ÉN daglig Vercel Cron, der kalder sync-motoren server-side.
- `docs/ACCESS_MATRIX.md` er opdateret (samme PR) til at reflektere at HubSpot-adgang, når den
  aktiveres, sker via et server-side secret i dette projekt — ikke en cross-repo-integration.
- Ingen ændring af `ricko-spec/dk-wanderlust-spy` (Marketing Dashboard) er nødvendig eller sket.

## Dataflow (kort)

```
Vercel Cron (Gate C)
  → syncEngine.runConversionSync()
      → HubSpotReadAdapter.confirmStageContract()  [live, read-only, fail-closed]
      → HubSpotReadAdapter.readDealsPage()×N        [paginering, fail-closed, ingen tavs afkortning]
      → classify.reduceDealCohort() pr. deal         [ren funktion, ingen I/O]
      → persistence.upsertCohortRows()               [ét atomart upsert]
      → persistence.recordSyncRun()                  [audit-række]
  ← Admin: GET /admin/api/conversion
      → adminServer.loadConversionAdminOverview()
      → aggregate.buildConversionAggregate()          [small-cell + komplementær undertrykkelse]
```

## Felter og invariants

Se `supabase/013_conversion_measurement.sql` (fuld kommentering pr. tabel/kolonne) og
`src/lib/conversion/types.ts`. Kernevariants, alle bevist med tests
(`src/lib/conversion/classify.test.ts`, `syncEngine.test.ts`, `aggregate.test.ts`):

1. `measurement_started_at` sættes præcis én gang, aldrig senere (DB-trigger + applikation).
2. En deal optages (ENROLLED/EXCLUDED/PRE_START_EXISTING) præcis én gang — terminal tilstand
   ændres aldrig af en normal sync.
3. `Opdateret tilbud` nulstiller aldrig kohortestart eller eksponering.
4. Manglende/ugyldigt/delt bookingnummer ⇒ eksplicit `EXCLUDED`-årsag, ALDRIG stiltiende
   `PDF_ONLY`.
5. `ONLINE` kræver at rejseplanen eksisterede PÅ eller FØR første kvalificerede observation —
   en senere oprettet plan ændrer aldrig en allerede frosset `PDF_ONLY`.
6. Booket kan gå fra falsk til sand, aldrig tilbage.
7. Tomt grundlag ⇒ `null`, aldrig `0 %`.
8. Small-cell (<10) + komplementær undertrykkelse på enhver offentliggjort celle.

## Rollback

Gate B1 anvender INGEN migration og aktiverer INGEN kode i production ud over selve PR-mergingen
af filerne (admin-UI'et viser fail-closed "ikke startet" uanset). Skulle noget alligevel behøve at
rulles tilbage efter en fremtidig Gate B2/C/D:

- **Før Gate B2 (migration ikke anvendt):** revert af PR'en er tilstrækkeligt — ingen DB-tilstand
  at rydde op.
- **Efter Gate B2 (migration anvendt, men Gate C/D ikke aktiveret):** de tre nye tabeller kan
  droppes med en ny, eksplicit migration, hvis kapitlet opgives — ingen andre tabeller
  refererer til dem (ingen FK ind i `conversion_*`-tabellerne fra andre tabeller).
- **Efter Gate D (målingen er aktiv):** at "rulle tilbage" betyder at sætte
  `conversion_measurement_state.status = 'PAUSED'` (stopper synkroniseringen uden datatab) — at
  slette data kræver Rickos eksplicitte, separate godkendelse, som al anden destruktiv handling.

## Åbne beslutninger til Ricko (Gate B0-niveau)

1. **Bekræft arkitektur A** (denne ADR) — eller anfør hvorfor B alligevel foretrækkes.
2. Ingen yderligere Gate B0-beslutninger er identificeret som blokerende for at starte Gate B1's
   implementering (uden aktivering).

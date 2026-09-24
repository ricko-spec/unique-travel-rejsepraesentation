# Vision 3.0 Fase 5 — Gate B0: Arkitekturbeslutning (ADR)

> [Issue #80](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/80), barn af
> Gate A ([Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78),
> PR #79, afsluttet `GO MED FORBEHOLD` 2026-09-24). Denne ADR er Gate B0 — arkitekturvalget skal
> være låst FØR Gate B1's implementering, jf. Issue #80's egen rækkefølge.
>
> **Revision 2 (2026-09-24, PR #81 review-runde 1):** kvalifikationsmodel, persistence-model,
> privacy-model, konflikt-tilstand, wire-DTO og udfaldsdefinition er redesignet efter et uafhængigt
> review (syv fund). Arkitekturvalget (A) er uændret. Ændringerne er markeret "(rev. 2)" nedenfor;
> den tidligere model ligger i git-historikken for denne fil (commit `a5f5e11`).
>
> **Revision 3 (2026-09-24, PR #81 review-runde 2, Codex-review 5308506532 på `198101b`):**
> booking før første kvalificerede observation håndteres fail-closed; 30/60/90-undertrykkelsen
> koordineres; modning er igen **pr. deal** som i Issue #80 (rev. 2's månedsmodning er trukket
> tilbage efter Rickos instruks) — privacy ligger udelukkende i publiceringslaget. Markeret "(rev. 3)".

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

1. **Mindst kompleks, som krævet.** A kræver ét nyt server-side secret (`HUBSPOT_PRIVATE_APP_TOKEN`)
   plus pseudonymiserings-secreten `HUBSPOT_DEAL_KEY_SECRET` i ét allerede eksisterende
   Vercel-projekt. B kræver et nyt secret her, samme HubSpot-token dér, en ny cross-repo
   API-kontrakt og to uafhængige deploy-/driftskæder.
2. **Samme, allerede etablerede trust-model** som `SUPABASE_SERVICE_ROLE_KEY`,
   `ANALYTICS_BRIDGE_API_KEY` og `BOOKING_MATCH_SECRET`: server-side-only, aldrig i klientkode,
   aldrig i repoet.
3. **Ét produktejerskab, enklere fejlsøgning** — læsevej, klassifikation og persistence i ét repo.
4. **Mindre angrebsflade end B**, som ville kræve et nyt "modtag observationer udefra"-endpoint.
5. **Konsistent med Analytics Bridge (Issue #45)** — samme HMAC-kontrakt for `booking_match_key`.

## Kvalifikationsmodel — prospektivt snapshot, ingen historik (rev. 2, fund 1)

Gate A erklærede historisk rekonstruktion `UNUSABLE`. Den første version brugte alligevel et
historisk "første gang kvalificeret"-tidsstempel (`everQualifiedAt`) som facit. Det er fjernet.
HubSpot-adapteren leverer nu KUN dealens aktuelle snapshot: `pipelineId`, `dealStageId`,
bookingnummer, `unique_travel_dealstatus`, `hs_is_closed`, `hs_is_closed_won`. Ingen
dealstage-historik, ingen `closedate`.

**Versioneret stage-kontrakt** (`src/lib/conversion/contract.ts`, `PIPELINE_STAGE_CONTRACT`,
`CONTRACT_VERSION = 2`): hver stage i pipeline `754595640` klassificeres som præcis én af

| Klasse | Betydning | Lukke-flag |
|---|---|---|
| `PRE_QUOTE` | åben, tilbud endnu ikke sendt (fx Screened) | skal være åben |
| `QUOTE_OR_LATER` | "Tilbud sendt eller senere" (`1098732868`, `1169407502`, og senere stages som solgt) | åben eller lukket |
| `CLOSED_AMBIGUOUS` | lukket stage der kan nås både før og efter et tilbud (typisk tabt/afvist) | skal være lukket |

Sync'en fejler lukket (`CONTRACT_DRIFT`/`CONTRACT_INCOMPLETE`), hvis pipelinens live stage-liste og
kontrakten ikke matcher 1:1, en deal har en ukendt stage/pipeline, eller lukke-flaget modsiger
stage-klassen. **Kun Gate A's to live-bekræftede stages er udfyldt i repoet** (`complete: false`):
de øvrige stage-id'er er ikke kendt uden et live metadata-kald, som Gate B ikke må lave. Derfor kan
ingen officiel sync gennemføres, før kontrakten er udfyldt ved Gate C (se runbooken). Det er bevidst
fail-closed.

**Algoritme** (`src/lib/conversion/classify.ts`):

1. **Baseline-sync** (den første godkendte sync; `measurement_started_at` er endnu ikke sat):
   deals i `QUOTE_OR_LATER` eller `CLOSED_AMBIGUOUS` ⇒ `PRE_START_EXISTING`; åbne `PRE_QUOTE`-deals
   ⇒ `ELIGIBLE_PENDING`. Commit-transaktionen sætter `measurement_started_at` = baseline-kørslens
   `observedAt`.
2. **Efter baseline:** en ny eller `ELIGIBLE_PENDING` deal, der NU observeres i `QUOTE_OR_LATER`,
   optages præcis én gang. **Kohortestart = denne syncs `observedAt`**. Eksponering fryses samtidig
   (`ONLINE` hvis tidligste `trips.created_at` for bookingnøglen ≤ kohortestart, ellers `PDF_ONLY`).
3. Første observation i en `CLOSED_AMBIGUOUS`-stage efter baseline ⇒ `EXCLUDED` med
   `CLOSED_BEFORE_QUALIFIED_OBSERVATION` (kan ikke afgøres entydigt — aldrig stiltiende optaget).
4. Terminale tilstande (`ENROLLED`, `EXCLUDED`, `PRE_START_EXISTING`) ændrer aldrig eligibility,
   årsag, kohortestart, eksponering eller bookingnøgle igen. "Opdateret tilbud" kan derfor intet
   nulstille — håndhævet både i reduceren og af en DB-trigger.

**Kendt, accepteret konsekvens:** en deal der går fra `PRE_QUOTE` til en lukket-tvetydig stage
mellem to daglige syncs, bliver `CLOSED_BEFORE_QUALIFIED_OBSERVATION` (synlig i datakvalitet),
mens en deal der går direkte til solgt, optages. Effekten er lille ved daglig kørsel og er synlig
som et tal i adminvisningen.

## Udfaldsdefinition — én sandhedstabel (rev. 2, fund 7)

Kilde: Gate A §3.1/§5 ("kun overgangen til det UT-ejede solgt/booket-signal
`unique_travel_dealstatus` tæller som Booket", bevidst ikke dealstage). `hs_is_closed_won` er
HubSpots stage-afledte flag og afgør derfor ALDRIG Booket. Implementeret i `classifyOutcomeSignal`;
migrationens kommentarer, runbooken og testene bruger samme tabel.

| `unique_travel_dealstatus` ∈ {Solgt, Billetter sendt} | `hs_is_closed` | `hs_is_closed_won` | Resultat |
|---|---|---|---|
| ja | true | true | **BOOKED** |
| ja | false | false | **BOOKED** (UT-status er autoritativ) |
| ja | true | false | **BOOKED** + outcome-konflikt (datakvalitet) |
| nej | false | false | **NOT_BOOKED** (åben) |
| nej | true | false | **NOT_BOOKED** + tabt/afvist (datakvalitet) |
| nej | true | true | **NOT_BOOKED** + outcome-konflikt (datakvalitet) |
| — | false | true | umulig kombination ⇒ kontraktdrift, hele sync'en fejler |

`first_booked_at` = `observedAt` for den første sync, der så UT-solgt-status (ingen `closedate`).
BOOKED kan aldrig blive NOT_BOOKED igen. Tabt/afvist og konflikter indgår aldrig i
konverteringsprocenten.

**Booking før tilbuddet (rev. 3, review-runde 2 fund 1).** UT-solgt-status kan observeres, mens
dealen stadig står i en `PRE_QUOTE`-stage. Dealen forbliver da `ELIGIBLE_PENDING`, men
`first_booked_at` huskes. Når den senere observeres i `QUOTE_OR_LATER`, gælder
`first_booked_at < first_qualified_observation_at` ⇒ **`EXCLUDED/BOOKED_BEFORE_QUALIFIED_OBSERVATION`**
(aldrig optaget, aldrig en konvertering fra tilbuddet). Observeres booking og kvalifikation i samme
sync, er intervallet 0 og dealen optages som booket. Håndhævet tre steder: reduceren; DB-CHECK
`conversion_deal_cohort_enrolled_booked_order_check` (ENROLLED ⇒ `first_booked_at ≥ kohortestart`)
og `..._booked_before_fields_check`; og aggregeringen (kun `0 ≤ first_booked_at − kohortestart ≤ w`
tæller, og en række med negativt interval er ikke publicerbar).

## Persistence — én transaktionel skrivevej (rev. 2, fund 2)

Sync-motoren skriver KUN via tre RPC'er i migration 013 (SECURITY INVOKER, EXECUTE kun
`service_role`, faste `CONVERSION_*`-exceptions uden data):

1. `conversion_begin_sync_run(contract_version, lease_seconds)` — advisory lock; kræver
   `status = ACTIVE` og matchende kontraktversion; markerer RUNNING-kørsler med udløbet lease som
   `FAILED/ABANDONED`; afviser hvis en anden kørsel er RUNNING (også håndhævet af et unikt
   partielt indeks); opretter en RUNNING-række med lease; returnerer `sync_generation`.
2. `conversion_commit_sync_run(run_id, sync_generation, contract_version, observed_at, is_baseline,
   rows)` — ÉN transaktion: advisory lock + `FOR UPDATE` på state; validerer lease, generation,
   kontraktversion, monotont `observed_at`, baseline-konsistens, dubletter, rækkernes
   kontraktversion og at ny kohortestart = `observed_at`; upserter hele batchen (triggeren
   `conversion_deal_cohort_guard` afviser enhver ændring af frosne felter og enhver skrivning uden
   for en aktiv commit); afslutter kørslen `SUCCEEDED` med tællere; opdaterer
   `last_successful_sync_at`, `sync_generation` og (ved baseline) `measurement_started_at`. Enhver
   exception ruller ALT tilbage.
3. `conversion_fail_sync_run(run_id, error_code)` — afslutter `FAILED` med en kategorisk kode
   (CHECK-constraint på kodelisten; ingen fritekst).

**Fejl:** motoren returnerer aldrig `ok: true` efter en fejl; hvis selv FAILED-rækken ikke kan
skrives, returneres `auditRecorded: false`. **Crash midt i en kørsel:** kohorten er urørt (commit
er atomisk); RUNNING-rækken blokerer nye kørsler indtil leasen (30 min) udløber, hvorefter næste
`begin` markerer den `ABANDONED`. En kørsel, der har mistet sin lease, kan ikke committe.
**Samtidighed:** lease + unikt indeks + advisory lock + `sync_generation` (optimistisk værn).
Verificeret mod rigtig Postgres (pglite) — se `docs/TESTING.md`.

## Fail-closed læsning (rev. 2, fund 4)

HubSpot: eksakt `total` på hver side (skal være konstant og nås præcist), ingen tomme sider før
total, ingen dubletter (deal-id eller deal_key), tom kilde er en fejl. Supabase: `trips` og HELE
`conversion_deal_cohort` læses via `src/lib/paged-read.ts` (eksakt `count`, fail-closed ved
afkortning); ingen URL-baseret `.in(...)` over deal keys. Enhver ufuldstændig eller ugyldig
læsning blokerer hele sync'en — en ægte ONLINE-deal kan aldrig blive PDF_ONLY pga. en afkortet
`trips`-læsning.

## Delte bookingreferencer — reconciliation (rev. 2, fund 5)

En reference er delt, hvis mere end én distinkt deal bærer den — på tværs af (a) de frosne nøgler
på alle persisterede rækker og (b) de aktuelle, gyldige bookingnumre i HELE den observerede kilde
(uanset status). Uafhængigt af observationsrækkefølge:

- en ny kvalificeret deal med delt reference ⇒ `EXCLUDED/SHARED_BOOKING_REFERENCE` (nøglen gemmes,
  så en senere tredje deal også opdages);
- en allerede `ENROLLED` deal, hvis frosne reference senere bliver delt ⇒
  `booking_conflict_detected_at` sættes én gang (også hvis dealen ikke længere ses i kilden).
  Rækken bevares med sin oprindelige eksponering (revisionsspor), men indgår **aldrig** i
  publicerbare konverteringstal — kun som datakvalitetstal.

## Måledefinition og privacy i publiceringslaget (rev. 3)

**Måledefinition (Issue #80, uændret):** modning pr. **deal**. En deal indgår i vindue w
(30/60/90), når der er gået mindst w dage siden dens kohortestart; den tæller som booket i w, hvis
`0 ≤ first_booked_at − kohortestart ≤ w` dage. Rev. 2's modning pr. kohortemåned er trukket
tilbage — den ændrede den godkendte definition og forsinkede deals op til en måned.

**Privacy ligger udelukkende i publiceringslaget** (`src/lib/conversion/aggregate.ts`):

1. Udfaldsceller publiceres kun, når tilbud n, booket b og ikke-booket n−b alle er ≥ 10; ellers
   skjules tæller, nævner og procent sammen.
2. Modne deals sorteres efter kohortestart (deals fra samme sync holdes altid samlet) og grupperes
   i **hierarkiske publiceringsblokke**:
   - **30-blokke** lukker, når n, b30 og n−b30 alle er ≥ 10;
   - **60-blokke** er sammenhængende 30-blokke, der lukker, når b60 og n−b60 er ≥ 10 **og
     inkrementet b60−b30 er 0 eller ≥ 10**;
   - **90-blokke** er sammenhængende 60-blokke, der lukker, når b90 og n−b90 er ≥ 10 **og
     inkrementet b90−b60 er 0 eller ≥ 10**.
   Vindue w publiceres som summen af lukkede w-blokke; en åben rest tilbageholdes (vises som
   "Ikke nok data endnu"/skjult). Trenden viser 30-blokkene.
3. **Koordinering på tværs af vinduer (review-runde 2 fund 2):** fordi 60-populationen er et præfiks
   af 30-blokkene og 90-populationen et præfiks af 60-blokkene, er alt, der kan udledes ved
   differens mellem 30, 60, 90 og trenden, en sum af blokinkrementer, som hver er 0 eller ≥ 10 —
   for både booket og ikke-booket (inkrementet er det samme tal med modsat fortegn). Eksempel:
   30 tilbud, 15 booket efter 30 dage, 16 efter 60 ⇒ 30-dages-raten vises, 60-dages-cellen skjules,
   indtil den slås sammen med en senere kohorte, så inkrementet bliver ≥ 10.
4. **Over tid:** et vindue vokser kun, når en hel blok lukker, og en moden deals tal er faste, så
   dag-til-dag-ændringer er også 0 eller ≥ 10. Egenskabstest over 260 dages daglig visning og alle
   tre vinduer (`aggregate.test.ts`).
5. Tælletal uden udfald (gruppetotaler, datakvalitet) small-cell-undertrykkes (1–9) med sekundær
   undertrykkelse; tabt/afvist og outcome-konflikter skjules også ved lille komplement.
6. Rækker med bookingkonflikt eller booking før kohortestart indgår aldrig i publicerbare tal.

**Konsekvens for læseren:** de publicerede rater dækker alle modne deals i lukkede blokke; nyligt
modnede deals kan være tilbageholdt, indtil der er nok til en ny blok. Selve definitionen (hvornår
en deal er moden, og hvad der tæller som booket) er uændret.

**Resterende, dokumenteret risiko:** (a) antallet af tilbageholdte/umodne tilbud (uden udfald) kan
udledes som gruppetotal minus en vinduesnævner; (b) hvis en delt bookingreference opdages, EFTER at
en blok er publiceret, fjernes den tidligere ENROLLED-deal fra aggregatet; et tidligere vist tal kan
da falde med 1, og en bruger med daglige snapshots kan udlede dealens udfald.

**Beslutning (Ricko, 2026-09-24, PR #81 review-runde 3):** risiko (b) er **eksplicit accepteret**,
fordi dashboardet er internt og admin-beskyttet (session-login, 401 før enhver læsning, ingen
sælgeropdeling). Løsningen udvides bevidst IKKE med stabiliserede/publicerede snapshots. Accepten
er begrænset til denne interne visning; eksponeres tallene nogensinde uden for admin (eksport,
deling, andre målgrupper), skal risikoen genvurderes før det sker. Se `docs/DECISIONS.md`.

## Admin-API — eksplicit wire-DTO (rev. 2, fund 6)

`GET /admin/api/conversion` returnerer `ConversionWire` (`src/lib/conversion/wire.ts`): alle
datoer som ISO-strenge. Klienten validerer svaret med et zod-skema og formaterer datoer sikkert
(ugyldig ⇒ "—"); der castes aldrig JSON til en type med `Date`-felter. Fejlsvar indeholder kun
generiske tekster. Freshness (`NO_SYNC`/`FRESH`/`STALE` > 36 t) beregnes server-side.

## Trusselsmodel (kort)

| Risiko | Reduktion |
|---|---|
| `HUBSPOT_PRIVATE_APP_TOKEN` lækket | Read-only scope; server-side-only; aldrig i klientkode/repo/logs; roteres uafhængigt |
| Rå deal-id/bookingnummer i DB/UI/logs | Kun domæneadskilte HMAC-nøgler (CHECK: 64 hex-tegn); tomme/korte/ens secrets afvises FØR enhver læsning/skrivning; fejl logges kun som kategoriske koder |
| Lille celle/komplement afsløres (også mellem 30/60/90 og over tid) | Hierarkiske publiceringsblokke (rev. 3), bevist med regressions- og egenskabstests |
| Booking før tilbuddet tælles som konvertering | `BOOKED_BEFORE_QUALIFIED_OBSERVATION` i reducer + DB-CHECK + ikke-negativt interval i aggregeringen (rev. 3) |
| Delvist opdateret kohorte / forkert "succes" | Én transaktionel commit-RPC; fejl giver FAILED-run; aldrig `ok: true` efter fejl |
| Samtidige kørsler overskriver hinanden | Lease + unikt indeks + advisory lock + `sync_generation` |
| Skjult historisk backfill | Ingen historik i adapter-kontrakten; kohortestart = `observedAt` (DB-håndhævet); `measurement_started_at` sættes kun af baseline-commit og er uforanderlig (trigger) |
| Frosne felter ændres af en kodefejl | DB-trigger afviser; skrivning uden for commit-RPC afvises |

## Dataflow (kort)

```
Vercel Cron (Gate C)
  → syncEngine.runConversionSync()
      → secretsAreUsable()                           [før ALT andet]
      → persistence.loadMeasurementState()           [ACTIVE + kontraktversion]
      → persistence.beginSyncRun()                   [RPC: lease]
      → HubSpotReadAdapter.confirmStageContract()    [live stage-liste ⇔ kontrakt 1:1]
      → HubSpotReadAdapter.readDealsPage()×N         [total/dubletter/tomme sider fail-closed]
      → persistence.loadTravelPlanIndex()/loadAllCohortStates()  [paged-read, komplet eller fejl]
      → classify.* pr. deal + delte referencer       [ren funktion]
      → persistence.commitSyncRun()                  [RPC: alt eller intet]
        eller persistence.failSyncRun()              [RPC: FAILED + kode]
  ← Admin: GET /admin/api/conversion
      → adminServer.loadConversionAdminOverview()    [paged-read, streng parsing]
      → aggregate.buildConversionAggregate()          [privacy-model]
      → wire.toConversionWire()                       [ISO-strenge]
```

## Rollback

- **Før Gate B2 (migration ikke anvendt):** revert af PR'en er tilstrækkeligt.
- **Efter Gate B2, før Gate C/D:** tabellerne og RPC'erne kan droppes med en ny, eksplicit
  migration — ingen andre tabeller refererer til dem.
- **Efter Gate D:** `conversion_measurement_state.status = 'PAUSED'` stopper syncs uden datatab
  (begin afviser). Sletning af data kræver Rickos eksplicitte godkendelse.

## Åbne beslutninger til Ricko

1. **Bekræft arkitektur A** (uændret fra rev. 1).
2. **Stage-klassifikationen (Gate C-forudsætning):** de øvrige stages i pipeline `754595640`
   (Screened, solgt, tabt/afvist m.fl.) skal hentes fra live-metadata og klassificeres
   `PRE_QUOTE`/`QUOTE_OR_LATER`/`CLOSED_AMBIGUOUS` med Rickos bekræftelse, før `complete: true`.
   Indtil da fejler enhver officiel sync lukket.

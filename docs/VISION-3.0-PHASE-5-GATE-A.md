# Vision 3.0 Fase 5 — Gate A: read-only datagrundlagsverifikation

> [Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78), barn af
> [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41). Gate A er en
> read-only data- og arkitekturgennemgang — **ingen produktkode, migration, database-write,
> HubSpot-write, secretændring, scheduler eller deploy** i denne runde. Denne rapport er selve
> Gate A-leverancen. Opdateret 2026-09-24 (runde 3): Ricko har selv kørt den eneste udestående
> kommando (`Invoke-QuoteSignalLiveEvidence.ps1`, seneste mergede/reviewede version på
> `origin/integration/marketing-dashboard-google-ads-v1` i `ricko-spec/dk-wanderlust-spy`) og delt
> det fulde, aggregerede output. Denne runde dokumenterer resultatet og skelner eksplicit mellem
> historisk og prospektiv måling, som Ricko bad om.

## Afgørelse

## **GO MED FORBEHOLD** — men KUN til den prospektive måling. Historisk backfill forbliver blokeret.

To adskilte spørgsmål, to adskilte svar:

1. **Kan HubSpots historik bruges til at rekonstruere fortidens "Tilbud sendt"?** **Nej.**
   Live-målt dækning er 6,2 % over al historik, og dækningen er **0 % i hver eneste måned fra
   september 2025 til og med maj 2026** (1.538 af de 2.386 deals i scope). Dette bekræfter — med ny,
   dokumenteret live-evidens, ikke en antagelse — Issue #78's eget punkt 8's forbehold: historisk
   stage-history er ikke en sandhedskilde. **Historisk backfill af kohorten er derfor blokeret,
   fuldt stop.**
2. **Kan en prospektiv, fremadrettet måling starte pålideligt fra nu?** **Ja, med forbehold.**
   Pipeline- og stage-kontrakten er live-bekræftet uden uoverensstemmelser (`allConfirmed: true`),
   og selve læsemekanismen er fuldt pålidelig (100 % `complete_and_reconciled` historik). Et
   ubegrundet fund (`afterOutcomeRatio` 51,2 %, se §3.2) skal adresseres i Gate B's design af selve
   den daglige synkronisering, før den aktiveres — men blokerer ikke at gå videre til det
   designarbejde. Den historiske `UNUSABLE`-dom blokerer **ikke automatisk** den prospektive løsning
   (Rickos eksplicitte instruks) — den blokerer specifikt **kun** brug af HubSpots retrospektive
   historik som datagrundlag, og medfører at målingen skal starte fra en fast, dokumenteret
   startdato (§4) i stedet.

**Scope af "GO MED FORBEHOLD":** tilladelse til at gå videre til **Gate B — design af
migration/persistence for den prospektive daglige synkronisering**. **Ikke** en godkendelse af
migration, secrets, scheduler eller nogen live produktionsmåling — de har hver deres egen gate
(B, C, D) og kræver Rickos særskilte godkendelse, uændret fra Issue #78's egen arbejdsform.

---

## 1. Hvad ER verificeret (dette repo, read-only, ingen HubSpot)

### 1.1 Repository- og arkitekturgate
```
Repo:         ricko-spec/unique-travel-rejsepraesentation  ✓
Branch:       docs/gate-a-conversion-measurement-78 (fra frisk origin/main)
origin/main:  c407d6264b7c75848787c557e67d30a59a8f4c3b (uændret gennem alle tre runder)
```

### 1.2 Fase 4/Issue #76/PR #77 — bekræftet MERGED (rettelse af stale docs)
`docs/STATUS.md`, `docs/ROADMAP.md` og `docs/CHECKPOINT.md` indeholdt før runde 1 formuleringer om
at Fase 4/PR #77 "ikke er merget". Verificeret mod GitHub: **PR #77 blev merget
2026-09-19T09:24:56Z, merge-commit `c407d626`, base `main`** — identisk med nuværende `main`/HEAD.
Salgsoversigten (Åbnet/Set/Kontakt/Seneste aktivitet i `/admin`) er altså **live i production**.
Rettet i runde 1.

### 1.3 Data der allerede findes i dette repo til brug for online/PDF-only-kohorten
| Felt | Kilde | Pålidelighed |
|---|---|---|
| `booking_no` | `trips.booking_no` (unique, NOT NULL) | Stabil identitet — bruges allerede som upsert-nøgle og kundens adgangskode |
| Oprettelsestidspunkt for online rejseplan | `trips.created_at` | Sat én gang, ændres **aldrig** ved re-upload |
| Aktiv/inaktiv | `trips.active` | Soft-delete; re-upload sætter altid `true` |
| Sikker matchnøgle uden bookingnummer i klartekst | `booking_match_key = HMAC-SHA256(BOOKING_MATCH_SECRET, booking_no.trim())` | Live siden Issue #45/PR #46 (2026-09-16) |
| Målt kundeaktivitet (sekundært signal) | `trip_visits` / `trip_section_engagement` / `trip_contact_intent` | Live siden hhv. 2026-09-18 og 2026-09-19 |

### 1.4 Eksisterende genbrugeligt fundament i dette repo
- Analytics Bridge API (`GET /api/internal/analytics/travel-plans`, Issue #45) — genbruges 1:1 til
  den nye kohorte-synkronisering. Marketing Dashboards eget join-arbejde konsumerer allerede netop
  dette API.
- `toTravelPlanRecord()`-mønstret (aldrig `...row`-spredning) — direkte genbrugeligt skabelon.
- `paged-read.ts` (count-baseret, ingen tavs afkortning) — bør genbruges til den daglige
  HubSpot-synkroniserings paginering.

---

## 2. Adgangsvej (uændret fra runde 2)

HubSpot-MCP/OAuth-sporet er droppet. Al adgang sker via en IT-udstedt Private App-token, sat
**kun** midlertidigt i Rickos eget shell (`HUBSPOT_PRIVATE_APP_TOKEN`, `Read-Host -AsSecureString`,
ryddet i `finally`). Ingen agent har set eller håndteret tokenet. `docs/ACCESS_MATRIX.md` afspejler
dette.

---

## 3. Live-evidens (2026-09-24, kørt af Ricko selv, read-only)

Kommando: `Invoke-QuoteSignalLiveEvidence.ps1` (`--mode=quote-history-evidence`), **seneste
mergede/reviewede version på `origin/integration/marketing-dashboard-google-ads-v1`** i
`ricko-spec/dk-wanderlust-spy`. Output er allerede rent aggregeret (scriptets egen
`assertReportIsAggregateOnly`-vagt forhindrer andet) — gengivet her i sin helhed, som Issue #78's
eget acceptkriterium kræver ("Gate A dokumenterer live-valideret stage- og feltkontrakt med kun
aggregater").

### 3.1 Stage-/pipelinekontrakt — bekræftet, ingen uoverensstemmelser

```
PHASE5B3_STAGE_CONTRACT {"version":1,"pipelineConfirmed":true,"quoteSent":"confirmed",
"updatedQuote":"confirmed","allConfirmed":true,"reasonsDa":[]}
```

Pipeline `754595640` og de to stage-id'er (`1098732868` = "Tilbud sendt", `1169407502` =
"Opdateret tilbud") er **live bekræftet mod HubSpot i selve denne kørsel** — ikke kun genbrugt fra
et ældre PR. Dette lukker Issue #78's krav 1-3 for denne kandidat fuldt ud.

### 3.2 Gate M-vurdering: `UNUSABLE` for **historisk rekonstruktion** — kandidat `dealstage-history-quote-milestone`

```json
{
  "assessment": {
    "verdict": "UNUSABLE",
    "reasonsDa": ["dækning 6.2% er under brugbarhedsgrænsen"],
    "measurement": {
      "coverageRatio": 0.0620,
      "temporalConsistencyRatio": 0.4884,
      "missingUnknownRatio": 0.8730,
      "afterOutcomeRatio": 0.5116,
      "semanticChangeAtCutover": false,
      "sampleSize": 2386
    }
  },
  "dataHealth": {
    "dealsInScope": 2386,
    "established": 148,
    "byReasonCode": {
      "ok": 148, "history-not-usable": 0, "no-quote-event": 2083,
      "quote-event-before-createdate": 0, "quote-event-after-outcome": 155
    },
    "byHistoryState": { "complete_and_reconciled": 2386 },
    "multipleQuoteEvents": 24,
    "updatedQuoteWithoutFirstOffer": null,
    "updatedQuoteObservedAmongEstablished": 23
  },
  "recommendedProcessReliableFromMonth": null
}
```

**Læsning:**
- **Læsemekanismen selv er 100 % pålidelig** — alle 2.386 deals har `complete_and_reconciled`
  historik (ingen huller/inkonsistens i selve dataindsamlingen). Problemet er ikke scriptet; det er
  hvad HubSpots historik faktisk indeholder for ældre deals.
- **87,3 % af deals (2.083/2.386) har intet registreret "Tilbud sendt"-event overhovedet**
  (`no-quote-event`) — kun 148 (6,2 %) har et brugbart, tidsmæssigt konsistent event
  (`established`/`ok`).
- **`afterOutcomeRatio` 51,2 %** — af de 303 deals der HAR et detekteret quote-event (148 `ok` +
  155 `quote-event-after-outcome`), er **over halvdelen** tidsstemplet EFTER at deal-udfaldet
  allerede var afgjort. Dette er logisk usammenhængende for "Tilbud sendt" som et ledende signal og
  er **ikke forklaret af denne måling alene** — kan skyldes retroaktive rettelser af ældre,
  allerede lukkede deals, eller gen-quotede/genåbnede sager. **Skal adresseres i Gate B's design**
  (se §5), men er en egenskab ved den RETROSPEKTIVE historik-læsning — ikke nødvendigvis noget der
  gentager sig i en prospektiv, dag-for-dag-observerende synkronisering.
- `history-not-usable: 0` og `quote-event-before-createdate: 0` — ingen fund i disse kategorier.
- `multipleQuoteEvents: 24` — 24 deals har mere end ét "Tilbud sendt"-event i historikken (adskilt
  fra "Opdateret tilbud", som er en egen stage og ikke tæller som endnu et tilbud).
- `recommendedProcessReliableFromMonth: null` — scriptet gætter bevidst ikke selv en cutovermåned;
  det er en menneskelig vurdering ud fra den månedlige fordeling nedenfor.

### 3.3 Månedlig fordeling — den konkrete evidens bag "ingen historisk backfill"

| Måned | Deals i alt | Etableret ("Tilbud sendt" pålideligt fundet) | Andel |
|---|---|---|---|
| 2025-09 | 67 | 0 | 0,0 % |
| 2025-10 | 81 | 0 | 0,0 % |
| 2025-11 | 85 | 0 | 0,0 % |
| 2025-12 | 95 | 0 | 0,0 % |
| 2026-01 | 203 | 0 | 0,0 % |
| 2026-02 | 252 | 0 | 0,0 % |
| 2026-03 | 171 | 0 | 0,0 % |
| 2026-04 | 464 | 0 | 0,0 % |
| 2026-05 | 120 | 0 | 0,0 % |
| 2026-06 | 126 | 7 | 5,6 % |
| 2026-07 | 206 | 47 | 22,8 % |
| 2026-08 | 335 | 77 | 23,0 % |
| 2026-09 (delvis, til 24/9) | 181 | 17 | 9,4 % |

**Læsning:** 0,0 % etableret i **ni sammenhængende måneder** (sep. 2025 – maj 2026, 1.538 deals),
efterfulgt af et klart, brat spring fra juni 2026. Dette er ikke "der var ingen tilbud dengang"
(usandsynligt for en rejsebureau-pipeline med hundredvis af deals/måned) — det er et **dataartefakt**
i HubSpots egen historik for ældre/importerede deals, præcis den kontaminationsrisiko Issue #78's
forretningsdefinition advarer imod. Springet i juni 2026 er ikke i sig selv årsagsforklaret af denne
måling (kan være en proces-, migrations- eller konfigurationsændring) — kun tidspunktet er observeret.

**Konsekvens (Rickos instruks, denne runde):** et `UNUSABLE`-resultat for historisk rekonstruktion
blokerer **ikke automatisk** den prospektive løsning. Det blokerer **specifikt historisk backfill**
og betyder at målingen skal starte fra en **fast, dokumenteret startdato** — se §4.

### 3.4 Hvad IKKE er målt i denne runde

- **Match-/dæknings-/dublet-tal mod Online Rejseplan (join-mode) er ikke genmålt.** Kun de 3+ dage
  gamle referencetal fra Marketing Dashboards egen Gate 3 (2026-09-21, "271 rejseplaner, 197
  matchet") findes — se det tidligere afsnit i denne rapports historik (nu fjernet som selvstændig
  sektion for at holde rapporten fokuseret på den bekræftede live-evidens; tallene kan genfindes i
  PR #101 hvis Ricko ønsker dem citeret igen).
- Screened-deal-antal er ikke separat talt (mekanismen definerer Screened som "aldrig passeret
  stage 1098732868" — indirekte dækket af `no-quote-event`-bucket'en, men ikke isoleret som eget tal
  i denne kørsel).

---

## 4. Startdato — nu et dokumenteret, evidensbaseret krav, ikke kun en præference

- Fase 1B/1C's `TRACKING_SINCE` og Fase 3's `CONTACT_INTENT_TRACKING_SINCE` er **engagement-
  målingens** start — stadig irrelevante for Fase 5's kohorte-nulpunkt.
- **Bindende for den officielle prospektive måling (Rickos instruks + nu understøttet af §3.3's
  evidens):** kohorten starter fra en **fast, dokumenteret startdato** — konkret defineret som
  **første succesfulde daglige synkronisering**, ikke en bagudskuende dato udledt af HubSpot- eller
  `trips`-historik. Dette er ikke længere kun en "foreløbig præference" — §3.3 viser konkret, at en
  bagudskuende rekonstruktion for perioden før juni 2026 ville være baseret på et kendt, målt
  dataartefakt (0 % dækning), ikke manglende reel aktivitet.
- Historiske tal (§3.2-§3.3, samt Marketing Dashboards egne 2026-09-21-tal) må vises som
  **eksplorative** i et separat afsnit af et fremtidigt dashboard, men indgår **aldrig** i den
  officielle konverteringsmåling uden en fremtidig, selvstændig, stærkere evidensbasis end denne
  rapport.
- Den præcise kalenderdato for "første succesfulde daglige synkronisering" kendes naturligvis
  først når Gate C (scheduler) aktiveres — det er korrekt og forventet, at dette nulpunkt er
  fremadrettet defineret, ikke en dato, der findes i dag.

---

## 5. Historisk vs. prospektiv måling — eksplicit adskilt, som bedt om

| | **Historisk måling (retrospektiv)** | **Prospektiv måling (fremadrettet)** |
|---|---|---|
| Spørgsmål | Kan HubSpots historik bruges til at rekonstruere fortidens "Tilbud sendt"? | Kan en daglig, fremadrettet synkronisering måle det pålideligt fra nu? |
| Afgørelse | **Nej — `UNUSABLE`** (6,2 % dækning, 0 % i 9 sammenhængende måneder) | **Ja, med forbehold** — pipeline/stage-kontrakt bekræftet ren; ét ubegrundet fund skal adresseres i designet (`afterOutcomeRatio`, se §3.2) |
| Konsekvens | **Backfill af kohorten fra HubSpot-historik er blokeret, fuldt stop.** Bruges kun til eksplorativ kontekst, aldrig officielle tal | **GO MED FORBEHOLD til Gate B** — design af den daglige synkronisering, migration/persistence. Ikke en godkendelse til at aktivere selve målingen (kræver Gate C/D) |
| Nulpunkt | N/A — findes ikke, og skal ikke findes | Fast, dokumenteret dato = første succesfulde daglige sync (§4) |

**Kohorte-/udfaldsdefinition for den prospektive måling** (Rickos præcisering denne runde):

- Kvalifikation: deal når stage `1098732868` ("Tilbud sendt") **eller senere**. `Screened`
  (aldrig passeret denne stage) tæller **aldrig** som tilbud sendt.
- `Opdateret tilbud` (`1169407502`) starter **aldrig** en ny kohorte — samme kohorte, samme
  tidsstempel for første kvalificerede observation.
- Eksponeringsgruppe ved første kvalificerede observation: **PDF + online rejseplan** (matchende
  online rejseplan eksisterede allerede) vs. **Kun PDF** (ingen matchende online rejseplan på det
  tidspunkt). Gruppen fryses permanent — ændres aldrig bagudrettet, heller ikke hvis der senere
  oprettes en online rejseplan for samme booking.
- Udfald: **Booket** vs. **Ikke booket endnu**. Mellemstadier (Opdateret tilbud, øvrige interne
  stages) ændrer **ikke** udfaldsdefinitionen — kun overgangen til det UT-ejede
  "solgt/booket"-signal (`unique_travel_dealstatus`, ikke dealstage-id, jf. §3.1's tidligere
  dokumenterede designvalg) tæller som Booket.
  *Note til Ricko:* denne to-tilstands-udfaldsmodel (Booket/Ikke booket endnu) erstatter det
  tidligere udkasts firedeling (OPEN/WON/LOST/UNKNOWN) for selve **hovedmålingen**. Om et
  eksplicit tabt/afvist-udfald (adskilt fra "endnu ikke booket") skal vises separat i
  data-kvalitets-/statusrapportering, er ikke afklaret her — flagget i §6, ikke antaget.

---

## 6. Åbne beslutninger til Ricko

1. **Bekræft GO MED FORBEHOLD-scopet** (§"Afgørelse"): tilladelse til Gate B-design, ikke til at
   aktivere nogen live måling.
2. **`afterOutcomeRatio` (51,2 %, §3.2)** — skal undersøges/forklares, eller er det acceptabelt at
   Gate B's design blot undgår retrospektiv historik-læsning helt (observér kun dagens faktiske
   stage ved hver sync, byg egen historik fremadrettet) og dermed sandsynligvis omgår problemet?
3. **Booket/Ikke booket endnu vs. et separat tabt/afvist-udfald** (§5, note) — skal "Ikke booket
   endnu" også dække deals HubSpot selv har lukket som tabt, eller skal tabt vises som en tredje,
   synlig tilstand i datakvalitetsrapporteringen (uden at være del af selve
   konverteringsprocent-hovedtallet)?
4. Valgfrit, ikke blokerende: skal `--mode=join` køres frisk for at opdatere Marketing Dashboards
   3+ dage gamle match-/dæknings-tal (271 rejseplaner/197 matchet), eller er de tilstrækkelige som
   eksplorativ reference indtil Gate B?
5. Godkend/juster kohortemodellens Gate B-startpunkt: skal Gate B-designarbejdet startes som eget
   issue nu, eller afvente et separat oplæg først?

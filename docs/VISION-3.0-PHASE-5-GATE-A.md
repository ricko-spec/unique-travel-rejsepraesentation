# Vision 3.0 Fase 5 — Gate A: read-only datagrundlagsverifikation

> [Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78), barn af
> [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41). Gate A er en
> read-only data- og arkitekturgennemgang — **ingen produktkode, migration, database-write,
> HubSpot-write, secretændring, scheduler eller deploy** i denne runde. Denne rapport er selve
> Gate A-leverancen. Opdateret 2026-09-24 (runde 2): adgangsvej ændret fra HubSpot-MCP/OAuth til en
> godkendt HubSpot Private App-token, og eksisterende, allerede verificeret reference-arbejde fra
> Marketing Dashboard-projektet (`ricko-spec/dk-wanderlust-spy`, privat repo) er inddraget — kun som
> reference/operatørværktøj, jf. Rickos eksplicitte, snævre godkendelse (se §5).

## Afgørelse

## **MEASUREMENT_BLOCKED**

Uændret fra runde 1, men markant tættere på ophævelse. Ingen live HubSpot-kald er foretaget **af
en agent** i nogen runde — kun read-only research af allerede eksisterende, tidligere Ricko-kørte
og reviewede arbejde i et andet, privat repo. Pipeline-, property- og stage-kontrakten er nu
**dokumenteret og forklaret** (§3), men er **reference-evidens fra et andet projekts tidligere
live-kørsler** (2026-09-21 og tidligere), ikke en ny, live-verificeret måling for **dette**
kapitel. Issue #78's eget punkt 8 ("historisk stage-history blev tidligere vurderet utilstrækkelig
— genbrug ikke den som sandhed uden ny dokumenteret evidens") betyder konkret her: den **nyeste**
og mest robuste kandidat til stage-kontrakten (dealstage-*historik*-baseret "Tilbud sendt"-læsning,
§3.3) er bygget og enhedstestet i Marketing Dashboard-projektet, men **er selv i det projekt aldrig
kørt live** — dens egen Gate M står stadig som `MEASUREMENT_BLOCKED` per seneste kendte status
(PR #140, merget 2026-09-23). Der findes derfor ingen frisk, live-bekræftet evidens at læne denne
rapports afgørelse op ad endnu.

**Hvad der nu udestår er præcist afgrænset til: én kommando, kørt af Ricko selv, med det nyligt
udstedte Private App-token.** Alt forberedende arbejde — kontrakt-dokumentation, sikkerhedsgrænser,
hvilken kommando, hvorfor hvert felt er nødvendigt — er gjort i denne runde (§3-§4).

---

## 1. Hvad ER verificeret (dette repo, read-only, ingen HubSpot)

Uændret fra runde 1 — se §1.1-§1.4 nedenfor for de fire underpunkter.

### 1.1 Repository- og arkitekturgate
```
Repo:         ricko-spec/unique-travel-rejsepraesentation  ✓
Branch:       docs/gate-a-conversion-measurement-78 (fra frisk origin/main)
origin/main:  c407d6264b7c75848787c557e67d30a59a8f4c3b (identisk med daværende HEAD, hentet før branch)
```
Genbekræftet ved start af denne runde (2026-09-24): samme resultat.

### 1.2 Fase 4/Issue #76/PR #77 — bekræftet MERGED (rettelse af stale docs)
`docs/STATUS.md`, `docs/ROADMAP.md` og `docs/CHECKPOINT.md` indeholdt før runde 1 formuleringer om
at Fase 4/PR #77 "ikke er merget". Verificeret mod GitHub: **PR #77 blev merget
2026-09-19T09:24:56Z, merge-commit `c407d626`, base `main`** — identisk med nuværende `main`/HEAD.
Salgsoversigten (Åbnet/Set/Kontakt/Seneste aktivitet i `/admin`) er altså **live i production**,
ikke kun implementeret og afventende. Rettet i runde 1.

### 1.3 Data der allerede findes i dette repo til brug for online/PDF-only-kohorten
| Felt | Kilde | Pålidelighed |
|---|---|---|
| `booking_no` | `trips.booking_no` (unique, NOT NULL) | Stabil identitet — bruges allerede som upsert-nøgle og kundens adgangskode |
| Oprettelsestidspunkt for online rejseplan | `trips.created_at` | Sat én gang, ændres **aldrig** ved re-upload (ikke med i upsert-payload) |
| Aktiv/inaktiv | `trips.active` | Soft-delete; re-upload sætter altid `true` |
| Sikker matchnøgle uden bookingnummer i klartekst | `booking_match_key = HMAC-SHA256(BOOKING_MATCH_SECRET, booking_no.trim())` | Live siden Issue #45/PR #46 (2026-09-16), testet, dokumenteret `docs/ANALYTICS-BRIDGE-API.md` |
| Målt kundeaktivitet (sekundært signal, ikke del af Gate A's kernemåling) | `trip_visits` / `trip_section_engagement` / `trip_contact_intent` | Live siden hhv. 2026-09-18 og 2026-09-19 (Fase 1B/1C/2/3) |

`trips` har eksisteret siden initial commit (2026-05-23). **`created_at` er teknisk pålidelig hele
vejen tilbage** — men det er IKKE det samme som at vide hvornår Online Rejseplan reelt gik i
production-brug over for kunder (se §4).

### 1.4 Eksisterende genbrugeligt fundament i dette repo
- Analytics Bridge API (`GET /api/internal/analytics/travel-plans`, Issue #45) — server-to-server,
  Bearer-auth, HMAC-matchnøgle-mønster kan genbruges 1:1 til den nye kohorte-synkronisering.
  Marketing Dashboard-projektets eget join-arbejde (§3) konsumerer allerede netop dette API som
  ekstern klient — samme kontrakt, ingen ændring nødvendig her.
- `toTravelPlanRecord()`-mønstret (aldrig `...row`-spredning) — direkte genbrugeligt skabelon.
- `paged-read.ts` (count-baseret, ingen tavs afkortning) — samme mønster bør genbruges til den
  daglige HubSpot-synkroniserings paginering.

---

## 2. Adgangsvej — rettelse fra runde 1

**Runde 1** undersøgte OAuth/HubSpot-MCP-forbindelse. Ricko stoppede dette spor eksplicit
(2026-09-24): "IT har allerede udstedt en godkendt HubSpot Private App-nøgle til read-only brug."
Al efterfølgende adgang bruger **udelukkende**:

- Miljøvariablen `HUBSPOT_PRIVATE_APP_TOKEN` — sat **kun** midlertidigt i Rickos eget shell, læst
  via `Read-Host -AsSecureString` (ingen skærmekko), ryddet i en `finally`-blok uanset udfald.
- **Aldrig** indsat i Claude Code-chatten, en fil, `.env`, GitHub, en log eller et commit.
- Ingen HubSpot-MCP-forbindelse er forsøgt godkendt i denne runde. De to tidligere undersøgte
  MCP-forbindelser (`claude.ai HubSpot`, `plugin:marketing:hubspot`) er **ikke** brugt eller
  autoriseret — det spor er droppet, ikke kun sat i baggrunden.
- `docs/ACCESS_MATRIX.md` er rettet (samme commit som denne rapport) til at beskrive
  Private App-operatørvejen i stedet for OAuth/MCP — se diffen i PR #79.

---

## 3. Reference-evidens: eksisterende, allerede verificeret arbejde i Marketing Dashboard

**Ricko godkendte eksplicit** (2026-09-24) at dette kapitel må bruge `ricko-spec/dk-wanderlust-spy`
(privat repo, "Marketing Dashboard") **read-only, kun som reference og operatørværktøj** — ingen
ændringer, ingen nye issues/PR'er/commits dér, intet projektarbejde flyttes dertil. Undersøgt
read-only i denne runde: **PR #101** (merget 2026-09-21, Issue #100 "Vision 3.0 Fase 5A —
join-bevis rejseplan × HubSpot") og **PR #140** (merget 2026-09-23, Issue #139 "Fase 5B-3 —
live-valideret dealstage-history-reader for 'Tilbud sendt'"), samt de to filer Ricko navngav:
`scripts/travelplan-join-dry-run.ts` og `scripts/operator/Invoke-QuoteSignalLiveEvidence.ps1`
(begge på branchen `integration/marketing-dashboard-google-ads-v1`, ikke endnu på `main` i det
repo). Ingen filer fra dette repo er kopieret ind i `unique-travel-rejsepraesentation` — kun de
konfigurationsfakta (ID'er/navne) og konklusioner der er nødvendige for at dokumentere **dette**
kapitels egen stage-/feltkontrakt, jf. Issue #78's acceptkriterium 1.

### 3.1 Hvad er allerede bekræftet dér (og genbruges her som kontrakt, ikke som Gate A-tal)

| Fakta | Status i Marketing Dashboard | Hvordan bekræftet |
|---|---|---|
| Pipeline-id `754595640` | Bekræftet, live-valideret gentagne gange (`confirmQuoteStageContract` kører denne kontrol FØR enhver klassifikation, i både join- og quote-history-evidence-læsevejen) | Live, read-only, af Ricko |
| Bookingnummer-property: internt navn `unique_travel_bookingno`, label "Unique Travel BookingNO" | **Gate 2 PASS** (2026-09-21) — bekræftet at det ER TravelWire-bookingnummeret, kan være udfyldt **før** salgets udfald, verificeret manuelt på åbne/solgte/afviste deals | Ricko, manuel semantisk bekræftelse, ikke kun feltnavn |
| Stage "Tilbud sendt" = stage-id `1098732868` | Del af kontrakten der live-bekræftes ved hver kørsel | `confirmQuoteStageContract` mod `GET /crm/v3/pipelines/deals` |
| Stage "Opdateret tilbud" = stage-id `1169407502` | Samme | Samme — **starter aldrig en ny kohorte, nulstiller aldrig tiden, tæller aldrig som endnu et tilbud** (eksplicit testet i begge rækkefølger) |
| UT's eget salgs-status-felt: `unique_travel_dealstatus` (værdier inkl. "Solgt", "Billetter sendt" = solgt-bucket) | Bekræftet property, brugt som **eneste** kilde til Solgt/booket — bevidst IKKE dealstage-id, for at undgå to potentielt modstridende udfaldskilder | Dokumenteret designbeslutning, reviewet |
| Outcome-klassifikation (WON/LOST/UNKNOWN) | Bygger på `unique_travel_dealstatus` + HubSpots egne `hs_is_closed`/`hs_is_closed_won`-flag — **aldrig** dealstage-id | Samme |

### 3.2 Hvordan dette besvarer Issue #78's stage-kontrakt-krav — og hvorfor det AFVIGER fra den bogstavelige formulering

Issue #78 beder om en **stage-id for "Screened"** og en eksplicit liste af "øvrige stages hvor
kunden allerede har fået tilbud". Marketing Dashboard-arbejdet besvarer det samme spørgsmål med en
**strengere, mere robust mekanisme**, som **ikke kræver disse enkelt-ID'er**:

- Kvalifikation til tilbudskohorten afgøres af **dealstage-*historik*** (er stage `1098732868`
  **nogensinde** passeret for denne deal — ikke kun dealens **nuværende** stage). En deal der
  aldrig har passeret `1098732868` er per definition "Screened eller tidligere" — der er ikke
  brug for et separat Screened-id, fordi mekanismen er en tærskel i historikken, ikke en liste af
  kategorier.
- Fordi kvalifikationen er historik-baseret, dækker den **automatisk** alle efterfølgende stages
  (Opdateret tilbud, Solgt, Tabt, enhver anden sen stage) — en deal der engang nåede
  "Tilbud sendt" forbliver kvalificeret uanset hvor den er nu. Det opfylder Issue #78's krav 2's
  sidste led ("øvrige stages, hvor kunden allerede må have fået første tilbud") uden en udtømmende
  stage-liste.
- Solgt/booket vs. tabt/afvist afgøres **bevidst ikke** af dealstage-id, men af det separate,
  UT-ejede statusfelt + HubSpots lukke-flag — en dokumenteret, reviewet beslutning i Marketing
  Dashboard-projektet for at undgå to kilder til samme udfald, der kan komme i modstrid.

**Konsekvens for dette kapitel:** stage-/feltkontrakten kan dokumenteres som ovenfor, men den
konkrete, **friske** live-måling (antal deals pr. tilstand, dækning, dubletter, delte referencer,
match mod Online Rejseplan, månedlig fordeling) for **dette** kapitel er **ikke** foretaget endnu —
kun de ældre 2026-09-21-tal fra Marketing Dashboards egen Gate 3 findes (se §3.3), og de er en
**anden populations snapshot** (deres egen definerede periode/scope), ikke nødvendigvis den
periode/det scope Online Rejseplans Gate A skal bruge (jf. Rickos prospektive præference, §4).

### 3.3 Tidligere målte tal i Marketing Dashboard (2026-09-21, EKSPLORATIVE — ikke denne rapports Gate A-tal)

Gengivet **udelukkende som kontekst/reference**, ikke som en afgørelse for dette kapitel. Alle tal
er allerede aggregater (ingen bookingnumre/kundedata), offentliggjort af Marketing Dashboard-teamet
i deres eget PR #101 efter Rickos egen live, read-only kørsel:

- Rejseplaner: 271 i alt, **197 matchet (72,7 %)** mod Analytics Bridge; 265 aktive (194 matchet,
  73,2 %), 6 inaktive (3 matchet, 50,0 %).
- Deals (2.606 i alt, al historik, ingen `createdate`-filtrering): referencetilstand `single`
  1.940/2.606 (74,4 %), `empty` 666, `multiple`/`invalid-format`/`field-missing` alle 0; `matched`
  197, `noPlan` 1.456, **`conflictSharedReference` 287 deals fordelt på 142 grupper**.
- Outcome: OPEN 254 (142 med reference, 41 matchet) · WON 777 (576 med reference, 76 matchet) ·
  LOST 1.548 (1.198 med reference, 78 matchet) · UNKNOWN 27 (24 med reference, 2 matchet). *Forbehold
  fra Marketing Dashboard selv: OPEN/UNKNOWN-fordelingen blev målt før en senere outcome-regelrettelse
  — en ny kørsel kan flytte nogle fra OPEN til UNKNOWN; antallet er ikke genmålt.*
- **Marketing Dashboards egen bindende anbefaling dengang: "GO MED FORBEHOLD til Fase 5B"**, med
  seks eksplicitte forbehold — herunder at de 142 delte-reference-grupper (287 deals) skal
  undersøges før automatisk kobling, de 71 rejseplaner uden deal skal behandles som dækningsgab, og
  at resultaterne **ikke** må bruges som bevis for kausal effekt.
- **Gate M (dealstage-*historik*-baseret "Tilbud sendt"-evidens, den nyeste og mest robuste
  kandidat) er selv i Marketing Dashboard-projektet ALDRIG kørt live** — bygget og enhedstestet
  (629/629 tests, PR #140), men blokeret på nøjagtig samme ting som dette kapitel:
  `HUBSPOT_PRIVATE_APP_TOKEN` var ikke tilgængeligt i en agent-session. Status der: `MEASUREMENT_BLOCKED`.

---

## 4. Startdato — uændret fra runde 1, nu med Rickos præference tilføjet

- Fase 1B/1C's `TRACKING_SINCE = 2026-09-18T12:20:18Z` og Fase 3's
  `CONTACT_INTENT_TRACKING_SINCE = 2026-09-19T08:21:19Z` er **engagement-målingens** start — ikke
  relevante for om en online rejseplan overhovedet blev oprettet, og må ikke genbruges som Fase 5's
  kohorte-nulpunkt.
- **Rickos eksplicitte, foreløbige præference (2026-09-24): en ren prospektiv start ved første
  succesfulde daglige synkronisering.** Historiske tal (inkl. §3.3's 2026-09-21-tal fra Marketing
  Dashboard, og enhver `trips.created_at`-baseret bagudskuende optælling) må vises som
  **eksplorative**, men blandes ikke ind i den officielle konverteringsmåling uden stærk evidens.
  Dette er den foretrukne af de to muligheder Issue #78 selv stiller op (officiel start ved første
  sync vs. en tidligere, dokumenteret pålidelig historisk kohorte).
- Konsekvens: den **officielle** Gate A/Fase 5-måling behøver ikke en bagudskuende cutoverdato
  udledt af `trips.created_at` eller HubSpot-historik — nulpunktet er teknisk defineret som "første
  gang den daglige synkronisering kører succesfuldt", hvilket fjerner behovet for at gætte en dato.
  Dette afgøres endeligt, når Gate A i øvrigt kan ophæves.

---

## 5. Den ene kommando der udestår

**Ingen ny PowerShell-blok er skrevet i denne runde** — Ricko bad eksplicit om at genbruge den
eksisterende, allerede reviewede og testede operatør-procedure i stedet for at opfinde en ny
HubSpot-klient. Den findes i `ricko-spec/dk-wanderlust-spy` (privat repo), branch
`integration/marketing-dashboard-google-ads-v1`:

```
scripts/operator/Invoke-QuoteSignalLiveEvidence.ps1
```

**Hvad den gør (læst read-only, ikke ændret):** beder om `HUBSPOT_PRIVATE_APP_TOKEN` via
`Read-Host -AsSecureString` (ingen ekko), sætter den **kun** som miljøvariabel for barneprocessen,
kører `bun scripts/travelplan-join-dry-run.ts --mode=quote-history-evidence` (read-only: ingen
HubSpot-writes, ingen filer skrives, ingen Supabase-adgang), og rydder token/SecureString/
udklipsholder i en `finally`-blok der kører uanset udfald (også ved fejl/Ctrl-C).

**Hvorfor netop denne kommando, og ikke en anden:** den er den **eneste** af Marketing
Dashboard-projektets fire-fem modes, der (a) kun kræver ét credential
(`HUBSPOT_PRIVATE_APP_TOKEN` — ikke også `ANALYTICS_BRIDGE_API_KEY`/`BOOKING_MATCH_SECRET`), (b)
**aldrig er kørt live før** (så resultatet er reel ny evidens, ikke en gentagelse af §3.3's
3 dage gamle tal), og (c) direkte besvarer Issue #78's stage-kontrakt-krav
(`confirmQuoteStageContract` + dealstage-historik for "Tilbud sendt"/"Opdateret tilbud") — den
allerede identificerede, dokumenterede erstatning for en litterær Screened-stage-liste (§3.2).

**Hvad den udskriver:** kun aggregater — stage-kontrakt-bekræftelse (pipeline-id + de to
stage-id'er, live bekræftet mod HubSpot i selve kørslen), en Gate M-vurdering
(`STRONG`/`USABLE_WITH_CAVEATS`/`UNUSABLE`), en Data Health-rapport og en månedlig
dæknings-/fordelingsoversigt — **aldrig** deal-id'er, bookingreferencer eller andre
identifikatorer. Scriptets egen `assertReportIsAggregateOnly`-vagt kaster og forhindrer output, hvis
det ikke er tilfældet.

**Kørsel (Ricko, i sit eget shell, i en checkout af `dk-wanderlust-spy` på branchen
`integration/marketing-dashboard-google-ads-v1`):**

```
.\scripts\operator\Invoke-QuoteSignalLiveEvidence.ps1
```

Valgfrit: `-OutFile <sti>` for at gemme output (samme aggregat-only-indhold) til en lokal fil.

**Efter kørsel:** del kun konsol-/fil-outputtet (tal, verdict, stage-kontrakt-bekræftelse) tilbage
— aldrig en anden eksport fra HubSpot. Jeg opdaterer denne rapport, Issue #78-kommentaren og PR
#79 med resultatet og den endelige Gate A-afgørelse, når det foreligger.

**Valgfrit, ikke krævet nu:** en frisk kørsel af `--mode=join --property=unique_travel_bookingno`
(kræver også `ANALYTICS_BRIDGE_API_KEY` + `BOOKING_MATCH_SECRET`) ville opdatere §3.3's 3 dage
gamle match-/dæknings-tal. Ikke nødvendigt for at ophæve blokeringen — kun for at friske
allerede-god evidens op. Ricko vælger.

---

## 6. Foreslået kohortemodel (udkast — IKKE endelig, afventer Gate A-data)

Uændret fra runde 1, nu med den bekræftede stage-mekanisme (§3.2) indarbejdet:

- Prospektiv, frossen kohorte pr. deal ved **første kvalificerede observation** — første gang
  dealens stage-historik viser en overgang til stage `1098732868` ("Tilbud sendt") eller senere.
  `Opdateret tilbud` (`1169407502`) starter aldrig en ny kohorte.
- `Screened` (aldrig passeret `1098732868`) udelukkes altid fra nævneren — automatisk, af
  mekanismen selv, ikke af en vedligeholdt stage-liste.
- `ONLINE` hvis en matchende online rejseplan (via `booking_match_key`) eksisterede på
  observationstidspunktet — ellers `PDF_ONLY`. Gruppen ændres **aldrig** bagudrettet, selv hvis der
  senere oprettes en online rejseplan for samme booking (Issue #78's eksplicitte krav). Senere
  oprettelse kan logges som sekundær info, ikke som kohorte-omskrivning.
- Outcome (`WON`/`LOST`/`UNKNOWN`) afgøres af `unique_travel_dealstatus` + HubSpots
  `hs_is_closed`/`hs_is_closed_won` — **ikke** dealstage-id — og opdateres løbende uden at ændre
  kohortetilhørsforholdet.
- Officielt nulpunkt = første succesfulde daglige synkronisering (§4, Rickos præference) —
  historiske tal (inkl. §3.3) vises kun eksplorativt, ikke som del af den officielle måling.
- Ny, pseudonymiseret Supabase-tabel — pseudonym-nøgle afledt af HubSpot-deal-id (aldrig
  bookingnummer, kundenavn, e-mail i klartekst), samme princip som `booking_match_key`.
- Daglig, idempotent, read-only HubSpot-synkronisering; ingen HubSpot-writes nogensinde.
- Fail-closed-visning: stale/fejlet sync, ændret pipeline/stage-kontrakt, tom nævner eller for
  små celler ⇒ "utilstrækkeligt datagrundlag", aldrig et falsk 0%- eller nul-tal.
- Ingen kausalitetspåstand i UI-tekst — kun observeret forskel, samme sprogprincip som Fase 4's
  ordliste-regel (aldrig "hot"/"lead"/"årsag").

Dette udkast kræver et separat, eksplicit design-review efter Gate A er ophævet, før Gate B
(migration) kan startes — jf. Issue #78's egen fire-gate-arbejdsform.

---

## 7. Åbne beslutninger til Ricko

1. **Kør `Invoke-QuoteSignalLiveEvidence.ps1`** (§5) — den ene resterende handling for at kunne
   afslutte Gate A. Del kun aggregat-outputtet tilbage.
2. **Bekræft startdato-modellen** (§4): officielt nulpunkt = første succesfulde daglige
   synkronisering, historiske tal kun eksplorative — eller angiv en anden model, hvis du ønsker det.
3. Valgfrit: skal `--mode=join` køres frisk for at opdatere §3.3's 3 dage gamle match-/
   dæknings-tal, eller er de tilstrækkelige som eksplorativ reference?
4. Når (1) foreligger: gennemgå resultatet sammen, før Gate A kan afsluttes med `GO`/`GO MED
   FORBEHOLD`.

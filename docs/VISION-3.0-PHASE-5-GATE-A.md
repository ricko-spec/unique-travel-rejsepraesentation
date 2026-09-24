# Vision 3.0 Fase 5 — Gate A: read-only datagrundlagsverifikation

> [Issue #78](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/78), barn af
> [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41). Gate A er en
> read-only data- og arkitekturgennemgang — **ingen produktkode, migration, database-write,
> HubSpot-write, secretændring, scheduler eller deploy** i denne runde. Denne rapport er selve
> Gate A-leverancen.

## Afgørelse

## **MEASUREMENT_BLOCKED**

Gate A kan ikke afsluttes med `GO` eller `GO MED FORBEHOLD`, fordi **ingen af de
HubSpot-afhængige verifikationspunkter i Issue #78 kunne udføres** i denne session. Der findes
ingen godkendt, allerede etableret HubSpot-adgang for dette projekt (`docs/ACCESS_MATRIX.md`
nævner ikke HubSpot som en tilgængelig ressource — kun GitHub, Vercel, Supabase, Anthropic API og
TravelWire-PDF'er), og der er ikke oprettet ny adgang i denne session (se "Adgangsstatus" nedenfor).
Uden live-verificerede pipeline-/stage-id'er, bookingnummer-felt og aggregater kan hverken
stage-kontrakten, bookingnummerdækningen eller en troværdig startdato bekræftes — og en afgørelse
uden dette grundlag ville selv bryde opgavens eget fail-closed-princip ("målingen må ikke
publicere en konklusion når ... nødvendige data er ukendte eller inkonsistente").

Alt der **kunne** verificeres read-only i dette repository, er verificeret (se §1-§2) og peger
ikke på nogen blokerende arkitekturhindring i selve dette repo — blokeringen er udelukkende
manglende HubSpot-datagrundlag.

---

## Adgangsstatus (undersøgt, intet forsøgt ud over dette)

- `docs/ACCESS_MATRIX.md` lister ikke HubSpot som en ressource for dette projekt.
- To HubSpot MCP-forbindelser er installeret i miljøet (`claude.ai HubSpot`,
  `plugin:marketing:hubspot`) men **kræver OAuth-godkendelse** — ingen af dem er autoriseret. Der
  er **ikke** startet en OAuth-flow i denne session, da det ville etablere ny adgang til Unique
  Travels rigtige HubSpot-CRM (kundedata) ud over det denne repos `ACCESS_MATRIX.md` dækker — det
  kræver Rickos eksplicitte, bevidste godkendelse, ikke en antagelse fra en pastet opgavetekst.
- Windsor.ai (tilgængelig integrations-bro i miljøet) har **ingen HubSpot-konto forbundet** —
  kun en Facebook Ads-konto ("Unique Travel Ny"), read-only kontrolleret.
- Ingen credentials, tokens eller dele heraf er efterspurgt eller håndteret i denne session.

**To veje til at ophæve blokeringen** (begge beskrevet i detalje i §5 — Ricko vælger):

1. **Godkend HubSpot-MCP-forbindelsen interaktivt** i en fremtidig session, så en agent kan læse
   pipeline/stage/property-metadata og køre aggregerede søgninger direkte. Kræver en bevidst
   opdatering af `docs/ACCESS_MATRIX.md` til at inkludere HubSpot (read-only scope), fordi det er
   en ny systemadgang for dette projekt.
2. **Kør det vedlagte read-only Node.js-script lokalt** med et HubSpot Private App-token (aldrig
   delt med Claude), og indsæt kun det resulterende aggregat-JSON (tal, ingen bookingnumre/navne)
   tilbage i chatten eller i en opfølgende issue-kommentar. Kræver ingen ACCESS_MATRIX-ændring.

---

## 1. Hvad ER verificeret (dette repo, read-only, ingen HubSpot)

### 1.1 Repository- og arkitekturgate
```
Repo:         ricko-spec/unique-travel-rejsepraesentation  ✓
Branch:       docs/gate-a-conversion-measurement-78 (fra frisk origin/main)
origin/main:  c407d6264b7c75848787c557e67d30a59a8f4c3b (identisk med daværende HEAD, hentet før branch)
```

### 1.2 Fase 4/Issue #76/PR #77 — bekræftet MERGED (rettelse af stale docs)
`docs/STATUS.md`, `docs/ROADMAP.md` og `docs/CHECKPOINT.md` indeholdt før denne PR formuleringer
om at Fase 4/PR #77 "ikke er merget". Verificeret mod GitHub: **PR #77 blev merget
2026-09-19T09:24:56Z, merge-commit `c407d626`, base `main`** — identisk med nuværende `main`/HEAD.
Salgsoversigten (Åbnet/Set/Kontakt/Seneste aktivitet i `/admin`) er altså **live i production**,
ikke kun implementeret og afventende. Rettet i denne PR (se §4).

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
production-brug over for kunder (se §3, ikke afklaret her).

### 1.4 Eksisterende genbrugeligt fundament (uddybet i tidligere Gate-gennemgang)
- Analytics Bridge API (`GET /api/internal/analytics/travel-plans`, Issue #45) — server-to-server,
  Bearer-auth, ingen HubSpot-afhængighed i dette repo i dag, HMAC-matchnøgle-mønster kan genbruges
  1:1 til den nye kohorte-synkronisering.
- `toTravelPlanRecord()`-mønstret (aldrig `...row`-spredning) — direkte genbrugeligt skabelon for
  den nye pseudonymiserede analysetabel.
- `paged-read.ts` (count-baseret, ingen tavs afkortning) — samme mønster bør genbruges til den
  daglige HubSpot-synkroniserings paginering.

---

## 2. Hvad IKKE er verificeret (kræver live HubSpot-adgang — blokerer Gate A)

Ingen af nedenstående punkter fra Issue #78's Gate A-liste kunne udføres:

| # | Krav (Issue #78) | Status |
|---|---|---|
| 1 | Korrekt Unique Travel-pipeline bekræftet | **Ikke verificeret** — intet pipeline-id set |
| 2 | Præcise stage-id'er for Screened / Tilbud sendt / Opdateret tilbud / Solgt-booket / tabt-afvist / øvrige "tilbud allerede sendt"-stages | **Ikke verificeret** |
| 3 | Bookingnummer-felt bekræftet (kandidat: `unique_travel_bookingno`) | **Ikke verificeret** — kandidatnavnet er ikke bekræftet mod det faktiske property-skema |
| 4 | Reel startdato for production-brug af Online Rejseplan | **Ikke fastlagt** — kræver enten en forretningsbeslutning fra Ricko eller en krydstjekket dato mod tidlige, reelle `trips`-rækker (som kræver læsning ud over denne rapports mandat, se §3) |
| 5 | Bookingnummerdækning i deals efter startdato | **Ikke målt** |
| 6 | Delte bookingreferencer/manglende værdier/dubletter | **Ikke målt** |
| 7 | Brugbart prospektivt nulpunkt (stage-historik vurderes IKKE automatisk tilstrækkelig, jf. opgavens eget punkt 8) | **Ikke vurderet** — ingen ny dokumenteret evidens indhentet |

Ingen aggregater (antal deals, antal Screened, antal ved/efter Tilbud sendt, antal booket,
dækning, dubletter) kan derfor opgives i denne rapport. At gætte eller antage tal her ville være
en direkte overtrædelse af opgavens privacy- og fail-closed-regler.

---

## 3. Startdato — hvad der kan siges uden HubSpot-data

Opgaven skelner eksplicit mellem tracking-start (teknisk) og produktets brugsstart (forretning).
I dette repo:

- Fase 1B/1C's `TRACKING_SINCE = 2026-09-18T12:20:18Z` og Fase 3's
  `CONTACT_INTENT_TRACKING_SINCE = 2026-09-19T08:21:19Z` er **engagement-målingens** start —
  **ikke** relevante for om en online rejseplan overhovedet blev oprettet. De må ikke forveksles
  med eller genbruges som Fase 5's kohorte-nulpunkt.
- `trips.created_at` er teknisk pålidelig siden 2026-05-23 (initial commit), men det er **ukendt
  fra denne gennemgang** om alle rækker fra den tidlige periode repræsenterer reel kundevendt brug
  eller også indeholder udviklings-/testoprettelser. At afgøre det kræver enten (a) en aggregeret,
  read-only optælling af tidlige `trips`-rækker sammenholdt med Rickos viden om hvornår salgsteamet
  reelt begyndte at bruge produktet, eller (b) at Ricko selv angiver en fast cutoverdato han er
  komfortabel med, uafhængigt af databasens tidligste rækker.
- **Anbefaling:** Fase 5's kohorte-nulpunkt bør være en **eksplicit, dokumenteret dato Ricko
  vælger** (som `TRACKING_SINCE`-mønstret i Fase 1B) — ikke udledt automatisk af `min(created_at)`
  eller af HubSpots deal-historik. Dette undgår både "gamle importerede HubSpot-deals forurener
  målingen" og "tidlige test-trips tælles som reel online-eksponering".

---

## 4. Rettelser til stale docs i denne PR

- `docs/STATUS.md` — Fase 4/PR #77 markeret merged/live (var "ikke merget"); "Aktivt kapitel"
  opdateret til Issue #78 Gate A = `MEASUREMENT_BLOCKED`; Fase 5-ejerskabsnotatet rettet (se
  næste punkt).
- `docs/ROADMAP.md` — Issue #76/PR #77 flyttet fra "Næste" til "Lukket (seneste)"; Issue #78
  tilføjet under "Næste" med Gate A-status.
- `docs/CHECKPOINT.md` — branch/HEAD, færdigt/udestående og næste handling opdateret til Gate
  A-tilstanden.
- `docs/DECISIONS.md` — ny række: Fase 5 (prospektiv konverteringsmåling) er, per Issue #78
  (oprettet af Ricko 2026-09-24), besluttet placeret **i dette repo** — det tidligere notat om at
  "Fase 5 hører hjemme i Marketing Dashboard-projektet" (fra Fase 4-arbejdet, `docs/ROADMAP.md` og
  `docs/CHECKPOINT.md`, før Issue #78 fandtes) er **overhalet af denne nyere, eksplicitte
  beslutning**. Rettet konsekvent i ROADMAP/CHECKPOINT/STATUS i denne PR.

---

## 5. Sådan ophæves blokeringen — to veje

### Vej A — godkend HubSpot-MCP-forbindelsen (kræver en fremtidig, separat session)
Kræver at Ricko selv gennemfører OAuth-loginnet i sin browser (ikke noget en agent kan gøre for
ham), og at `docs/ACCESS_MATRIX.md` opdateres eksplicit til at inkludere HubSpot som en
read-only-ressource for dette projekt — en bevidst, dokumenteret beslutning, ikke en stiltiende
udvidelse. Anbefales KUN hvis Ricko ønsker at en agent selv kan udforske pipeline/stage-metadata
interaktivt fremover.

### Vej B — kør et lokalt, read-only script og indsæt kun aggregatet (anbefalet til Gate A)
Et Node.js-script er lagt i scratchpad (**ikke i dette repo** — det er ikke produktkode og skal
ikke committes): se kørselsvejledningen nedenfor. Scriptet:
- Bruger kun et HubSpot **Private App-token** med read-only scopes
  (`crm.objects.deals.read`, `crm.schemas.deals.read`, `crm.pipelines-orders.read` /
  tilsvarende pipeline-read-scope) — token angives KUN som miljøvariabel på Rickos egen maskine,
  aldrig indsat i chatten.
- Udskriver **udelukkende**: pipeline-id + label, stage-id'er + labels + rækkefølge,
  deal-property-navne der matcher "booking" (navn/label, ikke værdier), og — i et andet trin, efter
  Ricko har bekræftet hvilke stage-id'er der betyder hvad — rene optællinger (counts) for de
  aggregater Issue #78 beder om.
- Udskriver **aldrig** bookingnumre, kundenavne, e-mails eller andre feltværdier.

**Kørselsvejledning (kør på Rickos egen maskine, ikke i denne repo-mappe):**

```bash
# 1. Opret et HubSpot Private App med KUN disse scopes: crm.objects.deals.read, crm.schemas.deals.read
#    (HubSpot → Settings → Integrations → Private Apps → Create). Kopiér tokenet.
# 2. Sæt tokenet som miljøvariabel i DIN terminal (aldrig i en fil der committes, aldrig i chatten):
export HUBSPOT_TOKEN="<dit private app-token>"
# 3. Kør trin 1 (metadata-only — INGEN kundedata, sikkert at dele output fra):
node gate-a-hubspot-metadata.mjs
# 4. Læs output, bekræft/vælg pipeline-id og stage-id'er, og indsæt dem øverst i
#    gate-a-hubspot-aggregates.mjs (se filens TODO-kommentarer), og en kandidat-startdato.
# 5. Kør trin 2 (aggregater — udskriver KUN tal, aldrig felt-værdier):
node gate-a-hubspot-aggregates.mjs
# 6. Del KUN JSON-outputtet fra trin 5 (og evt. trin 3) — aldrig rå CSV-eksport, aldrig
#    enkeltrækker fra HubSpot.
```

De to scripts (`gate-a-hubspot-metadata.mjs`, `gate-a-hubspot-aggregates.mjs`) er **bevidst ikke
committet i dette repo** — de er operatør-tooling til Rickos egen maskine, ikke produktkode, og
ligger derfor uden for docs-only-PR'ens scope. De er leveret direkte til Ricko i sessionen der
producerede denne rapport (ikke et sted en public repo-læser kan se lokale filstier). Node 18+
(global `fetch`), ingen npm-installation nødvendig, ingen afhængighed af dette repos
`node_modules`. Efterspørg dem igen hos Claude Code hvis de er væk — indholdet er fuldt
beskrevet ovenfor (HubSpot-endpoints, felter, aggregeringslogik) og kan genskabes derfra.

---

## 6. Foreslået kohortemodel (udkast — IKKE endelig, afventer Gate A-data)

Issue #78's tekniske løsningsforslag er allerede detaljeret og velbegrundet. Denne sektion
gengiver den **kun som et udkast til fælles forståelse**, ikke som en godkendt Gate
A-konklusion — en endelig designbeslutning forudsætter de verificerede aggregater fra §2.

- Prospektiv, frossen kohorte pr. deal ved **første kvalificerede observation** (dvs. første
  gang dealen når en stage der betyder "tilbud sendt" eller senere) — ikke ved deal-oprettelse og
  ikke ved Screened.
- `Screened` udelukkes altid fra nævneren.
- `ONLINE` hvis en matchende online rejseplan (via `booking_match_key`) eksisterede på
  observationstidspunktet — ellers `PDF_ONLY`. Gruppen ændres **aldrig** bagudrettet, selv hvis der
  senere oprettes en online rejseplan for samme booking (Issue #78's eksplicitte krav).
  Senere oprettelse kan logges som sekundær info, ikke som kohorte-omskrivning.
- Outcome (`WON`/`LOST`/`UNKNOWN`) opdateres løbende, men ændrer aldrig kohortetilhørsforholdet.
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

1. **Vej A eller Vej B (§5)** — skal HubSpot-MCP-adgang godkendes til fremtidig agent-brug, eller
   skal Gate A ophæves via det lokale script du selv kører?
2. **Fast startdato for kohorten** (§3) — en eksplicit dato du vælger, ikke automatisk udledt.
3. **Bekræft at Fase 5 hører hjemme i dette repo** (allerede impliceret af Issue #78, rettet i
   docs i denne PR — bekræft venligst at det er korrekt forstået, siden det ændrer en tidligere
   dokumenteret beslutning fra Fase 4-arbejdet).
4. Når Vej A eller B er kørt: gennemgå de resulterende aggregater sammen, før Gate A kan afsluttes
   med `GO` eller `GO MED FORBEHOLD`.

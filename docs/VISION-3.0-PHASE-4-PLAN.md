# Vision 3.0 Fase 4 — salgsoversigt: beslutningsgrundlag

**Status: FORSLAG. Intet af dette er implementeret.** Implementering kræver Rickos scopegodkendelse (se §14).
Fase 3 (PR #74) er merget og live; dette dokument er adskilt fra den og ændrer ingen kode. Master-issue:
[#41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41).

**Resultat (kapitlets ene mål):** sælgeren kan på under et minut se, hvilke rejseforslag der har målt
kundeaktivitet, som kan give anledning til opfølgning — og hvilke der *ikke kan vurderes* — uden at systemet
påstår mere end det har observeret.

## 0. Hvad er verificeret, og hvad er foreslået

| | |
|---|---|
| **Verificeret** (2026-09-19) | Kodens nuværende adfærd (listevisning, adgang, læsning) er læst i `main` og i PR #74-branchen (før merge; `main`-træet er siden identisk med den). Tal i §1 er read-only aggregater fra produktions-DB (kun optællinger/størrelser — ingen kundedata læst eller gengivet) |
| **Foreslået** | Alt i §2–§14: kolonner, filtre, default, tilstande, læsemodel, acceptkriterier, scope |

## 1. Observeret grundlag (verificerede tal)

| Måling | Værdi | Betydning for designet |
|---|---|---|
| Rejseplaner i alt / aktive | 267 / 261 | Lille datasæt; alt kan læses set-baseret |
| Oprettet seneste 30 / 90 dage | 114 / 233 | Vokser ≈ 4 pr. dag |
| Aktive oprettet **før** åbningsmåling startede (2026-09-18) | **258 af 261** | Næsten hele listen er "før måling" |
| … heraf uden `trip_visits`-række | 251 | I dag vises de som **"Ikke åbnet endnu"** — misvisende (se §7) |
| `trip_visits` / med aktivitet seneste 7 dage | 9 / 9 | Målingen er ny; aktivitetsdata er sparsomt |
| Rejseplaner med sektionsdata (Fase 2) | 4 (15 rækker) | Ditto |
| Kontakt-intent (Fase 3) | 0 rækker (målt **før** Fase 3-deploy) | Udgangspunkt: koden er live siden 2026-09-19T08:21:19Z, så rigtige kundeklik kan nu give rækker |
| Profiler / med `advisor_match_name` | 8 / 8 | Grundlag for "Mine" |
| Distinkte rådgivernavne i `trips.data.advisor` | 11 (0 trips uden) | Rådgivernavn er en pålidelig nøgle; 11 > 8 profiler ⇒ nogle rådgivere har ikke login |
| Trips uden `created_by` | 172 af 267 | `created_by` er **ikke** egnet til "Mine" |
| Ugyldig trip-data (itinerary/hotels ikke array, forkert `advisorEmail`-type) | 0 | Hardening er latent, ikke akut (se §10) |
| Størrelse på nuværende liste-svar (`data` + `raw_pdf_text` for alle trips) | **≈ 3,1 MB**, +≈ 45 KB/dag | Se §9 og R1 |

## 2. Sælgerens arbejdsgang

1. Sælgeren åbner admin og ser **én tabel** (samme sted som i dag), sorteret efter *seneste målte aktivitet*.
2. Øverst: rejseforslag hvor kunden for nylig har åbnet, nået pris eller klikket på telefon/email.
3. Sælgeren scanner kolonnerne *Åbnet*, *Set*, *Kontakt*, vælger et forslag og åbner detaljesiden
   (uændret Fase 1C/2/3-visning), og beslutter selv om/hvordan der følges op.
4. Rejseforslag uden målt aktivitet ligger **under** — de skjules aldrig — og "før måling"-forslag er tydeligt
   mærket, så fraværet af data ikke læses som fravær af interesse.

Systemet **fortolker ikke**. Det viser observeret aktivitet; sælgeren vurderer.

## 3. Observeret aktivitet vs. fortolkning

| Observeret (må vises) | Fortolkning (må IKKE vises/antydes) |
|---|---|
| Åbnet: senest \<tidspunkt\>, \<n\> besøg (læseperioder, ikke personer/enheder) | "Interesseret", "varm", "sandsynlig køber" |
| Sektioner nået: n af m (inkl. om *Pris* er nået) | "Har læst prisen og overvejer" |
| Telefon/email **klikket** (seneste tidspunkt) | "Har kontaktet os", "samtale gennemført", "booking på vej" — et klik er **ikke** en gennemført kontakt |
| Ingen åbning målt siden \<dato\> | "Ikke interesseret", "aldrig åbnet", "ikke sendt" |
| Oprettet \<dato\> | "Sendt til kunden" — `created_at` er oprettelse, **ikke** afsendelse; en uåbnet præsentation kan være ikke-sendt |

Krav: ingen score, rangering udover tidsstempler, farvekodning der antyder værdi, eller ord som *hot/varm/lead/
score/interesse* i UI'et. Tests håndhæver ordlisten (AK-12).

## 4. Anbefalede kolonner og deres præcise betydning

Eksisterende kolonner bevares (Booking, Destination, Kunde, Oprettet, Oprettet af, Status, Handlinger).
**"Kundeaktivitet" opdeles i tre målte signaler + en sorteringsnøgle:**

| Kolonne | Præcis betydning | Kilde | Tilstande (aldrig blandet) |
|---|---|---|---|
| **Åbnet** | Senest åbnet + antal besøg (læseperioder) | `trip_visits` | *åbnet* · *ikke åbnet endnu* (kun trips oprettet efter målestart) · ***ingen åbning målt siden 18. sep*** (trips oprettet før) · *ingen åbning seneste 12 mdr* (eksisterende retention-regel) · *kunne ikke hentes* |
| **Set** | Antal hovedafsnit nået, "n/m" af de afsnit rejseplanen faktisk har; *Pris* markeres separat hvis nået | `trip_section_engagement` + eligibility | *n/m* · *ingen registreret* · *kunne ikke vurderes* (ugyldig trip-data) · *kunne ikke hentes* |
| **Kontakt** | Telefon og/eller Email **klikket** + seneste klik | `trip_contact_intent` + eligibility | *Tlf/Mail ✓ + tidspunkt* · *ingen registreret* · *kunne ikke vurderes* · *kunne ikke hentes* |
| **Seneste aktivitet** | Nyeste af tre tidsstempler: `last_opened_at`, seneste `last_seen_at`, seneste `last_clicked_at`. Ren dato-aritmetik — ingen vægtning | afledt | dato · tom (*ingen målt aktivitet*) |

Reglen for tomme celler: **i listen vises kun positive, observerede fakta**; "ingen registreret" er en
neutral, dæmpet tekst og aldrig et "—" der kan læses som *"kunden gjorde det ikke"* for et forløb der ikke var
målt. Detaljesiden beholder Fase 2/3's ✓/— med målestart-noter uændret.

Kolonnerækkefølge, sekundære linjer (fx *Oprettet/Oprettet af* under Booking) og responsivt layout er
implementeringsvalg inden for scope.

## 5. Filtre og sorteringer (få)

**Filtre** (kombinerbare, plus eksisterende fritekstsøgning):

1. **Aktivitet:** *Alle* (default) · *Har målt aktivitet* · *Kontaktklik* · *Ingen målt aktivitet*
2. **Sælger:** *Alle* (default) · *Mine* (skjult hvis den indloggedes profil mangler `advisor_match_name`)
3. **Vis deaktiverede** (fra som default)

**Sorteringer:** *Seneste aktivitet* (default) · *Oprettet (nyeste)* · *Senest åbnet*.
Deterministiske tie-breakers: dato ↓, dernæst `created_at` ↓, dernæst `id`.

## 6. Default-visning og begrundelse

**Default = alle aktive rejseforslag, sorteret efter *Seneste aktivitet* ↓; rækker uden målt aktivitet
følger under, sorteret efter *Oprettet* ↓.** Begrundelse:

- Løser kernen ("hvad skal jeg følge op på") uden at skjule noget — i dag er der kun 9 forslag med data, så et
  filter-som-default (*Har målt aktivitet*) ville vise en næsten tom liste og skjule 250+ forslag.
- Bevarer den eksisterende mentale model (én liste, søgning) i stedet for en ny side.
- Erstatter "vis 5 seneste + Vis alle" med en pagineret visning (se §9).

*Alternativ, forkastet:* en separat "Opfølgning"-side. Den fordobler navigation og vedligehold uden at give sælgeren
mere information end sortering + filter på samme tabel.

## 7. Gamle rejseplaner, manglende målinger og fejl

- **Før måling.** Åbningsmåling startede 2026-09-18 (`TRACKING_SINCE`). For de 258 aktive trips oprettet før, uden
  række, er "Ikke åbnet endnu" en påstand systemet ikke kan stå inde for (kunden kan have åbnet linket før
  målingen). Forslag: ny tilstand **"Ingen åbning målt siden \<dato\>"** (`not-measured`); "Ikke åbnet endnu"
  bevares kun for trips oprettet efter målestart. Det er en mindre ændring af Fase 1C's liste-tilstand
  (`classifyTripEngagement`) og er **i scope**.
- **Sektioner og kontaktklik** har egne målestarter (Fase 2 er live siden 2026-09-18; Fase 3 er live siden 2026-09-19T08:21:19Z;
  `CONTACT_INTENT_TRACKING_SINCE` er fortsat `null` og kan sættes til dette tidspunkt i næste kodeleverance). Fordi listen kun viser *positive* fakta, kræver den
  ingen ekstra målestarts-kolonne; detaljesiden bærer noterne.
- **Fejl pr. kilde.** Hver kilde læses og fejler uafhængigt. En fejlet kilde giver *"kunne ikke hentes"* i sin
  kolonne og udelades fra *Seneste aktivitet* (med diskret banner) — aldrig en tom/"ingen"-tilstand, og listen
  vises fortsat.
- **Ugyldig trip-data.** Rækken beholdes; *Set* og *Kontakt* viser *kunne ikke vurderes*. Rækken droppes aldrig.
- **Retention** er ikke aktiveret (`010b`/`pg_cron`); reglen "ingen åbning seneste 12 mdr" er uændret.

## 8. Adgangsregler — hvem kan se hvilke rejseplaner?

**Uændret model, verificeret i koden:** enhver indlogget Supabase-bruger (invite-only) er "sælger"; der er ingen
roller og ingen ejerskabs-partitionering. `GET /admin/api/trips` kræver `getSessionUser()` og læser med
service-role server-side; alle sælgere ser alle rejseplaner og deres aktivitet. Middleware matcher `/admin` og
opdaterer kun sessionen — adgangskontrol sker pr. route.

Forslag (ingen ny adgangsmodel):

- **"Mine" er et bekvemmelighedsfilter, ikke adgangskontrol.** Matcher `trips.data.advisor` (lower/trim) mod den
  indloggedes `profiles.advisor_match_name` (samme case-insensitive navnematch som `enrichAdvisorContact`).
  `created_by` bruges **ikke** (172 af 267 mangler).
- **Dataminimering:** listens svar bygges server-side som et kompakt DTO. `data`, `raw_pdf_text` (indeholder
  kundenavne/rejsedetaljer) og `created_by`-uuid sendes **ikke** til browseren. I dag sendes `data` og
  `raw_pdf_text` for alle trips til enhver sælgers browser.
- Nye endpoints skal have samme session-gate; uautentificeret ⇒ 401 (testes).

**Beslutning til Ricko:** er det acceptabelt, at alle sælgere fortsat ser alle rejseforslag og deres aktivitet
(uændret), eller ønskes per-sælger-synlighed? Sidstnævnte er et **væsentligt ændret scope** og indgår ikke.

## 9. Datatilgang, pagination og N+1

- **Ingen ekstra kald pr. række.** Fast antal set-baserede læsninger uanset antal rejseplaner: `trips` (kun de
  nødvendige kolonner), `trip_visits`, `trip_section_engagement`, `trip_contact_intent`, `destinations` (13 rækker;
  galleri-eligibility) og den indloggedes profil. Testes med en forespørgselstæller (AK-2).
- **Ingen `.in("trip_id", [...])`** (lærdom fra PR #70: voksende URL). Hele sæt læses ufiltreret og flettes i
  hukommelsen — trivielt ved disse mængder (≈ 270 trips, ≤ 5 sektionsrækker og ≤ 2 kontaktrækker pr. trip).
- **Række-loft:** Supabase/PostgREST returnerer som standard højst 1000 rækker pr. forespørgsel (verificér
  projektets `max_rows`). Det er ikke et problem for `trips` (267) i dag, men `trip_section_engagement` (≤ 5 pr.
  åbnet trip) kan nå loftet uden at nogen opdager det (stille afkortning ⇒ falske "ingen registreret"). Kravet er
  derfor en **pagineret læsehjælper** (`.range()`-løkke) med test på > 1000 rækker (AK-3).
- **Pagination i UI:** klient-side, 50 rækker pr. side + "Vis flere". Server-side pagination er ikke nødvendig før
  ≈ 1000+ rejseplaner; genbesøges dér.
- **Svarstørrelse:** kompakt DTO ≈ 200–300 B pr. række ⇒ ≈ 60–80 KB mod ≈ 3,1 MB i dag. Dette lukker samtidig
  backlog-punktet PERF-1 og fjerner en voksende platformsrisiko (R1).

## 10. Runtime-hardening af Fase 2's `computeEligibleSections`

**Behov: ja, og det er i scope** — fordi *Set n/m* for hundredvis af rækker ellers ville regnes på rå JSONB.
Fase 2's admin-detalje afleder i dag itinerary/hotels/contact-eligibility fra rå `row.data`, mens kundesiden og
endpointet bruger `tripSchema` → `normalizeTrip` (ChatGPT-fund, Issue #41-kommentar 2026-09-18). I dag er 0 af
267 trips ugyldige (verificeret), så risikoen er **latent, ikke akut** — men listen må ikke bygges på rå læsning.

Forslag (mønster fra Fase 3's `resolveContactChannels`): én delt `resolveEligibleSections(rawTripData, galleryImages)`
→ `SectionId[] | null` (`null` = kan ikke vurderes ⇒ "kunne ikke vurderes", aldrig falsk minus), brugt af admin-
detalje, listen og Fase 2-endpointet, med paritetstest mod endpointet (AK-10). Fase 2's *adfærd* for gyldige data
ændres ikke.

## 11. Nye databaseobjekter?

**Nej.** Alle nødvendige data findes (`trips`, `trip_visits`, `trip_section_engagement`, `trip_contact_intent`,
`profiles`, `destinations`). Ingen migration, ingen ny tabel, ingen ny tracking, ingen retention. En SQL-view/RPC
til server-side aggregering kan overvejes først ved ≈ 1000+ rejseplaner; det er en fremtidig, separat beslutning.

## 12. Acceptkriterier og regressionskrav

Testbare; "tests" betyder adfærd og fejlveje, ikke antal. Sikkerheds-/semantik-kritiske tests mutationskontrolleres.

| # | Kriterium |
|---|---|
| AK-1 | Liste-svaret indeholder hverken `data`, `raw_pdf_text` eller `created_by`; størrelsen for 300 mock-rejseplaner er < 150 KB |
| AK-2 | Antallet af databaseforespørgsler er konstant (≤ 6) uanset antal rejseplaner (forespørgselstæller-test på 10 vs. 500 trips) |
| AK-3 | Læsehjælperen henter > 1000 rækker korrekt (test på 2 500 mock-rækker); en afkortet/fejlet side giver *kunne ikke hentes*, aldrig tom |
| AK-4 | Tilstandsmatrix pr. signal (Åbnet/Set/Kontakt): *positiv · ingen registreret · før måling (kun Åbnet) · kunne ikke vurderes · kunne ikke hentes* — hver med test, og *kunne ikke hentes/vurderes* renderes aldrig som *ingen registreret* |
| AK-5 | *Seneste aktivitet* = nyeste af de tre tidsstempler; fejlede kilder udelades og flagges; deterministiske tie-breakers |
| AK-6 | Default = aktive, sorteret efter *Seneste aktivitet*; rækker uden aktivitet ligger under; filtre kombineres; *Mine* er skjult uden `advisor_match_name`; eksisterende søgning virker uændret |
| AK-7 | Trips oprettet før `TRACKING_SINCE` uden række viser *"Ingen åbning målt siden \<dato\>"* — aldrig *"Ikke åbnet endnu"*; trips oprettet efter viser *"Ikke åbnet endnu"* |
| AK-8 | Uautentificeret ⇒ 401; svaret indeholder ingen hemmeligheder/uuid'er ud over `id` til detaljelinket |
| AK-9 | Ingen skrivninger, ingen migration, ingen nye tabeller, ingen ny tracking; detaljesidens Fase 1C/2/3-visning og målestarts-noter uændrede |
| AK-10 | `resolveEligibleSections`: gyldig ⇒ samme resultat som før; ugyldig ⇒ `null` ⇒ *kunne ikke vurderes*; paritet admin ↔ endpoint på valid/malformed data |
| AK-11 | Kontaktklik vises som *klikket* (observation) — aldrig som gennemført kontakt/booking |
| AK-12 | UI-tekster indeholder ingen af ordene *hot, varm, lead, score, interesseret, sandsynlig* (test på tekstkonstanter) |
| AK-13 | Regression: hele den eksisterende suite (604 tests) er grøn; Fase 1C-klassifikatorens eksisterende tests er uændrede undtagen den bevidste `not-measured`-udvidelse |
| AK-14 | Lokal end-to-end kontrol af den byggede app mod read-only data: list-endpoint 401/200, DTO-form, ingen skrivninger (som i Fase 3-runden) |

## 13. Forslag til én samlet implementeringsopgave

**Titel:** *Vision 3.0 Fase 4: salgsoversigt — målt kundeaktivitet i rejseforslagslisten (barn af #41)*

**Resultat:** sælgeren kan se og sortere/filtrere rejseforslag efter målt kundeaktivitet (åbnet, sektioner,
kontaktklik) uden at systemet fortolker aktiviteten.

**I scope (én PR):**
- Ny server-side læsemodel for listen (kompakt DTO; pagineret læsehjælper; fejl pr. kilde; fast antal læsninger)
- Kolonner *Åbnet / Set / Kontakt / Seneste aktivitet*; filtre og sorteringer i §5; default i §6; klient-side
  pagination
- `not-measured`-tilstand for åbning (før måling) og ordlyd
- `resolveEligibleSections` (runtime-hardening) brugt af listen, admin-detalje og Fase 2-endpoint
- Tests iht. §12, mutationskontrol af de kritiske, lokal end-to-end kontrol
- Docs: STATUS/ROADMAP/TESTING/SYSTEM-ARKITEKTUR/DECISIONS

**Uden for scope:** AI-score/lead-score/"hot lead", automatiske opfølgninger/notifikationer/tasks, HubSpot/Analytics
Bridge, charts/dashboards/KPI'er, per-sælger-adgangsstyring, nye tabeller/migrationer/tracking/retention, ændring af
Fase 1B/2/3's målesemantik, "sendt til kunden"-tracking, Fase 5.

**Afhængigheder og release:** bygger på Fase 3, som er merget og live (PR #74; cutover-metode B valgt, så `trip_contact_intent` og cutover-beslutningen er
på plads). Ingen migration ⇒ kun kode-deploy: preview → ChatGPT-review → Rickos merge-OK. Model: Sonnet er
tilstrækkelig; ingen arkitektur-/sikkerhedskompleksitet der kræver en dyrere model.

**Størrelse:** middel — ca. 10–14 filer + tests; ingen ny infrastruktur.

## 14. Åbne beslutninger til Ricko

1. **Scopegodkendelse** af §13 som ét kapitel.
2. **Adgang (§8):** alle sælgere ser alle rejseforslag (uændret) — bekræft. Per-sælger-synlighed er ikke inkluderet.
3. **"Ikke åbnet endnu" → "Ingen åbning målt siden \<dato\>"** for rejseplaner oprettet før målestart (§7) — bekræft
   ordlyd og at Fase 1C's liste-tilstand justeres.
4. **Default-visning (§6):** alle aktive, sorteret efter seneste aktivitet — bekræft (alternativet er en separat side).

*Fase 3-afhængighed:* cutover-metode B er valgt (se `docs/VISION-3.0-PHASE-3.md`); `CONTACT_INTENT_TRACKING_SINCE` er
fortsat `null` og kan sættes til `2026-09-19T08:21:19Z` i næste relevante kodeleverance — Fase 4-PR'en eller en lille
separat ændring (Ricko afgør; ikke medregnet i scope §13). Fase 4 kan planlægges uden den, fordi listen kun viser positive fakta.

## 15. Risici

| # | Risiko | Alvor | Håndtering |
|---|---|---|---|
| R1 | Liste-svaret (≈ 3,1 MB, +≈ 45 KB/dag) nærmer sig platformens grænse for ikke-streamede svar (historisk ≈ 4,5 MB — verificér) og indeholder kundetekst til alle browsere | **Medium** (vokser; dataminimering) | Kompakt DTO i Fase 4 (AK-1) |
| R2 | 1000-rækkers standardloft afkorter stille `trip_section_engagement` ⇒ falske "ingen registreret" | **Medium** (fremtidig, tavs) | Pagineret læsehjælper (AK-3) |
| R3 | Sælgere læser "Ikke åbnet"/klik som fortolkning (uåbnet = ikke sendt/uinteresseret; klik = samtale) | **Medium** (misbrug af signal) | Ordlyd, `not-measured`, ordliste-test (AK-7/11/12) |
| R4 | Aktivitetsdata er sparsomme de første uger (9 åbnede rejseplaner); listen kan virke "tom" | Lav | Default viser alt; "før måling" er tydeligt mærket |
| R5 | Rå JSONB-læsning i Fase 2-admin (latent; 0 ugyldige i dag) | Lav (latent) | `resolveEligibleSections` (AK-10) |
| R6 | "Mine" bygger på navnematch; rådgivere uden profil (11 navne vs. 8 profiler) får intet "Mine"-filter | Lav | Filter skjules uden match; ingen adgangskonsekvens |

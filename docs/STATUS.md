# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-09-10** (PR #23 pæn PDF-fejlbesked live)

## Production

- **Commit:** `4169f19` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk`
- **PR #23 (`fix/friendly-invalid-pdf-error`)** — merged (fast-forward) og production-verificeret
  **2026-09-10**. Fejler PDF-parsingen, får sælgeren nu en rolig dansk besked i stedet for
  Anthropics rå API-tekst, `Claude returnerede ikke gyldig JSON` eller en liste af
  Zod-issues à la `itinerary.0.type: Invalid enum value…`.
  Nyt modul **`src/lib/parse-errors.ts`** klassificerer fejlen i fire typer:
  `unreadable` (422) → "PDF'en kunne ikke læses. Tjek at det er en TravelWire-rejsebeskrivelse,
  og prøv igen." · `transient` (503) → "Rejseplanen kunne ikke læses lige nu. Prøv igen om
  lidt." · `billing` (502) → credits-beskeden **bevaret ordret** · `config` (502) →
  "AI-parseren er ikke sat rigtigt op lige nu. Kontakt Ricko/admin."
  **Klassificeringen bygger på faktiske svar, ikke gæt:** en tom og en korrupt PDF blev sendt
  gennem produktionsmodellen og gav 400 med hhv. `PDF cannot be empty` og
  `The PDF specified was not valid.` — begge mønstre er dækket eksplicit. En ikke-TravelWire
  PDF går derimod igennem til modellen, som svarer `{}`; den falder i schema-grenen og giver
  også PDF-beskeden.
  **Bevidst afvigelse fra oplægget:** "Claude svarede, men ikke med JSON" er klassificeret som
  `transient`, ikke som PDF-fejl. Alle tre faktiske forekomster i `parse_failures` er fuldt
  gyldige TravelWire-PDF'er, hvor modellen indledte med prosa — at bede sælgeren tjekke sin
  PDF ville være vildledende. Samme grund gør 404 (udgået model-id) til `config`.
  **Tekniske detaljer sendes ikke længere til browseren.** `issues` og `raw` blev tidligere
  returneret i fejlsvaret; `raw` er hele det parsede trip-objekt med kundedata, og UI'et
  brugte det aldrig. Server-side er alt bevaret: `logParseFailure` kaldes uændret for
  `invalid_json`, `anthropic_error` og `schema_mismatch` med samme `raw_response`, `issues`
  og `pdf_name`, og `console.error` får nu også fejltype og HTTP-status.
  Succes-stien, auth, filstørrelses-tjek og `parse_failures` er uberørt. Ingen DB-migration,
  ingen ændring af prompt eller schema, ingen kundeside.
- **PR #22 (`fix/tour-toggle-label`)** — merged (fast-forward) og production-verificeret
  **2026-09-09**. Tidslinjens udfold-knap sagde **"Læs om udflugten"** for alt med
  `expandKind: "program"`, men den kategori dækker både endagsture og flerdagsforløb med
  overnatning. En 14-dages rundrejse eller 5-dages safari er ikke en udflugt.
  Optalt på 221 aktive rejser / 218 program-items: **81 flerdagsforløb** (SAFARI 31,
  TURPROGRAM 19, RUNDREJSE 12, KRYDSTOGT 4, plus TREKKING, CRUISE, HALONG CRUISE, SAPA-TUR
  m.fl.) får nu **"Læs om programmet"**, mens de **137 ægte endagsture** (UDFLUGT, AKTIVITET,
  TILKØB, SIGHTSEEING TRANSFER) beholder **"Læs om udflugten"**. `Se flydetaljer` (1040) og
  `Se udflugtsmuligheder` (64) er uberørte.
  **"Programmet" frem for "rundrejsen"**, fordi gruppen også rummer safarier, krydstogter og
  trekking, som ikke er rundrejser.
  **Skillelinjen læses af `typeLabel`, ikke af `expand.days`.** Parseren bruger nemlig også
  `days` til at dele ÉN dag op i "Formiddag"/"Eftermiddag", så 2 blokke kan sagtens være én
  udflugt — 7 ægte endagsture ville have fået forkert etiket med days-metoden (fanget og
  kasseret undervejs). `typeLabel` siger derimod enten `DAG 11` eller `DAG 7–8` /
  `3 DAGE / 2 NÆTTER`; de to mønstre klassificerer alle 218 items korrekt uden én fejl.
  Labellogikken er flyttet fra `Timeline.tsx` til `isMultiDayProgram` + `timelineToggleLabel`
  i `format.ts`, så den kan testdækkes — komponenten blev 13 linjer kortere.
  Ingen DB-migration, ingen parserændring, intet rejseindhold, ingen layoutændring.
- **PR #21 (`fix/hotel-notes-readable`)** — merged (fast-forward) og production-verificeret
  **2026-09-09**. Hotel-noterne er nu læsbare: **fuld `text-grey-text` + `leading-relaxed`**,
  fortsat 12px og kursiv. Genoptager den notes-ændring der bevidst blev fjernet under
  genbesøget af PR #2 — denne gang som selvstændig, afgrænset ændring.
  **Root cause er målbar:** `text-grey-text/80` gav `#7e7e7e` mod kortets hvide bund =
  **4,06:1 kontrast**, under WCAG AA's krav på 4,5:1 for normal tekst. Fuld `text-grey-text`
  (`#5e5e5e`) giver **6,48:1**.
  **Størrelsen blev bevidst på 12px.** Fem varianter blev målt i Chromium mod rigtige
  produktionssider først: `text-sm` gav +12 til +156px sidehøjde og ny ombrydning (op til
  fire ekstra linjer pr. side) og ville gøre noterne lige så store som værelseslinjerne fra
  PR #2. `leading-relaxed` (19,5px) giver i stedet luft mellem de linjer der allerede er:
  **linjeantallet er uændret på samtlige testede sider**, og sidehøjden vokser kun 14-78px.
  Ønskes `text-sm` alligevel, er det ét ord på samme linje i `Hotels.tsx`.
  **Rækkevidde: 448 af 755 aktive hotelkort (59 %) på 200 af 220 rejser** har noter.
  Note-typerne er reelt indholdsbærende: transport/transfer (145), måltider (89),
  forbehold/garanti (87), check-in/check-ud-tider (53), babyseng (43), senge/værelsestype
  (23), tilkøb (15), connecting doors (9). Kort uden noter er bit-for-bit uændrede.
  Kun to Tailwind-klasser i `Hotels.tsx` — +7/−1, heraf 6 linjer kommentar. Ingen
  DB-migration, ingen parserændring, ingen ændring af hoteldata, room-blocks, alternativer,
  sub-hoteller, admin, auth eller bookingnummer-unlock.
- **PR #2 (`fix/preserve-room-blocks`)** — merged (fast-forward) og production-verificeret
  **2026-09-09**, efter at have ligget åben som WIP siden 2026-07-29. Hotelkort med **2+
  værelser** viser nu værelsesfordelingen i en afgrænset boks med headeren
  "Værelsesfordeling · N værelser" og fed `Værelse N:`-label pr. linje. Kort med **ét**
  værelse beholder den hidtidige diskrete visning, så par-rejser forbliver rolige.
  **Root cause var rendering, ikke datatab:** `roomAllocations` har hele tiden været komplet
  i `data`-jsonb — fordelingen stod bare som svag grå liste uden visuel afgrænsning.
  Derfor ingen parserændring og ingen DB-migration.
  Rebaset 26 commits frem fra `cc06d1a` til `78a8107`. To konflikter, begge "begge sider
  tilføjede noget i slutningen af filen": `formatCustomerPreview` (PR #14) og
  `splitRoomAllocation` lever nu side om side i `format.ts` + `format.test.ts`.
  **To justeringer ved genbesøget** (commit `6e6d0c6` oven på den rebasede `e884f8d`):
  (1) PR'ens notes-ændring (`text-xs`/80 % → `text-sm`) blev **rullet tilbage** — den ramte
  446 hotelkort, hvoraf 366 slet ikke har flere værelser, altså langt uden for
  room-blocks-scopet. Noterne står som før; kan tages op separat.
  (2) Label-genkendelsen i `splitRoomAllocation` er **mønsterbaseret** i stedet for
  længdebaseret. Den gamle grænse (kolon inden 24 tegn) tabte 7 ægte værelseslinjer på
  bookingerne 35617/35780, hvor TravelWire skriver
  `Værelse 4 (Family Suite Jacuzzi, 2 Bedrooms): …` (44 tegn). En højere grænse duer ikke —
  fritekst som `Fordeling af værelserne aftales ved ankomst: …` har kolon allerede efter
  42 tegn; begyndelsesordet skiller dem rent.
  Testfixtures er udskiftet: booking 35518 er siden juli ændret til **to hoteller à tre
  værelser uden noter**, så de gamle fixtures beskrev data der ikke findes længere.
  Filer: `Hotels.tsx`, `format.ts`, `format.test.ts` — +147/−2. Uberørt: admin, auth,
  bookingnummer-unlock, parser, DB, hero-logo, favicon og PR #16's `align-items: start`.
- **PR #20 (`feature/favicon-brand-icon`)** — merged (fast-forward) og production-verificeret
  **2026-09-09**. Browserfanen viser nu **Unique Travels grønne Q/palme-ikon** i stedet for
  Next.js' standard-ikon. Sidste punkt i den brand-tråd hero-logoet (PR #18) startede.
  **Asset: `src/app/icon.png`** — 512×512 transparent PNG, **5,9 KB**, genereret fra Rickos
  icon-only asset `Unique-travel-green-icon 1.png` (920×992): centreret på kvadratisk canvas
  med 20px luft, så Q-cirklen ikke rører fanens kant, og gemt med 8-farvet PNG-palette.
  Alle opake pixels holder brandets teal `rgb(7,78,80)` — ingen visuel ændring af brandet.
  Grøn frem for hvid version, fordi faner og bogmærker typisk har lys baggrund.
  Metoden er **Next.js 14 App Router file-based metadata**: filen hedder `icon.png` og ligger
  direkte i `src/app/`, så Next selv injicerer `<link rel="icon" type="image/png"
  sizes="512x512">` i root layout. `metadata`-objektet i `src/app/layout.tsx` er derfor
  **ikke rørt** — title, description og robots er uforandrede.
  **Kun én fil i hele PR'en** (`src/app/icon.png`, ny binary). Ingen DB-migration, ingen
  parserændring, intet rejseindhold, og hero-logoet er uberørt.
  Bemærk: der fandtes ingen favicon/icon i repoet i forvejen, og der er bevidst ikke lagt
  en dublet i `public/brand`. Det hvide icon-only asset er ikke tilføjet (ingen aktuel brug).
- **PR #18 (`feature/customer-hero-logo`)** — merged (fast-forward) og production-verificeret
  **2026-09-08**. Kunderejseplanens hero viser nu det **godkendte hvide Unique Travel-logo med
  Q/palme** i stedet for tekst-wordmarken. Løser den længe blokerede logo-tråd — blokeringen var
  udelukkende det manglende asset, som Ricko leverede 2026-09-08.
  **Asset: `public/brand/unique-travel-logo-white.png`** — første fil i en ny `public/`-mappe.
  Transparent PNG 987×332, 16 KB, **byte-identisk med Rickos original** (ingen re-komprimering,
  ingen skalering, intet visuelt ændret). AI-filen er ikke brugt, og logoet er ikke genskabt som SVG.
  `.wordmark` erstattet af `.hero-logo` i `globals.css`: **124px på mobil, 168px fra 760px**
  (højde 42px / 57px). Diskret `drop-shadow(0 1px 3px rgba(0,0,0,0.28))` — ingen baggrundsboks —
  holder det hvide logo læsbart på lyse hero-billeder; bevidst valgt og bekræftet af Ricko.
  Også rettet i `[bookingId]/loading.tsx`, som havde en anden kopi af tekst-wordmarken — ellers
  ville skeletonet vise tekst og hoppe til logo. Kun 4 filer, 22 linjer ind / 9 ud.
  Uberørt: kontakt-knap, hero-title, kicker, pills, intro, CTA, nøgleinfo-stribe,
  bookingnummer-unlock. Ingen DB-migration, ingen parserændring, intet rejseindhold.
- **PR #16 (`fix/hotel-cards-natural-height`)** — merged og production-verificeret **2026-09-07**.
  Christian meldte en stor tom hvid blok under højre hotelkort på en Sri Lanka-rejseplan.
  Root cause: `.hotels` er et CSS Grid, og grid stretcher som standard alle items i en række til
  rækkens højde; fra 1024px er der to kolonner, så et højt pakke-/rundrejsekort satte højden for
  hele rækken, og `.hotel`s hvide baggrund gjorde overskudspladsen synlig. Ingen `h-full`,
  `min-height` eller `auto-rows-fr` var involveret — det var grid'ets default.
  Fix: **`align-items: start` på `.hotels`** (5 linjer i `globals.css`, heraf 4 kommentar).
  Ingen effekt i én kolonne, så mobil er uændret. Målt i Chromium på seks rejser, desktop 1280px:
  tom bund gik fra 590px / 226px / 138px / 56px til 0px; mobil 390px er bit-for-bit identisk med
  før. Intet indhold klippes (`scrollHeight == clientHeight`), og antal kort, listelinjer og
  tekstlængde er uændret. Kun CSS — ingen markup-, data- eller logikændring.
- **PR #14 (`feature/admin-trip-search`)** — merged og deployet **2026-09-07**. Søgefelt i
  admin-listen "Alle præsentationer" (ønsket af Randi: en rejseplan var svær at finde igen
  efter opdatering). Filtrerer på **bookingnummer** (helt/delvist, `#` ignoreres), destination,
  kundenavn og slug; søgeordet deles i ord, så `bali 35682` og `sri lanka` begge virker.
  Client-side i `src/lib/trip-search.ts` — `GET /admin/api/trips` henter hele listen uden
  pagination, så data er allerede i browseren. Ingen DB-migration, ingen ny endpoint, ingen
  ændring af parser, customer, auth eller bookingnummer-unlock.
  Ved aktiv søgning vises alle match og "Vis alle" erstattes af en tæller; tomt felt giver
  præcis den hidtidige visning (seneste 5 / vis alle), og `showAllTrips` røres ikke.
  **Rådgiver er ikke søgbar** — feltet findes ikke på listeelementet (ligger i `trip.data`).
- **PR #12 (`fix/jimbaran-location-and-hero-logo`)** — merged og production-verificeret **2026-09-07**.
  Jimbaran-koden i TravelWire hænger på Kuta, så PDF'en kan skrive opholdet som `Jimbaran (Kuta)`,
  `Jimbaran/Kuta` eller `Kuta/Jimbaran`. Ny helper `normalizeLocationLabel`
  (`src/lib/location-label.ts`) fjerner Kuta kundevendt — men kun når den står side om side med
  Jimbaran med en TW-separator (parentes, skråstreg, komma). Kaldes fra `normalizeTrip`, så
  rensningen sker ved **render**: eksisterende rejser blev rettet uden re-upload, uden migration
  og uden ændring af parser-prompten. Rå `data`-jsonb beholder TW's original.
  Bevidst urørt: `Kuta` alene, `Kuta Beach`/`Kuta Selatan`, fritekst som "Jimbaran nær Kuta",
  og `trip.intro` (intro ændres kun via intro-endpointet).
  Production-verificeret på bookingerne 35685, 35682, 35799 (rettet), 35479 (ægte Kuta-rejse,
  uændret) og 35764 (ren Jimbaran, uændret); bookingnummer-unlock bekræftet uændret.
  **Hero-logo (palme/Q) indgik IKKE** — se åbne tråde.
- Tidligere: `efa8b31` og `8d664dc` var docs-only STATUS-commits oven på app-koden fra
  PR #5–#9 / `9dfddbf`
- Indhold ud over juli-batchen (sec-fixes, password-flow, destinations-upload m. WebP, opret-destination,
  AI Project Automation Kit):
  - **PR #6 (`fix/admin-password-recovery-flow`)** — password recovery for admin: reset-side,
    recovery-mail, sessionshåndtering + ærlig 429-besked ved Supabase mail-rate-limit.
  - **PR #7 (`fix/customer-access-and-multiple-hotel-alternatives`)** — flere alternative hoteller vises
    som separate cards (løftes fra `notes` i normalizer), ingen dobbelt "Besparelse: Besparelse …";
    adgangsgate/bookingnummer-unlock verificeret.
  - **PR #8 (`fix/customer-layout-logo-and-tour-description`)** — rundrejse-/programinklusioner ligger
    ikke længere som lang tekstblok på pakke-hotel-kortet; vises i rejseplanen som "Læs om udflugten".
    Header/logo bekræftet ens på tværs (ren tekst-wordmark, intet Q/palme — ingen ændring).
  - **PR #5 (`feat/backend-integrations-created-by-and-parse-failures`)** — `trips.created_by` sættes ved
    oprettelse (kun insert-grenen; re-upload rører den ikke) + parse-fejl logges i `parse_failures`
    dead-letter (`invalid_json` | `schema_mismatch` | `anthropic_error`). Production-smoke-testet 2026-08-26.
  - **PR #9 (`fix/customer-hero-image-selection`)** — kombi-destinationer ("Sri Lanka & Maldiverne" o.l.)
    får nu landets hero-billede via segment-match i rute-rækkefølge (`pickDestinationMatch`); enkelt-
    destinationer uændret; fallback bevaret. Production-verificeret 2026-08-26.

## Branches

Branch-oprydning **fuldført 2026-08-26**: alle merged branches (PR #5–#9, `dest-admin`,
`docs/*`, `rate-limit-unlock-security-fix`, `feature/redigerbar-intro` m.fl.) samt de
tilhørende scratchpad-/D-worktrees er slettet lokalt og på remote. `feat/backend-integrations-…`
blev force-slettet lokalt (kun gammel pre-rebase `30900d8`; indholdet er i main via `af0acb2`).
Kun WIP/aktive branches består.

| Branch | Tilstand |
|---|---|
| `main` | = origin/main = `4169f19` (production) |
| `docs/status-after-sebastian-fixes` | **IKKE merged (WIP)** — bevares |
| `feature/individuelle-logins-profiles` | Merged/legacy, lokal + remote — bevares indtil Ricko beslutter om den skal slettes |
| `gallery-upload-diagnose` (kun remote) | **IKKE merged** — bevares indtil afklaret |

Worktrees: kun `main` (Desktop).
`fix/jimbaran-location-and-hero-logo` (+ `wt-jimbaran`), `feature/admin-trip-search`
(+ `wt-search`) og `fix/hotel-cards-natural-height` (+ `wt-cards`) blev alle slettet 2026-09-07
efter merge (verificeret ancestor af `origin/main`). `feature/customer-hero-logo` (+ `wt-hero-logo`)
slettet 2026-09-08 på samme vilkår. `feature/favicon-brand-icon` (+ `wt-favicon`) slettet
2026-09-09 efter merge og production-verifikation. `fix/preserve-room-blocks` (+ `wt-rooms`)
slettet 2026-09-09 efter at PR #2 endelig blev merged. `fix/hotel-notes-readable`
(+ `wt-notes`) slettet 2026-09-09 efter merge og production-verifikation.
`fix/tour-toggle-label` (+ `wt-tour`) slettet samme dag på samme vilkår.
`fix/friendly-invalid-pdf-error` (+ `wt-pdf`) slettet 2026-09-10 efter merge og
production-verifikation.

## Åbne tråde

1. Mille: opret Japan/Kenya/Mauritius-lignende manglende destinationer + billeder i production (ren drift, ingen kode)
2. ~~**Hero-logo (palme/Q)**~~ — **LØST 2026-09-08 i PR #18.** Ricko leverede de godkendte
   brand-assets, og heroen viser nu det hvide logo med Q/palme fra
   `public/brand/unique-travel-logo-white.png`. **Mille har godkendt logoet** (meldt af
   Ricko 2026-09-09). Favicon er også løst — se PR #20
3. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt
4. Branch-oprydning — **fuldført 2026-08-26** (kun WIP/aktive branches består)

## Backlog (fra august-review)

- **Yderligere kommentarer fra PDF** — flere hotel-/programnoter der i dag ikke fanges struktureret,
  kunne løftes til kundevendt visning (kræver afklaring af hvilke felter).
- **Vandflyver-tag** — dedikeret markør/ikon for vandflyver-transfers og bagagebegrænsninger
  (i dag kun fri-tekst i noter).
- ~~**Favicon**~~ — **LØST 2026-09-09 i PR #20.** Browserfanen viser det grønne Q/palme-ikon
  fra `src/app/icon.png` (512×512, 5,9 KB, genereret fra `Unique-travel-green-icon 1.png`).
- **Supabase custom SMTP** — recovery-/system-mails rammer Supabase' delte mail-rate-limit;
  custom SMTP-domæne fjerner 429'erne (drift-opgave).
- ~~**"Læs om rundrejsen"-tekstlabel**~~ — **LØST 2026-09-09 i PR #22.** Flerdagsforløb siger nu
  "Læs om programmet"; ægte endagsudflugter beholder "Læs om udflugten".
- **`parse_failures` oprydning** — pg_cron-job der sletter rækker > 30 dage (jf. `supabase/README.md`)
  er endnu ikke sat op.
- ~~**Pæn fejlbesked ved ugyldig PDF**~~ — **LØST 2026-09-10 i PR #23.** Fire fejltyper med
  hver sin danske besked i `src/lib/parse-errors.ts`; tekniske detaljer bliver server-side.

## Seneste checks (2026-09-10, main `4169f19`)

PR #23 (PDF-fejlbesked), 2026-09-10: **test ✅ 97/97** (16 nye i `parse-errors.test.ts`, med
de faktiske Anthropic-fejlstrenge som fixtures) · typecheck ✅ · lint ✅ (kun de 6 kendte
img-warnings) · build ✅. En test asserter eksplicit at ingen sælgervendt besked indeholder
`JSON`, `schema`, `Zod`, `Anthropic`, `API_KEY`, `stack`, `undefined` eller `null`.
Alle 11 fejlscenarier kørt gennem den faktiske modulkode — hver giver en pæn dansk besked.
Production efter merge: `/admin` 200, `POST /admin/api/parse` uden session fortsat
`401 {"error":"Ikke logget ind"}`. Den nye UI-fallbacktekst er i admin-bundtet, og den gamle
`matcher det forventede skema` har **0 forekomster** i klient-bundtet. (`Invalid enum value`
findes stadig i et chunk, men det er Zods eget errorMap-bibliotek, ikke vores fejltekst.)
Kundeside-regression uændret: hero-logo, favicon, 35518's 2 værelsesbokse / 6 labels,
hotel-noternes `leading-relaxed`, "Læs om programmet" 1× og "Læs om udflugten" 2× på 34566,
sub-hotel-boks. `parse_failures` er tilgængelig og uændret (3 rækker, seneste 2026-09-07).
**Udestår:** klik-test i admin (upload en PDF og se boksen) kræver login, som agenter ikke
har jf. `docs/ACCESS_MATRIX.md`. Succes-stien er bit-for-bit urørt i diffen — kun de to
fejl-grene er ændret. Ricko/sælger bekræfter i UI.

PR #22 (programmet-label), 2026-09-09: **test ✅ 84/84** (13 nye for `isMultiDayProgram` og
`timelineToggleLabel`, med faktiske production-typeLabels som fixtures) · typecheck ✅ ·
lint ✅ (kun de 6 kendte img-warnings) · build ✅.
Før merge blev branchens produktionsbuild målt mod production på mobil 390 og desktop 1280:
**sidehøjden var identisk på alle 16 målinger** — kun knap-etiketten var anderledes.
Production efter merge, 10 rejser × 2 viewports: flerdagsforløb viser "Læs om programmet"
(34952 safari, 35121 + 35528 rundrejse, 35729 m. alternativer); ægte endagsture viser fortsat
"Læs om udflugten" (35133, 35579, og 2 af 3 på 34566); grænsetilfældet 35498 giver korrekt
3× udflugten + 1× programmet. `Se flydetaljer` og `Se udflugtsmuligheder` uændrede.
Booking 34566 er den stærkeste case: safari (5 dage/4 nætter) → programmet, mens halvdagstur
og ballon-tilkøb → udflugten, alt sammen på samme side.
Uberørt i samme kørsel: værelsesfordeling (35518: 2 bokse / 6 labels), hotel-noter
(12px/19,5px), alternativ- og sub-hotel-bokse, `align-items: start`, hero-logo og favicon.
0 kort klipper indhold, 0 vandret overflow på 390 px. Bookingnummer-unlock uændret: uden
cookie og med forkert cookie vises gaten, og hverken hotelnavne eller etiketter lækker.

PR #21 (hotel-noter), 2026-09-09: test ✅ 74/74 · typecheck ✅ · lint ✅ (kun de 6 kendte
img-warnings) · build ✅. Branchens produktionsbuild blev målt mod production (= main
`62dd490`) i Chromium på mobil 390 og desktop 1280 før merge, og production blev målt igen
efter. Noterne står nu **12px / 19,5px / `rgb(94,94,94)` / kursiv** på alle sider med noter.
**Uændret ±0px: rejse uden noter (34504) og booking 35518**, hvor de 2 værelsesbokse og
6 labels fortsat er intakte. Øvrige: badeferie 35579 +14/+15px, rundrejse 34566 +65/+33px,
alternativer 35729 +21/+14px, gruppe 35090 +78/+43px, lang note 35132 +44/+30px.
Maskinelt bekræftet identisk før/efter: notetekstens tegnantal, værelsesbokse,
værelseslabels, alternativ-bokse, sub-hotel-bokse, listeelementer og kortantal.
PR #16 intakt: `align-items: start` aktiv, kort i samme række har fortsat forskellige
højder (fx 546+772, 628+601 px). 0 kort klipper indhold, 0 vandret overflow på 390 px,
hero-logo og favicon på alle sider. Bookingnummer-unlock uændret: uden cookie og med
forkert cookie vises gaten, og hverken hotelnavne eller noter lækker.

PR #2 (værelsesfordeling), 2026-09-09: **test ✅ 74/74** (8 nye `splitRoomAllocation`-tests
med aktuelle production-strenge) · typecheck ✅ · lint ✅ (kun de 6 kendte img-warnings) ·
build ✅. **Maskinel gennemgang af alle 219 aktive rejser:** 120 hotelkort på 48 rejser har
2+ værelser; 333 værelseslinjer, hvoraf alle 333 nu får label (326 før justeringen),
**0 tegn går tabt** og 0 linjer bliver tomme.
Production-verificeret i Chromium på mobil 390 og desktop 1280 (cookie sat direkte, så
unlock-flowet ikke skriver til `rate_limits`): 35518 → 2 bokse/6 labels/6 linjer;
35617 + 35780 → 2 bokse/8 labels (de tidligere tabte lange labels er med); 35528
(Sri Lanka-rundrejse) → 2 værelsesbokse + pakke-boks med 5 sub-hoteller intakt;
35782 + 35789 → alternativ-bokse og Besparelse/Merpris uændret; **35579 (almindelig
badeferie) fuldstændig uændret — nul nye elementer.** Ingen kort klipper indhold, ingen
vandret overflow på 390 px, noter fortsat 12 px, hero-logo og favicon på alle sider.
PR #16 intakt: `align-items: start` aktiv, kort i samme række har fortsat forskellige
højder (fx 441+400 px). Bookingnummer-unlock uændret: uden cookie og med forkert cookie
vises gaten og hverken hotelnavne eller værelsesdata lækker.

PR #20 (favicon), 2026-09-09: typecheck ✅ · lint ✅ (kun de kendte img-warnings) · build ✅
(`/icon.png` fremgår som statisk route) · test ✅ 66/66. Production efter merge: deploy READY
på `79683d8`, `GET /icon.png` → 200 `image/png` 5919 bytes og **byte-identisk** (sha256) med
`src/app/icon.png` i repoet. `<link rel="icon" href="/icon.png?…" sizes="512x512">` bekræftet
på `/`, `/admin` og en rigtig kunderejseplan. Uforandret: `<title>Unique Travel</title>`,
`description="Skræddersyede rejser"`, `robots="noindex, nofollow"` på alle tre, og
hero-logoet (`/brand/unique-travel-logo-white.png` + `.hero-logo`) er stadig på kundesiden.

typecheck ✅ · lint ✅ (0 fejl; 4 kendte img-warnings = PERF-3) · build ✅ ·
test ✅ (66 tests / 6 filer: format, hotel-alternatives, normalize-trip, destination-match,
location-label, trip-search) — kørt på den træ-identiske commit før merge.
DB 2026-09-08: 223 trips (217 aktive), 15 destinationer — alle 15 har hero-billede.
Production efter PR #14: deploy READY, `/admin` 200, kundeside 200, `/admin/api/trips` uden
login 401, Jimbaran/Kuta-fix fortsat intakt.
Søgefunktionens ni testcases (præcist/delvist/`#`-bookingnummer, kundenavn, destination, slug,
uden match, ryddet felt, ryddet felt + "Vis alle") kørt mod den ægte production-liste på 222
trips — read-only. **Klik-test i selve admin-UI'et udestår: den kræver login, som agenter ikke
har (jf. `docs/ACCESS_MATRIX.md`: auth-brugere kun m. Rickos OK).** Ricko/Randi bekræfter i UI.
PR #16 production-verificeret 2026-09-07 med Chromium mod de rigtige kundesider (read-only):
`align-items=start` aktiv, tom bund 0px på alle pakke-/badeferie-kort, rundrejsekortet viser
fortsat alle 7 sub-hoteller, mobil uændret, ingen vandret scroll.
PR #18 production-verificeret 2026-09-08 med Chromium mod den rigtige kundeside (Sri Lanka,
read-only ud over én normal unlock): logo indlæst fra `/brand/unique-travel-logo-white.png`
(natural 987×332), **168×57px på desktop 1280 / 124×42px på mobil 390**, `alt="Unique Travel"`,
drop-shadow aktiv. `.wordmark` er væk, og "Unique Travel" optræder ikke længere som synlig
hero-tekst. Kontakt-knap uforandret (95×40px, til højre for logoet, ingen overlap); kicker,
title, pills, intro, CTA og nøgleinfo-stribe uforandrede; ingen fejlede `/brand/`-requests.
Fallback testet ved at blokere hero-fotoet: gradient-baggrunden aktiv og logoet fortsat
læsbart på begge breakpoints. Bookingnummer-unlock bekræftet uændret (gate vist, unlock virker).
Loading-skeletonet kunne ikke fanges visuelt — serveren svarer for hurtigt — men den serverede
RSC-payload viser at `loading.tsx` sender samme logo med korrekt `src` og `alt`.
Live-assettet er byte-identisk (md5) med filen i repoet.
Tidligere: PR #16 og #12 verificeret 2026-09-07; PR #5 og #9 2026-08-26.

## Kendte risici

- **Preview deler production-DB/-Storage** — al preview-test rører ægte data
- **Vercel preview er bag Vercel Authentication (SSO)** — preview-URL'er kan ikke curles anonymt;
  render-verifikation sker lokalt (mod prod-DB) eller på production efter merge
- **Storage-bucket-config uden for drift-tjekket** (destinations: 50 MB + MIME-allowlist)
- Parse-routen har latent 4,5 MB-grænse på PDF'er (Vercel-body-limit; TravelWire-PDF'er er små i praksis)
- Repo er public — disciplin omkring secrets/kundedata er procesbåret, ikke teknisk håndhævet

## Næste anbefalede outcome

1. **Vision 2.0 scope-afklaring og plan** med Ricko — ingen kode endnu (planlægges som preview-branch før merge)
2. **Backlog-prioritering** — vælg næste kundevendte forbedring fra listen ovenfor

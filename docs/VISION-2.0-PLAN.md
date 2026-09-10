# Vision 2.0 — implementeringsplan

> Status: **udkast til godkendelse**. Ingen kode ændret. Ingen app-filer rørt.
> Skrevet 2026-09-10 mod main `7fd5caa`. **Revideret 2026-09-10** efter Rickos
> indvending: galleriet er polish, ikke en reel Vision 2.0-start. Fase 1 er nu
> Hero + rejseoverblik.
> Planen oversætter **eksisterende, godkendt designmateriale** til konkrete PR'er.
> Der er bevidst **ikke** lavet et nyt designforslag.

## Kilder

| Kilde | Hvad den bidrager med |
|---|---|
| `Designmanual Unique Travel.pdf` | Farver, typografi, logovarianter, fotostil, tone |
| `BRAND FRAMEWORK_Unique Travel.pdf` | DBK-kundetypen og hvad den vil se |
| `reference/README.md` (Cowork-projektmappen) | Den oprindelige design-handoff: tokens, 10 views, spacing, breakpoints |
| Live production (`rejseplaner.uniquetravel.dk`) | Målt tilstand, se tal nedenfor |
| `docs/DECISIONS.md` | 2026-07-21: Vision 2.0 bygges på preview-branch, aldrig direkte på main |

Bemærk: `rejsepraesentation-improvements.md` (Downloads) er **ikke** brugt som designkilde.
Den er en ældre sikkerhedsbrief; dens eneste designafsnit foreslår farver
(`warm coral #D97757`) der modsiger designmanualen, og dens kontekstafsnit peger på et
forkert Supabase-projekt. Sikkerhedsdelen er desuden for længst implementeret.

## Hvad designmaterialet faktisk kræver

Fra designmanualen:

- **Farver:** Rainforest `#004e50` (primær), Sand `#e2dccd`, Gold `#d3a75d`, Sunset `#b7583a` (spot, sparsomt)
- **Typografi:** Cormorant (headlines/logo), Open Sans (brødtekst), Lindsay Signature kun som sjælden stemningsmarkør
- **Fotostil:** stram, minimalistisk, eksklusiv. Kølige blågrønne toner + varme gulddetaljer + neutrale sandfarver. **Undgå visuel støj, hygge-udtryk og generisk stock**
- **Tone:** cool, intelligent, eksklusivt — udtrykkeligt "ikke hyggeligt eller grønt"

Fra brand frameworket — DBK-kunden (30-75 år, par/familier/generationsrejser) vil se:

- **Store, flotte billeder** og **luft (whitespace)**
- **Kortere tekster**
- Et **eksklusivt visuelt udtryk** — kunden skal "visuelt forelske sig i produktet"

Det er hele designretningen. Vision 2.0 er ikke en ny palette; det er **mere billede,
mere luft, mindre tekst** inden for den palette der allerede er implementeret.

## Gap-analyse

### Allerede løst — rør ikke

- **Farvetokens matcher 1:1.** Alle 11 tokens i `globals.css` er identiske med
  design-handoffet, og Rainforest/Sand/Gold matcher designmanualen. Der er **ingen farve-gap**.
- **Typografi er på plads.** Cormorant + Open Sans via `next/font/google`, self-hostet (GDPR).
- **Alle 10 views fra handoffet er bygget:** Hero, TripDetails, SectionHeader, Timeline,
  Hotels, Price, Practical Note, ContactCTA, Footer, ActionBar.
- **Brandmærket er komplet:** hero-logo (PR #18) og favicon (PR #20).
- **Nylig UX-oprydning:** værelsesfordeling (PR #2), hotelkortenes højde (PR #16),
  hotel-noternes læsbarhed og WCAG-kontrast (PR #21), programmet-labelen (PR #22),
  transport-chips (PR #24), alternative hoteller (PR #26).

Ingen af disse punkter skal genåbnes. Vision 2.0 bygger ovenpå dem.

### Målt tilstand på production (booking 34566, desktop 1280)

| Sektion | Højde | Andel af siden |
|---|---:|---:|
| Hero | 780 px | 11 % |
| Nøgleinfo-stribe | 233 px | 3 % |
| **Timeline** | **3817 px** | **54 %** |
| Destinationsgalleri | 376 px | 5 % |
| Hoteller | 969 px | 14 % |
| Pris + praktisk | 530 px | 8 % |
| CTA + footer | 109 px | 2 % |

Hero + stribe udgør tilsammen 14 % af siden og er alt kunden ser før den 3817 px lange
timeline. Det er her førstehåndsindtrykket afgøres.

### Gap 1 — førstehåndsindtrykket læses som "PDF lagt på web" (fase 1)

Målt på den nuværende hero:

- **Alt indhold er klemt i én venstrekolonne.** Logo, kicker, titel, pills, intro og CTA
  ligger alle inden for de yderste ~620 px; hele højre halvdel af hero-fotoet står tom.
  Kompositionen er ikke stram og bevidst — den er en venstrestillet tekstblok på et foto.
- **Intro-teksten er fire linjer brødtekst direkte på fotoet** (109 px høj, 17 px Open Sans,
  median 563 tegn på tværs af alle rejser, max 785). Det er dokumenttekst, ikke
  magasin-anslag. DBK-kravet er kortere tekster.
- **Datoerne står to gange lige efter hinanden:** som pill i heroen
  (`15. juli 2026 – 28. juli 2026`) og igen 100 px længere nede i striben som
  `Afrejse` / `Hjemkomst`. Ren dublering i det vigtigste område af siden.
- **Rejsens omfang fremgår ikke.** Kunden får to datoer og skal selv regne varigheden ud.
  Antal nætter, antal destinationer og rutens form står ingen steder samlet.
- **Pills blander to informationstyper** uden visuel forskel: ruten
  (`2N. Arusha, 4N turprogram, 6N. Kendwa`) og datointervallet ser identiske ud.
- **Nøgleinfo-striben er en 4-kolonners formular** — `Afrejse` / `Hjemkomst` / `Rejsende` /
  `Rådgiver`. På rejser med mange rejsende løber navnelisten ud over stribens højde og
  klippes visuelt. Det ligner et bookingsystem, ikke en præsentation.

**Det er dette gap Vision 2.0 skal lukke først.** Ikke fordi heroen er teknisk forkert,
men fordi den er det eneste sted hvor "eksklusivt visuelt udtryk" og "kunden skal visuelt
forelske sig i produktet" afgøres.

### Gap 2 — billeder fylder for lidt (fase 4)

Billedmaterialet **findes allerede**: alle 15 destinationer har hero-billede og præcis
3 galleribilleder, og galleriet vises på alle 230 aktive rejser. Men galleriet er kun
**5 % af sidehøjden**, mens tekst (timeline) er 54 %.

Galleriet står desuden som den eneste kundevendte komponent uden for designsystemet:

- `rounded-lg` (8 px) — designsystemet bruger 2 px på kort, 999 px på pills
- `bg-stone-100` — en Tailwind-grå der ikke findes i paletten
- `max-w-5xl` (1024 px) — resten af siden er 1180 px
- `px-4 md:px-8 py-12 md:py-16` — ikke sidens 28/56/72 px-rytme

**Dette er billedlayout-polish, ikke en Vision 2.0-start.** Galleriet findes allerede,
billederne vælges allerede manuelt, og kundens oplevelse ændres kun begrænset af at rette
bredde, spacing, radius, baggrundsfarve og billedhøjde. Det hører hjemme i **fase 4**
sammen med `next/image`, hvor det får reel effekt: større billeder giver først mening når
de også leveres i rigtig størrelse.

### Gap 3 — ingen billedoptimering (fase 4)

Ingen kundevendte billeder bruger `next/image` (kendt som PERF-3; kilden til de 6
lint-warnings). Målt på production leveres hero-billedet i **5610×3739 px** til en
1280 px-visning, og galleribilledernes bredde svinger fra 1000 til 4000 px.

### Gap 4 — teksttyngde (fase 1 delvist, fase 2 resten)

Intro er median 563 tegn, og timeline fylder over halvdelen af siden. DBK-kravet er
"kortere tekster". Intro-delen håndteres i fase 1 (visuel forkortelse, intet indhold
slettes); timeline-tyngden i fase 2. Bemærk at intro-teksten er brand-policy og redigeres
af sælgerne — **selve teksten ændres ikke af denne plan.**

### Gap 5 — fotostil er en indholdsbeslutning

Designmanualen kræver stram, støjfri, eksklusiv fotostil. Nogle nuværende
galleribilleder ligger langt fra det. **Det kan kode ikke løse** — det hører til Mille
og billeddriften. Nævnt her, så det ikke forveksles med et implementeringsgap.

### Hvad vi ikke skal ændre

- Farvepaletten og typografien — de er godkendte og korrekt implementeret
- Sektionsrækkefølgen — den følger handoffet
- Datamodellen (`Trip`, `itinerary`, `hotels`, `alternatives`, `roomAllocations`, `notes`)
- Parser og prompt
- Admin, auth, bookingnummer-unlock
- Alt fra PR #2/#16/#18/#20/#21/#22/#23/#24/#26

## Faseplan

Hver fase er én PR, bygges på preview-branch og testes af Ricko før merge
(jf. `docs/DECISIONS.md` 2026-07-21).

| Fase | Indhold | Risiko |
|---|---|---|
| **1** | **Hero + rejseoverblik / førstehåndsindtryk** | Middel |
| 2 | Timeline / program | Høj |
| 3 | Hoteller | Høj |
| 4 | Billeder: galleri-polish + `next/image` | Middel |
| 5 | Pris, praktisk info, CTA, mobil-polish | Lav-middel |

---

## Fase 1 — Hero + rejseoverblik (første Vision 2.0-PR)

### Hvad kunden ser anderledes

1. **Et reelt rejseoverblik før timelinen.** Rejsens omfang samles ét sted: varighed,
   antal destinationer og rutens form. Alt bygges på felter der **allerede findes på alle
   230 aktive rejser** — `subtitle` (ruten), `hotels[].nights` (median 14 nætter, max 33)
   og `hotels[].location` (median 3 destinationer, max 9). **Ingen ny data, intet nyt felt,
   ingen parserændring.**
2. **En roligere hero-komposition med mere luft.** Indholdet er i dag klemt i venstre
   ~620 px med tom højreside. Fase 1 giver hero-blokken bevidst placering og vejrtrækning,
   så fotoet får lov at virke — designmanualens "stram og minimalistisk komposition".
3. **Intro som magasin-anslag frem for dokumenttekst.** Introen vises forkortet med
   mulighed for at folde ud. **Hele teksten forbliver tilgængelig** — der slettes intet,
   og selve teksten redigeres ikke (den er brand-policy og styres af sælgerne).
4. **Datoerne står ét sted i stedet for to.** Dubleringen mellem hero-pill og
   nøgleinfo-stribe fjernes.
5. **Pills skelner mellem rute og tidsrum** i stedet for at se ens ud.
6. **Nøgleinfo-striben bliver præsentation frem for formular.** Roligere hierarki, og
   navnelisten under `Rejsende` klipper ikke længere på rejser med mange rejsende.

### Hvordan det adskiller sig fra i dag

| | I dag | Efter fase 1 |
|---|---|---|
| Rejsens omfang | Kun to datoer; kunden regner selv | Varighed + destinationer samlet |
| Intro | 4 linjer brødtekst på fotoet | Kort anslag, fuld tekst et klik væk |
| Datoer | To gange inden for 100 px | Ét sted |
| Hero-komposition | Venstrestillet blok, tom højreside | Bevidst komposition med luft |
| Nøgleinfo | 4-kolonners formular, navneliste klipper | Roligt hierarki, intet klipper |

### Hvad der bevares uændret

- Hero-logoet (PR #18) og dets placering
- Kontakt-knappen øverst til højre og CTA'en `Kontakt os om rejsen`
- Hero-fotoet, fallback-gradienten og overlay-lagene
- Kicker-teksten `Rejseforslag`
- **Alle data**: afrejse, hjemkomst, rejsende, rådgiver og bookingnummer vises fortsat
- Farver, tokens og fonte

### Hvad der kommer direkte fra det eksisterende designmateriale

Intet i fase 1 er et nyt designforslag:

- **Luft/whitespace og "store billeder"** → brand frameworkets DBK-krav
- **Kortere tekster** → samme kilde, ordret
- **Stram, minimalistisk komposition, ingen visuel støj** → designmanualens fotostil-afsnit
- **Cool, intelligent, eksklusivt — ikke hyggeligt** → designmanualens tone-afsnit
- **Cormorant til display, Open Sans til brødtekst** → uændret fra manualen og handoffet
- **Paletten** → uændret; ingen nye farver introduceres

### Filer

- `src/components/trip/Hero.tsx`
- `src/components/trip/TripDetails.tsx`
- `src/app/globals.css`
- Eventuelt én lille ny præsentationskomponent til rejseoverblikket, hvis det gør
  `Hero.tsx` mere læsbar end at udvide den

### Risici

- **Heroen er kundens første indtryk** og det mest synlige sted at fejle.
- `min-height`, overlay-gradienter og `hero-inner` er finjusteret; ændres højden, kan
  fotoets beskæring flytte sig uheldigt på tværs af de 15 destinationsbilleder.
- **Intro-forkortelse må aldrig skjule tekst permanent.** Udfoldning skal virke uden JS-fejl,
  og hele teksten skal være i DOM'en.
- Titlen er 124 px Cormorant på desktop; lange destinationsnavne
  (`Sri Lanka & Maldiverne`, `Vietnam & Thailand & Sri Lanka & Maldiverne`) skal bryde pænt.
- Rejseoverblikkets tal udledes af `hotels[]`. Rejser med 0 hoteller eller manglende
  `nights` skal falde tilbage til ingenting frem for at vise `0 nætter`.

### Testbookinger

| Booking | Hvorfor |
|---|---|
| 34566 | Tanzania — reference-casen målt ovenfor; safari, 3 hoteller |
| 35528 | `Sri Lanka & Maldiverne` — lang destinationstitel + kombi-rejse |
| 35917 | Mauritius — ét hotel, korteste rejse; overblikket må ikke se tomt ud |
| 35132 | Mange rejsende — navnelisten der klipper i dag |
| 35498 | 27 itinerary-elementer, lang rejse |
| — | Rejse med kort intro og rejse med den længste (785 tegn) |

Mobil 390 px og desktop 1280 px på alle, plus 760 px (tablet-brudpunktet).

### Acceptkriterier

- Rejseoverblikket viser korrekt varighed og antal destinationer på alle testbookinger
- Rejser uden hoteldata viser intet overblik frem for nuller
- **Fuld intro-tekst er tilgængelig**; intet indhold er slettet eller permanent skjult
- Afrejse, hjemkomst, rejsende, rådgiver og bookingnummer fremgår fortsat
- Hero-logo, kontakt-knap og CTA er visuelt uændrede
- Ingen nye farver uden for paletten; ingen nye fonte
- Lange destinationsnavne bryder pænt på 390 px
- Navnelisten under `Rejsende` klipper ikke
- Ingen vandret overflow på 390 px
- Bookingnummer-unlock er uændret
- Timeline, hoteller, pris og CTA er uændrede i højde og indhold

### Hvad der eksplicit ikke må ændres i fase 1

- `/[bookingId]/page.tsx` — sektionsrækkefølge og datahentning
- `src/lib/types.ts`, `normalizeTrip` og datamodellen
- `src/lib/claude.ts` — prompt og schema
- Selve intro-**teksten** (brand-policy; kun visningen ændres)
- Timeline, Hotels, PriceAndNote, ContactCTA, ActionBar, DestinationGallery
- Admin, auth, bookingnummer-unlock, rate-limit, audit
- Farvetokens og fonte
- Alt fra PR #2/#16/#18/#20/#21/#22/#23/#24/#26

---

## Fase 2 — Timeline / program

| | |
|---|---|
| **Filer** | `src/components/trip/Timeline.tsx`, `globals.css` |
| **Ændring** | Reducér den visuelle tyngde af de 54 %: mere luft mellem kort, roligere chips, tydeligere skel mellem dagsblokke. **Ingen** ændring af hvad der vises |
| **Risiko** | **Høj** — den største og mest datavarierede sektion (fly, transfer, hotel, aktivitet, program, activities), og den rummer PR #22's labels og PR #24's chips |
| **Testbookinger** | 34566 (safari + halvdagstur + tilkøb) · 35528 (rundrejse + sub-hoteller) · 35498 (27 elementer) · 35579 (udflugtsmuligheder) · 35132 (kun fly) |
| **Accept** | Alle elementtyper renderer som før · labels fra PR #22 uændrede · chips fra PR #24 uændrede · intet indhold klippes · udfold/kollaps virker |

## Fase 3 — Hoteller

| | |
|---|---|
| **Filer** | `src/components/trip/Hotels.tsx`, `globals.css` |
| **Ændring** | Mere luft i kortene, roligere typografisk hierarki. **Rør ikke** værelsesfordelingen (PR #2), noternes typografi (PR #21), `align-items: start` (PR #16) eller alternativ-bokse (PR #7/#26) |
| **Risiko** | **Høj** — fem PR'er har rørt denne fil |
| **Testbookinger** | 35518 (2×3 værelser) · 35528 (rundrejse + 5 sub-hoteller) · 35917 (to alternativer) · 35729 (alternativ m. besparelse) · 35579 (almindelig) · 35132 (lange noter) |
| **Accept** | Værelsesbokse, alternativ-bokse, sub-hotel-bokse og noter uændrede i indhold og antal · ingen tom hvid bund · mobil uændret |

## Fase 4 — Billeder: galleri-polish + `next/image`

| | |
|---|---|
| **Filer** | `src/components/trip/DestinationGallery.tsx`, `globals.css`, `next.config.mjs`, samt `<img>`-brug i `Hero.tsx` og `Hotels.tsx` |
| **Ændring** | To ting der hører sammen: **(a)** galleriet ind i designsystemet — 1180 px bredde, sidens padding-rytme, radius 2 px, `--sand-page` frem for `bg-stone-100`, større billedhøjde. **(b)** kundevendte `<img>` → `next/image` med korrekte `sizes`, så større billeder ikke gør siden tungere |
| **Risiko** | **Middel.** `next/image` kræver at Supabase Storage-domænet whitelistes i `next.config.mjs`; fejler et domæne, forsvinder billedet. Galleridelen alene er lav risiko |
| **Testbookinger** | 34566 (billeder i 1000/4000/1200 px bredde) · 35528 (kombi-destination) · 35579 · 35621 (kort side) · en destination uden galleri |
| **Accept** | Galleriet flugter med sidens bredde og radius · ingen nye farver uden for paletten · rejser uden galleri renderer stadig ingenting · alle billeder loader · lint-warnings for `no-img-element` er væk · ingen vandret overflow |

## Fase 5 — Pris, praktisk info, CTA og mobil-polish

| | |
|---|---|
| **Filer** | `src/components/trip/PriceAndNote.tsx`, `ContactCTA.tsx`, `ActionBar.tsx`, `globals.css` |
| **Ændring** | Sidste rytme-justering og gennemgang af de tre brudpunkter (390/760/1024) |
| **Risiko** | **Lav-middel.** CTA er konverteringspunktet og rummer rådgiver-matchet |
| **Testbookinger** | Rejse med rådgiverprofil · rejse uden (CTA skal skjules) · mobil 390 + 360 · tablet 760 · desktop 1024 + 1280 |
| **Accept** | Rådgiver-CTA vises kun når profilen findes · sticky action bar dækker ikke indhold · telefonlink virker |

## Kendte risici på tværs

- **Ingen automatiske UI-tests.** Verifikation er scriptet browsermåling før/efter, som i
  PR #2/#21/#22/#24/#26 — ikke en varig regressionstest.
- **Fase 2 og 3 rører filer som ni PR'er har ændret.** De skal bygges sent og testes mod
  de bookinger der er nævnt pr. fase.
- **Fotostilen er ikke en kodeopgave.** Nogle nuværende billeder matcher ikke manualens krav
  om stram, støjfri æstetik. Større billeder i fase 4 gør afvigelsen mere synlig. Bør
  afklares med Mille parallelt.
- **Vision 2.0's scope har hidtil stået som "KRÆVER RICKO"** i `DECISIONS.md` og `ROADMAP.md`.
  Denne plan er et bud på at lukke det punkt, ikke en vedtagelse. Godkendes planen, bør
  begge dokumenter opdateres i samme ombæring.

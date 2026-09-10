# Vision 2.0 — implementeringsplan

> Status: **udkast til godkendelse**. Ingen kode ændret. Ingen app-filer rørt.
> Skrevet 2026-09-10 mod main `7fd5caa`.
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
  transport-chips (PR #24).

### Målt tilstand på production (booking 34566, desktop 1280)

| Sektion | Højde | Andel af siden |
|---|---:|---:|
| Hero | 780 px | 11 % |
| Nøgleinfo-stribe | 233 px | 3 % |
| **Timeline** | **3817 px** | **54 %** |
| **Destinationsgalleri** | **376 px** | **5 %** |
| Hoteller | 969 px | 14 % |
| Pris + praktisk | 530 px | 8 % |
| CTA + footer | 109 px | 2 % |

### Gap 1 — billeder fylder for lidt (kernen i Vision 2.0)

Billedmaterialet **findes allerede**: alle 15 destinationer har hero-billede og præcis
3 galleribilleder, og galleriet vises på alle 230 aktive rejser. Men galleriet er kun
**5 % af sidehøjden**, mens tekst (timeline) er 54 %. DBK-kravet om "store, flotte
billeder" er ikke indfriet — billederne er der, de er bare små.

### Gap 2 — galleriet står uden for designsystemet

`DestinationGallery.tsx` er den eneste kundevendte komponent der bruger rå
Tailwind-utilities i stedet for projektets tokens:

- `rounded-lg` (8 px) — designsystemet bruger 2 px på kort, 999 px på pills
- `bg-stone-100` — en Tailwind-grå der ikke findes i paletten
- `max-w-5xl` (1024 px) — resten af siden er 1180 px
- `px-4 md:px-8 py-12 md:py-16` — ikke sidens 28/56/72 px-rytme

Galleriet er derfor **smallere end resten af siden** og har en fremmed hjørneradius.

### Gap 3 — ingen billedoptimering

Ingen kundevendte billeder bruger `next/image` (kendt som PERF-3; kilden til de 6
lint-warnings). Målt på production leveres hero-billedet i **5610×3739 px** til en
1280 px-visning, og galleribilledernes bredde svinger fra 1000 til 4000 px. Skal
billederne fylde mere, bliver det her et reelt problem — ikke bare en advarsel.

### Gap 4 — teksttyngde

Intro-teksten er median **563 tegn** (max 785), og timeline fylder over halvdelen af
siden. DBK-kravet er "kortere tekster". Dette er delvis en **indholds**-opgave
(intro-stilen er brand-policy og redigeres af sælgerne), ikke kun en kode-opgave.

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
- Alt fra PR #2/#16/#18/#20/#21/#22/#23/#24

## Faseplan

Hver fase er én PR, bygges på preview-branch og testes af Ricko før merge
(jf. `docs/DECISIONS.md` 2026-07-21).

### Fase 1 — Galleriet ind i designsystemet (anbefalet første PR)

| | |
|---|---|
| **Filer** | `src/components/trip/DestinationGallery.tsx`, `src/app/globals.css` |
| **Ændring** | Erstat de rå Tailwind-utilities med semantiske klasser og tokens: 1180 px bredde, sidens padding-rytme (28/56/72 px), radius 2 px, `--sand-page` frem for `bg-stone-100`. Øg billedhøjden, så galleriet går fra 5 % mod ca. 12-15 % af siden. Ingen ændring af antal billeder eller datakilde |
| **Risiko** | **Lav.** Én komponent uden datalogik. Vises på alle rejser, så en fejl er synlig — men den er også let at se og rulle tilbage |
| **Testcases** | 34566 (Tanzania, 3 billeder) · 35528 (Sri Lanka & Maldiverne, kombi-destination) · 35579 (Thailand) · en rejse hvis destination mangler galleri (skal falde tilbage til ingenting) · mobil 390 + desktop 1280 |
| **Accept** | Galleriet flugter med sidens bredde og radius · ingen nye farver uden for paletten · rejser uden galleri renderer stadig ingenting · ingen vandret overflow · alle øvrige sektioner uændrede i højde |

### Fase 2 — Hero + rejseoverblik

| | |
|---|---|
| **Filer** | `src/components/trip/Hero.tsx`, `src/components/trip/TripDetails.tsx`, `globals.css` |
| **Ændring** | Mere luft omkring hero-indholdet, roligere hierarki mellem titel/pills/intro, blødere overgang fra hero til nøgleinfo-stribe. Intro får en maks-visningslængde med "læs mere", så DBK-kravet om kortere tekster opfyldes **uden at slette indhold** |
| **Risiko** | **Middel.** Hero er det første kunden ser, og heroens `min-height` + overlay er finjusteret. Intro-forkortelse må aldrig skjule tekst permanent |
| **Testcases** | Kort intro (ca. 200 tegn) · median (ca. 563) · længste (785) · rejse uden intro · rejse uden subtitle · lang destination ("Sri Lanka & Maldiverne") · mobil 390 + desktop 1280 |
| **Accept** | Hero-logo og kontakt-knap uændrede · fuld intro tilgængelig · ingen tekst klippes · titel bryder pænt på mobil · unlock-flowet uændret |

### Fase 3 — Timeline / program

| | |
|---|---|
| **Filer** | `src/components/trip/Timeline.tsx`, `globals.css` |
| **Ændring** | Reducér den visuelle tyngde af de 54 %: mere luft mellem kort, roligere chips, tydeligere skel mellem dagsblokke. **Ingen** ændring af hvad der vises |
| **Risiko** | **Høj** — den største og mest datavarierede sektion (fly, transfer, hotel, aktivitet, program, activities), og den rummer PR #22's labels og PR #24's chips |
| **Testcases** | 34566 (safari + halvdagstur + tilkøb) · 35528 (rundrejse + sub-hoteller) · 35498 (27 elementer) · 35579 (udflugtsmuligheder) · 35132 (kun fly) · mobil + desktop |
| **Accept** | Alle elementtyper renderer som før · labels fra PR #22 uændrede · chips fra PR #24 uændrede · intet indhold klippes · udfold/kollaps virker |

### Fase 4 — Hoteller

| | |
|---|---|
| **Filer** | `src/components/trip/Hotels.tsx`, `globals.css` |
| **Ændring** | Mere luft i kortene, roligere typografisk hierarki. **Rør ikke** værelsesfordelingen (PR #2), noternes typografi (PR #21) eller `align-items: start` (PR #16) |
| **Risiko** | **Høj** — fire nylige PR'er har rørt denne fil |
| **Testcases** | 35518 (2×3 værelser) · 35528 (rundrejse + 5 sub-hoteller) · 35729/35782 (alternativer) · 35579 (almindelig) · 35132 (lange noter) · mobil + desktop |
| **Accept** | Værelsesbokse, alternativ-bokse, sub-hotel-bokse og noter er uændrede i indhold og antal · ingen tom hvid bund · mobil uændret |

### Fase 5 — Pris, praktisk info, CTA og mobil-polish

| | |
|---|---|
| **Filer** | `src/components/trip/PriceAndNote.tsx`, `ContactCTA.tsx`, `ActionBar.tsx`, `globals.css` |
| **Ændring** | Sidste rytme-justering og gennemgang af de tre brudpunkter (390/760/1024) |
| **Risiko** | **Lav-middel.** CTA er konverteringspunktet og rummer rådgiver-matchet |
| **Testcases** | Rejse med rådgiverprofil · rejse uden (CTA skal skjules) · mobil 390 + 360 · tablet 760 · desktop 1024 + 1280 |
| **Accept** | Rådgiver-CTA vises kun når profilen findes · sticky action bar dækker ikke indhold · telefonlink virker |

### Tværgående — billedoptimering (PERF-3)

Ligger som **selvstændig PR mellem fase 1 og 2**, ikke som en del af en fase: skift
kundevendte `<img>` til `next/image` med korrekte `sizes`. Det lukker de 6 kendte
lint-warnings og er en forudsætning for at billeder må fylde mere uden at gøre siden tung.
Risiko: middel — `next/image` kræver at Supabase Storage-domænet whitelistes i
`next.config.mjs`, og fejler et domæne, forsvinder billedet.

## Anbefalet første PR

**Fase 1 — galleriet ind i designsystemet.**

Ricko foreslog Hero + rejseoverblik som første fase. Jeg anbefaler at bytte om, af tre grunde:

1. **Galleriet er det eneste sted med en objektiv, ubestridt afvigelse** — rå
   Tailwind-utilities, fremmed hjørneradius og en bredde der ikke flugter med resten af
   siden. Det er ikke en smagsdom; det afviger fra det design-handoff resten af siden følger.
2. **"Store, flotte billeder" er DBK-kundens tydeligste krav**, og galleriet er hvor
   billeder bor. At løfte 5 % mod 12-15 % er den største Vision 2.0-effekt pr. ændret linje.
3. **Lavest risiko.** Komponenten har ingen datalogik, ingen betingelser ud over
   "0 billeder → render intet", og den er rørt af nul af de sidste otte PR'er.
   Hero derimod rummer logoet fra PR #18 og er kundens første indtryk.

Hero bliver fase 2 og følger umiddelbart efter — rækkefølgen udskyder den, den fjerner den ikke.

**Forventede filer i første PR:** `src/components/trip/DestinationGallery.tsx` og
`src/app/globals.css` (nye galleri-regler ved siden af de eksisterende sektionsregler).
Ingen andre. Ingen datamodel, ingen parser, ingen admin.

## Testcases til første PR

| Booking | Hvorfor |
|---|---|
| 34566 | Tanzania, 3 galleribilleder i vidt forskellig opløsning (1000/4000/1200 px bred) |
| 35528 | Sri Lanka & Maldiverne — kombi-destination, tester destinations-matchet |
| 35579 | Thailand, almindelig badeferie |
| 35621 | Maldiverne, kort side — galleriets vægt er mest synlig her |
| — | En destination uden galleri (skal rendere ingenting, ikke en tom sektion) |

Mobil 390 px og desktop 1280 px på alle.

## Kendte risici

- **Galleriet vises på alle 230 aktive rejser.** En fejl rammer bredt. Til gengæld er
  komponenten lille og isoleret, og rollback er én revert.
- **Billedvægt.** Løfter vi billedhøjden før PERF-3, downloader kunden stadig 4000 px-billeder.
  Derfor ligger billedoptimering som selvstændig PR lige efter fase 1 — eller før, hvis det
  foretrækkes.
- **Fotostilen er ikke en kodeopgave.** Nogle nuværende billeder matcher ikke manualens krav
  om stram, støjfri æstetik. Større billeder gør afvigelsen mere synlig. Bør afklares med Mille
  parallelt med fase 1.
- **Fase 3 og 4 rører filer som otte nylige PR'er har ændret.** De skal bygges sent og
  testes mod de bookinger der er nævnt pr. fase.
- **Ingen automatiske UI-tests.** Verifikation er scriptet browsermåling før/efter, som i
  PR #2/#21/#22/#24 — ikke en varig regressionstest.
- **Vision 2.0's scope har hidtil stået som "KRÆVER RICKO"** i `DECISIONS.md` og `ROADMAP.md`.
  Denne plan er et bud på at lukke det punkt, ikke en vedtagelse. Godkendes planen, bør
  begge dokumenter opdateres i samme ombæring.

## Hvad der ikke må røres endnu

Intet af nedenstående ændres før den relevante fase er godkendt:

- `/[bookingId]/page.tsx` — sektionsrækkefølge og datahentning
- `src/lib/types.ts` — `normalizeTrip` og hele datamodellen
- `src/lib/claude.ts` — prompt og schema
- Admin, auth, bookingnummer-unlock, rate-limit, audit
- Farvetokens og fonte i `globals.css`
- Hero-logo (PR #18) og favicon (PR #20)
- Værelsesfordeling (PR #2), hotelkortenes højde (PR #16), hotel-noter (PR #21),
  timeline-labels (PR #22), PDF-fejlbesked (PR #23), transport-chips (PR #24)

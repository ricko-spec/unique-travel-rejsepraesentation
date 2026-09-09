# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-09-09** (PR #2 værelsesfordeling live)

## Production

- **Commit:** `6e6d0c6` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk`
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
| `main` | = origin/main = `6e6d0c6` (production) |
| `docs/status-after-sebastian-fixes` | **IKKE merged (WIP)** — bevares |
| `feature/individuelle-logins-profiles` | Merged/legacy, lokal + remote — bevares indtil Ricko beslutter om den skal slettes |
| `gallery-upload-diagnose` (kun remote) | **IKKE merged** — bevares indtil afklaret |

Worktrees: kun `main` (Desktop).
`fix/jimbaran-location-and-hero-logo` (+ `wt-jimbaran`), `feature/admin-trip-search`
(+ `wt-search`) og `fix/hotel-cards-natural-height` (+ `wt-cards`) blev alle slettet 2026-09-07
efter merge (verificeret ancestor af `origin/main`). `feature/customer-hero-logo` (+ `wt-hero-logo`)
slettet 2026-09-08 på samme vilkår. `feature/favicon-brand-icon` (+ `wt-favicon`) slettet
2026-09-09 efter merge og production-verifikation. `fix/preserve-room-blocks` (+ `wt-rooms`)
slettet 2026-09-09 efter at PR #2 endelig blev merged.

## Åbne tråde

1. Mille: opret Japan/Kenya/Mauritius-lignende manglende destinationer + billeder i production (ren drift, ingen kode)
2. ~~**Hero-logo (palme/Q)**~~ — **LØST 2026-09-08 i PR #18.** Ricko leverede de godkendte
   brand-assets, og heroen viser nu det hvide logo med Q/palme fra
   `public/brand/unique-travel-logo-white.png`. Favicon udestår stadig — se backlog
3. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt
4. Branch-oprydning — **fuldført 2026-08-26** (kun WIP/aktive branches består)

## Backlog (fra august-review)

- **Yderligere kommentarer fra PDF** — flere hotel-/programnoter der i dag ikke fanges struktureret,
  kunne løftes til kundevendt visning (kræver afklaring af hvilke felter).
- **Vandflyver-tag** — dedikeret markør/ikon for vandflyver-transfers og bagagebegrænsninger
  (i dag kun fri-tekst i noter).
- **Favicon** — **Q/palme-logoet i heroen er løst 2026-09-08 (PR #18).** Tilbage står kun
  **favicon**: der er stadig intet brandmark i browserfanen. Assetet findes nu — `Unique-travel-white-icon`
  / `Unique-travel-green-icon` (icon-only, 920×992) er de oplagte kandidater, og de øvrige godkendte
  varianter (grøn, sort, GREEN+GOLD) ligger hos Ricko. Kræver kun en lille beslutning om lys/mørk
  variant — ikke længere blokeret på manglende materiale.
- **Supabase custom SMTP** — recovery-/system-mails rammer Supabase' delte mail-rate-limit;
  custom SMTP-domæne fjerner 429'erne (drift-opgave).
- **"Læs om rundrejsen"-tekstlabel** — evt. tydeligere toggle-label for rundrejse-/programafsnittet
  i rejseplanen (mindre UX-polish).
- **`parse_failures` oprydning** — pg_cron-job der sletter rækker > 30 dage (jf. `supabase/README.md`)
  er endnu ikke sat op.
- **Pæn fejlbesked ved ugyldig PDF** — for ugyldig/tom PDF returneres Anthropics rå 400-tekst til
  sælgeren (kun billing-fejl har særbesked). Overvej en generisk dansk besked.

## Seneste checks (2026-09-09, main `6e6d0c6`)

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

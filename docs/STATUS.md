# STATUS

> Læs denne før hver arbejdsrunde. Opdatér den ved hvert milepæl og inden en session slutter.
> Sidst opdateret: **2026-09-07** (PR #16 hotelkort med naturlig højde live)

## Production

- **Commit:** `7e41305` på `main` — Vercel READY, `https://rejseplaner.uniquetravel.dk`
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
| `main` | = origin/main = `7e41305` (production) |
| `fix/preserve-room-blocks` | **IKKE merged (WIP)** — åben PR #2. Worktree: `wt-room-blocks` |
| `docs/status-after-sebastian-fixes` | **IKKE merged (WIP)** — bevares |
| `feature/individuelle-logins-profiles` | Merged/legacy, lokal + remote — bevares indtil Ricko beslutter om den skal slettes |
| `gallery-upload-diagnose` (kun remote) | **IKKE merged** — bevares indtil afklaret |

Worktrees: kun `main` (Desktop). Den døde `wt-room-blocks`-registrering blev pruned
2026-09-07 — branchen `fix/preserve-room-blocks` og PR #2 er uberørte.
`fix/jimbaran-location-and-hero-logo` (+ `wt-jimbaran`), `feature/admin-trip-search`
(+ `wt-search`) og `fix/hotel-cards-natural-height` (+ `wt-cards`) blev alle slettet 2026-09-07
efter merge (verificeret ancestor af `origin/main`).

## Åbne tråde

1. Mille: opret Japan/Kenya/Mauritius-lignende manglende destinationer + billeder i production (ren drift, ingen kode)
2. **Hero-logo (palme/Q)** — **blokeret: logo-asset mangler i repoet.** Mille/Christian har bedt om
   palme-/Q-logo øverst på rejseplanerne, men der findes ingen `public/`-mappe, ingen billedfil i
   git-historikken og ingen inline SVG. Kan først bygges når Ricko lægger den godkendte fil ind
   (helst SVG i lys udgave — heroen har mørkt overlay). Ikke løst i PR #12; heroen viser fortsat
   ren tekst-wordmark. Se backlog nedenfor
3. Vision 2.0: scope KRÆVER RICKO — intet påbegyndt
4. Branch-oprydning — **fuldført 2026-08-26** (kun WIP/aktive branches består)

## Backlog (fra august-review)

- **Yderligere kommentarer fra PDF** — flere hotel-/programnoter der i dag ikke fanges struktureret,
  kunne løftes til kundevendt visning (kræver afklaring af hvilke felter).
- **Vandflyver-tag** — dedikeret markør/ikon for vandflyver-transfers og bagagebegrænsninger
  (i dag kun fri-tekst i noter).
- **Favicon / Q-logo** — kundevendt header er ren tekst-wordmark; intet Q/palme-brandmark eller favicon.
  Kræver eksplicit brandbeslutning (KRÆVER RICKO) — ikke en bug.
  **Blokeret 2026-09-07:** Mille/Christian har bedt om palme-/Q-logo øverst på rejseplanerne, men
  repoet indeholder intet logo-asset — ingen `public/`-mappe, ingen billedfil nogensinde committet
  (verificeret mod hele git-historikken), ingen inline SVG. Kan først bygges når Ricko lægger den
  godkendte SVG/PNG (lys udgave til mørkt hero-overlay) ind i repoet.
- **Supabase custom SMTP** — recovery-/system-mails rammer Supabase' delte mail-rate-limit;
  custom SMTP-domæne fjerner 429'erne (drift-opgave).
- **"Læs om rundrejsen"-tekstlabel** — evt. tydeligere toggle-label for rundrejse-/programafsnittet
  i rejseplanen (mindre UX-polish).
- **`parse_failures` oprydning** — pg_cron-job der sletter rækker > 30 dage (jf. `supabase/README.md`)
  er endnu ikke sat op.
- **Pæn fejlbesked ved ugyldig PDF** — for ugyldig/tom PDF returneres Anthropics rå 400-tekst til
  sælgeren (kun billing-fejl har særbesked). Overvej en generisk dansk besked.

## Seneste checks (2026-09-07, main `7e41305`)

typecheck ✅ · lint ✅ (0 fejl; 4 kendte img-warnings = PERF-3) · build ✅ ·
test ✅ (66 tests / 6 filer: format, hotel-alternatives, normalize-trip, destination-match,
location-label, trip-search). DB: 222 trips, 15 destinationer.
Production efter PR #14: deploy READY, `/admin` 200, kundeside 200, `/admin/api/trips` uden
login 401, Jimbaran/Kuta-fix fortsat intakt.
Søgefunktionens ni testcases (præcist/delvist/`#`-bookingnummer, kundenavn, destination, slug,
uden match, ryddet felt, ryddet felt + "Vis alle") kørt mod den ægte production-liste på 222
trips — read-only. **Klik-test i selve admin-UI'et udestår: den kræver login, som agenter ikke
har (jf. `docs/ACCESS_MATRIX.md`: auth-brugere kun m. Rickos OK).** Ricko/Randi bekræfter i UI.
PR #16 production-verificeret 2026-09-07 med Chromium mod de rigtige kundesider (read-only):
`align-items=start` aktiv, tom bund 0px på alle pakke-/badeferie-kort, rundrejsekortet viser
fortsat alle 7 sub-hoteller, mobil uændret, ingen vandret scroll.
Tidligere: PR #12 (Jimbaran/Kuta) verificeret 2026-09-07; PR #5 og #9 2026-08-26.

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

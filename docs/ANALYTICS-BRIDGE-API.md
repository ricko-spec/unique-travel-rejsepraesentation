# Analytics Bridge API

> [Issue #45](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/45),
> under [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)
> (Vision 3.0). Read-only, server-to-server eksport af online rejseplaner til
> Rickos Marketing Dashboard.

```
Online Rejseplan  --->  Analytics Bridge API  --->  Marketing Dashboard  <---  HubSpot
```

Dette repo er **source of truth for om og hvornår** en online rejseplan blev oprettet.
Marketing Dashboard kobler det med HubSpot for at analysere salgseffekt. Der er **ingen
HubSpot-afhængighed i dette repo**, og API'et konkluderer aldrig kausalitet/uplift selv —
det eksponerer kun fakta.

## Endpoint

```
GET /api/internal/analytics/travel-plans
```

Server-to-server only. Ingen CORS-headers sættes — almindelig browser-brug på tværs af
origins er derfor ikke muligt (og skal ikke gøres muligt). Ingen skrive-operationer.
`force-dynamic` + `Cache-Control: no-store` på alle svar.

## Auth

```
Authorization: Bearer <ANALYTICS_BRIDGE_API_KEY>
```

- Fail closed: manglende header, forkert nøgle, eller manglende
  `ANALYTICS_BRIDGE_API_KEY` på serveren giver alle `401 Unauthorized`.
- Nøglen sammenlignes med konstant-tid (`crypto.timingSafeEqual`), ikke `===`.
- Skemaet er case-sensitivt (`Bearer`, ikke `bearer`) — RFC 6750.
- **`ANALYTICS_BRIDGE_API_KEY` er ikke det samme som `BOOKING_MATCH_SECRET`** (se
  nedenfor) — to uafhængige secrets, to uafhængige formål. Roter dem uafhængigt af
  hinanden.

## Match-nøgle — `booking_match_key`

Bookingnummeret er kundens adgangskode til rejseplanen og returneres **aldrig** i
klartekst, hverken i output eller i logs. I stedet udstilles en deterministisk HMAC:

```
booking_match_key = HMAC-SHA256(BOOKING_MATCH_SECRET, normalized_booking_no)
```

**Normalisering** (skal reproduceres identisk i Marketing Dashboard for at få samme
match-key ud fra HubSpots bookingnummer):

```ts
function normalizeBookingNo(bookingNo: string): string {
  return bookingNo.trim();
}
```

Kun `trim()`. Ingen store/små bogstaver-normalisering, ingen locale-transformation —
bookingnumre i dette system er rene cifre-strenge (fx `"35930"`), så der er intet
"case" at folde, og enhver ekstra normalisering ville bare være en kilde til at de to
systemer regner forskelligt.

HMAC'en beregnes **on-the-fly** ved hvert kald — hverken bookingnummeret eller HMAC'en
persisteres nogen steder i dette repo.

**Reference-implementation** (Node.js — Marketing Dashboard kan bruge samme opskrift i
et andet sprog, blot algoritmen er identisk):

```ts
import { createHmac } from "node:crypto";

function computeBookingMatchKey(bookingNo: string, secret: string): string {
  const normalized = bookingNo.trim();
  return createHmac("sha256", secret).update(normalized, "utf8").digest("hex");
}
```

Output: 64 tegn, lowercase hex (standard SHA-256-digest-længde). Hex er valgt frem for
base64 for at undgå enhver tvetydighed mellem URL-safe/standard-varianter på tværs af de
to systemer.

## Response

```json
{
  "schema_version": 1,
  "data": [
    {
      "trip_id": "3f9c2e10-...-uuid",
      "booking_match_key": "5e884898da28...64 hex-tegn",
      "online_plan_created_at": "2026-08-01T12:00:00.000Z",
      "active": true,
      "destination": "Malaysia"
    }
  ],
  "pagination": {
    "next_cursor": "eyJzaW5jZSI6bnVsbCwiaWQiOiIzZjljMmUxMC0uLi4ifQ",
    "has_more": true
  }
}
```

### Felter pr. rejseplan

| Felt | Kilde | Betydning |
|---|---|---|
| `trip_id` | `trips.id` | Intern uuid — den stabile nøgle for rejseplanen |
| `booking_match_key` | HMAC af `trips.booking_no` | Se ovenfor. Aldrig bookingnummeret selv |
| `online_plan_created_at` | `trips.created_at` | Sat én gang ved første oprettelse, ændres IKKE ved re-upload (feltet er ikke med i upsert-payloaden i `POST /admin/api/trips`, så `ON CONFLICT` rører det aldrig) |
| `active` | `trips.active` | Soft-delete-flag. Rejseplaner returneres uanset værdi — se "Historisk værdi" nedenfor |
| `destination` | `trips.destination` | Stabilt, ikke-følsomt analysefelt (landenavn, ikke kundedata) |

### Bevidst udeladt: `online_plan_updated_at`

Issue #45 beder om feltet "hvis det findes og er semantisk pålideligt". Det er **ikke**
inkluderet i denne version: `trips.updated_at` opdateres af en generisk Postgres-trigger
(`trips_set_updated_at`) ved **enhver** ændring af rækken — re-upload af en ny PDF, en
sælgers intro-redigering, eller blot at slå `active` til/fra i admin-dashboardet. Feltet
fortæller "rækken blev rørt", ikke "rejseplanen blev genudgivet til kunden", og ville
derfor kunne mistolkes som et forretningssignal det ikke er. `updated_at` bruges stadig
**internt** i API'et som del af sync-mekanikken (se nedenfor) — det er en fundamentalt
svagere kontrakt ("noget ændrede sig, hent igen") end at udstille den som analysefelt.

### Bevidst udeladt (Issue #45's eksplicitte liste)

Output indeholder **aldrig**: bookingnummer i klartekst, `slug`/kundelink, kundenavn,
email, telefon, rejseplanens fritekst/data (`trips.data`, `raw_pdf_text`),
access-cookie/session-id, eller andre kundedata. `toTravelPlanRecord()`
(`src/lib/analytics-bridge.ts`) bygger altid et helt nyt objekt fra et snævert sæt
navngivne felter — den sprednes aldrig `...row`, så selv hvis en fremtidig ændring
kommer til at SELECT'e flere kolonner, kan de ikke lække med ud. Se test-casen "lækker
IKKE ekstra/følsomme felter" i `src/lib/analytics-bridge.test.ts`.

## Paginering og incremental sync

To adskilte spørgsmål, løst hver for sig:

### 1. Hvilket tidsvindue henter jeg?

Query-param `since` (valgfri, ISO-8601, fx `2026-09-01T00:00:00.000Z`). Filtrerer på
`trips.updated_at >= since`. Uden `since`: fuld eksport af alle rejseplaner nogensinde.

**Anbefalet mønster for Marketing Dashboard** (klassisk "checkpoint på eget ur, ikke på
kildedata" for idempotent incremental sync):

1. Læg `runStartedAt = new Date()` **før** første kald.
2. Kald API'et med `since = <sidst gemte watermark>` (eller udelad for første, fulde
   kørsel).
3. Paginér til `has_more: false` (se nedenfor).
4. **Kun hvis hele crawlet lykkedes**, gem `runStartedAt` som ny watermark.

`since` filtreres med `>=` (ikke `>`) — en række der ligger præcis på grænsen leveres
hellere én gang for meget (idempotent upsert på `trip_id` i Marketing Dashboard) end at
risikere at den aldrig leveres.

### 2. Hvordan bladrer jeg gennem ét vindues rækker?

Ren keyset-paginering på `id` (aldrig `OFFSET`) — `cursor`-parameteren fra et svars
`pagination.next_cursor` sendes uændret med i næste kald:

```
GET /api/internal/analytics/travel-plans?since=2026-09-01T00:00:00.000Z
GET /api/internal/analytics/travel-plans?cursor=eyJzaW5jZSI6...
```

`cursor` er **selv-indeholdende** (bærer både `since`-vinduet og positionen) — når du
paginerer, skal du kun sende `cursor`, ikke `since` igen (er begge sendt, vinder
`cursor`). Bliv ved med at følge `next_cursor` indtil `has_more: false`.

**Hvorfor id og ikke `updated_at` som pagineringsnøgle:** `id` er en uuid-primærnøgle og
derfor 100% kollisionsfri. At bruge et tidsstempel som pagineringsnøgle (selv med
mikrosekund-præcision) åbner i teorien for at to rækker deler præcis samme værdi ved en
sidegrænse — samme klasse fejl som blev fundet og rettet i Issue #38/PR #39's
upload-tracking (`docs/SYSTEM-ARKITEKTUR.md` § upload_events). Ved at lade `since` alene
afgøre *hvilket* datasæt der høres til, og `id` alene afgøre *rækkefølgen* inden for det
datasæt, undgås tuple-sammenligning helt, og problemet opstår aldrig.

`limit` (valgfri): sidestørrelse, default 200, klampet til max 500. Ugyldig/manglende
værdi falder stille tilbage til default (i modsætning til en ugyldig `cursor`, som giver
`400` — en forkert `limit` kan aldrig ændre forespørgslens *betydning*, kun sidestørrelsen).

**Kendt, dokumenteret grænse:** endpointet henter internt `limit + 1` rækker for at kunne
afgøre `has_more` uden en ekstra tælle-forespørgsel. `MAX_PAGE_SIZE` (500) er bevidst
holdt et godt stykke under PostgREST' standard max-rows-grænse (1000, verificeret for
netop dette Supabase-projekt under Issue #38-arbejdet). Bliver `db-max-rows` nogensinde
konfigureret lavere end 501 for dette projekt, kan `has_more` blive stille forkert — det
samme ville dog allerede gælde flere eksisterende endpoints i repoet (fx
`GET /admin/api/trips`, som ikke er pagineret overhovedet). Verificér antagelsen i
production hvis sidestørrelsen nogensinde hæves væsentligt.

## Historisk værdi

API'et eksporterer **alle** eksisterende rejseplaner (aktive og deaktiverede) — der
kræves ingen backfill af nye kundedata. En deaktiveret rejseplan repræsenterer stadig
det historiske faktum "der blev oprettet en online rejseplan for denne booking", så den
udelades ikke — `active` er med i output netop så Marketing Dashboard selv kan vælge
hvordan feltet skal indgå i en analyse.

## Fejl

| Status | Betydning |
|---|---|
| `400` | Ugyldig `cursor` (korrupt/manipuleret) eller ugyldig `since` (ikke ISO-8601) |
| `401` | Manglende/forkert `Authorization`-header, eller `ANALYTICS_BRIDGE_API_KEY` ikke konfigureret server-side |
| `500` | `BOOKING_MATCH_SECRET` ikke konfigureret, eller intern fejl (DB-fejl, uventet exception) |

Alle fejlsvar er `{ "error": "<generisk besked>" }` — aldrig Postgres/Supabase-fejltekst,
stack traces eller andre interne detaljer. Detaljer logges server-side, sanitiseret: kun
fejlkode/fejltekst fra Postgres/PostgREST, aldrig rå trip-data.

## Env-vars (nye i denne PR)

| Variabel | Formål | Deles med Marketing Dashboard? |
|---|---|---|
| `ANALYTICS_BRIDGE_API_KEY` | Server-to-server auth for selve endpointet | Ja — Marketing Dashboard skal sende den som Bearer-token |
| `BOOKING_MATCH_SECRET` | HMAC-nøgle til `booking_match_key` | Ja — Marketing Dashboard skal bruge SAMME secret til at genberegne match-key fra HubSpots bookingnummer |

Begge er server-side-only env-vars (ligesom `SUPABASE_SERVICE_ROLE_KEY`) — aldrig i
klientkode, aldrig i repoet, aldrig i logs. Sæt dem i Vercel → Project Settings →
Environment Variables for production (og evt. preview, hvis Marketing Dashboard-teamet
skal teste mod preview — husk at preview deler production-DB'en, se
`docs/ACCESS_MATRIX.md`).

## Sådan konsumerer Marketing Dashboard API'et

1. Kald `GET /api/internal/analytics/travel-plans` med `Authorization: Bearer
   <ANALYTICS_BRIDGE_API_KEY>`.
2. Første, fulde synkronisering: udelad `since`. Følg `next_cursor` indtil
   `has_more: false`.
3. Gem `runStartedAt` (jf. §"Paginering og incremental sync") som ny watermark.
4. Fremtidige kørsler: send `since = <watermark>`, følg cursor igen.
5. For hver returneret række: beregn `computeBookingMatchKey(hubspotBookingNo,
   BOOKING_MATCH_SECRET)` og match mod `booking_match_key`.
6. Behandl re-levering af en allerede set `trip_id` som en idempotent upsert, ikke en
   fejl — `since` bruger bevidst `>=`.
7. Byg IKKE en standard-plan-konverteringsrate uden en denominator for ikke-solgte
   tilbud — det kræver data Marketing Dashboard/HubSpot ejer, ikke dette API. Se Issue
   #45 § "Kritisk analyse-regel".

## Fase 2+ (senere, versionsstyret — IKKE del af denne PR)

Når Vision 3.0 fase 1B (session-tracking) er implementeret, kan endpointet udvides med
fx `first_opened_at`, `last_opened_at`, `session_count`. Det sker med en ny
`schema_version` og bagudkompatibelt (nye felter tilføjes, eksisterende ændres ikke) —
ikke ved at bryde denne kontrakt.

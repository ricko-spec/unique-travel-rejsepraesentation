# Vision 3.0 — eventmodel (Fase 1: fundament + åbninger)

> Design til [Issue #43](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/43),
> under [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41).
> **Docs-only.** Ingen migration, ingen kode, intet endpoint er bygget i denne omgang.
> Skrevet 2026-09-16 mod main efter PR #42.
>
> Dokumentet er beslutningsgrundlaget: det fastlægger sessiondefinition, datamodel,
> privacy-grænser og fejlkontrakt, så Fase 1B kan implementeres uden nye åbne spørgsmål.

## 1. Hvad Fase 1 skal kunne svare på

Pr. rejseplan, til sælgeren:

| Signal | Kilde |
|---|---|
| Ikke åbnet endnu | ingen `customer_sessions`-rækker for trippen |
| Første reelle kundeåbning | `min(started_at)` |
| Seneste reelle kundeåbning | `max(last_seen_at)` |
| Antal besøg | `count(*)` — én række = ét besøg |

Intet andet. Sektionsengagement, kontaktklik, lead score og salgsoversigt er Fase 2-4
(se Issue #41) og er bevidst ikke designet ind her ud over at skemaet skal kunne vokse.

## 2. Sessiondefinition (mekanisk)

**Ét besøg = ét session-id = én række i `customer_sessions`.**

Session-id'et lever i en cookie:

| Egenskab | Værdi | Hvorfor |
|---|---|---|
| Navn | `trip_session_<slug>` | Ét id pr. rejseplan, aldrig ét på tværs |
| Værdi | `crypto.randomUUID()`, server-genereret | Opaque, tilfældig, ikke afledt af noget om brugeren |
| `httpOnly` | true | Ingen JS skal læse den; ingen client-tracking-flade |
| `secure` | true | Samme krav som `trip_access_<slug>` |
| `sameSite` | `lax` | Overlever unlock-redirectet (POST → 303 → GET) |
| `path` | `/<slug>` | **Gør cross-trip-identitet teknisk umulig** |
| `maxAge` | 1800 sek. (30 min.), **sat på ny ved hvert besøg** | Rullende inaktivitetsvindue |

### Hvorfor rullende inaktivitetsvindue og ikke fast levetid

En fast levetid (fx "session = 24 timer") splitter en kunde der læser rejseplanen igennem
hen over et døgn i to besøg, og limer to reelt adskilte åbninger sammen hvis de falder
tæt på hinanden. Et rullende vindue matcher det sælgeren faktisk spørger om — *en
brugssituation* — og er samtidig branchestandard (GA's session-timeout er 30 min.).

Mekanikken er billig: fordi `maxAge` sættes forfra ved hvert besøg, håndterer **browseren
selv** sessiongrænsen. Serveren behøver ikke sammenligne tidsstempler for at afgøre om et
besøg er nyt — cookien er der (samme session) eller den er væk (nyt id, ny række). Ingen
tilstand, ingen tidszoneproblemer, ingen kant-tilfælde.

### Path-scopingen er selve privacy-garantien

`path=/<slug>` betyder at browseren aldrig sender trip A's session-cookie til trip B.
To rejseplaner til samme familie kan derfor ikke kobles sammen — ikke fordi vi lader være,
men fordi datagrundlaget ikke findes. Det er gratis og det er den samme mekanik som
`trip_access_<slug>` allerede bruger.

### Konsekvenser vi accepterer bevidst

- **Samme kunde på mobil + desktop = to besøg.** Korrekt ifølge Issue #43. Vi forsøger
  ikke at koble dem. Ingen fingerprinting.
- **Rydder kunden cookies, tæller næste åbning som et nyt besøg.** Accepteret; alternativet
  kræver identifikation af personen.
- **Ingen absolut sessionslængde.** En kunde der rammer siden hvert 25. minut i tre dage
  tæller som ét besøg. Urealistisk for en rejseplan, og fejlen går mod **under**tælling —
  den sikre retning for et tal vi viser sælgere.
- **Klienten kunne teoretisk sende et nyt tilfældigt id pr. request og oppuste tælleren.**
  Det kræver kendskab til `booking_no` (se §3), rammer kun én rejseplan, og giver ingen
  adgang til noget. Accepteret i Fase 1; ingen mitigering bygges.

## 3. Hvad er en "reel kundeåbning"?

Fem betingelser. **Alle** skal være opfyldt, ellers skrives der intet — og der mintes
ikke engang en session-cookie.

| # | Betingelse | Hvor | Hvorfor |
|---|---|---|---|
| 1 | `trip_access_<slug>`-cookien findes | middleware | Uden unlock er der ingen kunde |
| 2 | Værdien matcher `trips.booking_no` | `page.tsx` (eksisterende gren) | Den autoritative adgangskontrol |
| 3 | Ingen Supabase-auth-cookie i browseren | middleware | Sælger der tester kundelinket |
| 4 | User-Agent er ikke bot-klassificeret | middleware | Link-previewers, scannere |
| 5 | `VERCEL_ENV === "production"` **og** host er det kanoniske domæne | middleware | Lokal dev, Vercel preview, branch-alias |

### Betingelse 1+2 — unlock-cookien

Bot- og støjfiltrering får uforholdsmæssigt meget opmærksomhed i analytics-projekter.
Her er det værd at sige højt: **adgangskravet gør det meste af arbejdet.** For at få en
`trip_access_<slug>`-cookie skal man POST'e det korrekte `booking_no` gennem `unlockTrip`
(rate-limitet til 10 forsøg/15 min. pr. IP+slug). Ingen crawler, ingen link-preview og
ingen tilfældig scanner kommer forbi det. Filter 3-5 er ekstra lag, ikke hovedforsvaret.

Middleware kan kun se at cookien *findes* — den kan ikke verificere værdien uden et
DB-opslag, og det skal middleware ikke lave. En forfalsket cookie får derfor mintet en
session-cookie, men `page.tsx` renderer `AccessGate` og skriver aldrig til DB'en. Ingen
forurening.

### Betingelse 3 — admin/sælger

Sælgeren er logget ind i `/admin` i samme browser når hun tester kundelinket. Supabase'
auth-cookie (`sb-<projekt-ref>-auth-token`, evt. chunket `.0`/`.1`) har `path=/` og sendes
derfor også til kundesiden. Vi tjekker **kun at cookien findes** — vi validerer ikke
sessionen.

Det er et bevidst valg: `getSessionUser()` laver et netværkskald til Supabase Auth, og det
vil vi ikke lægge på hver eneste kundesidevisning. Til formålet "er det her sandsynligvis
en sælger?" er cookiens tilstedeværelse nok, og en falsk positiv koster kun at ét besøg
ikke tælles — igen den sikre retning.

**Dokumenteret begrænsning:** dette fanger **ikke** en sælger der er logget ud, bruger
inkognito, en anden browser eller sin private telefon. Det er accepteret. Alternativet
(identificere personer bag kundesiden) er i direkte modstrid med privacy-princippet.
Konsekvensen er at et lille antal sælger-test kan optræde som kundeåbninger; sælgerne skal
vide det, og det skal stå ved tallet i Fase 4's UI.

### Betingelse 4 — bots

Ren regex-klassifikation af `User-Agent`-headeren i middleware, **transient**: strengen
læses, matches, og forsvinder med requesten. Den logges ikke, hashes ikke og gemmes ikke —
heller ikke som kategori. Der er ingen dokumenteret nødvendighed for at gemme den i Fase 1
(jf. Issue #43 §5), og "mobil vs. desktop" er ikke et Fase 1-signal.

Tom UA behandles som bot. En rigtig browser sender altid en UA.

### Betingelse 5 — miljø

```ts
process.env.VERCEL_ENV === "production" && isProductionHost(host)
```

To lag, fordi preview deler production-DB og derfor ikke må beskyttes af en antagelse:

- `VERCEL_ENV` er `"production"` / `"preview"` / `"development"` / undefined (lokalt).
  Det er den eneste dokumenterede, aktive måde at kende miljøet på når databasen er den
  samme. Dette er svaret på Issue #43's krav om ikke at stole på "det er bare preview":
  **det er et eksplicit kodetjek, ikke en implicit antagelse.**
- Host-tjekket lukker det sidste hul: production-deployet er også nåbart på
  branch-aliaset `...-git-main-unique-travel.vercel.app`, hvor `VERCEL_ENV` *er*
  `"production"`. Kun `rejseplaner.uniquetravel.dk` tæller.

Begge er rene funktioner med miljø/host som argumenter — derfor unit-testbare uden at
sætte `process.env` i testen.

## 4. Server vs. browser

**Alt er server-side. Der køres ingen analytics-JavaScript i kundens browser i Fase 1.**

| Signal | Autoritet | Begrundelse |
|---|---|---|
| Blev siden åbnet? | Server (request'en selv) | Browseren ved intet serveren ikke ved |
| Hvornår? | Server (`now()` i Postgres) | Én urkilde, ingen klient-tidszoner |
| Hvilken rejseplan? | Server (`row.id` fra det opslag der allerede sker) | |
| Session-identitet | Server (mintet i middleware) | Klienten opbevarer, serveren udsteder |

En klientside-beacon (`fetch` til et tracking-endpoint) blev overvejet og **forkastet**:
den kræver et nyt offentligt endpoint, den koster en ekstra netværksrequest på kundesiden,
den blokeres af adblockers, og den gør analytics til noget der kan gå i stykker i
kundens browser. Ingen af Fase 1's fire signaler kræver den. Fase 2 (sektionsengagement)
*kan* kræve browser-input — den beslutning tages der, ikke her.

### Hvorfor cookien mintes i middleware og ikke i `page.tsx`

Det er den centrale arkitektoniske tvang i dette design:

- `page.tsx` er en Server Component og **kan ikke sætte cookies**.
- `unlockTrip` (Server Action) kan — men kører **kun i selve unlock-øjeblikket**. Et
  genbesøg dag 3 med den eksisterende 30-dages access-cookie rammer `page.tsx` direkte,
  og `unlockTrip` køres aldrig igen. Al sessionslogik placeret dér ville kun se den
  allerførste åbning.
- **Middleware er det eneste sted der kan sætte en cookie ved ethvert besøg.**

Middleware i dag: `matcher: ["/admin", "/admin/:path*"]` — kundesider rammes ikke.
Fase 1B skal udvide matcheren. Se §8 for det præcise mønster og risikoen.

### Arbejdsdeling

| Middleware (edge) | `page.tsx` (node) |
|---|---|
| Læser cookies + UA + env + host | Har allerede `row.id` og den verificerede adgangskontrol |
| Kører filter 1, 3, 4, 5 (rene funktioner) | Kører filter 2 (eksisterende kode-gren) |
| Minter/genopfrisker session-cookien | Laver det ene DB-kald |
| **Ingen DB, ingen secrets, intet netværk** | Service-role som resten af systemet |

Middleware holdes fri for service-role-nøglen med vilje: den kører på alle matchede
requests, inkl. RSC-prefetches, og nøglen skal ikke udvides til edge-runtimen for
analytics' skyld.

**Invariant:** ingen session-cookie ⇒ intet DB-skriv. `page.tsx` skriver kun når der
ligger en gyldig UUID i `trip_session_<slug>`.

## 5. Flow — unlock → visning → session

```
A. Første besøg, ukendt kunde
   GET /ab12cd34ef56
     middleware : ingen trip_access-cookie          -> mint intet, videre
     page.tsx   : accessCookie != booking_no        -> <AccessGate/>, intet skriv
   POST unlockTrip (Server Action)
     rate-limit ok, kode ok
     -> audit_log: unlock_success        (uændret, eksisterende adfærd)
     -> sæt trip_access_<slug> (30 dage, httpOnly, path=/<slug>)
     -> redirect /<slug>
   GET /ab12cd34ef56   (redirectet)
     middleware : trip_access findes, ingen sb-cookie, ikke bot, prod+kanonisk host
                  ingen trip_session_<slug>
                  -> id = crypto.randomUUID()
                  -> request.cookies.set(...)   <-- så page.tsx ser den NU
                  -> response.cookies.set(..., maxAge 1800)
     page.tsx   : accessCookie == booking_no
                  -> record_customer_session(id, row.id)   [best-effort, 1 s loft]
                  -> INSERT: ny række, started_at = last_seen_at = now(), view_count = 1
                  -> render rejseplanen
   Resultat: 1 række. "Første åbning" = nu.

B. Refresh x20 inden for 30 min.
     middleware : trip_session findes og er gyldig uuid -> GENBRUG id, forny maxAge
     page.tsx   : samme id -> ON CONFLICT -> last_seen_at = now(), view_count += 1
   Resultat: stadig 1 række. Besøgstallet rører sig ikke.

C. Ny fane / nyt vindue, samme browser, inden for vinduet
     Samme cookie-jar -> samme id -> som B. Stadig 1 besøg.

D. Genåbning næste dag
     Cookien er udløbet (>30 min. inaktivitet) -> nyt id -> ny række.
   Resultat: 2 rækker = 2 besøg. Seneste åbning opdateret.

E. Nyt device
     Ingen trip_access-cookie dér -> AccessGate -> unlock -> som A.
   Resultat: endnu et besøg. Bevidst; vi matcher ikke devices.

F. Sælger der tester (logget ind i /admin i samme browser)
     middleware : sb-...-auth-token findes -> mint intet
     page.tsx   : ingen session-cookie -> intet skriv. Siden renderes normalt.

G. Bot / link-preview
     Ingen trip_access-cookie (kender ikke booking_no) -> stopper allerede i A's første
     trin. UA-filteret er andet lag.

H. Localhost / Vercel preview / branch-alias
     VERCEL_ENV != "production" eller host != rejseplaner.uniquetravel.dk
     -> mint intet -> intet skriv. Samme DB, men ingen forurening.
```

## 6. Datamodel (SKITSE — ikke en migration)

Al SQL herunder er illustrativ. Den rigtige fil hedder `supabase/010_customer_sessions.sql`
og skrives i Fase 1B.

### Tabel

```sql
create table if not exists public.customer_sessions (
  id           uuid primary key,
  trip_id      uuid not null references public.trips(id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  view_count   integer not null default 1
);

comment on table public.customer_sessions is
  'Kundebesøg pr. rejseplan (Vision 3.0 fase 1). Én række = ét besøg. Ingen persondata: ingen IP, ingen user-agent, intet bookingnummer, intet navn. Service-role-only.';
comment on column public.customer_sessions.id is
  'Tilfældig uuid, mintet server-side i middleware og opbevaret i cookien trip_session_<slug> (httpOnly, path=/<slug>, 30 min. rullende). Opaque — ikke afledt af noget om brugeren.';
comment on column public.customer_sessions.trip_id is
  'ON DELETE CASCADE: engagementdata om en slettet rejseplan har ingen værdi og skal ikke overleve den.';
comment on column public.customer_sessions.view_count is
  'Sidevisninger inden for samme session. Sekundært signal — besøgstallet er count(*), ikke summen af dette.';
```

Fem kolonner. Det er hele datasættet.

#### `id` = cookieværdien — er det trygt?

`upload_events.id` er `gen_random_uuid()` server-side og krydser aldrig klientgrænsen.
Her er det omvendt: primærnøglen *er* den værdi klienten sender tilbage. Det er trygt her
og ikke i `upload_events`, fordi:

- Værdien er **opaque og tilfældig** — ikke afledt af device, IP, bookingnummer eller
  noget andet om personen. Den er ikke et fingerprint, den er et løbenummer.
- Der er **ingen rettigheder** knyttet til den. At kende et session-id giver adgang til
  ingenting. Adgangskontrollen er og bliver `trip_access_<slug>` + `booking_no`.
- Den er **kortlivet** (30 min.) og **path-scopet** til én rejseplan.
- Det værste en ondsindet klient kan gøre er at oppuste sit eget besøgstal på én
  rejseplan han allerede har adgang til (§2).

`page.tsx` skal validere formatet før brug (`isValidSessionId`) — en ugyldig værdi
kasseres, og der skrives ikke. Det er en ren funktion og unit-testes.

#### Hvorfor `on delete cascade` og ikke `set null` som `upload_events`

De to tabeller handler om forskellige ting. `upload_events` er en **adoptionslog om
sælgeren**: "Marie uploaderede 14 PDF'er i august" er sandt uanset om en af de trips
senere slettes — derfor `set null`, derfor `actor_name`-snapshot. `customer_sessions`
handler om **rejseplanen**; en session uden trip er analytisk værdiløs og alene en
privacy-omkostning. Cascade gør desuden `not null` muligt, og giver en ren
sletningshistorie: slettes trippen, forsvinder engagementdata med den.

Bemærk at trips i praksis **soft-deletes** (`active = false`). En deaktiveret rejseplan
beholder sine sessioner — korrekt, rækken findes stadig.

#### Indexes

```sql
create index if not exists customer_sessions_trip_started_idx
  on public.customer_sessions (trip_id, started_at);
create index if not exists customer_sessions_trip_last_seen_idx
  on public.customer_sessions (trip_id, last_seen_at desc);
create index if not exists customer_sessions_last_seen_idx
  on public.customer_sessions (last_seen_at);
```

De to første dækker `count(*)`, `min(started_at)` og `max(last_seen_at)` pr. trip. Den
tredje dækker retention-slettningen. Tabellen er lille (237 aktive rejser × få besøg), så
tre indexes er billige.

### Skriv-RPC

```sql
create or replace function public.record_customer_session(
  p_session_id uuid,
  p_trip_id    uuid
)
returns void
language sql
volatile
security definer
set search_path = public, pg_catalog
as $function$
  insert into public.customer_sessions as cs (id, trip_id)
  values (p_session_id, p_trip_id)
  on conflict (id) do update
    set last_seen_at = now(),
        view_count   = cs.view_count + 1
    where cs.trip_id = excluded.trip_id;
$function$;

revoke execute on function public.record_customer_session(uuid, uuid) from public;
revoke execute on function public.record_customer_session(uuid, uuid) from anon;
revoke execute on function public.record_customer_session(uuid, uuid) from authenticated;
grant  execute on function public.record_customer_session(uuid, uuid) to service_role;
```

Hvorfor RPC og ikke `supabase.from(...).upsert(...)`: klientbiblioteket kan ikke udtrykke
hverken `view_count + 1` eller `where`-klausulen på konfliktgrenen. Præcedensen findes
allerede i repoet — `increment_rate_limit` (migration 005) er nøjagtig samme mønster:
atomar UPSERT som RPC frem for læs-ret-skriv i Node.

`where cs.trip_id = excluded.trip_id` er forsvar i dybden: et session-id der præsenteres
for en *anden* rejseplan kan ikke overskrive den eksisterende række. Konfliktgrenen bliver
en tavs no-op — ingen fejl, ingen forurening. Cookiens path-scoping burde gøre det
umuligt, men et krafteret request skal ikke kunne flytte en session mellem rejseplaner.

### Læse-RPC (aggregering live)

```sql
create or replace function public.trip_session_summary(p_trip_ids uuid[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  select coalesce(jsonb_object_agg(trip_id, jsonb_build_object(
           'sessionCount',  session_count,
           'firstOpenedAt', first_opened_at,
           'lastSeenAt',    last_seen,
           'viewCount',     views
         )), '{}'::jsonb)
  from (
    select trip_id,
           count(*)            as session_count,
           min(started_at)     as first_opened_at,
           max(last_seen_at)   as last_seen,
           sum(view_count)     as views
    from public.customer_sessions
    where p_trip_ids is null or trip_id = any(p_trip_ids)
    group by trip_id
  ) s;
$function$;

revoke execute on function public.trip_session_summary(uuid[]) from public;
revoke execute on function public.trip_session_summary(uuid[]) from anon;
revoke execute on function public.trip_session_summary(uuid[]) from authenticated;
grant  execute on function public.trip_session_summary(uuid[]) to service_role;
```

**Ingen lagrede tællere.** Samme lære som PR #39: aggregér i Postgres, hent aldrig rå
rækker til Node for at tælle dem. Ét SQL-statement = ét READ COMMITTED-snapshot, så alle
fire tal for en rejseplan er indbyrdes konsistente, og resultatet (én nøgle pr. trip med
mindst ét besøg) kan aldrig ramme PostgREST' max-rows-grænse.

**Semantikken er vigtig:** en rejseplan der mangler i resultatet har ingen besøg. Det er
"ikke åbnet endnu" — eksplicit fravær, ingen null-jonglering i UI-laget.

### Aggregater: live eller gemt?

Live i Fase 1. Datamængden er triviel og et gemt aggregat ville være en anden kilde til
sandhed der kan komme ud af trit. Et per-trip-aggregat bliver først relevant hvis
retention skal være kortere end den periode sælgerne vil kigge tilbage over — se §9.

### `customer_events` — skitse til Fase 2-3, IKKE Fase 1B-scope

Kun her for at vise at skemaet kan vokse konsistent. **Bygges ikke nu.**

```sql
-- FASE 2-3. Ikke en del af Fase 1B. Kun illustrativ.
create table if not exists public.customer_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.customer_sessions(id) on delete cascade,
  trip_id     uuid not null references public.trips(id) on delete cascade,
  event_type  text not null,
  occurred_at timestamptz not null default now(),
  constraint customer_events_type_check check (event_type in (
    'section_intro','section_rejseplan','section_billeder',
    'section_hoteller','section_pris','section_kontakt',
    'contact_email_click','contact_phone_click'
  )),
  constraint customer_events_once_per_session unique (session_id, event_type)
);
```

To ting er allerede afklaret af Fase 1-designet: `section_*`-værdierne er de stabile
sektions-id'er fra Issue #40's progress-nav (`src/lib/progress-nav.ts`), og
`unique (session_id, event_type)` håndhæver Issue #41's krav om højst ét event pr.
sektion pr. session i **databasen** frem for i klientkode — ingen scroll-spam mulig,
uanset hvad browseren sender. `customer_sessions` er forudsætningen for begge dele; det
er derfor Fase 1 kommer først.

## 7. Privacy og sikkerhed

### Gemmes ALDRIG

| Data | Hvorfor ikke |
|---|---|
| `booking_no` i klartekst | Det er kundens adgangskode. Eksplicit krav i #41/#43 |
| `booking_no` som hash | Unødvendigt — `trip_id` er en bedre nøgle og allerede intern |
| `slug` | Samme: `trip_id` dækker behovet |
| Kundens navn, email, telefon | Ikke nødvendigt for nogen af de fire signaler |
| IP-adresse (også hashet/trunkeret) | Ikke nødvendig. Bot-filtrering sker på UA, transient |
| Rå User-Agent | Intet dokumenteret formål i Fase 1. Læses, matches, kasseres |
| UA-kategori (mobil/desktop) | Ikke et Fase 1-signal. Tages op i Fase 4 hvis nogen faktisk spørger |
| Referrer, geo, sprog, skærmstørrelse, tidszone | Fingerprinting-materiale |
| Enhver kobling mellem to rejseplaner | Umuligt via cookie-path-scoping |
| Supabase-bruger-id på en kundesession | Kunder har ingen konto, og sælgere tælles ikke |

### Gemmes

Tilfældig uuid · `trip_id` · to tidsstempler · ét heltal.

Rækken er kun personhenførbar via `trips`, som sælgeren i forvejen har lovligt. Analytics
tilføjer altså ingen ny kategori af persondata — kun "dette tilbud blev åbnet på disse
tidspunkter". Formålsbegrænset (dokumentere kundens interaktion med sit eget tilbud),
dataminimeret og retention-begrænset (§9). Sletning følger rejseplanen automatisk via
`on delete cascade`.

### Sikkerhedsgrænser

- Tabel og begge funktioner er **service-role-only**, samme mønster som `audit_log`,
  `rate_limits`, `parse_failures`, `upload_events`. Ingen anon-/authenticated-policies.
- RLS slået til med den etablerede policy:

```sql
alter table public.customer_sessions enable row level security;
drop policy if exists "service_role full access customer_sessions" on public.customer_sessions;
create policy "service_role full access customer_sessions"
  on public.customer_sessions for all
  to service_role
  using (true)
  with check (true);
```

- Analytics må ikke omgå adgangskontrol: skrivningen ligger **efter** access-gaten og kan
  kun nås af en request der allerede har bevist kendskab til `booking_no`.
- Ingen læsning eksponeres kundevendt. `trip_session_summary` kaldes kun fra
  `/admin`-siden af systemet (Fase 1C/4), bag den eksisterende auth-gate.
- Service-role-nøglen forbliver i `src/lib/supabase/server.ts` og kommer ikke til edge.
- `Set-Cookie` på hvert kundesidesvar gør svaret ucachebart på CDN-niveau. Uden betydning:
  siden er allerede `force-dynamic` + `revalidate = 0`.

### Åbent juridisk spørgsmål — KRÆVER RICKO

Er en måle-cookie omfattet af samtykkekravet i ePrivacy art. 5(3)? Undtagelsen gælder
"strengt nødvendige" cookies, og en besøgstæller er det ikke i snæver forstand.

Argumenterne for lav risiko: siden er privat og adgangsbeskyttet, målingen er
førstepartsrent, deles med ingen, profilerer ikke og kan ikke følge personen på tværs af
rejseplaner eller websites. Det er ikke marketing-tracking.

Muligheder: (a) fortsætte uden banner på det grundlag, (b) tilføje én linje på
`AccessGate` om at åbninger registreres, (c) droppe cookien og i stedet tælle grovere
server-side. **Anbefaling: (b)** — den koster næsten intet, er ærlig, og passer til
brandets tone. Men det er Rickos beslutning, ikke en teknisk detalje, og den skal tages
før Fase 1B deployes.

## 8. Admin, preview og bots — mekanikken

Hele gaten samles i én ren funktion så den kan unit-testes uden browser, DB eller Vercel,
præcis som `visibleNavSections`/`isScrolledToBottom` i `src/lib/progress-nav.ts`:

```ts
// src/lib/customer-session.ts (FASE 1B — skitse)
export type TrackDecisionInput = {
  vercelEnv: string | undefined;   // process.env.VERCEL_ENV
  host: string | null;             // request.headers.get("host")
  userAgent: string | null;
  hasAccessCookie: boolean;        // trip_access_<slug>
  cookieNames: string[];           // til admin-detektion
};

export function shouldTrackCustomerView(input: TrackDecisionInput): boolean;
export function isValidSessionId(value: string | undefined): boolean;
export function isBotUserAgent(ua: string | null): boolean;
export function hasAdminAuthCookie(cookieNames: string[]): boolean;
export function isProductionHost(host: string | null): boolean;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 1800;
export function sessionCookieName(slug: string): string;
```

### Middleware-matcheren

Kundeslugs er `lower(encode(gen_random_bytes(6),'hex'))` = præcis 12 hextegn (migration
001). Matcheren kan derfor være kirurgisk præcis frem for en bred negativ lookahead:

```ts
export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/:bookingId([0-9a-f]{12})",   // NY — kun kundesider
  ],
};
```

Det rammer hverken `/admin`, `/api`, `/_next`, statiske filer eller forsiden. Selve
middleware-kroppen skal forgrenes på path: auth-refresh **kun** for `/admin*` (uændret
adfærd), cookie-mint **kun** for kundeslugs.

**Verificér før implementering** (Fase 1B, ét SQL-opslag):

```sql
select count(*) from public.trips where slug !~ '^[0-9a-f]{12}$';
```

Slug-override-feltet i admin har aldrig virket (serveren ignorerer det — se
`docs/ROADMAP.md`), så svaret forventes at være 0. Er det ikke 0, falder vi tilbage til
`"/((?!admin|api|_next|favicon.ico|.*\\.).*)"` og dokumenterer det.

Matcher-ændringen er **den mest risikable del af Fase 1B**: den lægger en
middleware-invokation på al kundetrafik. Den skal reviewes for sig.

### Hvad strategien ikke kan

- Sælger i inkognito/anden browser/privat telefon tælles som kunde (§3).
- En bot der på en eller anden måde har fået en gyldig access-cookie og sender en normal
  browser-UA tælles med. Praktisk talt kun kundens eget sikkerhedssoftware.
- Vi opdager ikke om to personer deler ét device.

Alle tre fejl går mod støj i **plus**, aldrig mod at miste en ægte kundeåbning — og de er
små nok til at tallet stadig kan bruges operationelt, forudsat sælgerne kender
forbeholdet.

## 9. Konsistens, concurrency og idempotens

**Hele skrivningen er ét statement.** Der findes intet læs-så-skriv i applikationskoden,
og derfor intet vindue at tabe en opdatering i.

- **To samtidige requests med samme session-id:** begge kører `insert ... on conflict`.
  Postgres serialiserer på den unikke primærnøgle-index. Én vinder insertet; den anden
  tager rækkelås på konfliktgrenen og opdaterer. Resultat: præcis én række. Ingen
  duplikat, ingen tabt opdatering.
- **`view_count = cs.view_count + 1`** evalueres på den låste række inde i konfliktgrenen,
  ikke på en værdi Node har læst tidligere. Sikkert under samtidighed.
- **Dobbeltklik / dobbelt-submit på første besøg:** begge forsøger insert; én vinder,
  den anden bliver en update. Én række, `view_count = 2`. Korrekt: ét besøg.
- **Idempotens-nøglen er session-id'et.** Samme id skriver aldrig en ny række, uanset hvor
  mange gange det præsenteres.
- **Besøgstallet er `count(*)`** — ikke en tæller der kan komme ud af trit med
  virkeligheden.
- **Prefetch:** der linkes ingen steder fra internt til kundesider, så Next' `<Link>`-
  prefetch er ikke i spil. Skulle en RSC-prefetch alligevel ske, bærer den cookien og
  bumper kun `view_count` — aldrig besøgstallet. Det er netop derfor `count(*)` er
  overskriften og `view_count` det bløde tal.
- **Læsning:** `trip_session_summary` er ét statement under READ COMMITTED = ét snapshot.
  Et besøg der lander midt i kaldet er enten helt med eller helt ude; de fire tal kan
  ikke modsige hinanden.

## 10. Fail-open — hvor skrivningen sker, og hvorfor den ikke kan gøre skade

### Placering i `page.tsx`

```tsx
const row = await loadTrip(params.bookingId);
if (!row) notFound();                                  // 1. intet skriv

const accessCookie = cookies().get(`trip_access_${params.bookingId}`);
if (accessCookie?.value !== row.booking_no) {
  return <AccessGate .../>;                            // 2. intet skriv
}

await recordCustomerSession(row.id, params.bookingId); // 3. HER

const parsed = tripSchema.safeParse(row.data);         // 4. fejlsiden tæller som åbning
...
```

Placeringen er valgt bevidst: **efter** access-gaten (så `notFound()` og `AccessGate`
aldrig tælles) og **før** skema-parsingen. En kunde der åbner en rejseplan med ødelagte
data *har* åbnet linket — sælgerens spørgsmål er "har kunden klikket?", og svaret er ja,
også selvom vores rendering fejlede. Én placering, ét kald, ingen grene at holde styr på.

### Fejlkontrakten

```ts
// src/lib/customer-session-write.ts (FASE 1B — skitse)
export async function recordCustomerSession(tripId: string, slug: string): Promise<void> {
  try {
    const sessionId = cookies().get(sessionCookieName(slug))?.value;
    if (!isValidSessionId(sessionId)) return;          // ingen cookie = ingen skrivning
    const supabase = getSupabaseService();
    await Promise.race([
      supabase.rpc("record_customer_session", { p_session_id: sessionId, p_trip_id: tripId }),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
  } catch (e) {
    console.error("[customer-session] skrivning fejlede", e);
  }
  // Kaster ALDRIG.
}
```

Samme filosofi som `writeAudit` i `src/lib/audit.ts` — men bevidst **modsat**
`upload_events`.

### Hvorfor modsat Issue #38

`upload_events` er **fail-closed**: fejler event-insertet, afvises sælgerens upload. Det
var rigtigt dér, fordi kravet var 100% dækning i et internt værktøj — en usynlig upload
gør hele adoptionstallet utroværdigt, og prisen for fejlen bæres af en kollega der kan
prøve igen og sige til.

Her er alt anderledes. Prisen for et fail-closed-svigt ville blive båret af **kunden**,
som ville se en fejl på sit rejsetilbud fordi vores statistik havde en dårlig dag. Et
manglende besøg i en tæller er en ubetydelig omkostning; et ødelagt kundetilbud er ikke.
Issue #41 siger det direkte: kundesiden må aldrig blive skrøbeligere på grund af
analytics. **Derfor fail-open, uden forbehold** — og derfor er tallene "næsten helt
eksakte" frem for garanteret komplette. Det er den rigtige byttehandel, og sælgerne skal
kende den.

### Beviset

1. Funktionen returnerer `Promise<void>` og har hele kroppen i `try/catch`. Den har intet
   `throw` og ingen `finally` der kan kaste. Den kan derfor ikke *rejecte*.
2. Fordi den ikke kan rejecte, kan `await` ikke kaste. Ingen fejl kan nå
   error-boundary'en, `notFound()`, `AccessGate`, fejlsiden eller JSX-returneringen.
3. En PostgREST-fejl (tabel mangler, RLS afviser, FK-violation fordi trippen blev slettet
   midt i requesten) kommer tilbage som et **fejl-objekt**, ikke en exception — logges,
   ignoreres.
4. `Promise.race` mod en 1-sekunds timer: en hængende DB kan ikke holde kundesiden. Timeren
   *resolver* (rejecter ikke), så racet kan heller ikke kaste.
5. Mangler cookien, returneres der før noget netværkskald overhovedet sker.
6. Ingen anden kode læser returværdien; der er ingen tilstand at komme ud af trit med.

Forventet omkostning ved succes: ét RPC-kald i samme region (Vercel + Supabase, begge
eu-west-1) — tiere af millisekunder, i praksis parallelt med resten af sidens arbejde.
Måler vi senere at det betyder noget, er `waitUntil()` fra `@vercel/functions` det
oplagte næste skridt; det vurderes ikke nødvendigt nu og koster en ny afhængighed.

## 11. Retention

| Data | Periode | Mekanisme |
|---|---|---|
| `customer_sessions` (rå) | **12 måneder** på `last_seen_at` | pg_cron, dagligt |
| Aggregater | ingen gemmes i Fase 1 | live RPC |

**12 måneder** afvejer de to hensyn: en rejse har et salgsforløb på uger til måneder, og
en sælger kan med rimelighed ville se tilbage på en sæson ("åbnede de overhovedet
tilbuddet sidste efterår?"). Ud over ét år er værdien reelt nul, mens rækkerne bliver ren
ophobning. Rækkerne indeholder ingen direkte persondata, men dataminimering handler også
om ikke at gemme noget uden formål.

```sql
-- kræver extension pg_cron (Supabase: Database -> Extensions) — KRÆVER RICKO
select cron.schedule(
  'customer_sessions_retention',
  '17 3 * * *',
  $$delete from public.customer_sessions where last_seen_at < now() - interval '12 months'$$
);
```

**Cron-jobbet skal med i migration 010 — ikke som "en senere driftsopgave".** Præcedensen
er ubehagelig tydelig: `parse_failures` har haft en dokumenteret 30-dages oprydning som
hensigt siden migration 007 og har stadig ingen. En retention-politik der ikke er
schedulet er ikke en politik. Kan pg_cron ikke enables, skal Fase 1B i stedet levere et
Vercel Cron-endpoint — men noget skal køre fra dag ét.

### Konsekvens der skal håndteres i UI'et

Når rækker slettes efter 12 måneder, får en gammel rejseplan igen nul sessioner. Uden
forholdsregler ville den blive vist som **"ikke åbnet endnu"** — direkte misvisende over
for sælgeren.

Reglen for visningslaget (Fase 1C/4):

- Trip oprettet **inden for** retention-vinduet og uden sessioner → "Ikke åbnet endnu".
- Trip **ældre end** vinduet og uden sessioner → "Ingen registrerede åbninger de seneste
  12 måneder".
- Trip oprettet **før** sporingen blev slået til → "Sporing startede <dato>". Der
  backfilles ikke; samme situation som `upload_events`' `trackingSince`. Datoen lægges som
  konstant `TRACKING_SINCE` i `src/lib/customer-session.ts` når Fase 1B deployes, og
  `trip_session_summary` returnerer derudover `min(started_at)` som sanity-værdi.

Vil man senere kigge længere tilbage end 12 måneder, er svaret et per-trip-aggregat der
overlever oprydningen — en bevidst Fase 4-beslutning, ikke noget der sniges ind nu.

## 12. Fase 1B — implementeringsplan

Fase 1B er **kun opsamling**. Visningen i admin er Fase 1C (eller lægges ind i Fase 4's
salgsoversigt) — det holder den risikable middleware-ændring i et lille, isoleret PR, i
tråd med Issue #41's "én fase ≈ én PR".

### Filer

| Fil | Handling | Indhold |
|---|---|---|
| `supabase/010_customer_sessions.sql` | **NY** | Tabel + comments + RLS-policy + 3 indexes + `record_customer_session` + `trip_session_summary` + revoke/grant + pg_cron-job. Idempotent |
| `supabase/README.md` | ÆNDRES | Tabelrække i migrationsoversigten + driftsnote (retention, release-rækkefølge, fail-open-kontrakten) |
| `supabase/schema-baseline.json` | ÆNDRES | Efter `--update-baseline` |
| `src/lib/customer-session.ts` | **NY** | Rene funktioner, jf. §8. Ingen imports fra `next/*` eller Supabase |
| `src/lib/customer-session.test.ts` | **NY** | Vitest, ingen DB, ingen browser |
| `src/lib/customer-session-write.ts` | **NY** | `recordCustomerSession()`, best-effort, jf. §10 |
| `src/middleware.ts` | ÆNDRES | Matcher udvides med `/:bookingId([0-9a-f]{12})`; krop forgrenes på path. `/admin`-flowet røres ikke |
| `src/app/[bookingId]/page.tsx` | ÆNDRES | Ét `await recordCustomerSession(...)` efter access-gaten |
| `docs/SYSTEM-ARKITEKTUR.md` | ÆNDRES | §8 datamodel + middleware-afsnittet |
| `docs/DECISIONS.md` | ÆNDRES | Fail-open vs. #38's fail-closed · retention · cookie-samtykke (Rickos svar) |
| `docs/TESTING.md` | ÆNDRES | Testniveau for middleware-ændringer |
| `docs/STATUS.md`, `docs/ROADMAP.md` | ÆNDRES | Løbende |

**Ikke i Fase 1B:** admin-UI, `/admin/api`-endpoint, `customer_events`, sektionsevents,
kontaktklik, HubSpot, lead score.

### Tests (`src/lib/customer-session.test.ts`)

Samme mønster som `progress-nav.test.ts`: ren logik ind, boolean/streng ud.

- `isValidSessionId`: gyldig v4-uuid · uppercase · tom streng · `undefined` · `"abc"` ·
  36 tegn med forkert format · SQL-injektionsstreng.
- `isBotUserAgent`: googlebot · bingbot · facebookexternalhit · WhatsApp · Slackbot ·
  Twitterbot · LinkedInBot · Applebot · curl · python-requests · HeadlessChrome ·
  tom/`null` UA (→ bot) · ægte Safari iOS · ægte Chrome Windows · ægte Edge.
- `hasAdminAuthCookie`: `sb-iunixfpthdftmkgpugex-auth-token` · chunket `...-auth-token.0` ·
  kun `trip_access_x` · tom liste.
- `isProductionHost`: `rejseplaner.uniquetravel.dk` · med portsuffiks · branch-alias ·
  `localhost:3000` · `null`.
- `shouldTrackCustomerView`: sandhedstabel — alle fem betingelser opfyldt → true; hver
  enkelt betingelse negeret → false (5 cases); plus preview-host med
  `VERCEL_ENV="production"` → false.
- `sessionCookieName` + `SESSION_COOKIE_MAX_AGE_SECONDS === 1800`.

**Kan ikke unit-testes** (verificeres manuelt i production, se nedenfor): selve
middleware-matcheren, upsert-adfærden, pg_cron-jobbet.

### Release-rækkefølge

Issue #38 **krævede** migration før kode, fordi parse-routen var fail-closed: kode først
ville have afvist alle uploads. **Her gælder den tvang ikke.** Fail-open betyder at koden
kan deployes før migrationen uden at noget går i stykker — RPC-kaldet returnerer blot en
fejl der logges, og kundesiden renderer som altid.

Den frihed er en sikkerhedsegenskab, ikke en anbefaling. Anbefalet rækkefølge:

1. **(KRÆVER RICKO)** Kør `010_customer_sessions.sql` i SQL Editor på production.
   Verificér: tabel, RLS-policy, 3 indexes, 2 funktioner, cron-jobbet i `cron.job`.
2. `node scripts/check-schema-drift.mjs --update-baseline` → commit baseline.
3. Verificér slug-formatet (§8) før matcheren låses.
4. Merge og deploy koden.
5. Produktionsverifikation (se nedenfor).

Begrundelse for rækkefølgen: den giver nul fejllogs og dataopsamling fra første request
efter deploy. Men skulle rækkefølgen af en eller anden grund blive byttet om, er
konsekvensen støj i loggen — ikke en incident.

### Produktionsverifikation (Ricko, efter deploy)

Skrivestien kan **ikke** testes på preview: `VERCEL_ENV`/host-gaten slår bevidst
opsamlingen fra dér, og preview er desuden bag Vercel SSO. Det er en direkte konsekvens af
at preview deler production-DB — og prisen er værd at betale. Verifikation sker derfor på
production, med en rigtig (test)rejseplan:

1. Åbn kundelinket i en browser **uden** admin-login, unlock normalt.
   → `select count(*) from customer_sessions where trip_id = '<id>'` skal give **1**.
2. Refresh 5 gange. → stadig **1** række, `view_count = 6`, `last_seen_at` rykker.
3. Vent 35+ min., genåbn. → **2** rækker.
4. Åbn samme link i en browser hvor du er logget ind i `/admin`. → **ingen** ny række.
5. Åbn linket på branch-aliaset `...-git-main-...vercel.app`. → **ingen** ny række.
6. Tjek at intet i tabellen indeholder andet end uuid, uuid, to tidsstempler og et tal.

Bemærk at tricket fra `docs/TESTING.md` — at sætte `trip_access_<slug>`-cookien direkte —
**ikke** kan bruges til at teste opsamlingen lokalt: miljø-gaten slår til før alt andet.
Det er tilsigtet.

## 13. Acceptance — svar på Issue #43's ti spørgsmål

1. **Hvad tæller som ét besøg?** Ét session-id = én række i `customer_sessions`. Id'et
   mintes i middleware og lever i `trip_session_<slug>` med et rullende 30-minutters
   inaktivitetsvindue. Alle sidevisninger inden for vinduet er samme besøg.
2. **Hvornår tæller det næste besøg?** Når session-cookien er udløbet (>30 min. uden
   request) eller er væk — så mintes et nyt id, og der oprettes en ny række. Nyt device
   eller ryddede cookies giver også et nyt besøg; det er bevidst.
3. **Kunde med eksisterende 30-dages access-cookie?** Hun rammer `page.tsx` direkte uden
   at køre `unlockTrip`. Middleware ser access-cookien, minter en ny session-cookie, og
   `page.tsx` skriver rækken. Derfor **skal** logikken ligge i middleware — Server
   Components kan ikke sætte cookies, og `unlockTrip` kører kun ved selve unlock.
4. **Hvordan undgår vi at en refresh tæller igen?** Cookien overlever refreshet, så det
   samme id præsenteres, og `on conflict (id) do update` rammer den eksisterende række:
   kun `last_seen_at` og `view_count` ændres. Besøgstallet er `count(*)` og rører sig ikke.
5. **Hvordan holdes admin/preview/bots ude?** Fem AND-betingelser i middleware (§3):
   access-cookie til stede, ingen Supabase-auth-cookie, ikke bot-UA,
   `VERCEL_ENV === "production"`, kanonisk host. Fejler én, mintes der ingen cookie — og
   uden cookie skriver `page.tsx` ikke. Adgangskravet (`booking_no`) er i praksis det
   stærkeste bot-filter. Kendt hul: udlogget sælger i anden browser (§8).
6. **Hvilke persondata gemmer vi — og hvilke ikke?** Gemt: tilfældig uuid, `trip_id`,
   `started_at`, `last_seen_at`, `view_count`. **Ikke** gemt: bookingnummer (hverken
   klartekst eller hash), slug, navn/email/telefon, IP, rå eller kategoriseret User-Agent,
   referrer, geo, skærm/tidszone, nogen form for fingerprint, nogen kobling mellem to
   rejseplaner. Fuld liste i §7.
7. **Hvordan undgår vi race conditions/dobbelttælling?** Hele skrivningen er ét
   `insert ... on conflict do update`-statement i en RPC — intet læs-så-skriv i Node.
   Postgres serialiserer på primærnøglen; samtidige requests med samme id giver præcis én
   række. `view_count + 1` evalueres på den låste række. Læsningen aggregeres i ét
   statement = ét snapshot.
8. **Hvad sker der hvis analytics fejler?** Ingenting, for kunden. Skrivefunktionen kan
   ikke rejecte (hele kroppen i try/catch, intet throw), har et 1-sekunds timeout-loft, og
   PostgREST-fejl returneres som objekter frem for exceptions. Manglende tabel, RLS-afvisning
   eller hængende DB koster ét tabt datapunkt og en linje i loggen. Bevidst modsat Issue
   #38's fail-closed — begrundet i §10.
9. **Hvor længe gemmes data?** 12 måneder på `last_seen_at`, slettet af et pg_cron-job der
   oprettes i selve migration 010 (ikke som en senere driftsopgave — se `parse_failures`).
   Ingen aggregater gemmes. UI'et skal skelne "ikke åbnet endnu" fra "ingen åbninger inden
   for opbevaringsperioden" (§11).
10. **Hvad skal bygges i Fase 1B?** Migration `supabase/010_customer_sessions.sql`
    (tabel + RLS + 3 indexes + 2 RPC'er + cron), `src/lib/customer-session.ts` (ren logik)
    + tests, `src/lib/customer-session-write.ts`, udvidet matcher i `src/middleware.ts`, og
    ét kald i `src/app/[bookingId]/page.tsx`. Ingen admin-UI, intet endpoint, ingen
    `customer_events`. Fuld liste og release-rækkefølge i §12.

## 14. Beslutninger der kræver Ricko før Fase 1B

1. **Cookie-samtykke** (§7) — skal `AccessGate` nævne at åbninger registreres?
2. **Kør migration 010 i production** — DDL på produktionsdatabasen.
3. **Aktivér pg_cron-extension** i Supabase, hvis den ikke allerede er slået til.
4. **Middleware-matcheren udvides til kundesider** — ændrer request-håndteringen for al
   kundetrafik. Lille diff, men vær opmærksom ved review.
5. **Accepter de dokumenterede huller** (§8): udlogget sælger tæller som kunde, og
   fail-open betyder at tallene er tæt på eksakte frem for garanteret komplette.

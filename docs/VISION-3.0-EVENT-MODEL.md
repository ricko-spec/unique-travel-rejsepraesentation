# Vision 3.0 — eventmodel (Fase 1: fundament + åbninger)

> Oprindeligt design til [Issue #43](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/43)
> (PR #44), under [Issue #41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41).
> **Revideret af [Issue #63](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/63)
> (2026-09-17): den anbefalede Fase 1B-model er skiftet fra en ny session-cookie til en
> cookie-fri, server-side rolling visit-model. Se §0 for hvorfor.**
> **Docs-only. Ingen migration, ingen kode, intet endpoint er bygget endnu.**

## 0. Revisionshistorik og beslutning

**Fase 1B er ikke implementeret.** Dette dokument har gennemgået to runder:

1. **Issue #43/PR #44 (2026-09-16):** designede en ny `trip_session_<slug>`-cookie +
   `customer_sessions`-tabel, session-id mintet i middleware. Teknisk solidt, men gjorde
   Fase 1B afhængig af en uafklaret ePrivacy-vurdering (§7 dengang) og en
   middleware-udvidelse til al kundetrafik — begge blokerende.
2. **Issue #63 (2026-09-17):** stillede spørgsmålet direkte — kan den samme
   forretningsværdi opnås uden en ny analytics-cookie? Efter en konkret sammenligning
   (§14, arkiveret nedenfor) er svaret **ja**, og dette dokument er omskrevet til at
   beskrive den anbefalede model: **cookie-fri, server-side rolling visit-aggregation
   pr. rejseplan** (herefter "Model B" eller blot "designet").

Den tidligere cookie-model ("Model A") er **ikke** valgt. Den er arkiveret i §14 sammen
med den fulde begrundelse, fordi dens afvejninger (særligt ift. en fremtidig Fase 2) er
reel information, ikke blot historik der skal glemmes.

**Ingen af de to modeller er implementeret. Dette er fortsat kun et beslutningsgrundlag.**

## 1. Hvad Fase 1 skal kunne svare på

Pr. rejseplan, til sælgeren — uændret fra oprindelig scope:

| Signal | Kilde |
|---|---|
| Ikke åbnet endnu | ingen `trip_visits`-række for trippen |
| Første reelle kundeåbning | `trip_visits.first_opened_at` |
| Seneste reelle kundeåbning | `trip_visits.last_opened_at` |
| Antal besøg | `trip_visits.visit_count` |

Intet andet. Sektionsengagement, kontaktklik, lead score og salgsoversigt er Fase 2-4
(Issue #41) og designes bevidst ikke ind her ud over at skemaet skal kunne vokse (§9).

## 2. Hvad er ét besøg? (mekanisk, cookie-fri)

**Ét besøg = én sammenhængende læseperiode pr. rejseplan — ikke pr. browser, pr. enhed
eller pr. person.** Der findes intet klient-holdt identifikatorbegreb af nogen art: ingen
cookie ud over den eksisterende `trip_access_<slug>` (som fortsat kun bruges til
adgangskontrol, uændret), ingen `localStorage`, intet session-id sendt til klienten.

Al tilstand lever i én database-række pr. trip (`trip_visits`, §6):

| Kolonne | Betydning |
|---|---|
| `first_opened_at` | Sat ved første kvalificerede åbning nogensinde. Ændres aldrig igen. |
| `last_visit_started_at` | Starttidspunkt for den *aktuelle* besøgsperiode. |
| `last_opened_at` | Tidspunkt for den seneste kvalificerede render, uanset besøg. |
| `visit_count` | Antal besøgsperioder. |
| `open_count` | Antal kvalificerede sidevisninger i alt (blødt signal). |

**Reglen, evalueret server-side ved hver kvalificeret render:**

- Er `last_opened_at` **mere end 30 minutter gammel** (eller findes rækken slet ikke
  endnu) → dette er et **nyt besøg**: `visit_count += 1`, `last_visit_started_at = now()`.
- Ellers → **samme besøg fortsætter**: kun `last_opened_at` og `open_count` opdateres.

Hele beslutningen og skrivningen sker i **ét atomart SQL-statement** i Postgres (§6.2) —
der er intet tidsstempel der sendes fra Node, og der er intet mellemliggende læs-så-skriv
hverken i applikationskoden eller i SQL'en selv.

### Hvorfor 30 minutter

Samme branchestandard-begrundelse som det oprindelige design (GA's session-timeout er
30 min.): det matcher "en brugssituation" bedre end en fast levetid, og en fejl i den
ene retning (to reelt adskilte læsninger tæt på hinanden limes sammen) er den sikre
retning for et tal der vises sælgere — se §3 for de konkrete afvejninger.

### Konsekvenser vi accepterer bevidst

- **Mobil + desktop, samme husstand, inden for 30 min. af hinanden = ét besøg**, ikke to.
  Det er den systematiske forskel fra en cookie-baseret model, og den er accepteret
  eksplicit — se §3's scenarier.
- **Ingen besøgshistorik.** Vi ved *at* der har været 4 besøg og *hvornår* det seneste
  var — ikke hvornår de tre foregående faldt. Vil man senere kunne se en tidslinje, er
  det en bevidst senere udvidelse (en logtabel ved siden af, ikke en ombygning af denne).
- **Tælleren kan ikke manipuleres af klienten.** I modsætning til et klient-sendt
  session-id er vinduet håndhævet udelukkende mod serverens eget ur og den låste
  rækkes egen tilstand — der er intet en klient kan sende der ændrer *om* et besøg
  tælles.

## 3. Model B vs. den forkastede cookie-model — den konkrete afvejning

Fuld sammenligning ligger i §14 (arkiveret). Kort:

| | Model B (valgt) | Model A (forkastet, arkiveret §14) |
|---|---|---|
| Ny cookie | Ingen | `trip_session_<slug>`, ny ePrivacy-vurdering nødvendig |
| Middleware | Urørt (`/admin` only) | Udvides til al kundetrafik — "den mest risikable del" |
| Besøgsenhed | Pr. rejseplan | Pr. browser-cookie-jar |
| Klient-manipulerbar tæller | Nej | Ja (dokumenteret accepteret i Model A) |
| Sælger-der-logger-ind-efter-åbning-hul | Lukket (tjekkes ved hvert skriv) | Åbent (tjekkes kun ved cookie-mint) |
| Datavolumen | ≤ 1 række pr. trip (≈ 254 i dag) | Vokser med besøgstrafik |
| Retention | Politikbeslutning, intet teknisk pres | Bærende pg_cron-krav |
| Fase 2-fundament | Skal designe egen dedup-nøgle senere | Færdigt sessionsbegreb klar til brug |

**Hvad vi taber i præcision — de tre reelle scenarier:**

1. **Husstanden kigger sammen** (mor på telefon kl. 20:14, far på laptop kl. 20:19):
   tælles som 1 besøg (`open_count = 2`), ikke 2. Ikke entydigt forkert for "har
   husstanden set tilbuddet" — men skal stå tydeligt i UI'et som "besøg = læseperiode,
   ikke enhed".
2. **Relæ-kæden** (flere personer, <30 min. mellem hvert skridt): kæder på tværs af
   *alle* enheder, ikke kun pr. enhed som i en cookie-model. Værste case, kræver et
   ubrudt mønster for at opstå.
3. **Kunde rydder cookies og låser op igen inden for 30 min.:** Model B tæller korrekt
   ét besøg. En cookie-model ville (fejlagtigt) tælle to — Model B er her **mere**
   præcis, ikke mindre.

Alt andet — refresh, flere faner, genåbning efter >30 min., nyt device efter >30 min.,
bot-forsøg, "er den overhovedet åbnet" — leverer identisk resultat i begge modeller.
Fejlretningen er konsekvent undertælling, den samme sikre retning det oprindelige design
selv insisterede på.

## 4. Server vs. browser

**Alt er server-side. Der køres ingen analytics-JavaScript i kundens browser i Fase 1.**
Uændret princip fra det oprindelige design — kun *hvor* server-side-koden bor er
anderledes.

| Signal | Autoritet |
|---|---|
| Blev siden åbnet? | Server (request'en selv) |
| Hvornår? | Server (`now()` i Postgres — ét ur) |
| Hvilken rejseplan? | Server (`row.id` fra det opslag der allerede sker i `page.tsx`) |
| Nyt besøg eller fortsat besøg? | Server (Postgres, i samme statement som skrivningen) |

En klientside-beacon blev overvejet i det oprindelige design og forkastet af samme
grunde som stadig gælder: nyt offentligt endpoint, ekstra netværksrequest på
kundesiden, adblocker-sårbar. Ingen af Fase 1's fire signaler kræver den.

### Hvorfor det hele nu bor i `page.tsx` — ingen middleware nødvendig

Det oprindelige design krævede middleware, fordi en cookie skal mintes ved **hvert**
besøg, og `page.tsx` (Server Component) kan ikke sætte cookies — kun `unlockTrip`
(Server Action) kan, men den kører kun ved selve unlock-øjeblikket, ikke ved genbesøg
med den eksisterende 30-dages `trip_access_<slug>`-cookie.

Cookie-fri fjerner den tvang: der er intet at *sætte* ved hvert besøg — kun noget at
*læse og skrive i databasen*, og `page.tsx` har allerede en verificeret service-role
DB-forbindelse og den autoritative adgangskontrol (`hasValidTripAccess`, linje 68).
**Middleware-matcheren forbliver `["/admin", "/admin/:path*"]`, urørt.**

## 5. Flow — unlock → visning → besøgsregistrering

```
A. Første besøg, ukendt kunde
   GET /ab12cd34ef56
     page.tsx : accessCookie != booking_no  -> <AccessGate/>, intet skriv
   POST unlockTrip (Server Action) — UÆNDRET, ingen ændring i denne fil ud over uberørt
     rate-limit ok, kode ok -> audit_log: unlock_success -> sæt trip_access_<slug>
     -> redirect /<slug>
   GET /ab12cd34ef56   (redirectet)
     page.tsx : accessCookie == booking_no, gate-funktion tillader
                -> waitUntil(recordTripVisit(row.id))   [INGEN await]
                -> render rejseplanen og SEND responsen
                ~~ baggrund, efter responsen ~~
                -> record_trip_visit(trip_id): ingen række fandtes -> INSERT,
                   first_opened_at = last_opened_at = last_visit_started_at = now(),
                   visit_count = open_count = 1
   Resultat: 1 række. "Første åbning" = nu.

B. Refresh x20 inden for 30 min.
     page.tsx : samme trip_id, samme gate-udfald
                -> baggrund: last_opened_at < 30 min. gammel -> KUN
                   last_opened_at = now(), open_count += 1
   Resultat: stadig visit_count = 1. Besøgstallet rører sig ikke.

C. Ny fane / nyt vindue, samme browser, inden for vinduet
     Samme trip_id -> som B. Stadig 1 besøg.

D. Genåbning næste dag
     last_opened_at er nu >30 min. gammel -> nyt besøg
   Resultat: visit_count = 2. last_visit_started_at og last_opened_at opdateret,
   first_opened_at uændret.

E. Nyt device, samme husstand, >30 min. efter forrige
     Ingen trip_access-cookie dér -> AccessGate -> unlock -> som A, men trip_visits-
     rækken findes allerede -> UPDATE-grenen -> visit_count += 1 (>30 min. gammel).
   Resultat: endnu et besøg.

E2. Nyt device, samme husstand, <30 min. efter forrige (DEN ACCEPTEREDE AFVIGELSE)
     Som E, men last_opened_at er FRISK -> kun open_count += 1, visit_count UÆNDRET.
   Resultat: stadig ét besøg. Se §3.

F. Sælger der tester (logget ind i /admin i samme browser)
     page.tsx : hasAdminAuthCookie(cookies) === true -> gate returnerer false
                -> intet skriv. Siden renderes normalt.
   Lukker Model A's dokumenterede hul: tjekket sker ved HVERT skriveforsøg, ikke kun
   ved cookie-mint, så en sælger der logger ind EFTER at have åbnet linket udlogget
   fanges også (i modsætning til det oprindelige design).

G. Bot / link-preview
     Ingen trip_access-cookie (kender ikke booking_no) -> stopper allerede ved A's
     første trin. UA-filteret (§8) er andet lag.

H. Localhost / Vercel preview / branch-alias
     VERCEL_ENV != "production" eller host != rejseplaner.uniquetravel.dk
     -> gate returnerer false -> intet skriv. Samme DB, ingen forurening.
```

## 6. Datamodel (SKITSE — ikke en migration)

Al SQL herunder er illustrativ. Den rigtige fil hedder `supabase/010_trip_visits.sql` og
skrives først når Fase 1B implementeres (se §12).

### 6.1 Tabel — egen tabel, ikke kolonner på `trips`

**Bevidst valg: en dedikeret tabel, ikke nye kolonner på `trips`.** Én grund er
diskvalificerende for kolonne-varianten: `trips` har en `BEFORE UPDATE`-trigger
(`trips_set_updated_at`, `supabase/001_trips.sql`) der sætter `updated_at` ved enhver
opdatering — og `updated_at` betyder i dag "sælgeren ændrede rejseplanen"
(`admin/api/trips`-listen bruger det sådan). Kolonner på `trips` ville lade hver
kundeåbning bumpe det felt og gøre admin-listens "senest ændret" ubrugelig. Samme
mønster som `audit_log`, `rate_limits`, `parse_failures`, `upload_events`: hver
tværgående bekymring får sin egen service-role-only tabel.

```sql
create table if not exists public.trip_visits (
  trip_id               uuid primary key
                          references public.trips(id) on delete cascade,
  first_opened_at       timestamptz not null default now(),
  last_visit_started_at timestamptz not null default now(),
  last_opened_at        timestamptz not null default now(),
  visit_count           integer     not null default 1,
  open_count            integer     not null default 1
);

comment on table public.trip_visits is
  'Kundeåbninger pr. rejseplan (Vision 3.0 fase 1). Én række pr. trip — aldrig pr. person, enhed eller session. Ingen identifikator af nogen art: ingen cookie, ingen IP, ingen user-agent, intet bookingnummer, intet navn. Service-role-only.';
comment on column public.trip_visits.first_opened_at is
  'Første kvalificerede kundeåbning. Sættes på insert-grenen og opdateres ALDRIG.';
comment on column public.trip_visits.last_visit_started_at is
  'Starttidspunkt for den seneste besøgsperiode.';
comment on column public.trip_visits.visit_count is
  'Antal besøgsperioder. Et nyt besøg tælles kun når der er gået mere end 30 min. siden last_opened_at — på tværs af alle enheder. Kan ikke manipuleres af klienten (håndhævet udelukkende mod serverens ur og den låste rækkes tilstand).';
comment on column public.trip_visits.open_count is
  'Samlet antal kvalificerede sidevisninger. Blødt signal: refresh og flere enheder inden for samme besøg tæller her, ikke i visit_count.';

alter table public.trip_visits enable row level security;

drop policy if exists "service_role full access trip_visits" on public.trip_visits;
create policy "service_role full access trip_visits"
  on public.trip_visits for all
  to service_role
  using (true)
  with check (true);

create index if not exists trip_visits_last_opened_idx
  on public.trip_visits (last_opened_at desc);
```

Ingen `set_updated_at`-trigger på denne tabel — `last_opened_at` *er* det feltet.
Tabellen har højst én række pr. trip (≈254 i dag), så ét index ud over primærnøglen er
tilstrækkeligt. **Ingen separat læse-RPC nødvendig:** aggregeringen findes allerede som
selve rækken — Fase 1C/4 læser med et almindeligt `select`/`left join`, ikke en
`jsonb_object_agg`-aggregering som det oprindelige design krævede.

### 6.2 Skriv-RPC — den atomare operation

```sql
create or replace function public.record_trip_visit(p_trip_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_catalog
as $function$
  insert into public.trip_visits as tv (trip_id)
  values (p_trip_id)
  on conflict (trip_id) do update
    set last_opened_at        = now(),
        open_count            = tv.open_count + 1,
        visit_count           = tv.visit_count
                                  + (case when tv.last_opened_at < now() - interval '30 minutes'
                                          then 1 else 0 end),
        last_visit_started_at = case when tv.last_opened_at < now() - interval '30 minutes'
                                     then now() else tv.last_visit_started_at end;
$function$;

revoke execute on function public.record_trip_visit(uuid) from public;
revoke execute on function public.record_trip_visit(uuid) from anon;
revoke execute on function public.record_trip_visit(uuid) from authenticated;
grant  execute on function public.record_trip_visit(uuid) to service_role;
```

Ét statement. Intet `select` forud, intet læs-så-skriv — hverken i Node eller i SQL'en
selv. Samme begrundelse for RPC frem for `supabase.from().upsert()` som
`increment_rate_limit` (migration 005): klientbiblioteket kan ikke udtrykke
`tv.open_count + 1` eller et betinget `CASE`-udtryk på konfliktgrenen.

**Fælde for en fremtidig implementering:** i en `RETURNING`-klausul refererer
`tv`-alias'et til rækken *efter* opdateringen — `returning (tv.last_opened_at < now() -
interval '30 minutes')` er derfor altid falsk og kan ikke bruges til at rapportere "var
dette et nyt besøg". Fase 1 har ikke brug for den returværdi (fail-open ignorerer den
alligevel); en fremtidig Fase 2 der har brug for det, må bruge `xmax = 0`-mønstret eller
en PL/pgSQL-variant med en eksplicit variabel.

### 6.3 Bevis for race-sikkerhed

**Påstand:** samtidige requests mod samme rejseplan kan hverken dobbelttælle et besøg
eller tabe en opdatering.

1. **Serialisering.** `trip_id` er primærnøgle. `ON CONFLICT DO UPDATE` bruger
   speculative insertion: Postgres tager rækkelås på den konfliktende række **før**
   `SET`-udtrykkene evalueres. To transaktioner kan derfor aldrig evaluere
   `SET`-grenen for samme `trip_id` samtidig.
2. **Evalueringstidspunktet er det afgørende.** `tv.`-referencen i `SET`-udtrykket er
   rækken *som den er lige nu, efter låsen er taget* — ikke et snapshot fra
   statementets start. En ventende transaktion ser derfor den værdi den foregående
   netop skrev.
3. **Gennemgang.** Række: `last_opened_at = 11:00`, `visit_count = 3`. T1 og T2 ankommer
   begge ca. kl. 12:00.
   - T1 låser, evaluerer `11:00 < (12:00 − 30 min)` = `11:00 < 11:30` → sandt →
     `visit_count = 4`, `last_opened_at = 12:00:00.000`. Commit.
   - T2 får låsen, gen-læser `last_opened_at = 12:00:00.000`. Evaluerer
     `12:00:00.000 < 11:30:00.0xx` → **falsk** → `visit_count` uændret (4),
     `open_count += 1`.
   - Resultat: præcis ét besøg, to sidevisninger — uafhængigt af hvilken transaktion
     der reelt kom først (forskellen mellem de to `now()`-værdier er mikrosekunder,
     vinduet er 30 minutter).
4. **Første besøg / dobbeltklik:** rækken findes ikke. Begge forsøger insert;
   unikhedsindekset lader én vinde (`visit_count = 1`); den anden falder i
   konfliktgrenen og ser en frisk `last_opened_at` → ingen forøgelse. Én række, ét
   besøg, `open_count = 2`.
5. **Præcedens, ikke nyudvikling.** `increment_rate_limit` (migration 005, i produktion
   siden 2026-06-15) er samme konstruktion: `on conflict (key) do update set count =
   case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end` — en
   tidsbetinget tæller på en låst række. `record_trip_visit` er samme mønster med et
   rullende prædikat i stedet for et absolut.

### 6.4 30-minutters-vinduet — ét ur

Vinduet beregnes **udelukkende i Postgres**, af `now()` og en fast `interval`. Node
sender ingen tidsstempler og ingen varighed — bevidst forskel fra `checkRateLimit()`,
som beregner sit vindue i Node (`Date.now()`); det ville her blande to ure
(Node vs. Postgres) i samme sammenligning. `VISIT_WINDOW_MINUTES = 30` eksporteres som
konstant i `src/lib/trip-visit.ts` udelukkende til dokumentation/UI-tekst — den sendes
aldrig over ledningen. Ændres vinduet, kræver det en ny migration; det er en bevidst
konsekvens, fordi en vinduesændring ændrer betydningen af historiske
`visit_count`-værdier.

## 7. Privacy og sikkerhed

### Gemmes ALDRIG

| Data | Hvorfor ikke |
|---|---|
| Ny cookie af nogen art | Hele formålet med denne revision — se §0/§3 |
| `booking_no` i klartekst eller hash | Det er kundens adgangskode. `trip_id` er en bedre, allerede-intern nøgle |
| `slug` | Samme: `trip_id` dækker behovet |
| Kundens navn, email, telefon | Ikke nødvendigt for nogen af de fire signaler |
| IP-adresse (også hashet/trunkeret) | Ikke nødvendig |
| Rå eller kategoriseret User-Agent | Læses transient til bot-filtrering (§8), gemmes aldrig |
| Referrer, geo, sprog, skærmstørrelse, tidszone | Fingerprinting-materiale |
| Enhver kobling mellem to rejseplaner | Umuligt — der findes intet krydsende id at koble på |
| Session-/besøgshistorik | Kun aggregater (`first/last/visit_count/open_count`) — ingen logtabel i Fase 1 |

### Gemmes

`trip_id` · tre tidsstempler · to heltal. Ingen identifikator af nogen art.

### Sikkerhedsgrænser

- Tabel og funktion er **service-role-only**, samme mønster som `audit_log`,
  `rate_limits`, `parse_failures`, `upload_events`. RLS slået til, ingen
  anon-/authenticated-policies.
- Skrivningen ligger **efter** den eksisterende access-gate (`hasValidTripAccess`) og
  kan kun nås af en request der allerede har bevist kendskab til `booking_no`.
- Ingen læsning eksponeres kundevendt — kun fra `/admin`, bag den eksisterende
  auth-gate (Fase 1C/4, ikke bygget nu).
- Service-role-nøglen forbliver i `src/lib/supabase/server.ts`. Der er intet
  edge-/middleware-lag i dette design overhovedet.

### Fire punkter der KRÆVER Rickos stillingtagen — uafhængigt af model

Det er en **faktuel forskel**, ikke en juridisk konklusion, at Model B ikke sætter en ny
cookie: Model A's design gjorde cookiens nødvendighed under ePrivacy art. 5(3) til en
uafklaret, blokerende hard release gate (arkiveret §14). Model B sætter ingen ny cookie
og udløser derfor ikke det specifikke spørgsmål.

**Det betyder ikke at alle privacy-spørgsmål er besvaret.** Følgende gælder **uændret i
begge modeller** og er ikke vurderet her — kun beskrevet, så det ikke overses:

1. **Det er behandling af persondata i begge modeller.** `trip_visits.trip_id` kan
   kobles til `trips.customer_name` — "denne navngivne kunde åbnede sit tilbud kl.
   20:14" er en oplysning om en identificerbar person. At rækken kun er
   personhenførbar via `trips`, som sælgeren i forvejen har lovlig adgang til, ændrer
   ikke *arten* af behandlingen. **Formål og behandlingsgrundlag bør skrives
   eksplicit ned — KRÆVER RICKO.**
2. **Transparens** (fx en kort linje på `AccessGate` om at åbninger registreres) er
   uafhængig af cookie-spørgsmålet. Om det er nødvendigt/ønsket vurderes ikke her.
   **KRÆVER RICKO.**
3. **Retention er nu en ren politikbeslutning, ikke et teknisk krav.** I den forkastede
   cookie-model tvang et voksende datasæt en 12-måneders sletning frem. Her kan en
   `trip_visits`-række leve med rejseplanen (cascade) uden at noget ophobes — men at
   der ikke er teknisk pres er ikke det samme som at "for evigt" er det rigtige svar.
   **KRÆVER RICKO**, se §11.
4. **Sælgerkommunikation.** Fordi tælleren er pr. rejseplan (ikke pr. person), er
   "5 besøg" en husstandsoplysning, ikke en oplysning om én bestemt person. Det er en
   fordel — men en sælger der læser "5 besøg" må ikke overfortolke det som fem
   forskellige mennesker. Fase 1C/4's UI skal sige hvad et besøg er (§3). Dette er en
   leveringsforpligtelse ved valget af Model B, ikke en åben beslutning.

## 8. Gaten — én ren funktion, ét sted, ingen middleware

```ts
// src/lib/trip-visit.ts (FASE 1B — skitse). Ingen imports fra next/* eller Supabase.
export type VisitDecisionInput = {
  vercelEnv: string | undefined;   // process.env.VERCEL_ENV
  host: string | null;             // headers().get("host")
  userAgent: string | null;        // headers().get("user-agent")
  cookieNames: string[];           // cookies().getAll().map(c => c.name)
};

export function shouldRecordTripVisit(input: VisitDecisionInput): boolean;
export function isBotUserAgent(ua: string | null): boolean;      // tom UA => bot
export function hasAdminAuthCookie(names: string[]): boolean;    // ^sb-.*-auth-token(\.\d+)?$
export function isProductionHost(host: string | null): boolean;  // kun rejseplaner.uniquetravel.dk
export const VISIT_WINDOW_MINUTES = 30;
```

Fire betingelser (mod fem i det forkastede design — `trip_access`-tilstedeværelse
udgår, fordi den autoritative kontrol allerede er sket i `page.tsx` inden gaten nås):

1. **Ikke bot.** `isBotUserAgent(headers().get("user-agent"))`. Ren regex, transient —
   læses, matches, forsvinder med requesten. Gemmes aldrig, ikke engang som kategori.
2. **Ikke sælger/admin.** `hasAdminAuthCookie(cookies().getAll()...)` — kun
   *tilstedeværelse* af Supabase' auth-cookie tjekkes, ikke sessionens gyldighed
   (samme afvejning som det oprindelige design: et netværkskald til Supabase Auth pr.
   kundevisning er ikke værd prisen; en falsk positiv koster kun ét utalt besøg — den
   sikre retning). Fordi tjekket sker ved **hvert** skriveforsøg (ikke kun ved en
   cookie-mint), lukkes hullet hvor en sælger logger ind *efter* at have åbnet linket
   udlogget — noget det oprindelige design ikke kunne.
3. **Produktionsmiljø.** `process.env.VERCEL_ENV === "production"`. Præcedens:
   `rateLimitEnvScope()` i `src/lib/rate-limit.ts` — samme allowlist-mønster,
   fail-safe default ("tæl ikke" i stedet for "development").
4. **Kanonisk host.** `isProductionHost(host)` — kun `rejseplaner.uniquetravel.dk`.
   Nødvendigt fordi produktions-deployet også er nåbart på branch-aliaset
   `...-git-main-unique-travel.vercel.app`, hvor `VERCEL_ENV` *er* `"production"`.

Alle fire er rene funktioner, unit-testbare uden browser, DB eller
`process.env`-manipulation — samme mønster som `progress-nav.ts`/`trip-access.ts`.

**Kendt, uændret hul:** en udlogget sælger, i inkognito, eller på en privat telefon,
tælles som kunde. Alternativet er at identificere personer bag kundesiden — i direkte
modstrid med præmissen. Skal stå ved tallet i Fase 1C/4's UI.

## 9. Fail-open og nul-latens

**Uændret fra det oprindelige design — kun funktions-/filnavne er anderledes.** To krav
holdes samtidig: analytics må ikke kunne ødelægge kundesiden (fail-open), og den må
ikke kunne gøre den langsommere (nul kritisk-vej-latens). Løsningen er den samme:
`waitUntil()` fra `@vercel/functions`.

```tsx
import { waitUntil } from "@vercel/functions";

const row = await loadTrip(params.bookingId);
if (!row) notFound();                                   // 1. intet skriv

const accessCookie = cookies().get(tripAccessCookieName(params.bookingId));
if (!hasValidTripAccess(accessCookie?.value, row.booking_no)) {
  return <AccessGate slug={params.bookingId} destination={row.destination} />;  // 2. intet skriv
}

// 3. HER — planlægges, afventes IKKE. Responsen venter ikke på DB'en.
waitUntil(recordTripVisit(row.id));

const parsed = tripSchema.safeParse(row.data);           // 4. fejlsiden tæller som åbning
```

Placeringen: efter access-gaten (så `notFound()`/`AccessGate` aldrig tælles), før
skema-parsingen (en kunde der åbner en rejseplan med ødelagte data *har* åbnet linket).

`recordTripVisit()` er strukturelt identisk med det oprindelige designs
`recordCustomerSession()`, kun med `trip_id` i stedet for et session-id-opslag:

```ts
// src/lib/trip-visit-write.ts (FASE 1B — skitse)
const WRITE_TIMEOUT_MS = 2000;

export async function recordTripVisit(tripId: string): Promise<void> {
  try {
    const supabase = getSupabaseService();
    const write = supabase.rpc("record_trip_visit", { p_trip_id: tripId });
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), WRITE_TIMEOUT_MS));
    const result = await Promise.race([write, timeout]);
    if (result === null) {
      console.error("[trip-visit] timeout", { tripId });
      return;
    }
    const { error } = result;
    if (error) {
      console.error("[trip-visit] rpc-fejl", { tripId, code: error.code, message: error.message });
    }
  } catch (e) {
    console.error("[trip-visit] uventet fejl", e);
  }
  // Kaster ALDRIG.
}
```

**Loggrænsen, uændret:** `tripId` + Postgres' `error.code`/`error.message` er det eneste
der logges — aldrig `booking_no`, slug, kundenavn, rejsedata eller rå request-headere.

**Hvorfor `waitUntil` og ikke Next.js' `after()`:** `after()` kræver Next.js 15; repoet
kører Next 14. `waitUntil` fra `@vercel/functions` er en platform-primitiv, virker
uafhængigt af Next-version, og er **den eneste nye dependency** i dette design.

**Hvorfor fail-open og ikke fail-closed som Issue #38's `upload_events`:** der er
prisen for et svigt forskellig. I #38 rammer et fail-closed-svigt en kollega, der kan
prøve igen. Her ville et fail-closed-svigt ramme **kunden** med en fejl på sit
rejsetilbud, fordi vores statistik havde en dårlig dag. Et tabt datapunkt i en tæller er
en ubetydelig omkostning; et ødelagt kundetilbud er ikke. Derfor fail-open, uden
forbehold — tallene er "tæt på eksakte", ikke garanteret komplette, og sælgerne skal
kende den byttehandel.

**Beviset for at det ikke kan forsinke eller ødelægge siden** er identisk med det
oprindelige designs §10.5 (ni led: `waitUntil` returnerer synkront, ingen `await` på
skrivestien, ingen analytics-JS i browseren, hele funktionskroppen i try/catch uden
`throw`, en afvist RPC kommer som fejl-objekt ikke exception, `Promise.race` mod en
timer der *resolver* aldrig kaster, manglende cookie/gate-afvisning stopper før noget
netværkskald sker) — genbruges ordret med to filnavne udskiftet.

## 10. Fase 2-kompatibilitet — den ærlige afvejning

Dette er det stærkeste argument for den forkastede cookie-model, og det skal ikke
affejes.

**Hvad Fase 2 (#41) vil have:** "nåede kunden ned til hotellerne i *dette* besøg?",
"klikkede de på kontakt?", med dedup "højst ét event pr. sektion pr. besøg".

**Fire observationer:**

1. **Fase 2 kræver klient-JavaScript uanset model.** Scroll-position kan kun kendes i
   browseren. Den forkastede cookie-model leverer ikke Fase 2 — kun én brik til den
   (et session-id). Fase 2 er et større arkitektonisk skridt end Fase 1 i begge modeller.
2. **Der er mindst tre mulige dedup-nøgler til Fase 2, og et arvet cookie-session-id er
   ikke oplagt den bedste:** (a) et arvet cookie-session-id fra denne fase, (b) et
   **in-memory page-load-id** genereret i browseren ved sideindlæsning (lagres intet
   sted — hverken cookie eller `localStorage` — lever kun i JS-hukommelsen og dør ved
   navigation), som for "scrollede de til hotellerne under *denne* sideindlæsning" reelt
   er **mere** præcist end et 30-minutters vindue der kan spænde over flere
   sideindlæsninger, eller (c) ren server-side dedup pr. `(trip_id, event_type)`, som
   dækker en stor del af den faktiske salgsværdi uden noget identifikatorbegreb
   overhovedet.
3. **Hvad vi permanent mister ved at vælge cookie-fri nu:** kohorte-/funnel-analyse pr.
   besøg ("af de 12 besøg, hvor mange nåede til prisen?"). Hvis Fase 4's lead score
   nødvendigvis skal bygge på konverteringsrate *pr. besøg*, er den arkiverede
   cookie-model det rigtige fundament. Hvis den kan bygge på engagementssignaler *pr.
   rejseplan* — hvilket produktets skala (≈254 trips, en håndfuld sælgere) og #41's
   ordlyd peger på — er forskellen uden praktisk betydning.
4. **Døren lukkes ikke, den holdes åben.** Beviser Fase 2 senere at der reelt skal
   bruges et sessionsbegreb, tilføjes det **da** — sammen med den klient-JavaScript der
   rent faktisk gør det nødvendigt, og med kendskab til hvad eventsne faktisk er værd.
   `trip_visits` bliver stående uændret ved siden af. Rækkelåsen på `trip_visits` kan
   desuden bære mere end én tæller: en PL/pgSQL-variant kan i samme transaktion, mens
   låsen holdes, betinget skrive til en tilstødende eventtabel — race-sikkert af samme
   grund som §6.3, uden noget klient-holdt id.

## 11. Retention

**Ingen bærende teknisk mekanisme i dette design** (modsat den forkastede models
pg_cron-krav) — men **stadig en beslutning der skal træffes eksplicit**, ikke som
default (§7, punkt 3). Datasættet vokser ikke med trafik (≤ 1 række pr. trip), så der
er intet teknisk pres for at slette — men "ingen sletning nogensinde" er ikke
automatisk det rigtige svar til dataminimering.

Hvis Ricko beslutter en retention-periode, er mekanismen den samme som det oprindelige
design skitserede (pg_cron, `where last_opened_at < now() - interval '...'`) — men
**krymper** rækken i stedet for at slette den (fx nulstil `visit_count`/`open_count`,
behold `first_opened_at`), eller sletter den helt, afhængig af hvad Ricko beslutter
skal ske med "ikke set i X måneder"-signalet i UI'et. Denne beslutning er bevidst ikke
forudbestemt her.

## 12. Fase 1B — implementeringsplan (IKKE bygget endnu)

### Filer

| Fil | Handling | Indhold |
|---|---|---|
| `supabase/010_trip_visits.sql` | **NY** | Tabel + comment + RLS-policy + index + `record_trip_visit` + revoke/grant. Idempotent |
| `supabase/README.md` | ÆNDRES | Tabelrække i migrationsoversigten |
| `supabase/schema-baseline.json` | ÆNDRES | Efter `--update-baseline` |
| `src/lib/trip-visit.ts` | **NY** | Rene funktioner, §8. Ingen imports fra `next/*`/Supabase |
| `src/lib/trip-visit.test.ts` | **NY** | Vitest, ingen DB, ingen browser |
| `src/lib/trip-visit-write.ts` | **NY** | `recordTripVisit()`, §9 |
| `src/app/[bookingId]/page.tsx` | ÆNDRES | Ét `waitUntil(recordTripVisit(...))` efter access-gaten — ikke `await` |
| `package.json` + `package-lock.json` | ÆNDRES | Ny dependency: `@vercel/functions` (eneste nye) |
| `docs/SYSTEM-ARKITEKTUR.md` | ÆNDRES | Datamodel + routebeskrivelse |
| `docs/DECISIONS.md` | ÆNDRES | Model B valgt (denne revision) · fail-open vs. #38 · retention (§11 — Rickos svar) |
| `docs/STATUS.md`, `docs/ROADMAP.md` | ÆNDRES | Løbende |

**Ikke i Fase 1B:** admin-UI, `/admin/api`-endpoint, `customer_events`,
sektionsevents, kontaktklik, HubSpot, lead score, `src/middleware.ts` (urørt).

### Tests (`src/lib/trip-visit.test.ts`)

Samme mønster som `progress-nav.test.ts`/`trip-access.test.ts`: ren logik ind,
boolean/streng ud.

- `isBotUserAgent`: googlebot · bingbot · facebookexternalhit · WhatsApp · Slackbot ·
  curl · python-requests · HeadlessChrome · tom/`null` UA (→ bot) · ægte Safari/Chrome/Edge.
- `hasAdminAuthCookie`: `sb-iunixfpthdftmkgpugex-auth-token` · chunket `...-auth-token.0` ·
  kun `trip_access_x` · tom liste.
- `isProductionHost`: `rejseplaner.uniquetravel.dk` · med portsuffiks · branch-alias ·
  `localhost:3000` · `null`.
- `shouldRecordTripVisit`: sandhedstabel — alle fire betingelser opfyldt → true; hver
  betingelse negeret enkeltvis → false (4 cases); preview-host med
  `VERCEL_ENV="production"` → false.

**Kan ikke unit-testes** (verificeres manuelt i production): upsert-adfærden,
race-scenariet under reelt samtidige requests.

### Release-rækkefølge

Fail-open betyder at rækkefølgen ikke er tvungen (modsat Issue #38). Anbefalet:

0. Beslutning skrevet i `docs/DECISIONS.md`: Model B valgt, de dokumenterede
   præcisionsbegrænsninger (§3) og §7's fire punkter eksplicit besvaret.
1. **(KRÆVER RICKO)** Kør `010_trip_visits.sql` i SQL Editor på production. Verificér:
   tabel, RLS-policy, index, funktion, grants.
2. `node scripts/check-schema-drift.mjs --update-baseline` → commit baseline i samme
   ombæring.
3. `npm i @vercel/functions` → commit `package.json` + `package-lock.json`.
4. `npm run typecheck && npm run lint && npm test`; `npm run build` (route-ændring).
5. Push branch → Vercel-preview → **Rickos OK** → fast-forward-merge til main.
6. Produktionsverifikation (nedenfor).

Byttes 1 og 5 om, er konsekvensen støj i runtime-loggen — ikke en incident.

### Rollback-rækkefølge

1. **Stop opsamling øjeblikkeligt:** revert kode-commit'en (eller blot
   `waitUntil`-linjen) → push til main. Fra næste request skrives der intet.
2. `trip_visits` kan blive stående uden skade — fire tal og en FK, ingen
   identifikatorer.
3. **Fuld tilbagerulning:** `drop function public.record_trip_visit(uuid); drop table
   public.trip_visits;` → `--update-baseline` → commit.
4. **Intet at rydde op i kundernes browsere** — der er aldrig sat noget dér. Dette er
   den konkrete forskel fra den forkastede models rollback, som ville efterlade
   `trip_session_<slug>`-cookies i op til 30 minutter hos rigtige kunder.

Intet i rollbacken rører `trips`, `middleware.ts` eller adgangskontrollen.

### Produktionsverifikation (Ricko, efter deploy)

Kan **ikke** testes på preview: miljø-gaten (§8, betingelse 3-4) slår bevidst
opsamlingen fra dér, fordi preview deler production-DB.

1. Åbn kundelinket i en browser **uden** admin-login, lås op normalt →
   `select * from trip_visits where trip_id = '<id>'` giver 1 række,
   `visit_count = 1`, `open_count = 1`. Skrivningen sker i baggrunden
   (`waitUntil`) — giv det et par sekunder, tjek runtime-loggen for
   `[trip-visit]` hvis rækken udebliver.
2. Refresh 5 gange → stadig `visit_count = 1`, `open_count = 6`.
3. Åbn samme link på en anden enhed inden for 5 minutter → **stadig**
   `visit_count = 1`, `open_count` stiger. Dette er den accepterede afvigelse (§3) —
   verificér den bevidst, ikke som en fejl.
4. Vent 35+ min., genåbn → `visit_count = 2`, `last_visit_started_at` opdateret,
   `first_opened_at` uændret.
5. Åbn linket i en browser hvor du er logget ind i `/admin` → ingen ændring.
6. Åbn linket på branch-aliaset `...-git-main-...vercel.app` → ingen ændring.
7. Bekræft at rækken kun indeholder én uuid, tre tidsstempler og to heltal.

## 13. Acceptance — svar på Issue #43's oprindelige ti spørgsmål (opdateret til Model B)

1. **Hvad tæller som ét besøg?** En sammenhængende læseperiode pr. rejseplan (ikke pr.
   enhed), afgrænset af et 30-minutters inaktivitetsvindue på `trip_visits.last_opened_at`.
2. **Hvornår tæller det næste besøg?** Når `last_opened_at` er mere end 30 minutter
   gammel ved næste kvalificerede render.
3. **Kunde med eksisterende 30-dages access-cookie?** Rammer `page.tsx` direkte som i
   dag; gaten evalueres, og skrivningen sker i samme `page.tsx`-request. Ingen
   middleware involveret.
4. **Hvordan undgår vi at en refresh tæller igen?** `record_trip_visit` opdaterer kun
   `last_opened_at`/`open_count` når vinduet ikke er udløbet — `visit_count` er
   urørt.
5. **Hvordan holdes admin/preview/bots ude?** Fire betingelser i `page.tsx` (§8):
   ikke-bot-UA, ingen admin-auth-cookie, `VERCEL_ENV === "production"`, kanonisk host.
6. **Hvilke persondata gemmer vi — og hvilke ikke?** Gemt: `trip_id`, tre
   tidsstempler, to heltal. Ikke gemt: nogen form for identifikator, cookie, IP,
   User-Agent, kundedata. Fuld liste §7.
7. **Hvordan undgår vi race conditions/dobbelttælling?** Ét
   `insert ... on conflict do update`-statement med et betinget `CASE`-udtryk,
   evalueret på den låste række. Bevist i §6.3.
8. **Hvad sker der hvis analytics fejler?** Ingenting for kunden — `waitUntil` +
   fail-open, identisk kontrakt til det oprindelige design (§9).
9. **Hvor længe gemmes data?** Ingen teknisk tvunget grænse (datasættet vokser ikke
   med trafik); retention er en ren, endnu ubesluttet politik (§11 — KRÆVER RICKO).
10. **Hvad skal bygges i Fase 1B?** `supabase/010_trip_visits.sql`,
    `src/lib/trip-visit.ts` + tests, `src/lib/trip-visit-write.ts`, ét
    `waitUntil(...)`-kald i `page.tsx`, én ny dependency. **Ingen middleware-ændring.**
    Fuld liste §12.

## 14. Beslutninger der kræver Ricko før Fase 1B

**Skal foreligge før kode skrives:**

1. **Model B er valgt** (denne revision, Issue #63) — kræver ikke yderligere
   godkendelse i sig selv, men de følgende punkter gør.
2. **Eksplicit accept af de dokumenterede præcisionsbegrænsninger** (§3): samtidig
   husstandsbrug inden for 30 min. tælles som ét besøg; relæ-kæder kan kæde flere
   personer sammen; udlogget sælger tæller som kunde; fail-open betyder "tæt på
   eksakt", ikke "garanteret komplet" — og et tilsagn om at det står ved tallet i
   Fase 1C/4's UI.
3. **Behandlingsgrundlag og formål** for besøgsregistreringen skrevet ned (§7, pkt. 1).
4. **Transparens-beslutning:** siges der noget til kunden, og hvor (§7, pkt. 2).
5. **Retention-beslutning for `trip_visits`** (§7 pkt. 3, §11).

**Skal foreligge før deploy:**

6. **Kør migration 010 i production** — DDL på produktionsdatabasen.
7. **Bekræft kanonisk produktionsdomæne** som eneste tællende host.
8. **Accept af ny dependency** `@vercel/functions`.
9. **Rickos OK på preview før fast-forward-merge til main** (standardflow).

**Bortfaldet ift. den arkiverede cookie-model:**

- ePrivacy-afklaringen for en ny analytics-cookie — **udgår, ingen ny cookie sættes**.
- Godkendelse af middleware-matcher-udvidelse til kundesider — **middleware røres ikke**.
- Aktivering af pg_cron som forudsætning — kun relevant hvis punkt 5 lander på aldring.
- Verifikation af slug-formatet til en middleware-matcher — var kun nødvendig for den.

---

## Appendix — Model A (cookie-session, arkiveret, IKKE valgt)

Bevaret for referencens skyld: den fulde begrundelse for hvorfor cookie-modellen ikke
blev valgt, og hvornår den kan blive det rigtige valg alligevel.

### Hvorfor arkiveret

Model A er ikke dårligt designet — den er overdimensioneret til Fase 1 og betaler
forud for en Fase 2 der endnu ikke er designet:

- Den introducerer en klient-cookie for at kunne svare på fire spørgsmål der kan
  besvares uden.
- Den lægger middleware på al kundetrafik for at kunne sætte den cookie — det
  oprindelige design kaldte selv dette "den mest risikable del af Fase 1B".
- Den er blokeret bag en juridisk afklaring der **kun** udløses af cookien (§7's
  daværende hard release gate).
- Den accepterer to huller Model B ikke har: en klient kan i teorien oppuste sin egen
  tæller ved at rotere cookieværdien (dokumenteret accepteret i det oprindelige §2),
  og en sælger der logger ind i `/admin` *efter* at have åbnet et kundelink udlogget
  bliver ikke fanget (tjekket skete kun ved cookie-mint, ikke ved hvert besøg).

### Hvornår Model A alligevel er det rigtige valg

**Model A bliver den rigtige model i det øjeblik Fase 2 beviser at der skal bruges et
rigtigt sessionsbegreb** — typisk hvis Fase 4's lead score nødvendigvis skal bygge på
konverteringsrate *pr. besøg* snarere end *pr. rejseplan* (§10). Da indføres cookien
sammen med den klient-JavaScript der rent faktisk kræver den, som en langt lettere
nødvendighedsdiskussion at føre end i dag — og med reelt kendskab til hvad eventsne er
værd. `trip_visits` kan blive stående ved siden af uden at skulle rulles tilbage.

### Model A's fulde tekniske design

Den oprindelige, fulde specifikation (`trip_session_<slug>`-cookie, `customer_sessions`-
tabel, middleware-mint, sessiondefinition, sandhedstabel for gaten, fulde flow-scenarier
A-H, retention via pg_cron som bærende krav) er ikke gentaget her i fuld længde — den
lever i repoets git-historik (denne fils tilstand før Issue #63's revision,
commit-historikken for `docs/VISION-3.0-EVENT-MODEL.md` på `main`). Kernepunkterne der
adskiller den fra Model B er opsummeret i §3's sammenligningstabel.

# Unlock-kode — design: skal `booking_no` fortsætte som kundens adgangskode?

> [Issue #55](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/55).
> **Docs-only.** Ingen implementation, ingen migration, ingen production-ændring i denne
> PR. Formålet er at give Ricko et konkret beslutningsgrundlag — dokumentet vælger ikke på
> hans vegne.

## 1. Hvad dette dokument svarer på

`docs/ROADMAP.md` har et åbent punkt: *"Unlock-kode ≠ booking_no? — sikkerheds-/UX-afvejning."*
I dag er kundens rejseplan låst med kundens eget bookingnummer som kode — et
forretnings-id genbrugt som credential. Dette dokument beskriver præcis hvad det
betyder i praksis, hvilken reel trussel det (og alternativerne) står overfor, og
lægger 2-3 konkrete modeller frem med deres sikkerheds-, UX- og migrationspris.

## 2. Nuværende model — verificeret i current-main-koden

Kilder: `src/app/[bookingId]/page.tsx`, `src/app/[bookingId]/actions.ts`,
`src/app/[bookingId]/AccessGate.tsx`, `src/lib/rate-limit.ts`, `src/lib/audit.ts`,
`supabase/001_trips.sql`, `supabase/005_rate_limits.sql`, `docs/ANALYTICS-BRIDGE-API.md`.

**Om PR #60:** dette dokument er baseret på **current-main** (denne PR grener fra
`main`, ikke fra PR #60). [Issue #56/PR #60](https://github.com/ricko-spec/unique-travel-rejsepraesentation/pull/60)
er en **separat, endnu ikke merged** testability-refactor der udtrækker
adgangschecket til `src/lib/trip-access.ts` — ren omskrivning, ingen adfærdsændring
(se PR'ens egen beskrivelse). Den fil findes derfor IKKE på den branch/main dette
dokument selv beskriver. Nedenfor beskrives current-main's faktiske **inline**
sammenligning, med en parentetisk reference til hvor den samme logik vil bo hvis/når
PR #60 merges. Dette dokument kan merges uafhængigt af PR #60.

- `trips.booking_no text not null unique` — kundens forretnings-bookingnummer
  (`supabase/001_trips.sql:18`).
- `trips.slug text not null unique default lower(encode(gen_random_bytes(6), 'hex'))`
  — en **kryptografisk tilfældig** 12-tegns hex-streng (48 bit entropi), IKKE afledt af
  booking_no eller kundedata (`supabase/001_trips.sql:19-20`). Kunden får linket
  `/{slug}` — ikke `/{booking_no}`.
- Adgang: `AccessGate` viser en kodeboks. `unlockTrip(slug, code)`
  (`actions.ts:11-82`) rate-limiter først (`checkRateLimit(\`unlock:${ip}:${slug}\`)`,
  10 forsøg/15 min pr. IP+slug), slår derefter `booking_no` op for `slug`, og
  sammenligner `code === booking_no`. Match → cookie `trip_access_{slug}` sat til
  **selve booking_no'et i klartekst**, `httpOnly`, `secure`, `sameSite=lax`,
  `path=/{slug}`, 30 dage.
- `page.tsx:66-69` (current-main, inline): adgang kræver
  `accessCookie.value === row.booking_no` — én streng-lighed, direkte i
  `TripPage`-komponenten. (Hvis/når PR #60 merges, bor den samme sammenligning i
  `src/lib/trip-access.ts::hasValidTripAccess` — en ren udtrækning uden
  adfærdsændring, ikke rørt af dette dokument.)
- Alle unlock-forsøg (success/failed/rate_limited) logges i `audit_log`
  (`actions.ts:26-71`) — ingen booking_no i selve audit-metadata, kun antal forsøg.
- **Analytics Bridge** (`docs/ANALYTICS-BRIDGE-API.md`): `booking_match_key =
  HMAC-SHA256(BOOKING_MATCH_SECRET, normalizeBookingNo(booking_no))`, beregnet
  server-side fra `trips.booking_no` — booking_no er her en **forretnings-matchnøgle**,
  ikke en adgangskode. Dette skal fortsætte uafhængigt af hvad der besluttes her.

**Reel model i dag er altså allerede to uafhængige secret-komponenter, ikke én:**
en stærk, tilfældig URL-komponent (slug) + et svagt, forudsigeligt sekundært
"password" (booking_no). **Vigtig præcisering:** dette er IKKE to-faktor-
autentifikation (2FA/MFA) i den tekniske betydning — 2FA kombinerer typisk
forskellige *slags* beviser (noget du ved + noget du har/er). Her er begge
komponenter samme slags bevis: et bearer/knowledge-secret man skal kende eller
have fået tilsendt, blot med meget forskellig styrke. Det er ikke helt så svagt
som "ingen beskyttelse" — men booking_no er substantielt svagere end slug'en det
kombineres med.

## 3. Den faktiske trusselsmodel — ikke sikkerhedsteater

Hvad rate-limit og de nuværende foranstaltninger reelt beskytter imod, og hvad de ikke gør:

| Trussel | Beskyttet i dag? | Hvorfor |
|---|---|---|
| Tilfældig internet-scanning finder en rejseplan uden at kende linket | **Ja, med forbehold** | Slug har 48 bit entropi — stærk modstand mod almindelig online-gætning ved nuværende produktvolumen (få hundrede rejseplaner). Det er IKKE samme styrkeklasse som en moderne 128-bit magic-link-credential (se §6) — blot langt over hvad en realistisk online brute-force-flade kan udtømme i dag |
| Nogen der HAR linket (videresendt mail, browserhistorik, skærmbillede) gætter koden ved tilfældig brute force | **Delvist** | Rate-limit (10/15 min pr. IP+slug) gør det langsomt, men booking-numre ligner et lavt-entropi sekventielt felt (typisk 4-5 cifre) — over uger/måneder, eller fra flere IP'er, er det ikke urealistisk at ramme det rigtige nummer |
| Nogen der har legitim adgang til bookingnummeret et ANDET sted (fx en kollega med adgang til TravelWire/booking-systemet, en medrejsende, en tidligere medarbejder) kan bruge det som unlock-kode uden at have fået det tiltænkt som en hemmelighed | **Nej — dette er strukturelt** | booking_no er ikke designet til at være hemmeligt; det er et forretnings-id, kendt af flere parter end blot kunden |
| Kompromitteret kode kan roteres/nulstilles uden at ændre kundens rigtige booking | **Nej** | Der findes ingen adgangskode adskilt fra booking_no — at "nulstille koden" betyder i praksis at ændre kundens faktiske bookingnummer i kildesystemet, hvilket ikke giver mening operationelt |
| Rejseplanens indhold er højrisiko-data (betalingskort, pas) | **N/A — det er det ikke** | Data er navn, rejseplan, hotelinfo — personoplysninger der skal beskyttes efter GDPR, men ikke finansielle akkreditiver |

**Konklusion:** Den reelle svaghed er ikke "enhver kan gætte sig ind." Den er (a)
booking_no er strukturelt ikke en hemmelighed — den er kendt/kendelig af flere end
kunden — og (b) der er ingen rotations-/nulstillingsvej hvis en kode først er
kompromitteret eller delt forkert. Det er en reel, om end lav-til-moderat, risiko —
ikke en kritisk sårbarhed, og bestemt ikke sikkerhedsteater at adressere den heller.

## 4. Model A — behold `booking_no` som unlock-kode

**Beskrivelse:** Ingen ændring. Status quo som beskrevet i §2.

| | |
|---|---|
| Simplicity | Højeste. Nul migrationsarbejde, nul ny UX, nul ny supportvej. |
| Nuværende UX | Kunden kender allerede sit bookingnummer fra bekræftelsesmailen — ingen ny ting at huske. |
| Risiko | Se §3: struktureldelt "hemmelighed", ingen rotation. Lav-til-moderat i praksis pga. slug'ens entropi og rate-limit, men strukturelt uelegant. |
| Hvad rate-limit reelt beskytter imod | Automatiseret/hurtig brute-force af koden fra én IP — ikke langsom, distribueret, eller "kendte det i forvejen"-adgang. |
| Rotation ved mistanke om lækage | Ingen reel vej uden at ændre selve bookingnummeret i kildesystemet (TravelWire) — upraktisk og forretningsmæssigt forkert. |

**Når det er det rigtige valg:** hvis Ricko vurderer at risikoen i §3 er acceptabel for
produktets nuværende brug (interne rejseplaner, ikke betalingsflow), og at
implementeringsomkostningen ved Model B ikke er værd det lige nu.

## 5. Model B — separat, tilfældig `access_code` pr. trip

**Beskrivelse:** Et nyt felt, `trips.access_code`, uafhængigt af `booking_no`. Kunden
låser op med access_code i stedet for booking_no. `booking_no` forbliver
forretnings-matchnøglen (Analytics Bridge, support, TravelWire) — den holder helt op
med at være en credential.

### Generering
Kort, menneske-indtastelig, tilfældig streng — fx 6-8 cifre (samme "indtast fra en
mail"-UX som i dag, `inputMode="numeric"` i `AccessGate.tsx` kan genbruges uændret)
eller en base32/Crockford-streng uden forvekslelige tegn (0/O, 1/I/l) hvis alfanumerisk
foretrækkes for højere entropi ved samme længde. Genereres server-side med
`crypto.randomBytes`, ALDRIG afledt af booking_no/slug/destination.

### Storage: en reel sikker hash-model — ikke "SHA-256 + fast salt"

I dag ligger `booking_no` i klartekst i `trips`, fordi det i forvejen er et synligt
forretningsfelt. Et dedikeret `access_code` bør **hashes**, netop fordi dets ENESTE
formål er at være en hemmelighed. Men et tidligere udkast af dette dokument foreslog
"SHA-256 med et lille fast salt" — det er **utilstrækkeligt** og er rettet her:
en 6-8-cifret/tegns kode har lav entropi (10⁶-10⁸ muligheder), og en almindelig,
hurtig hash-funktion som SHA-256 kan beregnes **milliarder af gange i sekundet** på
almindelig hardware (GPU/ASIC). Et fast/lille salt forhindrer kun præ-beregnede
rainbow-tables på tværs af rækker — det gør INTET ved den reelle trussel: en
angriber med en kopi af databasen (læk, fejlkonfigureret RLS, forladt backup) kan
brute-force hele koderummet **offline, pr. række,** på sekunder til minutter. Salt
alene løser ikke et lav-entropi-problem; det kræver enten en langsom/memory-hard
KDF, eller et separat hemmeligt input hashen ikke virker uden.

> **Navngivning:** for at undgå kollision med produktmodellerne (Model A/B/C,
> §4-§6) hedder de to storage-tilgange nedenfor **"Storage-strategi 1"** og
> **"Storage-strategi 2"** — de er begge implementationsdetaljer UNDER Model B,
> ikke separate produktmodeller.

**Anbefalet retning: Storage-strategi 1 — scrypt med per-record salt.**
Konkret: Node's indbyggede `node:crypto`-modul har `scrypt`/`scryptSync`
(memory-hard, tunbar cost-parameter) — **ingen ny dependency**, ingen native
binding at kompilere på Vercels serverless-runtime (i modsætning til `bcrypt`,
som kræver en native `.node`-binding, eller `argon2`, som har tilsvarende
kompileringsafhængigheder — begge kan være skrøbelige i et serverless-build-miljø).
Repoet bruger allerede `node:crypto` direkte flere steder (`randomBytes`,
`createHmac`, `timingSafeEqual` i `src/lib/analytics-bridge.ts`) — samme
værktøjskasse, ingen ny afhængighed at vedligeholde/opdatere/patch'e.

Skitse (til en fremtidig implementation, ikke skrevet her). **Async `scrypt`,
ikke `scryptSync`**, i selve request-pathen (unlock-action, sidevisning): scrypt
er bevidst CPU-/memory-hård — kørt synkront ville den blokere Node's event loop
under hvert unlock-/verifikations-kald og dermed forsinke *alle* andre
samtidige requests på samme serverless-instans. Den async variant frigiver
event loopet mens KDF'en arbejder:
```ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

async function hashAccessCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(code, salt, 32)) as Buffer; // cost-parametre tunes ved implementation
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyAccessCode(code: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  const derived = (await scrypt(code, Buffer.from(saltHex, "hex"), 32)) as Buffer;
  return timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
}
```
`access_code_hash` gemmer `salt:derivedKey` (begge hex) — hvert forsøg er dyrt
(memory-hard) at teste, selv med hele databasen i hånden, uden at blokere
Node-processen mens det sker.

**Alternativ, kortere diskuteret: Storage-strategi 2 — server-keyed HMAC-SHA256
med separat pepper.** `HMAC-SHA256(PEPPER_SECRET, code)`, hvor `PEPPER_SECRET` er
en ny, high-entropy server-secret (Vercel env-var, ALDRIG i databasen). Fordel:
meget billigere at beregne end scrypt (og synkron `createHmac` blokerer ikke
event loopet nævneværdigt, i modsætning til scrypt — HMAC-SHA256 er mikrosekunder,
ikke titals millisekunder), og fordi DB'en (Supabase) og pepperen (Vercel env)
lever i **forskellige systemer** i denne stack, beskytter det reelt mod et
DB-only-læk (fx en fejlkonfigureret RLS-policy eller en Supabase-side-hændelse) —
uden pepperen kan en hurtig HMAC ikke brute-forces offline af et rent DB-læk alene.
Ulempe: sikkerheden hviler nu på at ÉN ekstra secret aldrig lækker sammen med
DB'en, og det introducerer en ny secret at oprette, rotere og dokumentere
(rotation af `PEPPER_SECRET` ville kræve at rehashe ALLE eksisterende access_codes
— enten ved næste unlock, eller en batch-jobs, en driftskompleksitet
Storage-strategi 1 ikke har). **Ingen ny secret oprettes i denne PR** — nævnt kun
som en vurderet, men ikke anbefalet, alternativ retning.

**Anbefaling:** Storage-strategi 1 (async scrypt, per-record salt). Den er
sikker uafhængigt af om databasen nogensinde lækker alene, kræver ingen ny
server-secret at oprette/rotere/dokumentere, og bruger udelukkende Node's
indbyggede `crypto`-modul — ingen ny dependency, ingen native-binding-risiko på
Vercel. Den async variant undgår desuden at blokere event loopet under
unlock/sidevisning.

Ulempe fælles for begge storage-strategier: sælgeren kan ikke længere "se koden
igen" i admin — kun regenerere den (se §"Workflow/UX" nedenfor for hvad det
konkret betyder). Det er en acceptabel, endda ønskværdig, konsekvens (samme
princip som at man ikke kan se en glemt adgangskode, kun nulstille den) — men
det ER en reel ændring i sælgerens arbejdsgang ift. i dag, beskrevet konkret
nedenfor.

### Reset/rotation
En admin-handling: "Generér ny adgangskode" på trippen — overskriver hash, ugyldiggør
øjeblikkeligt evt. udestående uautoriserede kopier af den gamle kode. Løser præcis det
Model A ikke kan (§3).

### Rotation og den eksisterende 30-dages cookie — eksplicit

Cookien indeholder fortsat kundens **plaintext** access_code (samme princip som i
dag, hvor den indeholder plaintext `booking_no`) — cookies er i sagens natur noget
klienten kan læse, så der er intet at vinde ved at forsøge at "hashe cookien selv";
serveren skal under alle omstændigheder have en klartekst-værdi at verificere.

**Det server-siden gør er afgørende:** hver request der læser cookien, hasher
serveren cookiens plaintext-værdi (med det gemte salt for netop den trip) og
sammenligner mod den **AKTUELLE** `access_code_hash` i databasen — ikke mod en
værdi cachet fra unlock-tidspunktet. Det er præcis derfor rotation virker
øjeblikkeligt: regenereres koden, ændres `access_code_hash`; en gammel cookies
plaintext hasher nu til noget andet end den nye hash, og næste server-tjek
(enhver sidevisning, ikke kun et nyt unlock-forsøg) afviser den og viser
`AccessGate` igen. Det kræver ingen separat "cookie-blacklist" eller
serverside-sessionstabel — verifikation er allerede stateless pr. request, ligesom
dagens `accessCookie.value === row.booking_no`-sammenligning.

**Fremtidig designmulighed (IKKE en del af denne anbefaling, udvider ikke scope
her):** en *opaque* cookie-værdi (et tilfældigt sessionstoken, ikke selve koden i
klartekst) slået op i en separat sessions-tabel ville tillade fx at invalidere
individuelle sessioner uden at ændre selve access_code'en, og ville undgå at
sende access_code'en gentagne gange i en cookie over 30 dage. Det er en reel,
større arkitekturændring (kræver en ny tabel/RPC, en migration, og et
server-side opslag pr. request i stedet for en ren hash-sammenligning) — nævnt
her som en mulig senere forbedring, ikke foreslået implementeret nu.

### Re-upload/upsert-adfærd
`POST /admin/api/trips` upserter i dag på `booking_no` (`onConflict: "booking_no"`,
`src/app/admin/api/trips/route.ts`). Et re-upload af samme booking bør **ikke**
generere en ny access_code — kunden har allerede sit link+kode, og at ændre koden ved
hvert re-upload ville låse eksisterende kunder ude uden varsel. `access_code` sættes
derfor kun ved **insert** (ny booking_no), akkurat som `created_by` allerede gør det
i dag (se kommentaren "PAIN-2" i `trips/route.ts`).

### Gamle rejseplaner (migration/backward compatibility)
Eksisterende rows har intet `access_code`. To realistiske veje:
- **(i) Lazy backfill:** `access_code` er nullable. Er den `null`, falder
  `unlockTrip` tilbage til at sammenligne mod `booking_no` (dagens adfærd) — så en
  gammel kundes eksisterende kode ("deres bookingnummer") fortsætter med at virke
  uændret, uden en engangs-migreringskørsel eller at genudsende nye koder til
  hundredvis af gamle kunder.
- **(ii) Big-bang backfill:** generér `access_code` for alle eksisterende rows i én
  batch-migration og udsend nye koder. Kræver et kommunikations-flow til eksisterende
  kunder (mail) — markant større operationel byrde, kun relevant hvis Model A's
  risiko vurderes uacceptabel for ALLE eksisterende bookinger, ikke kun nye.

(i) er klart at foretrække medmindre Ricko vurderer at eksisterende bookinger reelt
skal have deres booking_no-baserede adgang lukket ned.

### Support-scenarier
- "Jeg har mistet min kode" → admin regenererer, sender nyt link+kode manuelt
  (samme arbejdsgang som i dag, hvor sælgeren allerede kan slå bookingnummeret op).
- "Jeg har delt mit link med en ven ved en fejl" → i dag: ingen vej at lukke adgangen
  uden at ændre selve bookingnummeret. Med Model B: regenerér koden, den delte adgang
  dør øjeblikkeligt (30-dages-cookien hos vennen bliver ugyldig ved næste
  server-tjek, da den sammenlignes mod den NYE hash).
- Cookie/flere enheder: uændret ift. i dag — cookien er stadig `trip_access_{slug}`,
  path-scopet, 30 dage. Model B ændrer KUN hvad kodeindholdet matches imod
  server-side, ikke cookie-mekanikken. (Denne kontrakt er beskrevet som en
  regressionstest i det separate, endnu ikke merged Issue #56/PR #60 — se
  bemærkningen i §2 om hvorfor dette dokument ikke forudsætter den PR.)

### Kundeflow
Identisk UX til kunden: en kode fra en mail, indtastet i samme formular. Den eneste
synlige forskel er at koden ikke længere "er" bookingnummeret — hvilket for de fleste
kunder er usynligt (de kopierer/indtaster blot det de fik i mailen).

### Sælgerens workflow — Model B er IKKE "ingen workflowændring"

**Forskellen fra i dag:** i dag findes "koden" allerede i kundens egen verden —
det ER deres bookingnummer, som de kender fra TravelWire/bekræftelsesmailen.
Sælgeren skal ikke aktivt *distribuere* en hemmelighed; den findes i forvejen hos
kunden. Med Model B er `access_code` et **helt nyt artefakt** der udelukkende
findes i Unique Travel-systemet — sælgeren SKAL nu selv sørge for at kunden
modtager den. Det er en reel, ny arbejdsgang, ikke en usynlig detalje:

- **Hvor plaintext-koden findes ved oprettelse:** vises i admin-UI'et **kun i
  responsen fra oprettelses-kaldet** (samme øjeblik trippen oprettes) — ligesom
  fx et engangs-API-nøgle-flow. Den gemmes ALDRIG i klartekst nogen steder
  bagefter (kun `access_code_hash` i databasen, jf. ovenfor).
- **Vises den kun én gang?** Ja — det er selve pointen ved at hashe den. Efter
  oprettelses-responsen er væk (siden genindlæst, browser lukket), kan koden
  ikke "slås op" igen noget sted i admin.
- **Hvad gør sælgeren hvis den ikke blev kopieret/sendt?** Kun én vej: "Generér
  ny adgangskode" (regenerering). Der er ingen "vis koden igen"-knap — det ville
  kræve at gemme den i klartekst, hvilket underminerer hele formålet med at hashe
  den. Dette SKAL være tydeligt i admin-UI'ets tekst ("Kopiér koden nu — den kan
  ikke vises igen"), ellers er der reel risiko for at en sælger mister koden
  utilsigtet og skal generere en ny, hvilket sender et andet link/kode-par end
  det kunden måske allerede har fået at vide er "på vej".
- **Resend/reset-scenarie:** hvis en kunde beder om koden igen (mistet mail,
  spam-filter), har sælgeren INGEN måde at se den gamle kode — kun regenerere.
  Det er funktionelt identisk med "nulstil adgangskode"-flows andre steder
  (`password/reset`-routen i dette repo er præcedens for netop dette mønster).
- **Normal drift uden fejl:** uploadflowet i sig selv er uændret (samme PDF-parse
  og trip-oprettelse) — men der er nu et ekstra, aktivt sælgertrin: kopiér koden
  fra oprettelses-responsen ind i den mail/besked sælgeren allerede sender til
  kunden med linket. I dag er der ikke noget automatiseret mail-udsendelsesflow
  at ændre (sælgeren sender manuelt) — men det ekstra "husk at kopiere koden
  MED, ikke kun linket"-trin er reelt, og bør fremhæves visuelt i admin (fx en
  markant kopiér-knap ved siden af link-kopiér-knappen), ikke antages
  "usynligt" for sælgeren.

### Analytics Bridge
**Upåvirket.** `booking_match_key` bliver ved med at være `HMAC-SHA256(secret,
booking_no)` — booking_no forlader aldrig sin rolle som forretnings-matchnøgle, den
holder blot op med samtidig at være en credential. Dette er eksplicit et krav fra
Issue #55 og holder under alle tre modeller i dette dokument.

### Rate-limit/audit
Uændret mekanik (`checkRateLimit`, `writeAudit`) — nøglen skifter fra "gæt et
bookingnummer" til "gæt en access_code", ellers identisk. En højere-entropi kode gør
selve rate-limit-vinduet mindre kritisk (svagere brute-force-flade i forvejen), men
ændrer ikke behovet for det.

| | |
|---|---|
| Simplicity | Moderat — én ny nullable kolonne, én hash-funktion, ét reset-endpoint. |
| Nuværende UX | Uændret for kunden. |
| Sælgerens workflow | Uploadflowet selv er uændret, men sælgeren får et nyt, aktivt trin: kopiere access_code fra oprettelses-responsen (vises kun én gang) og sende den med til kunden — se "Sælgerens workflow" ovenfor for hvorfor dette IKKE er en usynlig detalje. |
| Sikkerhedsgevinst | Fjerner den strukturelle "delt hemmelighed"-svaghed (§3); giver reel rotation/reset. |
| Rest-risiko | Stadig et 6-8-cifret/tegns codeword bag rate-limit — ikke perfekt, men markant stærkere end et forudsigeligt forretnings-id, og nu rotérbart. |
| Pris | Lille migration (nullable kolonne — se §7), ny hash-håndtering, ét nyt admin-UI-element. |

## 6. Model C — token/link-baseret adgang (kun hvis den giver reel værdi)

**Beskrivelse:** Kunden får et unikt, uigætteligt link der ALENE giver adgang — ingen
kode at indtaste. Reelt en udvidelse af slug'en til at VÆRE den fulde credential
(fjerner kode-trinnet helt), evt. med udløb/engangsbrug.

**Vurdering:** slug'en er i forvejen 48 bit tilfældig — at gøre DEN til hele
credentialen er reelt at fjerne den anden secret-komponent (§2) og stole 100 % på
at linket aldrig lækker (mail-videresendelse, link-preview-bots der "besøger"
linket og potentielt udløser et engangstoken, browserhistorik på delte computere,
referrer-lækage fra tredjeparts-sider). Det fjerner brugerens indtastning — en
reel UX-gevinst — men fjerner samtidig den ene beskyttelse der IKKE afhænger af at
linket forbliver hemmeligt.

**Hvis Model C alligevel vælges senere:** brug IKKE det nuværende 48-bit slug som
den eneste credential — 48 bit er en fornuftig styrke for en URL-komponent der
*kombineres* med noget andet (§2-§3), men er ikke en moderne magic-link-standard
når den skal stå helt alene (industripraksis for rene magic-link-tokens ligger
typisk på ≥128 bit, samme størrelsesorden som en UUID v4 eller en
`crypto.randomBytes(16+)`-streng). En fremtidig link-only-model bør derfor
generere et **separat, stærkere, dedikeret token** — ikke ophøje det eksisterende
slug til at bære hele sikkerhedsbyrden alene.

**Denne model tilføjer ikke tydelig værdi ift. Model B for dette produkt:** Model B
bevarer to uafhængige hemmeligheder (link + kode) uden at gøre kundeflowet tungere.
Token/link-modellen er relevant hvis målet var at fjerne kode-indtastning som UX-
friktion — men det er ikke et problem der er rejst nogen steder i produktets historik
(ingen ROADMAP-punkter eller kendte klager om at kodeindtastning er en barriere).
**Anbefales derfor ikke som primær vej.** Nævnt her for fuldstændighedens skyld, og
fordi det er den naturlige "næste forenkling" hvis Ricko på et tidspunkt ØNSKER at
fjerne kode-trinnet — men det er en separat, sekundær beslutning, ikke en erstatning
for at løse §3's kerneproblem.

## 7. Migrations-/release-plan (KUN som design — ingen migration skrevet her)

Skitse for Model B, i faser, uden at nogen af dem implementeres i denne PR:

- **Fase A — schema:** ny nullable kolonne `trips.access_code_hash text` (+ evt.
  `access_code_set_at timestamptz` til audit/debugging). Ingen `not null`, ingen
  default — fuldt bagudkompatibel dag ét, rører intet eksisterende.
- **Fase B — dual-read:** `unlockTrip` udvides til: er `access_code_hash` sat,
  sammenlign mod den (hash af indtastet kode); er den `null`, fald tilbage til
  dagens `code === booking_no`-sammenligning (§5, "(i) Lazy backfill"). Nye
  rejseplaner får automatisk en access_code ved oprettelse (kode-ændring i
  `POST /admin/api/trips`, kun i insert-grenen). Gamle rejseplaner fortsætter
  uændret på booking_no, indtil/hvis de eksplicit får en kode.
- **Fase C — nye rejseplaner bruger kun access_code:** når Fase B har kørt stabilt,
  kan admin-UI'et begynde at vise/fremhæve den genererede access_code som DEN
  officielle kode i kundemail-flowet (i dag er der ikke noget automatiseret
  mail-flow at ændre — sælgeren kopierer link+kode manuelt, så dette er en
  ren tekst-/UI-ændring, ikke et system-flow).
- **Fase D — gamle rejseplaner:** en bevidst, separat beslutning, IKKE en del af
  denne plan: enten (a) lade dem for evigt falde tilbage til booking_no
  (accepteret rest-risiko for historiske bookinger), eller (b) en engangs
  backfill+kommunikations-kampagne (§5, "(ii) Big-bang backfill") hvis Ricko
  vurderer at historiske bookinger også skal lukkes ned.
- **Rollback:** enhver fase kan rulles tilbage ved simpelthen at stoppe med at
  konsultere `access_code_hash` (Fase B's dual-read gør kolonnen rent additiv) —
  ingen data skal slettes eller migreres tilbage, kolonnen kan blot ignoreres igen.

## 8. Konkrete testcases for en fremtidig implementation

Uafhængigt af hvilken model der vælges, bør en implementation af Model B som minimum
dække (mekanisk, i samme stil som repoets øvrige `src/lib/*.test.ts`-suite — fx det
separate, endnu ikke merged `src/lib/trip-access.test.ts` fra Issue #56/PR #60, hvis
den er landet inden Model B implementeres):

- Korrekt access_code (efter Fase B) giver adgang; booking_no alene gør IKKE længere
  (når access_code_hash er sat).
- `null`/manglende `access_code_hash` (gammel trip) falder korrekt tilbage til
  booking_no-sammenligning.
- Forkert access_code afvises, tæller stadig mod rate-limit.
- Regenereret kode: den GAMLE kode holder øjeblikkeligt op med at virke (næste
  server-side tjek, ikke kun næste unlock-forsøg).
- Hash-sammenligning er konstant-tid (samme mønster som
  `timingSafeEqualStrings` i `src/lib/analytics-bridge.ts` fra Issue #45/PR #46).
- Re-upload af eksisterende booking_no ændrer IKKE en allerede sat access_code.
- Ny booking_no (insert) genererer altid en frisk access_code.
- `booking_match_key` (Analytics Bridge) er uændret af om access_code er sat —
  regressionstest der beviser HMAC-inputtet stadig er `booking_no`, aldrig
  `access_code`.
- Cookie-attributter (httpOnly/secure/sameSite/maxAge/path) forbliver uændrede —
  hvis Issue #56/PR #60 er merged på implementationstidspunktet, skal dens
  eksisterende `trip-access.test.ts` fortsat være grøn uden ændring.

## 9. Ricko skal beslutte

| Valg | Konsekvens |
|---|---|
| **1. Behold Model A (status quo)** | Ingen implementation nødvendig. Accepterer den strukturelle risiko i §3 som lav nok til produktets nuværende brug. |
| **2. Vælg Model B (separat access_code, hashet, rotérbar)** | Kræver Fase A+B (§7) — lille, nullable-kolonne-migration + dual-read-logik. Ingen synlig UX-ændring for kunden. Fjerner §3's strukturelle svaghed og giver reel rotation. |
| **3. Vælg Model B + Fase D nu (fuld backfill af gamle rejseplaner)** | Som 2, men inkluderer en engangs-kommunikationskampagne til eksisterende kunder — markant større operationel byrde, kun relevant hvis historiske bookinger vurderes lige så udsatte som nye. |

### Teknisk anbefaling

**Valg 2 (Model B, uden Fase D indledningsvist).** Begrundelse: §3 identificerer en
reel, strukturel svaghed (delt, ikke-rotérbar hemmelighed) — ikke en kritisk
sårbarhed, men et unødvendigt design-valg der er billigt at rette. Model B løser det
uden at ændre kundens UX og uden at kræve en stor migrering af eksisterende data
(Fase B's dual-read gør det rent additivt). Fase D (backfill af gamle rejseplaner)
bør udskydes til en separat beslutning, fordi den kræver aktiv kundekommunikation og
ikke er nødvendig for at lukke svagheden for ALLE nye rejseplaner fremadrettet.

**Pris:** lav-moderat implementeringsomkostning (én nullable kolonne, hash-håndtering,
ét admin-UI-element til regenerering), nul kundevendt UX-ændring, nul risiko for
eksisterende bookinger (de falder blot tilbage til dagens adfærd indtil de aktivt får
en kode).

Dette dokument træffer ikke beslutningen — det er Rickos, jf. Issue #55.

# TESTING — strategi og kommandoer

## Automatiske checks

```bash
npm ci                                 # ALTID først på frisk checkout (sharp er dependency)
npm test                               # vitest run — >300 tests i src/lib/*.test.ts
npm run typecheck                      # tsc --noEmit — skal være grøn før push
npm run lint                           # 0 fejl kræves; 6 kendte no-img-element-warnings er OK (PERF-3)
npm run build                          # ved ændringer i routes/config/deps (skriver .next lokalt)
node scripts/check-schema-drift.mjs    # ved alt DB-arbejde; exit 0 = ingen drift (kræver .env.local)
```

Vitest-suiten dækker bl.a. JSON-salvage/normalisering (`normalize-trip`), dato-formatering,
hotel-alternativer, room-allocations, transport-chips, destination-matching og
parse-fejl-klassificering — se `src/lib/*.test.ts`.

## Testniveau efter ændringstype

Kør ikke mere end ændringen kræver:

- **Docs-only:** ingen af ovenstående — `git diff --check` er nok.
- **Ren lib/logik** (`src/lib/*.ts`): `npm test` + `npm run typecheck`.
- **Komponent/route:** + `npm run lint` + `npm run build`.
- **DB-arbejde:** + `node scripts/check-schema-drift.mjs`.
- **Visuel ændring på kundesiden:** targeted browsermåling på de testbookinger opgaven
  navngiver — ikke hele viewport-/bookingsmatrixen, medmindre opgaven eksplicit kræver det.

## Hvornår testes hvor

- **Preview (branch-push):** al funktionel test af nye ændringer sker HER, før Rickos merge-OK.
  Kræver Vercel-login (deployment protection).
- **Production:** kun røgtest efter merge (login, én sidevisning) + ren drift (Milles billeduploads,
  rigtige præsentationer). Aldrig eksperimenter.
- ⚠️ **Preview = production-data.** Preview-deploys peger på produktions-DB og -Storage.
  En trip/destination/et billede oprettet under test er ÆGTE. Ryd op efter test (deaktivér test-trips),
  og husk: et password-skift i preview er et rigtigt password-skift.
- Rate-limit-tests (11+ forsøg) låser den fælles kontor-IP i op til 15 min — test til sidst
  eller fra andet netværk.

## Manuel testliste pr. område

**Admin generelt:** login (audit: `login_success`) · log ud/ind · forkert kode afvises.
**PDF-upload/parse:** upload TravelWire-PDF → parse-preview vises → Opret → link-boks + mail-tekst →
re-upload af samme booking varsler "opdateres" og genbruger slug. QA-siden (`/admin/qa/{slug}`)
viser råtekst vs. JSON.
**Kundeside:** `/{slug}` → AccessGate → forkert kode afvises (audit) → korrekt kode åbner →
hero/tidslinje/hoteller/pris/CTA renderer · deaktiveret trip giver not-found · manglende
billeder falder pænt tilbage (gradient / skjult galleri).
**Intro-editor:** redigér → gem → vises på kundesiden · "Gendan AI-tekst" · to faner samtidig →
409 + "Genindlæs siden"-knap · audit-rækken indeholder kun længder/fingerprints.
**Password-flow:** forkert nuværende kode afvises · korrekt skift → log ind med ny kode ·
audit `password_changed` uden kode-værdier.
**Destinations-upload:** opret destination (dublet afvises case-insensitivt) · upload stort
original-JPEG (8-15 MB) → "Behandler billede..." → WebP vises · galleri-slot · ikke-billede
afvises med klar fejl · `_staging/` er tom bagefter.
**Kundeåbning/trip_visits (Issue #65):** `src/lib/trip-visit.ts` er dækket af unit-tests
(gate-logik: env, host, bot-UA, admin-cookie).

**Production-schema-verifikation efter migration 010 (2026-09-18, read-only, ingen
writes/RPC-kald):** `public.trip_visits` findes med de seks forventede kolonner (typer,
nullability og defaults matcher migrationen), primærnøgle `trip_id`, FK til
`trips(id) on delete cascade`, RLS aktiveret (`pg_class.relrowsecurity = true`), én
policy (`service_role full access trip_visits`, `cmd=ALL`), index
`trip_visits_last_opened_idx` + PK-index, `record_trip_visit(uuid)` findes med
`prosecdef = false` (bekræfter `SECURITY INVOKER`) og `EXECUTE` kun grantet til
`service_role` (+ ejeren `postgres` — ingen `anon`/`authenticated`/`PUBLIC`). Row count:
0 (ingen kunstige testevents oprettet, ingen reel trafik endnu da koden ikke er
deployet). Selve RPC'en er stadig ALDRIG kaldt — hverken lokalt eller i production.

**Manuel smoke-test EFTER release-cutover + deploy — BESTÅET (2026-09-18):**
1. Åbn en eksisterende rejseplan som kunde med korrekt adgang.
2. Vent 1-2 minutter.
3. Verificér read-only i `trip_visits`: rækken findes for trippens `trip_id`,
   `first_opened_at`/`last_opened_at` er sat, `visit_count = 1`, `open_count >= 1`.
4. Genindlæs siden inden for 30 minutter: `visit_count` forbliver 1, `open_count` stiger.
5. Ingen synlig fejl eller ekstra latens på kundesiden under nogen af trinene.

En rigtig kundeåbning oprettede én `trip_visits`-række, og et refresh inden for
30-minutters-vinduet øgede `open_count` uden at øge `visit_count`, som forventet.

**Kundeaktivitet i admin (Issue #69):** `src/lib/trip-engagement.ts` er dækket af
unit-tests (klassifikation: visit-row → opened, ingen row + ung cutoff → not-opened,
ingen row + cutoff ≥ 12 mdr. → no-recent-data inkl. eksplicit grænsetest, read-fejl →
altid `unavailable` uanset øvrige felter, malformed visit-data → `unavailable` frem for
en falsk kundeadfærd-påstand) samt dansk Europe/Copenhagen-formatering (sommer-/vintertid
testet separat). Klassifikationen er desuden sanity-tjekket read-only mod den ene rigtige
`trip_visits`-række i production (fra smoketesten ovenfor) og gav korrekt "1 besøg" /
"Senest 18/09 14:33".

**Manuel smoke-test efter merge/deploy af Issue #69-PR'en (PR #70 — merget/deployet,
UI-smoketest UDSAT: Ricko kan ikke teste lige nu, kendt driftsopfølgning, ikke en
blocker):**
1. Åbn **Alle præsentationer**: den rejseplan der allerede har en `trip_visits`-række
   viser "1 besøg" + korrekt "Senest …"-tidspunkt (dansk lokal tid).
2. Åbn dens trip-detaljeside: "Første åbning", "Senest set" og "Besøg" matcher databasen.
3. Åbn en anden, aldrig-besøgt rejseplan: adminlisten/detaljesiden viser "Ikke åbnet endnu".
4. Bekræft at admin fortsat fungerer og viser "Aktivitet kunne ikke hentes" (ikke "Ikke
   åbnet endnu") hvis `trip_visits`-opslaget kunstigt får lov at fejle (fx midlertidig
   RLS-/netværksfejl) — ikke noget der skal fremprovokeres i production, kun noteret som
   forventet adfærd.

**Sektionsengagement (Issue #71):** `src/lib/section-engagement.ts` er dækket af
unit-tests: section-enum (kun de fem gyldige værdier, inkl. Zod-body-schema'et delt med
endpointet), eligibility pr. sektion (tom itinerary/galleri/hoteller → ikke eligible,
price altid eligible, contact uden rådgiver-email → ikke eligible), gaten
(`shouldRecordSectionEngagement`: preview/ikke-kanonisk-host/bot/admin-cookie → no write,
canonical production + kundeadgang → allowed), dwell-state-machinen
(`dwellReducer`: enter+timeout → qualify, leave før dwell → cancel, re-enter → kan
kvalificere senere, en forsinket timeout efter leave kvalificerer IKKE, "qualified" er et
slutstadie), dedup (`shouldSendSection`: samme sektion højst én gang, fem forskellige kan
alle sendes, det eksplicitte femsektioners-loft), og admin-visningen
(`buildSectionEngagementDisplay`: seen/ikke-seen pr. eligible sektion, ineligible sektioner
udelades helt, read-fejl → `unavailable`, malformed/ukendt section i en række ignoreres
uden at gøre hele visningen utilgængelig). `src/lib/section-engagement-write.ts`s
`describeRecordSectionEngagementOutcome()` er dækket separat (samme mønster som Fase 1B's
`describeRecordTripVisitOutcome`).

**Endpoint-orkestreringen (`src/lib/section-engagement-endpoint.test.ts`, review-fund PR
#72):** `route.ts` er en tynd adapter over `handleSectionEngagement()`, så testene kører den
FAKTISKE sikkerhedskæde (body → trip + adgang → gate → server-side eligibility → skrivning)
med en spion på skrivningen. Cases: (A) manglende trip → ingen write; (B) manglende/forkert
adgangscookie → ingen write, og samme svar som manglende trip (ingen oracle); (C) preview/
ikke-kanonisk host → ingen write; (D) admin auth-cookie → ingen write; (E) bot/tom UA →
ingen write; (F) gyldig adgang + gyldig enum men ineligible sektion (contact uden
advisorEmail, itinerary/hotels uden indhold, gallery tomt eller kun tomme URL'er, ikke-
parsebar trip-data) → `204`, ingen write, og gate-afvisning sker før galleri-opslaget; (G)
gyldigt kald → præcis ét write med SERVER-afledt `trip.id` + valideret section (alle fem
sektioner), `price` altid eligible, et ekstra `trip_id` i body → 400 og intet skrives,
DB-fejl → 500 med ét forsøg. Dertil `computeEligibleSectionsForTrip` (samme funktion som
kundesiden). Kontrolleret ved mutation: fjernes eligibility-tjekket, fejler 6 tests.

**Migration 011 — grants/RLS/RPC kørt mod lokal in-memory Postgres (pglite, uden for
repoet), ikke kun læst:** roller `anon`/`authenticated`/`service_role` + Supabase-lignende
default ACL (auto-ALL på nye public-tabeller) oprettes, migrationen køres to gange
(idempotens), og bagefter verificeres: PUBLIC/anon/authenticated har INGEN table privileges,
`service_role` har præcis SELECT/INSERT/UPDATE, RLS enabled + policy bevaret, RPC
`SECURITY INVOKER` med EXECUTE kun til `service_role`, RPC-INSERT + ON CONFLICT-UPDATE
virker som `service_role` (`first_seen_at` uændret, `last_seen_at` rykker frem), DELETE/
TRUNCATE afvist for `service_role`, SELECT/INSERT/RPC afvist for anon/authenticated, og
`ON DELETE CASCADE` fjerner rækken uden at `service_role` har DELETE (24/24). Det var en
lokal pre-release-kørsel, ikke en production-kørsel. Selve production-migrationen
(`20260918184105_trip_section_engagement`) blev bagefter kørt af ChatGPT efter Rickos
godkendelse og verificeret read-only mod den levende database (samme grants/RLS/RPC-
egenskaber; 0 rækker; ingen syntetiske engagement-events skrevet). Schema-baseline er
opdateret efter live-kørslen, og live-kommentarer + RPC-krop er kontrolleret identiske med
migrationsfilen.

**Ikke unit-testet direkte (dokumenteret, bevidst):**
- `SectionEngagementTracker.tsx` selv (browser-`IntersectionObserver`/`fetch`) — bevidst
  holdt tynd, al beslutningslogik er udtrukket til `dwellReducer`/`shouldSendSection`
  ovenfor, jf. Issue #71's egen anbefaling ("IntersectionObserver er besværlig at
  unit-teste direkte").
- `src/app/[bookingId]/engagement/route.ts` selv (Next.js Request/cookies()/headers()) —
  route-filen er ren I/O-adapter (læs request, lever deps, oversæt status). Al
  beslutningslogik lever i `handleSectionEngagement()`, som route.ts kalder og som er
  testet ovenfor. Ingen eksisterende route-handler i dette repo mockes direkte i tests, og
  vitest har ingen `@/`-alias-opsætning (samme etablerede mønster som `/admin/api/trips`).
- `supabase/011_trip_section_engagement.sql`s RPC-adfærd (`ON CONFLICT`-grenen) mod den
  LEVENDE database — kun kørt lokalt (pglite, se ovenfor). Production har kun fået skemaet
  (0 rækker); der er bevidst IKKE skrevet syntetiske engagement-rækker dér.

**Manuel smoke-test efter en eventuel senere migration + merge/deploy af Issue #71-PR'en
(plan, IKKE udført — ingen kunstige section-engagement-events må oprettes):**
1. Åbn en rejseplan med alle fem sektioner som kunde med korrekt adgang, scroll roligt
   hele siden igennem (dvæl et par sekunder pr. sektion).
2. Verificér read-only i `trip_section_engagement`: op til fem rækker for trippens
   `trip_id`, én pr. besøgt sektion, `first_seen_at`/`last_seen_at` sat fornuftigt.
3. Åbn dens trip-detaljeside i admin: "Set i rejseplanen" viser ✓ for de besøgte,
   eligible sektioner.
4. Åbn en rejseplan uden galleri/hoteller: "Set i rejseplanen" viser ALDRIG en linje for
   de ikke-eligible sektioner.
5. Genindlæs siden: samme sektioner sendes igen (dedup er kun pr. page load) —
   `last_seen_at` opdateres, `first_seen_at` og `visit_count`-lignende semantik ændres ikke.
6. Ingen synlig fejl eller mærkbar ekstra latens på kundesiden under nogen af trinene.

**Kontakt-intent (Issue #73):** fire nye testfiler, alle uden browser/DB.
- `src/lib/contact-intent.test.ts` (rene logik): kanal-enum (kun `email`/`phone`; `#kontakt`-
  navigation, `sms` m.fl. afvises), strict body-schema (ekstra nøgler som `trip_id`/`booking_no`/
  `source` ⇒ afvist), server-eligibility (email kun med `advisorEmail`, phone altid), gaten
  (`shouldRecordContactIntent`: preview/ikke-kanonisk host/bot/admin-cookie ⇒ no write), dedup
  (`shouldSendChannel`: samme kanal højst én gang, email + phone begge, frisk Set sender igen) og
  admin-visningen (`buildContactIntentDisplay`: phone/email seen/unseen, ineligible email udelades
  — også med en gammel række, read-fejl ⇒ `unavailable` aldrig "ikke klikket", ukendt/malformed
  channel ignoreres, ugyldigt tidsstempel crasher ikke, telefon vises før email).
- `src/lib/contact-intent-endpoint.test.ts` (**security-orkestrering**): `route.ts` er en tynd
  adapter over `handleContactIntent()`, så testene kører den FAKTISKE kæde med en spion på
  skrivningen. (A) manglende/inaktiv trip; (B) manglende/forkert adgang — samme svar som manglende
  trip, og en gyldig cookie til slug A kan ikke skrive for slug B; (C) preview/ikke-kanonisk
  host; (D) admin auth-cookie; (E) bot/tom UA — alle ⇒ ingen write; (F) email uden `advisorEmail`
  (null/tom/mangler) og ikke-parsebar trip-data ⇒ `204`, ingen write; (G) phone ⇒ præcis ét write
  med SERVER-afledt `trip.id` (også uden `advisorEmail`); (H) eligible email ⇒ præcis ét write;
  (I) ekstra `trip_id` i body / ugyldig body ⇒ `400` uden trip-opslag og uden write; (J) RPC-fejl/
  timeout ⇒ `500` med præcis ét forsøg (ingen retry).
- `src/lib/contact-intent-client.test.ts` (klik-logik + komponent-kontrakter):
  `trackContactIntent()` — email-/phone-klik sender den rigtige kanal (body kun `{ channel }`,
  POST, same-origin, `keepalive: true`, URL `/<slug>/intent`), dedup pr. page load, begge kanaler
  kan sendes, frisk Set sender igen, afvist/synkront kastet fetch ⇒ ingen throw og ingen retry,
  afventer aldrig serversvaret. Dertil en **statisk scan** af de faktiske kildefiler (der er ingen
  component-test-opsætning, og wrapperen er ekstremt tynd): `ContactIntentLink` har ingen
  `preventDefault`/`stopPropagation`/`await`/storage/cookie og er et almindeligt `<a href>`;
  `ContactCTA` har præcis email + phone som tracked links og ingen "rå" `<a>`; `ActionBar` har
  præcis ét tracked link ("Ring", `tel:+4559498630`), mens "Kontakt os" → `#kontakt` er et
  UNTRACKED almindeligt `<a>`.
- `src/lib/contact-intent-write.test.ts`: `describeRecordContactIntentOutcome` (samme mønster som
  Fase 2).
Kontrolleret ved mutation (hver ændring fælder tests): server-eligibility fjernet, gate fjernet,
adgangstjek fjernet, `preventDefault` tilføjet, "Kontakt os" gjort tracked, `.strict()` fjernet,
dedup-markering fjernet.

**Kontakt-intent — review-rettelser på PR #74 (`src/lib/contact-intent-trip.test.ts`, 39 tests):**
- (A) `resolveContactChannels` — valid trip + advisorEmail ⇒ email + phone; valid uden advisorEmail (null/
  undefined/tom/mangler) ⇒ kun phone; malformed trip-data (null, streng, tal, array, itinerary/hotels ikke
  array, ukendt itinerary-type, ikke-streng advisorEmail) ⇒ `null` — aldrig en tom liste; kaster aldrig.
- (B) Malformed trip-data + DB-læsning OK ⇒ `unassessable`, ingen phone/email-tilstand overhovedet (heller
  ikke "—"), også med en klik-række til stede; read-fejl har forrang (`unavailable`).
- (C) **Paritet:** for valid/malformed data giver admin-eligibility og `handleContactIntent()` (spion på
  skrivningen) præcis samme svar pr. kanal — én runtime-sandhed.
- (D) `CONTACT_INTENT_TRACKING_SINCE` er `null` ELLER en fast UTC-streng senere end Fase 1B's
  `TRACKING_SINCE`, aldrig genbrugt.
- (E) No-row-semantik: `buildContactIntentTrackingNote` uden dato ⇒ ingen konkret dato/årstal; med dato ⇒
  "Kontaktklik måles fra …" (dansk format); uparsebar dato ⇒ dato-løs tekst; nævner aldrig Fase 1B's dato.
- (F) Statisk scan af admin-filerne: `page.tsx` bruger `resolveContactChannels(row.data)` og ikke
  `computeEligibleChannels`; `TripDetail` label'er Fase 1B's dato "Åbningsmåling fra" (ingen uscopet
  "Måling fra"); Kontakt-intent-blokken bruger `CONTACT_INTENT_TRACKING_SINCE` og aldrig `TRACKING_SINCE`;
  "kunne ikke vurderes" og "kunne ikke hentes" er begge til stede.
Kontrolleret ved mutation (hver ændring fælder tests): parse-fejl ⇒ `[]` i stedet for `null`,
unassessable-gren fjernet, admin tilbage til rå `row.data`, uscopet "Måling fra", kontakt-blok på Fase 1B's
dato, falsk dato før cutover, endpoint ignorerer runtime-eligibility.

**Migration 012 — kørt mod lokal in-memory Postgres (pglite, uden for repoet), ikke kun læst:**
roller `anon`/`authenticated`/`service_role` + Supabase-lignende default ACL (auto-ALL) oprettes,
migrationen køres to gange (idempotens), og verificeres: præcis de fire kolonner, ingen
`click_count`/identifikator-kolonner, PK `(trip_id, channel)`, FK cascade, CHECK (`email`/`phone`),
PUBLIC/anon/authenticated uden table privileges, `service_role` præcis SELECT/INSERT/UPDATE, RLS +
én service_role-policy, RPC `SECURITY INVOKER`/`VOLATILE`/`search_path = public, pg_catalog`/ét
`clock_timestamp()`, EXECUTE kun for `service_role`, `first_clicked_at` uændret over mange kald,
`last_clicked_at` rykker frem og går aldrig baglæns (`greatest`), mange klik ⇒ stadig præcis 2
rækker pr. trip, ugyldig channel/`kontakt`/en tredje kanal/dublet/ukendt trip afvist,
DELETE/TRUNCATE afvist for `service_role`, SELECT/INSERT/UPDATE/RPC afvist for anon/authenticated,
og cascade uden `service_role` DELETE (45/45). **IKKE en kørsel mod production** — migrationen er
ikke kørt live, og `schema-baseline.json` er ikke opdateret.

**Manuel smoke-test efter migration 012 + merge/deploy af Issue #73-PR'en (plan, IKKE udført —
ingen kunstige contact-intent-events må oprettes):**
1. Åbn en rejseplan med rådgiver-email som kunde med korrekt adgang; klik "Ring" (mobil) og/eller
   rådgiverens telefonlink og mail-kortet. Telefon-/mailappen åbner som normalt (ingen forsinkelse).
2. Verificér read-only i `trip_contact_intent`: højst to rækker for trippens `trip_id` (én pr.
   brugt kanal), `first_clicked_at`/`last_clicked_at` sat.
3. Klik "Kontakt os" (→ `#kontakt`): INGEN ny række (kun intern navigation).
4. Admin: trip-detaljesiden viser "Kontakt-intent" med ✓ + "Senest klikket …" for de brugte
   kanaler, adskilt fra "Set i rejseplanen".
5. Rejseplan uden `advisorEmail`: "Email klikket" vises slet ikke. En trip med malformed data viser
   "Kontaktaktivitet kunne ikke vurderes" — aldrig "Telefon klikket —".
6. Genindlæs og klik igen: `last_clicked_at` opdateres, `first_clicked_at` er uændret.

## Efter enhver testrunde

Rapportér resultater ærligt (også røde), opdatér `docs/STATUS.md`, og ryd test-data op.

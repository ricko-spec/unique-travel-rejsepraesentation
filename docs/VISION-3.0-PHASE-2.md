# Vision 3.0 Fase 2 — sektionsengagement end-to-end (Issue #71)

Kort referencedokument. Kildekoden selv (kommentarer i hver fil) er den detaljerede
sandhed; dette dokument giver overblikket og de beslutninger der går på tværs af filer.
GitHub (Issue #71, PR) er stadig source of truth ved konflikt.

## Hvad Fase 2 svarer på

Fase 1B/1C (Issue #65/#69, live) svarer på *om* og *hvor ofte* rejseplanen er åbnet.
Fase 2 svarer på: **nåede kunden faktisk frem til disse fem hovedafsnit?**

| Section (DB/enum) | DOM-anker | Eligibility |
|---|---|---|
| `itinerary` | `#rejseplan` | `trip.itinerary.length > 0` |
| `gallery` | `#billeder` | `filterGalleryImages(galleryImages).length > 0` |
| `hotels` | `#hoteller` | `trip.hotels.length > 0` |
| `price` | `#pris` | altid (sektionen har sin egen legitime tom-tilstand) |
| `contact` | `#kontakt` | `hasContact` (samme betingelse som `ContactCTA` selv renderer på) |

**Ikke i scope:** intro (allerede dækket af Fase 1B's åbningsregistrering), kontaktklik/
telefon/email-klik, hotel-link-klik, expand/collapse, billedklik, scrollprocent, heatmaps.
Det er Fase 3/4.

## Datamodel

`public.trip_section_engagement` (migration 011, **ikke kørt i production** — se
Release-rækkefølge nedenfor):

```sql
trip_id        uuid        not null references public.trips(id) on delete cascade
section        text        not null check (section in ('itinerary','gallery','hotels','price','contact'))
first_seen_at  timestamptz not null default now()
last_seen_at   timestamptz not null default now()
primary key (trip_id, section)
```

Højst **fem rækker pr. trip** — en aggregeret milestone-tabel, ikke en rå eventlog. Ingen
`view_count`. Ingen cookie/session-id/page-load-id/IP/User-Agent/scroll-position. Samme
Model B-præmis som `trip_visits` (Fase 1B).

Skrives udelukkende via `record_trip_section_engagement(p_trip_id uuid, p_section text)`
— PL/pgSQL, `security invoker`, ét `clock_timestamp()`-kald pr. kald, atomar
`INSERT ... ON CONFLICT DO UPDATE`, `first_seen_at` uændret på konfliktgrenen,
`last_seen_at = greatest(eksisterende, nyt)`. Nøjagtig samme race-/ur-mønster som
`record_trip_visit` (migration 010, to gange reviewet på PR #66) — se den fulde
begrundelse i `supabase/011_trip_section_engagement.sql`. `EXECUTE`: kun `service_role`.

## Hvorfor `supabase/011_trip_section_engagement.sql`, ikke `supabase migration new`

Overvejet og forkastet: Supabase CLI'et er installeret og virker teknisk i dette repo
(`supabase migration new` kører uden fejl selv uden en `supabase/config.toml`), men repoet
har aldrig brugt CLI'ets `supabase/migrations/`-mappe — alle ti eksisterende migrationer
(001-010b) er flade, manuelt nummererede filer, dokumenteret i `supabase/README.md`. At
introducere en parallel mappestruktur nu ville splitte migrationshistorikken uden fordel.
"011" er det deterministisk næste tal i den etablerede sekvens, ikke et gæt.

## Write-endpoint: `POST /[bookingId]/engagement`

**Bevidst IKKE under `/api/…`:** adgangscookien (`trip_access_<slug>`,
`src/lib/trip-access.ts`) er scoped til `path=/<slug>`. Et endpoint under `/api/…` ville
simpelthen ikke modtage den. Ruten er nested under den eksisterende `[bookingId]`-mappe,
så den arver samme path-præfiks.

Kontrakt:

| Situation | Svar |
|---|---|
| Ugyldig/ukendt body (`section` uden for de fem, ekstra nøgler, malformed JSON) | `400` |
| Trip findes ikke/er inaktiv, ELLER adgangscookien er forkert/mangler | `404` (bevidst samme svar for begge — se nedenfor) |
| Gate afviser (ikke production, ikke kanonisk host, bot, eller admin-auth-cookie) | `204`, ingen DB-skrivning |
| Gyldigt, gate godkender, skrivning lykkes | `204` |
| Gyldigt, gate godkender, DB-skrivning fejler | `500` (klienten ignorerer dette fuldstændigt) |

**Hvorfor 404 for både "trip findes ikke" og "forkert/manglende adgang":** dette er et
maskin-endpoint uden nogen UX-grund til at lade en klient skelne "dette slug findes slet
ikke" fra "dette slug findes, men koden er forkert" — at kunne skelne dem ville gøre
endpointet til en slug-/adgangs-oracle. Kundens `page.tsx` skelner derimod bevidst (den
skal vise `AccessGate`-formularen for en reel, aktiv trip) — det er en anden,
menneskevendt kontekst.

**Gate:** samme fire betingelser som Fase 1B (`VERCEL_ENV === "production"`, kanonisk
host, ikke-bot, ingen admin-auth-cookie) — men en NY, selvstændig funktion
(`shouldRecordSectionEngagement`, `src/lib/section-engagement.ts`), der genbruger de
underliggende primitiver fra `trip-visit.ts` uden at røre selve Fase 1B-filen (scope
guardrail i Issue #71: "ændring af Fase 1B's ... logik" er ikke i denne PR).

**Body:** `{ section: SectionId }`, `.strict()` — en ekstra nøgle som et forsøgt `trip_id`
afvises frem for at blive ignoreret. `trip_id` kan strukturelt aldrig sendes af klienten;
det udledes udelukkende server-side fra slug'en i URL'en.

## Klient: `SectionEngagementTracker`

Én generisk `"use client"`-komponent, monteret i `src/app/[bookingId]/page.tsx` med de
allerede eligibility-filtrerede sektioner som prop (samme mønster som `ProgressNav`).
Renderer intet (`return null`), ændrer intet ved de fem sektioners eget design.

**"Set"-regel:** kontinuerlig synlighed ét sted i viewportet i ≥750 ms — IKKE et krav om
at en bestemt procentdel af sektionen skal være synlig, og IKKE `ProgressNav`s smalle
trigger-bånd (`rootMargin: "-25% 0px -55% 0px"`). Det bånd løser et andet problem (hvilken
ÉN sektion er lige nu mest fremtrædende) og kræver derfor et separat
"er-brugeren-ved-bunden"-værn, fordi den sidste sektion (typisk KONTAKT) ofte ikke har nok
scroll-plads bagved sig til at nå ind i et bånd midt i viewportet.

Sektionsengagement er et andet problem — "er DENNE sektion, uafhængigt af de andre, set i
et meningsfuldt stykke tid" — løst med `IntersectionObserver`s egne DEFAULTS (hele
viewportet som root, `threshold: 0`, intet rootMargin-krympe): en meget høj sektion
(Timeline) er kontinuerligt delvist synlig i hele scroll-forløbet igennem den; en kort
sektion nær bunden (KONTAKT) tæller som synlig så snart en hvilken som helst del af den
entrer viewportet — inklusive når den til sidst "sidder fast" nederst, fordi siden ikke
kan scrolle længere. Intet separat bund-af-siden-værn nødvendigt. Selve
"hurtigt-scroll-forbi tæller ikke"-kravet varetages udelukkende af 750 ms-dwell-timeren,
ikke af synligheds-definitionens generøsitet.

Selve state-overgangene er en ren, testet reducer (`dwellReducer`,
`src/lib/section-engagement.ts`): `idle -> pending (enter) -> qualified (timeout)`, med
`leave` fra `pending` tilbage til `idle` (cancel). Komponenten selv er en tynd wrapper der
oversætter rigtige `IntersectionObserver`/`setTimeout`-hændelser til reducer-actions.

**Dedup:** udelukkende en in-memory `Set<SectionId>` (`shouldSendSection`) — ingen cookie,
localStorage eller sessionStorage. Et refresh sender sektionen igen; DB'en opdaterer blot
`last_seen_at` (aldrig `first_seen_at`).

**Fail-open:** fetch er `fire-and-forget` (aldrig `await`et af kalderen), fejl fanges i et
tomt `.catch()` — ingen fejl-UI, ingen retry, ingen global fejltilstand. Loftet på fem
writes pr. page load er strukturelt garanteret (kun fem sections findes) og desuden
eksplicit håndhævet i `shouldSendSection`.

## Admin-visning: "Set i rejseplanen"

Udvider det eksisterende "Kundeaktivitet"-kort på `/admin/trips/[id]` (Issue #69) — ingen
ny admin-side, ingen nye kolonner på **Alle præsentationer** (det er Fase 4). Kun
ELIGIBLE sektioner vises nogensinde; en trip uden galleri viser aldrig en "Billeder —"-
linje. Data hentes server-side (parallelt med de øvrige opslag på siden) og mappes gennem
`buildSectionEngagementDisplay()` til en af to tilstande: `available` (med en liste af
`{ section, seen, lastSeenAt }` for hver eligible sektion) eller `unavailable` — sidstnævnte
hvis ENTEN `trip_section_engagement`-opslaget eller det destinations-opslag
galleri-eligibility afhænger af, fejler. Aldrig et falsk minus.

## Transparens

Fase 1B's linje i `AccessGate.tsx` dækkede kun selve åbningen. Opdateret til:

> Vi registrerer, når rejseplanen åbnes, og hvilke hovedafsnit der ses, så din
> rejserådgiver bedre kan følge op på tilbuddet.

Ingen cookie-banner, ingen ny cookie, ingen ny checkbox. Faktuel dokumentation her, ingen
juridisk konklusion: formålet er salgsopfølgning, dataen er trip-baseret (ikke
person-/enhedsbaseret), og der tilføjes ingen ny klient-identifikator af nogen art.

## Retention

**Ikke aktiveret i denne PR.** `trip_section_engagement` har højst fem rækker pr. trip —
intet teknisk lagringspres. Om/hvornår en retention-politik indføres (fx samme
12-måneders-vindue som `trip_visits`) er en separat, fremtidig release-/policy-beslutning,
der kræver Rickos eksplicitte godkendelse, akkurat som `010b_trip_visits_retention.sql`.
Ingen ny `010c`/pg_cron-fil er oprettet i denne PR.

## Release-rækkefølge (samme mønster som migration 010/Issue #65)

1. Implementér branch + migration + kode + tests + docs — **denne PR**.
2. ChatGPT architecture/security-review af PR'en.
3. Ricko godkender KONKRET production-migration af `011_trip_section_engagement.sql`.
4. Migrationen køres, og tabel/RLS/policy/CHECK/RPC-grants verificeres read-only.
5. `node scripts/check-schema-drift.mjs --update-baseline` køres, og den opdaterede
   `schema-baseline.json` committes — **kun efter** migrationen faktisk er kørt.
6. Alle checks + Vercel preview køres igen.
7. ChatGPT final HEAD-review.
8. Rickos eksplicitte merge-godkendelse.
9. Merge/deploy.
10. Production-smoketest med en rigtig kundevisning (dokumenteret i `docs/TESTING.md`,
    ikke udført i denne PR).
11. Read-only DB-verifikation + admin-detaljeverifikation.

**Ingen migration eller merge sker automatisk.** `010b`/pg_cron rører intet af dette.

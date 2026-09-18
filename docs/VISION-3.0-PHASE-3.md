# Vision 3.0 Fase 3 — kontakt-intent

Issue: [#73](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/73) (barn af
[#41](https://github.com/ricko-spec/unique-travel-rejsepraesentation/issues/41)). GitHub issue + PR er
sandheden; dette dokument er den korte, operationelle reference.

Fase 2 svarer på om kunden **så** kontaktsektionen. Fase 3 svarer på om kunden **forsøgte at tage
kontakt**. SET (Fase 2) og KLIKKET (Fase 3) er to separate signaler i to separate tabeller og blandes
aldrig.

## Hvad tæller som kontakt-intent

| Kanal | Faktiske links | Tracked |
|---|---|---|
| `email` | `mailto:`-kortet i `ContactCTA` | ja |
| `phone` | rådgiverens `tel:`-link i `ContactCTA` og "Ring" i `ActionBar` (`tel:+4559498630`) | ja — begge er samme kanal, der gemmes ikke hvilken knap |
| — | "Kontakt os" i `ActionBar` (`#kontakt`) | **nej** — ren intern navigation |

## Datamodel — `supabase/012_trip_contact_intent.sql` (IKKE kørt i production)

```sql
trip_id           uuid        not null references public.trips(id) on delete cascade
channel           text        not null check (channel in ('email', 'phone'))
first_clicked_at  timestamptz not null default now()
last_clicked_at   timestamptz not null default now()
primary key (trip_id, channel)
```

Højst **to rækker pr. trip**. Ingen `click_count`, ingen rå kliklog, ingen source/surface, ingen
booking_no/slug/kundenavn/IP/User-Agent/device/viewport/referrer/cookie-/session-/page-load-id.

- **Adgang, to lag:** `REVOKE ALL` fra PUBLIC/anon/authenticated/service_role, dernæst
  `GRANT SELECT, INSERT, UPDATE` kun til `service_role` (intet DELETE — FK-kaskaden kræver det ikke);
  RLS enabled + service_role-policy som defense in depth.
- **RPC** `record_trip_contact_intent(p_trip_id uuid, p_channel text)`: PL/pgSQL, `SECURITY INVOKER`,
  `search_path = public, pg_catalog`, `volatile`, ét `clock_timestamp()`, atomar
  `INSERT ... ON CONFLICT DO UPDATE`; `first_clicked_at` ændres aldrig, `last_clicked_at =
  greatest(eksisterende, nu)`. `EXECUTE` kun for `service_role`.
- **Filnavn:** flad, nummereret fil efter repoets konvention (`012`, efter `011`) — ingen parallel
  `supabase/migrations/`-historik.

## Endpoint — `POST /[bookingId]/intent`

Under kundens egen slug-path (ikke `/api/…`), fordi `trip_access_<slug>`-cookien er scoped til
`/<slug>`. Route er en tynd adapter over `handleContactIntent()`
(`src/lib/contact-intent-endpoint.ts`) — den testede funktion ER den route.ts bruger.

Rækkefølge: **strict body** (`{ channel }`, ekstra nøgler som `trip_id` ⇒ 400, og ingen trip-opslag) →
**trip via URL-slug** (`active = true`) → **adgangscookie** (`hasValidTripAccess`; en cookie til slug A
kan aldrig validere mod slug B) → **gate** (`VERCEL_ENV === production`, kanonisk host, ikke bot, ingen
admin-auth-cookie) → **server-side eligibility** → **RPC** (server-afledt `trip.id`).

| Situation | Svar |
|---|---|
| Ugyldig body/channel (inkl. ekstra `trip_id`) | `400` |
| Trip findes ikke/er inaktiv, ELLER adgang mangler/er forkert | `404` (samme svar — ingen oracle) |
| Gate afviser (preview/ikke-kanonisk host/bot/admin) | `204`, ingen skrivning |
| Gyldig enum, men kanalen findes ikke på trippen | `204`, ingen skrivning |
| Skrevet | `204` |
| DB-fejl | `500` (klienten ignorerer det) |

**Eligibility** (`resolveContactChannels` → `computeEligibleChannels`, på `tripSchema` + `normalizeTrip`-output): `email` kun
med `advisorEmail` (samme betingelse som `ContactCTA`); `phone` altid (ActionBar har altid et
tel-link). Trip-data der ikke kan parses (kundesiden viser fejlside uden links) ⇒ ineligible.

## Klient — må aldrig forstyrre kontakthandlingen

`ContactIntentLink` er et helt almindeligt `<a href>`; `onClick` kalder kun `track()` som
side-effect. **Ingen** `preventDefault`, `stopPropagation`, `await`, loading state, fejl-UI eller retry.
Transport (`trackContactIntent`, `src/lib/contact-intent-client.ts`):
`fetch("/<slug>/intent", { method: "POST", keepalive: true, … })`, fire-and-forget med tom catch. `keepalive` er nødvendig, fordi
`mailto:`/`tel:`-navigation kan ske umiddelbart efter klikket. Body er kun `{ channel }` — aldrig
bookingnummer, slug eller trip-id.

**Dedup:** samme kanal højst én gang pr. page load, kun in-memory `Set` (ingen cookie/localStorage/
sessionStorage). Email og phone kan begge sendes. Setet ejes af `ContactIntentProvider` (monteret én
gang om kundesiden), IKKE et module-level Set: et module-level Set overlever Next.js client-side
navigation og ville dedup'e et klik i et nyt "besøg" mod et gammelt (eller mod en anden rejseplan).
Providerens Set følger komponent-træet og nulstilles desuden hvis `slug` skifter. Refresh sender igen;
DB'en opdaterer kun `last_clicked_at`.

## Sælger-visning

Ny separat blok **Kontakt-intent** i *Kundeaktivitet* på `/admin/trips/[id]` (uden for Fase 2's "Set i
rejseplanen"): "Telefon klikket" og "Email klikket" (✓ / —, med diskret "Senest klikket …" i
Europe/Copenhagen). Email vises **kun** hvis trippen har `advisorEmail`. Læsefejl ⇒ "Kontaktaktivitet
kunne ikke hentes" — aldrig et falsk "ikke klikket". Ukendt/malformed channel-række ignoreres. Ingen nye
kolonner på *Alle præsentationer* (Fase 4).

**Eligibility = samme runtime-sandhed som kunde og endpoint** (review-fund, PR #74). `trips.data` er
JSONB og ikke runtime-valideret af databasen. Admin afleder derfor kanalerne via
`resolveContactChannels(row.data)` (`src/lib/contact-intent-trip.ts`: `tripSchema.safeParse` →
`normalizeTrip` → `computeEligibleChannels`) — den SAMME funktion `handleContactIntent()` bruger. Læst som
rå JSON ville en malformed/legacy trip (hvor kundesiden viser sin fejlside uden ContactCTA/ActionBar)
stadig få “Telefon klikket —”, et falsk negativt signal. Kan trip-data ikke valideres, er eligibility
ukendt (`null`), og blokken viser **"Kontaktaktivitet kunne ikke vurderes"** — aldrig "—". Læsefejl har
forrang ("kunne ikke hentes"). En test beviser paritet mellem admin og endpoint på tværs af valid/malformed
trip-data.

## Tracking-cutover — `CONTACT_INTENT_TRACKING_SINCE`

Fase 1B's `TRACKING_SINCE` (`trip-visit.ts`) gælder **kun åbninger** (`trip_visits`) og vises nu som
**"Åbningsmåling fra …"**. Kontakt-intent har sin EGEN cutover: `CONTACT_INTENT_TRACKING_SINCE:
string | null` (`src/lib/contact-intent-tracking.ts`, en lille zod-fri fil, så admin-bundlet ikke trækker zod ind).

- **`null` indtil release-cutover** — vi kender ikke det faktiske production go-live-tidspunkt, og et
  gættet tidspunkt ville være en falsk påstand i sælger-UI'et.
- **Sættes udelukkende i den afsluttende release-cutover commit** — EFTER migration 012 er kørt i
  production og umiddelbart FØR merge/deploy — som en fast, hardkodet ISO-8601 UTC-streng (samme princip
  som Fase 1B: aldrig `Date.now()`, env-var, migrationens tidspunkt eller et DB-opslag). Release-metadata
  i kode; ingen ny DB-kolonne. Testen kræver at den er `null` ELLER en gyldig UTC-streng senere end Fase 1B's.
- **UI** (under Kontakt-intent-blokken, `buildContactIntentTrackingNote`): med dato → *"Kontaktklik måles
  fra [dato]."*; uden (før release) → *"Kontaktklik registreres fra det tidspunkt funktionen sættes i
  drift."* — ingen konkret dato før cutover.
- **No-row-semantik:** et "—" på Telefon/Email betyder KUN *"ingen registreret klik siden Fase 3-tracking
  blev sat i drift"* — aldrig historisk viden fra før funktionen fandtes, og aldrig siden Fase 1B.

## Transparens

`TRACKING_NOTICE` (delt af `AccessGate` og `Footer`) dækker nu også kontaktmuligheder: *"Vi registrerer,
når rejseplanen åbnes, hvilke hovedafsnit der ses, og når kontaktmuligheder bruges, så din rejserådgiver
bedre kan følge op på tilbuddet."* Ingen banner/modal/checkbox/cookie.

## Retention

Ikke aktiveret. `010b`/`pg_cron` er stadig ikke kørt/aktiveret. `trip_contact_intent` har højst to
rækker pr. trip (intet lagringspres); en evt. retention-politik er en separat, fremtidig
release-/policy-beslutning der kræver Rickos eksplicitte godkendelse — ikke "gem for evigt" som stiltiende
default.

## Release-rækkefølge

1. ✅ Implementering + migrationsfil + tests + docs i én PR.
2. ChatGPT architecture/security-review.
3. Rickos konkrete godkendelse af migration 012.
4. Migration 012 køres i production **før** kode-deploy, og verificeres read-only (grants, RLS, RPC,
   0 rækker). Uden tabellen fejler intet for kunden (klienten ignorerer 500), men klik registreres ikke,
   og admin viser "Kontaktaktivitet kunne ikke hentes".
5. `node scripts/check-schema-drift.mjs --update-baseline` **kun efter** migrationen er live.
6. **Release-cutover commit:** sæt `CONTACT_INTENT_TRACKING_SINCE` til det faktiske go-live-tidspunkt
   (fast ISO-8601 UTC) — først EFTER migration 012 er live og umiddelbart FØR merge/deploy. Indtil da er
   den `null`.
7. Fulde checks + Vercel.
8. ChatGPT final HEAD-review → Rickos merge-godkendelse → merge/deploy.
9. Production-smoketest når Ricko har mulighed (må ikke oprette kunstige events; udskydelse blokerer ikke merge).

## Udenfor scope (Fase 4+)

`#kontakt`-navigation som intent, `click_count`, rå eventlog, hotel-/billed-klik, timeline-interaktion,
lead score/"hot lead", cross-trip filtre/sortering/charts, notifikationer/seller alerts, email/SMS-
automation, HubSpot/Analytics Bridge, fingerprinting/IP/UA/referrer, nye cookies/storage, customer
middleware-matcher, retention-cron, `010b`/`pg_cron`.

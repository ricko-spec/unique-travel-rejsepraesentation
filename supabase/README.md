# Supabase-migrationer

Al DDL for produktionsdatabasen (Supabase-projekt `iunixfpthdftmkgpugex`, eu-west-1).
Verificeret 1:1 mod live-databasen 2026-07-20.

## Kørsel

Filerne er **idempotente** (`if not exists` / `drop ... if exists` / `or replace`) og køres
i nummerorden i [SQL Editor](https://supabase.com/dashboard/project/iunixfpthdftmkgpugex/sql/new):

| Fil | Indhold | Kørt live |
|---|---|---|
| `001_trips.sql` | trips + RLS + `set_updated_at()`-helper | 2026-05-23 (raw_pdf_text/slug-default: 2026-05-27) |
| `002_profiles.sql` | profiles + RLS + `handle_new_user`-trigger | 2026-06-02 |
| `003_destinations.sql` | destinations (billedbibliotek) + public-read RLS | 2026-05-27 |
| `004_audit_log.sql` | audit_log + indexes + RLS | 2026-06-15 |
| `005_rate_limits.sql` | rate_limits + `increment_rate_limit` RPC | 2026-06-15 |
| `006_created_by_on_trips.sql` | trips.created_by (skrives af POST /admin/api/trips siden 2026-08-04, kun i insert-grenen) | 2026-07-04 |
| `007_parse_failures.sql` | parse_failures dead-letter (koblet til parse-routen siden 2026-08-04) | 2026-07-04 |
| `008_schema_snapshot.sql` | `schema_snapshot()` RPC — grundlag for drift-tjekket | 2026-07-20 |
| `009_upload_events.sql` | upload_events — adoption/usage-log pr. sælger (Issue #38) | 2026-09-16 |
| `010_trip_visits.sql` | trip_visits + RLS + `record_trip_visit` RPC — cookie-fri visit-aggregation (Issue #65) | 2026-09-18T11:31:14Z (`20260918113114_trip_visits_usage_tracking`) — DB kun, koden er endnu ikke merget/deployet |
| `010b_trip_visits_retention.sql` | pg_cron-retention for trip_visits (12 mdr.) — bevidst separat fil | **Nej — separat, senere godkendelse (kræver evt. pg_cron-aktivering)** |
| `011_trip_section_engagement.sql` | trip_section_engagement + eksplicitte table grants + RLS + `record_trip_section_engagement` RPC — sektionsengagement (Issue #71) | 2026-09-18T18:41:05Z (`20260918184105_trip_section_engagement`) — DB kun, koden er endnu ikke merget/deployet. `schema-baseline.json` opdateret efter live-kørslen |
| `012_trip_contact_intent.sql` | trip_contact_intent + eksplicitte table grants + RLS + `record_trip_contact_intent` RPC — kontakt-intent, max 2 rækker/trip (Issue #73) | **Nej — versioneret, IKKE kørt i production (kræver Rickos særskilte godkendelse). `schema-baseline.json` er ikke opdateret** |

Derudover kræves Storage-bucket **`destinations`** (offentlige URLs) — oprettes manuelt i
Dashboard → Storage. Auth-brugere oprettes invite-only i Authentication → Add user.

## Regler

1. **Ny DDL = ny nummereret fil.** Rediger aldrig en allerede-kørt migration (undtagen
   kommentarer); næste fil hedder `013_*.sql`.
2. **Kør i Supabase-first, commit i samme ombæring.** Drift opstår når SQL køres i
   SQL Editor/MCP uden at filen lander i repoet — det var præcis hvad der skete med
   003-005 (oprettet maj-juni, først versioneret 2026-07-20).
3. Idempotens er et krav: hele mappen skal kunne køres mod en tom DB og reproducere
   produktion.
4. **Efter enhver skema-ændring:** kør migrationen live, dernæst
   `node scripts/check-schema-drift.mjs --update-baseline`, og commit migration +
   `schema-baseline.json` sammen.

## Driftsnote: parse_failures

- Koden skriver best-effort til `parse_failures` ved parse-fejl (`invalid_json`,
  `schema_mismatch`, `anthropic_error`). `max_tokens` afventer ERR-1 (backlog).
- **Oprydning:** rækker bør slettes efter 30 dage. Sættes op som separat
  Supabase-drift-opgave (pg_cron) — IKKE implementeret endnu:
  `delete from public.parse_failures where occurred_at < now() - interval '30 days';`
- **Data:** `raw_response` kan indeholde rå AI-output og kundedata fra PDF'en.
  Tabellen er intern/debug (service-role-only RLS) og må aldrig vises kundevendt.

## Driftsnote: upload_events (Issue #38)

- **Release-rækkefølge (fulgt):** migration 009 blev kørt og verificeret i production
  **FØR** kode-deploy, 2026-09-16. Parse-routen (`src/app/admin/api/parse/route.ts`) er
  fail-closed: uden `upload_events`-tabellen ville event-insertet fejle, og uploads ville
  stoppe med en fejlbesked i stedet for at fortsætte "usynligt" — derfor blev rækkefølgen
  overholdt.
- `schema-baseline.json` er opdateret til at matche (`node scripts/check-schema-drift.mjs`
  viser ingen drift).
- **Data:** ingen kundedata. Bookingnummeret gemmes kun som sha-256-hash
  (`booking_no_hash`), aldrig i klartekst. Tabellen er service-role-only (samme RLS-mønster
  som `parse_failures`/`audit_log`).
- **Historik:** de 172+ trips oprettet før denne feature backfilles IKKE til `upload_events`.
  Eksakt upload-tracking gælder fra tabellens første række — `trips.created_by` er fortsat det
  eneste (upræcise) signal for perioden før.
- **Oprydning:** ingen defineret endnu (i modsætning til `parse_failures`) — usage-data er
  forretningsstatistik, ikke debug-dead-letter, så der er ikke samme 30-dages-begrundelse.
  Tag stilling til retention hvis tabellen vokser stort.
- **Læsning til `/admin/brug`:** går udelukkende via RPC'en `usage_period_summary(period_start)`
  (defineret i samme migration), IKKE via direkte `.select()` fra klienten. Begrundelse: et
  almindeligt `.select()` kan trunkeres stille af PostgREST' standard max-rows-grænse, og en
  tidligere (forkastet) løsning med keyset-paginering på `id` viste sig usikker, fordi `id` er
  en tilfældig `gen_random_uuid()` — ikke en monoton nøgle — så et samtidigt event kunne blive
  misset. RPC'en kører som ét SQL-statement og aggregerer i ét Postgres-snapshot, hvilket
  garanterer et konsistent resultat uafhængigt af samtidige inserts. `EXECUTE` er låst til
  `service_role` (revoke fra `public`/`anon`/`authenticated`, samme mønster som
  `schema_snapshot()` i 008). Se den fulde begrundelse i kommentaren ved funktionen i
  `009_upload_events.sql` og regressionstesten i `src/lib/usage.test.ts`.

## Driftsnote: trip_visits (Issue #65)

- **Migration 010 ER KØRT og verificeret i production** — `iunixfpthdftmkgpugex`,
  migration `20260918113114_trip_visits_usage_tracking`, DB-skema-tidspunkt
  `2026-09-18T11:31:14Z`. Read-only verificeret direkte mod live-DB'en (2026-09-18):
  `trip_visits` med de seks forventede kolonner, PK `trip_id`, FK til
  `trips(id) on delete cascade`, RLS aktiveret, policy
  `service_role full access trip_visits` (`cmd=ALL`), index
  `trip_visits_last_opened_idx`, `record_trip_visit(uuid)` med `SECURITY INVOKER`
  (`prosecdef=false`) og `EXECUTE` kun til `service_role` (+ ejeren `postgres` —
  ingen `anon`/`authenticated`/`PUBLIC`). Row count: 0 — ingen kunstige testevents,
  ingen reel trafik endnu (koden er ikke merget/deployet). `schema-baseline.json` er
  opdateret til at matche (`node scripts/check-schema-drift.mjs` viser "ingen drift").
  `010b_trip_visits_retention.sql` er **ikke** kørt, og `pg_cron` er **ikke** aktiveret.
- **VIGTIG DISTINKTION:** `2026-09-18T11:31:14Z` er hvornår DB-INFRASTRUKTUREN blev
  klar — det er IKKE `TRACKING_SINCE`.
- **FASE 1B RELEASE-CUTOVER TIMESTAMP FASTLAGT.** `src/lib/trip-visit.ts`s
  `TRACKING_SINCE` er sat til `2026-09-18T12:20:18Z` (fast, hardkodet ISO-8601 UTC,
  ikke migrations-tidspunktet ovenfor) i en separat, sidste commit på PR-branchen.
  `src/lib/trip-visit.test.ts`s test er opdateret tilsvarende. **PR #66 er endnu ikke
  merget/deployet til production** — ingen live `trip_visits`-rækker forventet endnu.
  Næste gate: ChatGPT final HEAD-review, derefter Rickos endelige
  merge-godkendelse — ikke gjort endnu.
- **Retention er en separat fil** (`010b_trip_visits_retention.sql`), ikke en del af 010 —
  kræver egen godkendelse (og evt. aktivering af `pg_cron`-extensionen). `010_trip_visits.sql`
  fungerer fuldt ud uden den; rækker lever blot indtil retention aktiveres.
- **Data:** ingen booking_no, slug, kundenavn, IP eller User-Agent. Kun `trip_id` (uuid,
  FK til `trips`) + tidsstempler/tællere. Se kommentarerne i `010_trip_visits.sql` for den
  fulde never-store-liste.
- **Migrationshistorik:** efter Rickos eksplicitte godkendelse ("Kør migration 010") blev
  `010_trip_visits.sql` kørt mod production-projektet `iunixfpthdftmkgpugex`
  (migration `20260918113114_trip_visits_usage_tracking`, skema-tidspunkt
  `2026-09-18T11:31:14Z`). Efterfølgende blev tabel/RPC/RLS/grants verificeret read-only
  (se punkt ovenfor og PR #66-beskrivelsen). Ingen kunstige `trip_visits`-rækker er
  oprettet, og `record_trip_visit()` er ikke kaldt — al verifikation er read-only.

## Driftsnote: trip_contact_intent (Issue #73)

- **Migration 012 er KUN versioneret — IKKE kørt i production.** Kræver Rickos særskilte,
  eksplicitte godkendelse. `schema-baseline.json` opdateres FØRST efter en live-kørsel
  (`node scripts/check-schema-drift.mjs` viser "Ingen drift" indtil da, fordi både production og
  baseline er uden 012).
- **Release-rækkefølge:** migrationen køres FØR kode-deploy (ellers fejler skrivning/visning
  stille: klienten ignorerer 500, admin viser "Kontaktaktivitet kunne ikke hentes").
- **Data:** højst to rækker pr. trip (`email`/`phone`), kun `trip_id` + kanal + to tidsstempler.
  Ingen click_count, booking_no, slug, kundenavn, IP, User-Agent, cookie-/session-id eller
  source/surface. Se kommentarerne i `012_trip_contact_intent.sql`.
- **Retention er IKKE aktiveret** og er en separat, fremtidig release-/policy-beslutning
  (samme princip som `010b`). `010b`/`pg_cron` er stadig ikke kørt/aktiveret; max 2 rækker/trip
  giver intet teknisk lagringspres.

## Drift-tjek

```bash
node scripts/check-schema-drift.mjs                    # exit 0 = ok, 1 = drift, 2 = fejl
node scripts/check-schema-drift.mjs --update-baseline  # efter bevidst ændring
```

Scriptet kalder `schema_snapshot()` (008) og diffner mod `schema-baseline.json` —
kolonner, policies, indexes, constraints, funktioner, triggers og kommentarer.
Fandt allerede ved første kørsel en manglende trigger (`destinations_set_updated_at`)
som blev føjet til 003.

Dækker IKKE Supabase Storage bucket-config (lever i Storage-API'et, ikke i
`public`-skemaet) — det tjekkes separat:

```bash
node scripts/check-storage-drift.mjs                    # exit 0 = ok, 1 = drift, 2 = fejl
node scripts/check-storage-drift.mjs --update-baseline  # efter bevidst bucket-ændring
```

Sammenligner kun de bucket-egenskaber appen faktisk afhænger af (public-status,
file_size_limit, allowed_mime_types for bucket `destinations`) mod
`storage-baseline.json`. Read-only — kalder kun `GET /storage/v1/bucket/{name}`,
opretter/ændrer/sletter aldrig en bucket.

Manuelt alternativ — sammenlign live-DDL direkte i SQL Editor:

```sql
-- Tabeller + kolonner
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;

-- RLS-policies (forventet: 8 policies — se docs/SYSTEM-ARKITEKTUR.md §8)
select tablename, policyname, cmd, roles::text
from pg_policies where schemaname = 'public'
order by tablename, policyname;

-- Indexes
select indexname, indexdef from pg_indexes
where schemaname = 'public' order by tablename, indexname;

-- Funktioner (forventet: handle_new_user, increment_rate_limit, set_updated_at)
select p.proname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by p.proname;
```

Fuld dokumentation af datamodellen: `docs/SYSTEM-ARKITEKTUR.md` §8 + Bilag A.

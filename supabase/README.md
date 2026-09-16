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

Derudover kræves Storage-bucket **`destinations`** (offentlige URLs) — oprettes manuelt i
Dashboard → Storage. Auth-brugere oprettes invite-only i Authentication → Add user.

## Regler

1. **Ny DDL = ny nummereret fil.** Rediger aldrig en allerede-kørt migration (undtagen
   kommentarer); næste fil hedder `010_*.sql`.
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

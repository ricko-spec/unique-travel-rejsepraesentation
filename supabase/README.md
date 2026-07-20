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
| `006_created_by_on_trips.sql` | trips.created_by (sporing — kolonnen skrives endnu ikke af koden) | 2026-07-04 |
| `007_parse_failures.sql` | parse_failures dead-letter (endnu ikke koblet til koden) | 2026-07-04 |
| `008_schema_snapshot.sql` | `schema_snapshot()` RPC — grundlag for drift-tjekket | 2026-07-20 |

Derudover kræves Storage-bucket **`destinations`** (offentlige URLs) — oprettes manuelt i
Dashboard → Storage. Auth-brugere oprettes invite-only i Authentication → Add user.

## Regler

1. **Ny DDL = ny nummereret fil.** Rediger aldrig en allerede-kørt migration (undtagen
   kommentarer); næste fil hedder `009_*.sql`.
2. **Kør i Supabase-first, commit i samme ombæring.** Drift opstår når SQL køres i
   SQL Editor/MCP uden at filen lander i repoet — det var præcis hvad der skete med
   003-005 (oprettet maj-juni, først versioneret 2026-07-20).
3. Idempotens er et krav: hele mappen skal kunne køres mod en tom DB og reproducere
   produktion.
4. **Efter enhver skema-ændring:** kør migrationen live, dernæst
   `node scripts/check-schema-drift.mjs --update-baseline`, og commit migration +
   `schema-baseline.json` sammen.

## Drift-tjek

```bash
node scripts/check-schema-drift.mjs                    # exit 0 = ok, 1 = drift, 2 = fejl
node scripts/check-schema-drift.mjs --update-baseline  # efter bevidst ændring
```

Scriptet kalder `schema_snapshot()` (008) og diffner mod `schema-baseline.json` —
kolonner, policies, indexes, constraints, funktioner, triggers og kommentarer.
Fandt allerede ved første kørsel en manglende trigger (`destinations_set_updated_at`)
som blev føjet til 003.

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

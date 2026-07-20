-- ============================================================================
-- Migration 001: trips — hovedtabellen
-- ============================================================================
-- Produktions-DB: Supabase-projekt iunixfpthdftmkgpugex (eu-west-1).
-- Idempotent: kan køres gentagne gange. Kør 001→007 i rækkefølge mod en tom DB
-- for at reproducere produktion (verificeret mod live DDL 2026-07-20).
--
-- Historik: tabellen er fra initial commit (2026-05-23). raw_pdf_text og
-- slug-defaulten (tilfældig hex) kom til 2026-05-27 (QA-featuren) og er
-- foldet ind her, så 001 afspejler tabellens fulde form. created_by
-- tilføjes separat i 006 (kørt live 2026-07-04).
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  booking_no    text not null unique,
  slug          text not null unique
                  default lower(encode(extensions.gen_random_bytes(6), 'hex')),
  destination   text not null,
  customer_name text,
  data          jsonb not null,
  hero_photo    text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  raw_pdf_text  text
);

comment on column public.trips.raw_pdf_text is
  'Raw text extracted from uploaded PDF before Claude parsing. Used for admin QA comparison.';

-- Sekundære indexes (trips_slug_idx er redundant ift. unique-constraintens
-- eget index, men findes i produktion — bevaret så DDL matcher live).
create index if not exists trips_slug_idx   on public.trips (slug);
create index if not exists trips_active_idx on public.trips (active);

-- updated_at-trigger (fælles helper genbruges af 002)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trips_set_updated_at on public.trips;
create trigger trips_set_updated_at
  before update on public.trips
  for each row execute function public.set_updated_at();

-- Row Level Security
-- Service-role-nøglen bypasser RLS på Postgres-niveau, men policyen gør
-- intentionen eksplicit. Anon/authenticated har INGEN policies → ingen
-- direkte adgang; Next.js-serveren bruger service_role til alt.
alter table public.trips enable row level security;

drop policy if exists "service_role full access" on public.trips;
create policy "service_role full access"
  on public.trips
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- Migration 003: destinations — fælles billedbibliotek pr. destination
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-05-27 (DestinationManager-featuren);
-- DDL versioneret i repo 2026-07-20. Idempotent.
--
-- name matcher trips.destination 1:1 (inkl. flerlande-navne som
-- "Sri Lanka & Maldiverne"). hero_url er fallback-hero for alle rejser til
-- destinationen; gallery er op til 3 billede-URLs (håndhæves af Zod i
-- /admin/api/destinations, ikke af DB'en). Selve billederne ligger i
-- Storage-bucket "destinations" (offentlige URLs).
-- ============================================================================

create table if not exists public.destinations (
  name       text primary key,
  hero_url   text,
  gallery    jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.destinations enable row level security;

-- Eneste tabel med offentlig læseadgang (kundesiden læser dog reelt via
-- service_role — policyen er et bevidst lavt hegn for et ikke-følsomt datasæt).
drop policy if exists "Anyone can read destinations" on public.destinations;
create policy "Anyone can read destinations"
  on public.destinations for select
  to public
  using (true);

-- Ingen INSERT/UPDATE/DELETE-policies — kun service_role (server-side kode)
-- kan mutere.

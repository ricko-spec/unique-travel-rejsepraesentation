-- Unique Travel — Rejsepræsentation schema
-- Run this in Supabase SQL Editor (project: ocxrvkrggzppyhgyambj)

create extension if not exists "pgcrypto";

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  booking_no text not null unique,
  slug text not null unique,
  destination text not null,
  customer_name text,
  data jsonb not null,
  hero_photo text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_slug_idx on trips(slug);
create index if not exists trips_active_idx on trips(active);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trips_set_updated_at on trips;
create trigger trips_set_updated_at
  before update on trips
  for each row execute function set_updated_at();

-- Row Level Security
-- The service_role key bypasses RLS at the Postgres layer, but we add an
-- explicit policy below so the intent is documented and the table works
-- even if the request somehow arrives without that role context.
alter table trips enable row level security;

-- Anon and authenticated users have NO policies → no direct access.
-- The Next.js server uses the service_role key for all reads and writes.

drop policy if exists "service_role full access" on trips;
create policy "service_role full access"
  on trips
  for all
  to service_role
  using (true)
  with check (true);

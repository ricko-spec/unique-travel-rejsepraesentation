-- ============================================================================
-- Migration 002: profiles — sælgere (1:1 med auth.users)
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-06-02 (auth-cutover, individuelle
-- logins). Idempotent.
--
-- advisor_match_name = det navn der står i TravelWire-PDF'ernes "Vores ref:"-
-- linje (fx "Gustav Gotfredsen"). Bruges af enrichAdvisorContact til at koble
-- en rejses advisor til den rigtige email/telefon på kundens ContactCTA.
-- Brugere oprettes invite-only i Supabase Dashboard (Authentication → Add
-- user); triggeren nederst auto-opretter profil-rækken.
-- ============================================================================

create table if not exists public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              text not null,
  full_name          text,
  phone              text,
  advisor_match_name text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- hurtigt, case-insensitivt opslag på rådgivernavn
create index if not exists profiles_advisor_match_idx
  on public.profiles (lower(advisor_match_name));

-- updated_at-trigger (helper defineret i 001)
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS: hver bruger ser/redigerer KUN sin egen profil; service_role har fuld adgang
alter table public.profiles enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "service_role full access profiles" on public.profiles;
create policy "service_role full access profiles" on public.profiles
  for all to service_role using (true) with check (true);

-- auto-opret en profil-række når en bruger oprettes
create or replace function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

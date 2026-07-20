-- ============================================================================
-- Migration 006: created_by på trips (PAIN-2 fra Fable-review)
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-07-04. Idempotent.
-- (Oprindeligt udleveret som "003_created_by_on_trips.sql" fra Cowork-
-- sessionen — omnummereret til 006 i denne serie.)
--
-- Formål: spore hvem der oprettede hver rejse. Ingen låsning — alle sælgere
-- kan stadig redigere alle trips (kendt beslutning). Kun sporing.
--
-- Backend-integration (UDESTÅR pr. 2026-07-20 — kolonnen skrives endnu ikke):
--   src/app/admin/api/trips/route.ts POST — sæt created_by = user.id
--   (upsert-payload, kun ved insert. Ved eksisterende booking_no: rør ikke).
--
-- UI-integration senere (PAIN-2 del 2):
--   Vis "Oprettet af {profile.full_name}" på trip-detalje-siden.
--   Vis "Sidst rørt {updated_at}" som kolonne i AdminDashboard-listen.
-- ============================================================================

alter table public.trips
  add column if not exists created_by uuid references auth.users(id) on delete set null;

comment on column public.trips.created_by is
  'Sælgeren der oprettede rejsen. NULL for rækker oprettet før 2026-07. Fylder fra auth session ved POST /admin/api/trips.';

create index if not exists trips_created_by_idx on public.trips (created_by);

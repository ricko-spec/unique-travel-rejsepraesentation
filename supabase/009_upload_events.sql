-- ============================================================================
-- Migration 009: upload_events — 100% upload-tracking pr. sælger (Issue #38)
-- ============================================================================
-- IKKE kørt live endnu. Idempotent — klar til at køres i SQL Editor når Ricko
-- godkender. Se docs/DECISIONS.md + Issue #38 for release-rækkefølgen: denne
-- migration SKAL køres i production FØR kode-deploy, fordi parse-routen
-- fail-closed'er (afviser uploads) når tabellen mangler.
--
-- Formål: adoption/usage-log adskilt fra trips.created_by. created_by
-- fortæller kun hvem der oprindeligt oprettede en booking og ændres bevidst
-- ikke ved re-upload — det duer ikke som mål for "bruger sælgeren systemet
-- aktivt". upload_events logger HVER accepteret PDF-upload som et separat
-- event, uanset om den fører til en ny trip, en opdatering, eller fejler.
--
-- Fail-closed-kontrakt (håndhæves i src/app/admin/api/parse/route.ts):
--   Et 'received'-event oprettes FØR Claude kaldes. Fejler dette insert,
--   stopper requesten — Claude kaldes ikke, og sælgeren får en fejlbesked.
--   Der kan derfor ikke eksistere en behandlet PDF-upload uden et event.
--
-- Statusflow (én række opdateres in-place — se docs/SYSTEM-ARKITEKTUR.md):
--   received → validation_failed
--            → parse_failed
--            → parsed → published
--                     → save_failed
--   'parsed' kan legitimt blive stående (bruger lukker siden/annullerer) —
--   det er ikke i sig selv en fejltilstand.
--
-- Ingen kundedata: booking-nummeret gemmes KUN som sha-256-hash
-- (booking_no_hash), aldrig i klartekst. Ingen PDF-filnavne, rå AI-tekst,
-- kundenavne eller andet fra selve rejseplanen gemmes her.
--
-- Historik: de 172+ trips oprettet før denne feature backfilles IKKE —
-- eksakt tracking gælder fra første upload_events-række (min(received_at)).
-- ============================================================================

create table if not exists public.upload_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete set null,
  actor_name       text not null,
  received_at      timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  status           text not null default 'received',
  file_size_bytes  bigint,
  booking_no_hash  text,
  trip_id          uuid references public.trips(id) on delete set null,
  save_kind        text,
  failure_kind     text,

  constraint upload_events_status_check check (
    status in (
      'received',
      'validation_failed',
      'parse_failed',
      'parsed',
      'published',
      'save_failed'
    )
  ),
  constraint upload_events_save_kind_check check (
    save_kind is null or save_kind in ('created', 'updated')
  ),
  constraint upload_events_failure_kind_check check (
    failure_kind is null or failure_kind in (
      'file_too_large',
      'invalid_file_type',
      'invalid_json',
      'schema_mismatch',
      'max_tokens',
      'anthropic_error',
      'event_mismatch',
      'save_conflict',
      'save_error'
    )
  )
);

comment on table public.upload_events is
  'Adoption/usage-log: ét event pr. accepteret PDF-upload til /admin/api/parse. Autoritativ upload-tælling — adskilt fra trips.created_by, som kun sporer den oprindelige opretter. Service-role-only. Ingen kundedata (booking-nummer kun som hash).';
comment on column public.upload_events.user_id is
  'Sælgeren der uploadede. ON DELETE SET NULL hvis en auth-bruger slettes — actor_name-snapshottet bevarer stadig hvem det var.';
comment on column public.upload_events.actor_name is
  'Snapshot af profiles.full_name på upload-tidspunktet (fallback: email/user id hvis profilopslag fejler). Bevares selv hvis brugeren/profilen senere ændres eller slettes.';
comment on column public.upload_events.status is
  'received | validation_failed | parse_failed | parsed | published | save_failed. Se migration-header for statusflow.';
comment on column public.upload_events.booking_no_hash is
  'sha-256(bookingNo) hex, sat når parse lykkes. ALDRIG bookingnummeret i klartekst — det er kundens adgangskode til præsentationen.';
comment on column public.upload_events.trip_id is
  'Sat når eventet fører til en gemt trip (status=published). ON DELETE SET NULL — eventet overlever en evt. sletning af trippen.';
comment on column public.upload_events.save_kind is
  'created (ny booking_no) eller updated (re-upload af eksisterende booking) — sat sammen med published. Spejler wasUpdate-logikken i POST /admin/api/trips.';
comment on column public.upload_events.failure_kind is
  'Sanitiseret fejlkategori til statistik. ALDRIG rå API-fejltekst eller kundedata.';

alter table public.upload_events enable row level security;

drop policy if exists "service_role full access upload_events" on public.upload_events;
create policy "service_role full access upload_events"
  on public.upload_events for all
  to service_role
  using (true)
  with check (true);

-- updated_at-trigger (helper defineret i 001)
drop trigger if exists upload_events_set_updated_at on public.upload_events;
create trigger upload_events_set_updated_at
  before update on public.upload_events
  for each row execute function public.set_updated_at();

create index if not exists upload_events_received_at_idx on public.upload_events (received_at desc);
create index if not exists upload_events_user_id_idx      on public.upload_events (user_id);
create index if not exists upload_events_status_idx        on public.upload_events (status);
create index if not exists upload_events_trip_id_idx        on public.upload_events (trip_id);

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

-- ============================================================================
-- usage_period_summary(period_start) — konsistent snapshot-aggregering til
-- GET /admin/api/usage (reviewfund på PR #39: se begrundelse nedenfor).
-- ============================================================================
-- Første revision af /admin/api/usage hentede ALLE upload_events-rækker til
-- Node.js (enten som ét .select() eller keyset-pagineret på id) og
-- aggregerede i TypeScript. To problemer med det:
--   1) Et enkelt .select() kan blive stille trunkeret af PostgREST/Supabase'
--      standard max-rows-grænse.
--   2) `id` er en TILFÆLDIG uuid (gen_random_uuid()) — IKKE en monotont
--      voksende nøgle. Keyset-paginering på en tilfældig uuid er derfor
--      ikke et sikkert konsistens-værn: et nyt event kan indsættes MENS
--      pagineringen kører med en id der sorterer FØR den cursor vi allerede
--      har passeret, og bliver så aldrig hentet i det request — uden nogen
--      fejl, bare et for lavt tal.
--
-- Løsningen er at lade Postgres selv lave hele aggregeringen i ÉT
-- SQL-statement. Under Postgres' standard isolationsniveau (READ COMMITTED)
-- ser alle under-forespørgsler i ét statement PRÆCIS det samme snapshot af
-- databasen, taget ved statementets start. Et event der indsættes efter det
-- tidspunkt er simpelthen ikke synligt for dette kald — uanset dets uuid —
-- og alle tal i det returnerede objekt (totalUploads, pr.-bruger-tal,
-- trackingSince, stalledEvents osv.) er derfor garanteret indbyrdes
-- konsistente. Resultatet er desuden lille (én række pr. sælger med
-- uploads > 0 i perioden) og kan derfor aldrig ramme en rækkegrænse.
--
-- `period_start = null` betyder "all" (ingen nedre grænse). Alle andre felter
-- (trackingSince/stalledEvents/historicalActorEvents) er bevidst UAFHÆNGIGE
-- af period_start — samme princip som i src/lib/usage.ts.
--
-- Zero-upload-profiler håndteres IKKE her: den fulde profiles-liste er lille
-- (antal sælgere) og hentes/merges separat i route.ts — ingen konsistens-
-- risiko ved det, og det holder denne funktion fokuseret på upload_events.
--
-- Orphan-events (user_id IS NULL — auth-brugeren/profilen er slettet siden,
-- ON DELETE SET NULL): actor_name er gemt netop for at bevare hvem der
-- uploadede i det tilfælde, så disse events skal IKKE kun tælle med i
-- historicalActorEvents-indikatoren — de skal også indgå i 'users' som egne
-- rækker, grupperet efter actor_name (den eneste tilgængelige identitet),
-- markeret 'isHistorical: true' og 'userId: null'. per_user (user_id IS NOT
-- NULL) og per_orphan (user_id IS NULL) er disjunkte partitioner af
-- in_period, så summen af deres uploads-tal altid matcher totalUploads
-- uden dobbelttælling.
-- ============================================================================

create or replace function public.usage_period_summary(period_start timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
  with in_period as (
    select *
    from public.upload_events
    where period_start is null or received_at >= period_start
  ),
  per_user as (
    select
      user_id,
      false as is_historical,
      (array_agg(actor_name order by received_at desc))[1] as latest_actor_name,
      count(*) as uploads,
      count(*) filter (where status = 'published') as published,
      count(*) filter (where status = 'published' and save_kind = 'created') as new_trips,
      count(*) filter (where status = 'published' and save_kind = 'updated') as reuploads,
      count(*) filter (where status in ('validation_failed', 'parse_failed', 'save_failed')) as errors,
      count(*) filter (where status = 'parsed') as parsed_not_saved,
      max(received_at) as last_upload_at
    from in_period
    where user_id is not null
    group by user_id
  ),
  per_orphan as (
    select
      null::uuid as user_id,
      true as is_historical,
      actor_name as latest_actor_name,
      count(*) as uploads,
      count(*) filter (where status = 'published') as published,
      count(*) filter (where status = 'published' and save_kind = 'created') as new_trips,
      count(*) filter (where status = 'published' and save_kind = 'updated') as reuploads,
      count(*) filter (where status in ('validation_failed', 'parse_failed', 'save_failed')) as errors,
      count(*) filter (where status = 'parsed') as parsed_not_saved,
      max(received_at) as last_upload_at
    from in_period
    where user_id is null
    group by actor_name
  ),
  combined as (
    select * from per_user
    union all
    select * from per_orphan
  )
  select jsonb_build_object(
    'totalUploads', (select count(*) from in_period),
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'userId', user_id,
        'isHistorical', is_historical,
        'latestActorName', latest_actor_name,
        'uploads', uploads,
        'published', published,
        'newTrips', new_trips,
        'reuploads', reuploads,
        'errors', errors,
        'parsedNotSaved', parsed_not_saved,
        'lastUploadAt', last_upload_at
      ) order by uploads desc)
      from combined
    ), '[]'::jsonb),
    'trackingSince', (select min(received_at) from public.upload_events),
    'stalledEvents', (
      select count(*) from public.upload_events
      where status in ('received', 'parsed') and received_at < now() - interval '24 hours'
    ),
    'historicalActorEvents', (
      select count(*) from public.upload_events where user_id is null
    )
  );
$function$;

revoke execute on function public.usage_period_summary(timestamptz) from public;
revoke execute on function public.usage_period_summary(timestamptz) from anon;
revoke execute on function public.usage_period_summary(timestamptz) from authenticated;
grant execute on function public.usage_period_summary(timestamptz) to service_role;

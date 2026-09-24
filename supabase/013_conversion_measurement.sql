-- ============================================================================
-- Migration 013: prospektiv konverteringsmåling (Vision 3.0 Fase 5, Gate B —
-- Issue #80, barn af Gate A/Issue #78, PR #79)
-- ============================================================================
-- GATE B1: denne fil er BYGGET SOM FIL MEN IKKE ANVENDT. Ingen `supabase db
-- push`/SQL Editor-kørsel er sket. Anvendelse i production kræver Gate B2
-- (Rickos eksplicitte, separate godkendelse) — se
-- docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md og
-- docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md.
--
-- Revideret i PR #81 review-runde 1 (stadig ikke anvendt, derfor rettet i
-- samme fil frem for en ny migration): prospektiv snapshot-kvalifikation,
-- transaktionelle sync-RPC'er, DB-håndhævede frys-regler, bookingkonflikt-
-- tilstand og én entydig udfaldsdefinition. Kontraktversion 2.
--
-- Idempotent (`if not exists` / `drop ... if exists` / `or replace`), som
-- resten af mappen. Ingen kundedata, ingen rå HubSpot-id'er, ingen secrets.
--
-- ARKITEKTUR (Gate B0, ADR A): direkte, read-only HubSpot-læsning i DETTE
-- projekt. Service-role-only DB-adgang; kohortedata kan KUN skrives inde i
-- conversion_commit_sync_run (håndhævet af en trigger, ikke kun af appkoden).
--
-- BINDENDE FAKTA FRA GATE A (Issue #78, PR #79):
--   · Historisk rekonstruktion er UNUSABLE og bruges ALDRIG — kvalifikation
--     afgøres af dealens AKTUELLE stage ved hver daglig sync.
--   · Målingen starter ved første succesfulde, GODKENDTE produktionssync
--     (baseline-kørslen sætter measurement_started_at, én gang).
--   · Pipeline 754595640 · "Tilbud sendt" = 1098732868 · "Opdateret tilbud"
--     = 1169407502 (nulstiller aldrig kohorten) · bookingfelt
--     unique_travel_bookingno.
--   · UDFALD (én definition, = src/lib/conversion/contract.ts
--     classifyOutcomeSignal): BOOKED hvis og kun hvis unique_travel_dealstatus
--     ∈ {Solgt, Billetter sendt}. hs_is_closed/hs_is_closed_won afgør ALDRIG
--     BOOKED; de bruges kun til datakvalitet: tabt/afvist (lukket, ikke won,
--     ikke solgt) og outcome-konflikt (solgt men lukket-tabt, eller won uden
--     UT-solgt-status). closed_won uden closed = kontraktdrift (sync fejler).
--   · Eksponeringsgruppen fryses ved første kvalificerede observation.
-- ============================================================================

-- ============================================================================
-- TABEL 1: conversion_measurement_state — singleton måle-konfiguration
-- ============================================================================
create table if not exists public.conversion_measurement_state (
  id                       integer     primary key default 1
                             constraint conversion_measurement_state_singleton check (id = 1),
  status                   text        not null default 'NOT_STARTED'
                             constraint conversion_measurement_state_status_check
                             check (status in ('NOT_STARTED', 'ACTIVE', 'PAUSED')),
  contract_version         integer     not null default 2,
  measurement_started_at   timestamptz,
  last_successful_sync_at  timestamptz,
  sync_generation          bigint      not null default 0
                             constraint conversion_measurement_state_generation_check
                             check (sync_generation >= 0),
  updated_at               timestamptz not null default now(),
  constraint conversion_measurement_state_not_started_check
    check (status <> 'NOT_STARTED' or measurement_started_at is null)
);

comment on table public.conversion_measurement_state is
  'Singleton (id=1) driftsstatus for Vision 3.0 Fase 5 konverteringsmåling (Gate B, Issue #80). Ingen secrets, ingen kundedata. status=ACTIVE med measurement_started_at=NULL betyder "aktiveret, afventer baseline". measurement_started_at, last_successful_sync_at og sync_generation kan KUN ændres af conversion_commit_sync_run (trigger).';
comment on column public.conversion_measurement_state.contract_version is
  'Skal være lig runtime CONTRACT_VERSION i src/lib/conversion/contract.ts (pt. 2). Uoverensstemmelse ⇒ sync afvises (CONTRACT_VERSION_MISMATCH).';
comment on column public.conversion_measurement_state.measurement_started_at is
  'Sættes ÉN gang af den officielle baseline-kørsel (= dens observed_at). Uforanderlig herefter (trigger).';
comment on column public.conversion_measurement_state.sync_generation is
  'Optimistisk samtidighedsværn: returneres af conversion_begin_sync_run og skal være uændret ved commit; øges med 1 pr. succesfuld commit.';

alter table public.conversion_measurement_state enable row level security;

drop policy if exists "service_role full access conversion_measurement_state" on public.conversion_measurement_state;
create policy "service_role full access conversion_measurement_state"
  on public.conversion_measurement_state for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.conversion_measurement_state from public;
revoke all on table public.conversion_measurement_state from anon;
revoke all on table public.conversion_measurement_state from authenticated;
revoke all on table public.conversion_measurement_state from service_role;
grant select, insert, update on table public.conversion_measurement_state to service_role;

-- Håndhæver i databasen (ikke kun i appen), at nulpunktet og friskheds-
-- markøren kun kan flyttes af selve commit-transaktionen.
create or replace function public.conversion_measurement_state_guard()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
declare
  v_in_sync boolean := coalesce(current_setting('conversion.active_run', true), '') <> '';
begin
  if tg_op = 'INSERT' then
    if new.measurement_started_at is not null or new.last_successful_sync_at is not null or new.sync_generation <> 0 then
      raise exception 'CONVERSION_STATE_SEED_INVALID';
    end if;
    new.updated_at := now();
    return new;
  end if;

  if old.measurement_started_at is not null
     and new.measurement_started_at is distinct from old.measurement_started_at then
    raise exception 'CONVERSION_STARTED_AT_IMMUTABLE';
  end if;
  if not v_in_sync and (
       new.measurement_started_at is distinct from old.measurement_started_at
       or new.last_successful_sync_at is distinct from old.last_successful_sync_at
       or new.sync_generation is distinct from old.sync_generation) then
    raise exception 'CONVERSION_STATE_WRITE_OUTSIDE_SYNC';
  end if;
  if new.sync_generation < old.sync_generation then
    raise exception 'CONVERSION_GENERATION_BACKWARDS';
  end if;
  if old.last_successful_sync_at is not null and new.last_successful_sync_at < old.last_successful_sync_at then
    raise exception 'CONVERSION_LAST_SYNC_BACKWARDS';
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists conversion_measurement_state_guard on public.conversion_measurement_state;
drop function if exists public.conversion_measurement_state_guard_started_at();
create trigger conversion_measurement_state_guard
  before insert or update on public.conversion_measurement_state
  for each row execute function public.conversion_measurement_state_guard();

-- Singleton-rækken oprettes IKKE af denne migration (bevidst) — appen læser
-- en manglende række som "ikke startet". Seed sker først ved Gate C.

-- ============================================================================
-- TABEL 2: conversion_deal_cohort — én række pr. pseudonymiseret HubSpot-deal
-- ============================================================================
create table if not exists public.conversion_deal_cohort (
  deal_key                        text        primary key
                                     constraint conversion_deal_cohort_deal_key_check
                                     check (deal_key ~ '^[0-9a-f]{64}$'),
  booking_match_key               text
                                     constraint conversion_deal_cohort_booking_key_check
                                     check (booking_match_key is null or booking_match_key ~ '^[0-9a-f]{64}$'),
  first_seen_at                   timestamptz not null,
  last_observed_at                timestamptz not null,
  first_qualified_observation_at  timestamptz,
  exposure_group                  text
                                     constraint conversion_deal_cohort_exposure_check
                                     check (exposure_group in ('ONLINE', 'PDF_ONLY')),
  exposure_frozen_at              timestamptz,
  eligibility_status              text        not null
                                     constraint conversion_deal_cohort_eligibility_check
                                     check (eligibility_status in
                                       ('PRE_START_EXISTING', 'ELIGIBLE_PENDING', 'ENROLLED', 'EXCLUDED')),
  exclusion_reason                text
                                     constraint conversion_deal_cohort_exclusion_check
                                     check (exclusion_reason is null or exclusion_reason in (
                                       'MISSING_BOOKING_NO',
                                       'INVALID_BOOKING_NO_FORMAT',
                                       'SHARED_BOOKING_REFERENCE',
                                       'CLOSED_BEFORE_QUALIFIED_OBSERVATION'
                                     )),
  booking_conflict_detected_at    timestamptz,
  outcome_status                  text        not null default 'NOT_BOOKED'
                                     constraint conversion_deal_cohort_outcome_check
                                     check (outcome_status in ('NOT_BOOKED', 'BOOKED')),
  first_booked_at                 timestamptz,
  lost_observed_at                timestamptz,
  outcome_conflict_observed_at    timestamptz,
  contract_version                integer     not null,
  last_sync_run_id                uuid        not null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint conversion_deal_cohort_exposure_pair_check
    check ((exposure_group is null) = (exposure_frozen_at is null)),
  constraint conversion_deal_cohort_exposure_frozen_at_check
    check (exposure_frozen_at is null or exposure_frozen_at = first_qualified_observation_at),
  constraint conversion_deal_cohort_exposure_requires_enrolled_check
    check (exposure_group is null or eligibility_status = 'ENROLLED'),
  constraint conversion_deal_cohort_enrolled_fields_check
    check (eligibility_status <> 'ENROLLED' or (exposure_group is not null
           and first_qualified_observation_at is not null and booking_match_key is not null)),
  constraint conversion_deal_cohort_excluded_reason_check
    check ((eligibility_status = 'EXCLUDED') = (exclusion_reason is not null)),
  constraint conversion_deal_cohort_pending_prestart_fields_check
    check (eligibility_status not in ('ELIGIBLE_PENDING', 'PRE_START_EXISTING')
           or (first_qualified_observation_at is null and booking_match_key is null)),
  constraint conversion_deal_cohort_closed_before_fields_check
    check (exclusion_reason is distinct from 'CLOSED_BEFORE_QUALIFIED_OBSERVATION'
           or (first_qualified_observation_at is null and booking_match_key is null)),
  constraint conversion_deal_cohort_booking_problem_fields_check
    check (exclusion_reason not in ('MISSING_BOOKING_NO', 'INVALID_BOOKING_NO_FORMAT')
           or exclusion_reason is null
           or (first_qualified_observation_at is not null and booking_match_key is null)),
  constraint conversion_deal_cohort_shared_fields_check
    check (exclusion_reason is distinct from 'SHARED_BOOKING_REFERENCE'
           or (first_qualified_observation_at is not null and booking_match_key is not null)),
  constraint conversion_deal_cohort_conflict_requires_enrolled_check
    check (booking_conflict_detected_at is null or eligibility_status = 'ENROLLED'),
  constraint conversion_deal_cohort_booked_pair_check
    check ((outcome_status = 'BOOKED') = (first_booked_at is not null))
);

comment on table public.conversion_deal_cohort is
  'Én pseudonymiseret række pr. HubSpot-deal (Gate B, Issue #80). ALDRIG rå deal-id, bookingnummer i klartekst, kundenavn, e-mail eller payloads. Kan KUN skrives inde i conversion_commit_sync_run (trigger). Frosne felter (eligibility, årsag, kohortestart, eksponering, bookingnøgle, booket, tabt, konflikter) håndhæves af triggeren conversion_deal_cohort_guard.';
comment on column public.conversion_deal_cohort.deal_key is
  'HMAC-SHA256(HUBSPOT_DEAL_KEY_SECRET, "dealkey:v1:" || hubspot_deal_id) — aldrig det rå deal-id.';
comment on column public.conversion_deal_cohort.booking_match_key is
  'Samme HMAC-kontrakt som Analytics Bridge (Issue #45). Sat for ENROLLED og for EXCLUDED/SHARED_BOOKING_REFERENCE (så senere konflikter kan opdages); ellers NULL.';
comment on column public.conversion_deal_cohort.first_qualified_observation_at is
  'Kohortestart = observed_at for den FØRSTE sync, der så dealen i en QUOTE_OR_LATER-stage efter baseline. Aldrig et historisk HubSpot-tidsstempel. Ændres aldrig.';
comment on column public.conversion_deal_cohort.exposure_group is
  'ONLINE = en matchende online rejseplan eksisterede (tidligste trips.created_at <= kohortestart). PDF_ONLY = ingen. Frosset permanent.';
comment on column public.conversion_deal_cohort.eligibility_status is
  'PRE_START_EXISTING = ved baseline allerede kvalificeret/lukket. ELIGIBLE_PENDING = åben PRE_QUOTE-deal; kan optages senere. ENROLLED = optaget præcis én gang med frosset eksponering. EXCLUDED = permanent udelukket med årsag (aldrig stiltiende PDF_ONLY).';
comment on column public.conversion_deal_cohort.exclusion_reason is
  'MISSING_BOOKING_NO / INVALID_BOOKING_NO_FORMAT / SHARED_BOOKING_REFERENCE = bookingnummeret kan ikke afgøre ONLINE/PDF_ONLY entydigt. CLOSED_BEFORE_QUALIFIED_OBSERVATION = dealen blev første gang observeret i en lukket stage, der kan nås både før og efter et tilbud.';
comment on column public.conversion_deal_cohort.booking_conflict_detected_at is
  'Reconciliation-tilstand: sat én gang, når en ENROLLED deals frosne bookingreference senere viser sig delt med en anden deal. Rækken bevares (revisionsspor, oprindelig eksponering uændret), men indgår ALDRIG i publicerbare konverteringstal.';
comment on column public.conversion_deal_cohort.outcome_status is
  'BOOKED hvis og kun hvis unique_travel_dealstatus på et tidspunkt er observeret i {Solgt, Billetter sendt}. hs_is_closed_won afgør ikke BOOKED. Kan kun gå NOT_BOOKED → BOOKED.';
comment on column public.conversion_deal_cohort.first_booked_at is
  'observed_at for den første sync, der så UT-solgt-status. Ændres aldrig.';
comment on column public.conversion_deal_cohort.lost_observed_at is
  'Datakvalitet: første observation af hs_is_closed=true, hs_is_closed_won=false og ikke UT-solgt. Indgår aldrig i konverteringsprocenten.';
comment on column public.conversion_deal_cohort.outcome_conflict_observed_at is
  'Datakvalitet: første observation af modstrid mellem UT-solgt-status og HubSpots lukke-flag (solgt men lukket-tabt, eller won uden UT-solgt). Ændrer ikke outcome_status.';

alter table public.conversion_deal_cohort enable row level security;

drop policy if exists "service_role full access conversion_deal_cohort" on public.conversion_deal_cohort;
create policy "service_role full access conversion_deal_cohort"
  on public.conversion_deal_cohort for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.conversion_deal_cohort from public;
revoke all on table public.conversion_deal_cohort from anon;
revoke all on table public.conversion_deal_cohort from authenticated;
revoke all on table public.conversion_deal_cohort from service_role;
grant select, insert, update on table public.conversion_deal_cohort to service_role;
-- Ingen DELETE: en række fjernes aldrig af normal drift.

create index if not exists conversion_deal_cohort_eligibility_idx
  on public.conversion_deal_cohort (eligibility_status);
create index if not exists conversion_deal_cohort_booking_key_idx
  on public.conversion_deal_cohort (booking_match_key)
  where booking_match_key is not null;

create or replace function public.conversion_deal_cohort_guard()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  if coalesce(current_setting('conversion.active_run', true), '') = '' then
    raise exception 'CONVERSION_COHORT_WRITE_OUTSIDE_SYNC';
  end if;

  if tg_op = 'UPDATE' then
    if new.deal_key is distinct from old.deal_key
       or new.first_seen_at is distinct from old.first_seen_at
       or new.created_at is distinct from old.created_at then
      raise exception 'CONVERSION_COHORT_IDENTITY_FROZEN';
    end if;
    if old.eligibility_status <> 'ELIGIBLE_PENDING' and (
         new.eligibility_status is distinct from old.eligibility_status
         or new.exclusion_reason is distinct from old.exclusion_reason
         or new.first_qualified_observation_at is distinct from old.first_qualified_observation_at
         or new.exposure_group is distinct from old.exposure_group
         or new.exposure_frozen_at is distinct from old.exposure_frozen_at
         or new.booking_match_key is distinct from old.booking_match_key) then
      raise exception 'CONVERSION_COHORT_TERMINAL_FROZEN';
    end if;
    if old.booking_conflict_detected_at is not null
       and new.booking_conflict_detected_at is distinct from old.booking_conflict_detected_at then
      raise exception 'CONVERSION_COHORT_CONFLICT_FROZEN';
    end if;
    if old.outcome_status = 'BOOKED' and (new.outcome_status <> 'BOOKED'
         or new.first_booked_at is distinct from old.first_booked_at) then
      raise exception 'CONVERSION_COHORT_BOOKED_FROZEN';
    end if;
    if old.lost_observed_at is not null and new.lost_observed_at is distinct from old.lost_observed_at then
      raise exception 'CONVERSION_COHORT_LOST_FROZEN';
    end if;
    if old.outcome_conflict_observed_at is not null
       and new.outcome_conflict_observed_at is distinct from old.outcome_conflict_observed_at then
      raise exception 'CONVERSION_COHORT_OUTCOME_CONFLICT_FROZEN';
    end if;
    if new.last_observed_at < old.last_observed_at then
      raise exception 'CONVERSION_COHORT_LAST_OBSERVED_BACKWARDS';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists conversion_deal_cohort_set_updated_at on public.conversion_deal_cohort;
drop trigger if exists conversion_deal_cohort_guard on public.conversion_deal_cohort;
create trigger conversion_deal_cohort_guard
  before insert or update on public.conversion_deal_cohort
  for each row execute function public.conversion_deal_cohort_guard();

-- ============================================================================
-- TABEL 3: conversion_sync_runs — én revisionsrække pr. synkroniseringskørsel
-- ============================================================================
create table if not exists public.conversion_sync_runs (
  id                      uuid        primary key default gen_random_uuid(),
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  lease_expires_at        timestamptz not null,
  status                  text        not null default 'RUNNING'
                            constraint conversion_sync_runs_status_check
                            check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  contract_version        integer     not null,
  is_baseline             boolean,
  observed_at             timestamptz,
  error_code              text
                            constraint conversion_sync_runs_error_code_check
                            check (error_code is null or error_code in (
                              'CONFIG_INVALID', 'NOT_ACTIVE', 'CONTRACT_VERSION_MISMATCH',
                              'CONTRACT_INCOMPLETE', 'CONTRACT_DRIFT', 'HTTP_401', 'HTTP_403',
                              'HTTP_429', 'HTTP_5XX', 'NETWORK_ERROR', 'PAGE_INCONSISTENT',
                              'TOTAL_MISMATCH', 'DUPLICATE_DEAL', 'EMPTY_SOURCE',
                              'SOURCE_READ_FAILED', 'SYNC_ALREADY_RUNNING', 'COMMIT_REJECTED',
                              'ABANDONED', 'UNKNOWN')),
  deals_observed_count    integer,
  deals_enrolled_count    integer,
  deals_excluded_count    integer,
  deals_booked_count      integer,
  deals_conflict_count    integer,
  created_at              timestamptz not null default now(),
  constraint conversion_sync_runs_finished_check
    check ((status = 'RUNNING') = (finished_at is null)),
  constraint conversion_sync_runs_failed_requires_error_check
    check ((status = 'FAILED') = (error_code is not null)),
  constraint conversion_sync_runs_succeeded_fields_check
    check (status <> 'SUCCEEDED' or (observed_at is not null and is_baseline is not null
           and deals_observed_count is not null))
);

comment on table public.conversion_sync_runs is
  'Revisionsrække pr. sync-kørsel (Gate B, Issue #80). Kun kategoriske fejlkoder og tal — aldrig credentials, bookingnumre, deal-id''er, kundedata, payloads eller fritekst-fejlbeskeder. Højst én RUNNING ad gangen (unikt partielt indeks). En kørsel, der crasher, efterlades RUNNING uden kohortedata og markeres FAILED/ABANDONED, når leasen udløber.';

alter table public.conversion_sync_runs enable row level security;

drop policy if exists "service_role full access conversion_sync_runs" on public.conversion_sync_runs;
create policy "service_role full access conversion_sync_runs"
  on public.conversion_sync_runs for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.conversion_sync_runs from public;
revoke all on table public.conversion_sync_runs from anon;
revoke all on table public.conversion_sync_runs from authenticated;
revoke all on table public.conversion_sync_runs from service_role;
grant select, insert, update on table public.conversion_sync_runs to service_role;

create unique index if not exists conversion_sync_runs_single_running_idx
  on public.conversion_sync_runs ((true))
  where status = 'RUNNING';
create index if not exists conversion_sync_runs_started_at_idx
  on public.conversion_sync_runs (started_at desc);

-- ============================================================================
-- RPC'er — den ENESTE skrivevej for sync-motoren
-- ============================================================================
-- SECURITY INVOKER (samme mønster som 010-012): kaldes kun af service_role,
-- som har de nødvendige table privileges. Faste, kodede exception-tekster
-- (CONVERSION_*) — ingen data i fejlbeskeder. Hver RPC-kald er én
-- transaktion: en exception ruller ALT tilbage.

create or replace function public.conversion_begin_sync_run(p_contract_version integer, p_lease_seconds integer)
returns table (run_id uuid, sync_generation bigint)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $function$
#variable_conflict use_column
declare
  v_state public.conversion_measurement_state%rowtype;
  v_now timestamptz := clock_timestamp();
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('public.conversion_sync'));

  select * into v_state from public.conversion_measurement_state where id = 1 for update;
  if not found or v_state.status <> 'ACTIVE' then
    raise exception 'CONVERSION_NOT_ACTIVE';
  end if;
  if v_state.contract_version <> p_contract_version then
    raise exception 'CONVERSION_CONTRACT_VERSION_MISMATCH';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 60 or p_lease_seconds > 7200 then
    raise exception 'CONVERSION_LEASE_INVALID';
  end if;

  update public.conversion_sync_runs
     set status = 'FAILED', error_code = 'ABANDONED', finished_at = v_now
   where status = 'RUNNING' and lease_expires_at < v_now;

  if exists (select 1 from public.conversion_sync_runs where status = 'RUNNING') then
    raise exception 'CONVERSION_SYNC_ALREADY_RUNNING';
  end if;

  insert into public.conversion_sync_runs (status, contract_version, lease_expires_at, started_at)
  values ('RUNNING', p_contract_version, v_now + make_interval(secs => p_lease_seconds), v_now)
  returning id into v_id;

  return query select v_id, v_state.sync_generation;
end;
$function$;

create or replace function public.conversion_fail_sync_run(p_run_id uuid, p_error_code text)
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $function$
begin
  update public.conversion_sync_runs
     set status = 'FAILED', error_code = p_error_code, finished_at = clock_timestamp()
   where id = p_run_id and status = 'RUNNING';
  if not found then
    raise exception 'CONVERSION_RUN_NOT_RUNNING';
  end if;
end;
$function$;

-- Parser batchen ét sted (ingen temp-tabel, ingen ekstra privilegier).
create or replace function public.conversion_parse_batch(p_rows jsonb)
returns table (
  deal_key text,
  booking_match_key text,
  first_seen_at timestamptz,
  last_observed_at timestamptz,
  first_qualified_observation_at timestamptz,
  exposure_group text,
  exposure_frozen_at timestamptz,
  eligibility_status text,
  exclusion_reason text,
  booking_conflict_detected_at timestamptz,
  outcome_status text,
  first_booked_at timestamptz,
  lost_observed_at timestamptz,
  outcome_conflict_observed_at timestamptz,
  contract_version integer
)
language sql
immutable
security invoker
set search_path = public, pg_catalog
as $function$
  select *
    from jsonb_to_recordset(p_rows) as r(
      deal_key text,
      booking_match_key text,
      first_seen_at timestamptz,
      last_observed_at timestamptz,
      first_qualified_observation_at timestamptz,
      exposure_group text,
      exposure_frozen_at timestamptz,
      eligibility_status text,
      exclusion_reason text,
      booking_conflict_detected_at timestamptz,
      outcome_status text,
      first_booked_at timestamptz,
      lost_observed_at timestamptz,
      outcome_conflict_observed_at timestamptz,
      contract_version integer
    );
$function$;

create or replace function public.conversion_commit_sync_run(
  p_run_id uuid,
  p_sync_generation bigint,
  p_contract_version integer,
  p_observed_at timestamptz,
  p_is_baseline boolean,
  p_rows jsonb
)
returns table (observed_count integer, enrolled_count integer, excluded_count integer, booked_count integer, conflict_count integer)
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $function$
#variable_conflict use_column
declare
  v_state public.conversion_measurement_state%rowtype;
  v_run public.conversion_sync_runs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_len integer;
  v_distinct integer;
  v_observed integer;
  v_enrolled integer;
  v_excluded integer;
  v_booked integer;
  v_conflicts integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.conversion_sync'));

  select * into v_state from public.conversion_measurement_state where id = 1 for update;
  if not found or v_state.status <> 'ACTIVE' then
    raise exception 'CONVERSION_NOT_ACTIVE';
  end if;
  if v_state.contract_version <> p_contract_version then
    raise exception 'CONVERSION_CONTRACT_VERSION_MISMATCH';
  end if;
  if v_state.sync_generation <> p_sync_generation then
    raise exception 'CONVERSION_STALE_GENERATION';
  end if;

  select * into v_run from public.conversion_sync_runs where id = p_run_id for update;
  if not found or v_run.status <> 'RUNNING' then
    raise exception 'CONVERSION_RUN_NOT_RUNNING';
  end if;
  if v_run.lease_expires_at < v_now then
    raise exception 'CONVERSION_LEASE_EXPIRED';
  end if;
  if v_run.contract_version <> p_contract_version then
    raise exception 'CONVERSION_CONTRACT_VERSION_MISMATCH';
  end if;

  if p_observed_at is null or p_observed_at > v_now + interval '5 minutes' then
    raise exception 'CONVERSION_OBSERVED_AT_INVALID';
  end if;
  if v_state.last_successful_sync_at is not null and p_observed_at <= v_state.last_successful_sync_at then
    raise exception 'CONVERSION_OBSERVED_AT_NOT_AFTER_LAST_SYNC';
  end if;
  if p_is_baseline is distinct from (v_state.measurement_started_at is null) then
    raise exception 'CONVERSION_BASELINE_MISMATCH';
  end if;
  if p_is_baseline and exists (select 1 from public.conversion_deal_cohort) then
    raise exception 'CONVERSION_BASELINE_REQUIRES_EMPTY_COHORT';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'CONVERSION_ROWS_INVALID';
  end if;
  v_len := jsonb_array_length(p_rows);
  if v_len = 0 then
    raise exception 'CONVERSION_EMPTY_BATCH';
  end if;

  select count(distinct b.deal_key) into v_distinct from public.conversion_parse_batch(p_rows) b;
  if v_distinct <> v_len or exists (select 1 from public.conversion_parse_batch(p_rows) b where b.deal_key is null) then
    raise exception 'CONVERSION_DUPLICATE_DEAL_KEY';
  end if;
  if exists (select 1 from public.conversion_parse_batch(p_rows) b where b.contract_version is distinct from p_contract_version) then
    raise exception 'CONVERSION_ROW_CONTRACT_VERSION';
  end if;
  if exists (select 1 from public.conversion_parse_batch(p_rows) b where b.last_observed_at > p_observed_at) then
    raise exception 'CONVERSION_ROW_OBSERVED_AT';
  end if;
  if p_is_baseline and exists (
       select 1 from public.conversion_parse_batch(p_rows) b
        where b.eligibility_status not in ('ELIGIBLE_PENDING', 'PRE_START_EXISTING')
           or b.last_observed_at <> p_observed_at) then
    raise exception 'CONVERSION_BASELINE_STATUS';
  end if;
  -- Nye/pending rækker: ingen PRE_START efter baseline, og kohortestart skal
  -- være præcis denne kørsels observed_at (aldrig et historisk tidspunkt).
  if exists (
       select 1
         from public.conversion_parse_batch(p_rows) b
         left join public.conversion_deal_cohort c on c.deal_key = b.deal_key
        where (c.deal_key is null or c.eligibility_status = 'ELIGIBLE_PENDING')
          and ((not p_is_baseline and b.eligibility_status = 'PRE_START_EXISTING')
               or (b.first_qualified_observation_at is not null
                   and b.first_qualified_observation_at <> p_observed_at))) then
    raise exception 'CONVERSION_COHORT_START_INVALID';
  end if;

  perform set_config('conversion.active_run', p_run_id::text, true);

  insert into public.conversion_deal_cohort as c (
    deal_key, booking_match_key, first_seen_at, last_observed_at, first_qualified_observation_at,
    exposure_group, exposure_frozen_at, eligibility_status, exclusion_reason,
    booking_conflict_detected_at, outcome_status, first_booked_at, lost_observed_at,
    outcome_conflict_observed_at, contract_version, last_sync_run_id
  )
  select deal_key, booking_match_key, first_seen_at, last_observed_at, first_qualified_observation_at,
         exposure_group, exposure_frozen_at, eligibility_status, exclusion_reason,
         booking_conflict_detected_at, outcome_status, first_booked_at, lost_observed_at,
         outcome_conflict_observed_at, contract_version, p_run_id
    from public.conversion_parse_batch(p_rows)
  on conflict (deal_key) do update set
    booking_match_key              = excluded.booking_match_key,
    first_seen_at                  = excluded.first_seen_at,
    last_observed_at               = excluded.last_observed_at,
    first_qualified_observation_at = excluded.first_qualified_observation_at,
    exposure_group                 = excluded.exposure_group,
    exposure_frozen_at             = excluded.exposure_frozen_at,
    eligibility_status             = excluded.eligibility_status,
    exclusion_reason               = excluded.exclusion_reason,
    booking_conflict_detected_at   = excluded.booking_conflict_detected_at,
    outcome_status                 = excluded.outcome_status,
    first_booked_at                = excluded.first_booked_at,
    lost_observed_at               = excluded.lost_observed_at,
    outcome_conflict_observed_at   = excluded.outcome_conflict_observed_at,
    contract_version               = excluded.contract_version,
    last_sync_run_id               = excluded.last_sync_run_id;

  select count(*) filter (where last_observed_at = p_observed_at),
         count(*) filter (where eligibility_status = 'ENROLLED'),
         count(*) filter (where eligibility_status = 'EXCLUDED'),
         count(*) filter (where outcome_status = 'BOOKED'),
         count(*) filter (where booking_conflict_detected_at is not null)
    into v_observed, v_enrolled, v_excluded, v_booked, v_conflicts
    from public.conversion_parse_batch(p_rows);

  update public.conversion_sync_runs
     set status = 'SUCCEEDED', finished_at = clock_timestamp(), observed_at = p_observed_at,
         is_baseline = p_is_baseline, deals_observed_count = v_observed,
         deals_enrolled_count = v_enrolled, deals_excluded_count = v_excluded,
         deals_booked_count = v_booked, deals_conflict_count = v_conflicts
   where id = p_run_id;

  update public.conversion_measurement_state
     set measurement_started_at  = coalesce(measurement_started_at, p_observed_at),
         last_successful_sync_at = p_observed_at,
         sync_generation         = sync_generation + 1
   where id = 1;

  return query select v_observed, v_enrolled, v_excluded, v_booked, v_conflicts;
end;
$function$;

revoke execute on function public.conversion_begin_sync_run(integer, integer) from public;
revoke execute on function public.conversion_begin_sync_run(integer, integer) from anon;
revoke execute on function public.conversion_begin_sync_run(integer, integer) from authenticated;
grant  execute on function public.conversion_begin_sync_run(integer, integer) to service_role;

revoke execute on function public.conversion_fail_sync_run(uuid, text) from public;
revoke execute on function public.conversion_fail_sync_run(uuid, text) from anon;
revoke execute on function public.conversion_fail_sync_run(uuid, text) from authenticated;
grant  execute on function public.conversion_fail_sync_run(uuid, text) to service_role;

revoke execute on function public.conversion_parse_batch(jsonb) from public;
revoke execute on function public.conversion_parse_batch(jsonb) from anon;
revoke execute on function public.conversion_parse_batch(jsonb) from authenticated;
grant  execute on function public.conversion_parse_batch(jsonb) to service_role;

revoke execute on function public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb) from public;
revoke execute on function public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb) from anon;
revoke execute on function public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb) from authenticated;
grant  execute on function public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb) to service_role;

-- ============================================================================
-- RETENTION — bevidst IKKE en del af denne migration (samme princip som
-- 010b/012). Separat, fremtidig beslutning der kræver Rickos godkendelse.
-- ============================================================================

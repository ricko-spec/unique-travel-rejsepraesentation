-- ============================================================================
-- Migration 014: efterfølgende udelukkelse af optagne deals + databasekontrakt
-- v3 (Vision 3.0 Fase 5, Gate C2 — Issue #86, barn af #80, efter Gate C1
-- Issue #84 / PR #85)
-- ============================================================================
-- GATE C2: denne fil er BYGGET SOM FIL MEN IKKE ANVENDT. Anvendelse i
-- production kræver en separat, eksplicit godkendelse fra Ricko (samme mønster
-- som Gate B1 → B2). Se docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md.
--
-- Forudsætter migration 013 (20260924193406_conversion_measurement).
--
-- HVAD DEN GØR (additivt):
--   1. To nye, nullable kolonner på conversion_deal_cohort til Rickos
--      beslutninger 2026-09-25 (docs/DECISIONS.md):
--        post_enrollment_exclusion_reason ∈ {BOOKED_OTHER_REFERENCE_UNRESOLVED,
--                                            INVALIDATED_DUPLICATE_OR_TEST}
--        post_enrollment_excluded_at
--      Eksisterende rækker får NULL/NULL og er dermed gyldige under alle nye
--      CHECKs (forudsætter IKKE tomme tabeller).
--   2. CHECKs: gyldig årsag, par (begge eller ingen), kun på ENROLLED,
--      tidspunkt inden for [kohortestart, last_observed_at], kun under
--      kontraktversion >= 3.
--   3. Trigger conversion_deal_cohort_post_enrollment_guard (BEFORE UPDATE OR
--      DELETE): en markering kan ikke fjernes eller ændres, og en markeret
--      række kan ikke slettes (revisionsspor). Statement-trigger mod TRUNCATE
--      af en tabel med markerede rækker. Kohortestart/eksponering er allerede
--      frosset for ENROLLED af 013's conversion_deal_cohort_guard.
--   4. Ny skrivevej conversion_commit_sync_run_v3 (+ conversion_parse_batch_v3),
--      som persisterer markeringen. En NY markering skal have tidspunkt =
--      kørslens observed_at (aldrig historisk). 013's commit/parse bevares
--      (rollback), men EXECUTE fratages service_role, så ingen kan skrive via
--      en vej, der ikke kender markeringen.
--   5. Kontrolleret kontraktløft 2 → 3: default på
--      conversion_measurement_state.contract_version = 3; en eksisterende
--      singleton-række løftes KUN hvis målingen ikke er startet
--      (NOT_STARTED, measurement_started_at IS NULL). Er målingen startet
--      under en anden version, afbrydes migrationen tydeligt
--      (CONVERSION_014_REQUIRES_NOT_STARTED) — intet ændres.
--
-- HVAD DEN IKKE GØR: opretter ingen singleton-række, sætter ikke ACTIVE,
-- ingen cron, ingen data-writes ud over det betingede versionsløft af en
-- (i production ikke-eksisterende) NOT_STARTED-række. Ingen nye rettigheder
-- til anon/authenticated, ingen DELETE/TRUNCATE-grants.
--
-- Idempotent: genkørsel er en no-op (if not exists / drop ... if exists /
-- or replace / betinget update).
--
-- ROLLBACK: se supabase/README.md § Migration 014 (præcis SQL). Irreversibelt:
-- intet, så længe der ikke er skrevet markeringer. Findes der markerede
-- rækker, afviser rollback-SQL'en bevidst at droppe kolonnerne (tab af
-- revisionsspor) — det kræver en separat beslutning.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Forudsætninger og tydelig fejl ved startet måling under anden version
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.conversion_deal_cohort') is null
     or to_regclass('public.conversion_measurement_state') is null
     or to_regclass('public.conversion_sync_runs') is null then
    raise exception 'CONVERSION_014_REQUIRES_013';
  end if;
  if exists (
       select 1 from public.conversion_measurement_state
        where contract_version <> 3
          and (status <> 'NOT_STARTED' or measurement_started_at is not null)) then
    raise exception 'CONVERSION_014_REQUIRES_NOT_STARTED';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Kolonner
-- ----------------------------------------------------------------------------
alter table public.conversion_deal_cohort
  add column if not exists post_enrollment_exclusion_reason text,
  add column if not exists post_enrollment_excluded_at      timestamptz;

-- ----------------------------------------------------------------------------
-- 2. CHECK-constraints (drop + add ⇒ idempotent; valideres mod eksisterende rækker)
-- ----------------------------------------------------------------------------
alter table public.conversion_deal_cohort
  drop constraint if exists conversion_deal_cohort_post_enrollment_reason_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_pair_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_requires_enrolled_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_order_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_contract_check;

alter table public.conversion_deal_cohort
  add constraint conversion_deal_cohort_post_enrollment_reason_check
    check (post_enrollment_exclusion_reason is null or post_enrollment_exclusion_reason in (
      'BOOKED_OTHER_REFERENCE_UNRESOLVED',
      'INVALIDATED_DUPLICATE_OR_TEST'
    )),
  add constraint conversion_deal_cohort_post_enrollment_pair_check
    check ((post_enrollment_exclusion_reason is null) = (post_enrollment_excluded_at is null)),
  add constraint conversion_deal_cohort_post_enrollment_requires_enrolled_check
    check (post_enrollment_exclusion_reason is null or eligibility_status = 'ENROLLED'),
  add constraint conversion_deal_cohort_post_enrollment_order_check
    check (post_enrollment_excluded_at is null
           or (post_enrollment_excluded_at >= first_qualified_observation_at
               and post_enrollment_excluded_at <= last_observed_at)),
  add constraint conversion_deal_cohort_post_enrollment_contract_check
    check (post_enrollment_exclusion_reason is null or contract_version >= 3);

comment on column public.conversion_deal_cohort.post_enrollment_exclusion_reason is
  'Efterfølgende udelukkelse af en ALLEREDE optaget (ENROLLED) deal (Rickos beslutninger 2026-09-25, migration 014). BOOKED_OTHER_REFERENCE_UNRESOLVED = dealstatus "Solgt (andet booking nr.)"; INVALIDATED_DUPLICATE_OR_TEST = senere flyttet til Dubletter/Test Leads. Sættes én gang, fjernes/ændres aldrig, rækken kan ikke slettes (trigger). En markeret deal indgår ALDRIG i publicerede tællere, nævnere, rater eller trends.';
comment on column public.conversion_deal_cohort.post_enrollment_excluded_at is
  'observed_at for den sync, der første gang satte markeringen (aldrig historisk). Mellem kohortestart og last_observed_at. Ændres aldrig.';
comment on table public.conversion_deal_cohort is
  'Én pseudonymiseret række pr. HubSpot-deal (Gate B, Issue #80). ALDRIG rå deal-id, bookingnummer i klartekst, kundenavn, e-mail eller payloads. Kan KUN skrives inde i conversion_commit_sync_run_v3 (trigger; 013-commit har ikke længere EXECUTE). Frosne felter (eligibility, årsag, kohortestart, eksponering, bookingnøgle, booket, tabt, konflikter, efterfølgende udelukkelse) håndhæves af conversion_deal_cohort_guard og conversion_deal_cohort_post_enrollment_guard.';

-- ----------------------------------------------------------------------------
-- 3. Frys-/revisionsspor-triggere
-- ----------------------------------------------------------------------------
create or replace function public.conversion_deal_cohort_post_enrollment_guard()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    if old.post_enrollment_exclusion_reason is not null then
      raise exception 'CONVERSION_COHORT_POST_ENROLLMENT_DELETE_FORBIDDEN';
    end if;
    return old;
  end if;

  if old.post_enrollment_exclusion_reason is not null and (
       new.post_enrollment_exclusion_reason is distinct from old.post_enrollment_exclusion_reason
       or new.post_enrollment_excluded_at is distinct from old.post_enrollment_excluded_at) then
    raise exception 'CONVERSION_COHORT_POST_ENROLLMENT_FROZEN';
  end if;
  return new;
end;
$function$;

drop trigger if exists conversion_deal_cohort_post_enrollment_guard on public.conversion_deal_cohort;
create trigger conversion_deal_cohort_post_enrollment_guard
  before update or delete on public.conversion_deal_cohort
  for each row execute function public.conversion_deal_cohort_post_enrollment_guard();

create or replace function public.conversion_deal_cohort_truncate_guard()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $function$
begin
  if exists (select 1 from public.conversion_deal_cohort where post_enrollment_exclusion_reason is not null) then
    raise exception 'CONVERSION_COHORT_POST_ENROLLMENT_DELETE_FORBIDDEN';
  end if;
  return null;
end;
$function$;

drop trigger if exists conversion_deal_cohort_truncate_guard on public.conversion_deal_cohort;
create trigger conversion_deal_cohort_truncate_guard
  before truncate on public.conversion_deal_cohort
  for each statement execute function public.conversion_deal_cohort_truncate_guard();

-- Triggerfunktioner kaldes kun af triggere; ingen rolle skal kunne EXECUTE dem direkte.
revoke execute on function public.conversion_deal_cohort_post_enrollment_guard() from public;
revoke execute on function public.conversion_deal_cohort_post_enrollment_guard() from anon;
revoke execute on function public.conversion_deal_cohort_post_enrollment_guard() from authenticated;
revoke execute on function public.conversion_deal_cohort_truncate_guard() from public;
revoke execute on function public.conversion_deal_cohort_truncate_guard() from anon;
revoke execute on function public.conversion_deal_cohort_truncate_guard() from authenticated;
revoke execute on function public.conversion_deal_cohort_post_enrollment_guard() from service_role;
revoke execute on function public.conversion_deal_cohort_truncate_guard() from service_role;

-- ----------------------------------------------------------------------------
-- 4. Skrivevej v3
-- ----------------------------------------------------------------------------
create or replace function public.conversion_parse_batch_v3(p_rows jsonb)
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
  post_enrollment_exclusion_reason text,
  post_enrollment_excluded_at timestamptz,
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
      post_enrollment_exclusion_reason text,
      post_enrollment_excluded_at timestamptz,
      outcome_status text,
      first_booked_at timestamptz,
      lost_observed_at timestamptz,
      outcome_conflict_observed_at timestamptz,
      contract_version integer
    );
$function$;

create or replace function public.conversion_commit_sync_run_v3(
  p_run_id uuid,
  p_sync_generation bigint,
  p_contract_version integer,
  p_observed_at timestamptz,
  p_is_baseline boolean,
  p_rows jsonb
)
returns table (
  observed_count integer,
  enrolled_count integer,
  excluded_count integer,
  booked_count integer,
  conflict_count integer,
  post_enrollment_excluded_count integer
)
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
  v_post integer;
begin
  perform pg_advisory_xact_lock(hashtext('public.conversion_sync'));

  if p_contract_version is null or p_contract_version < 3 then
    raise exception 'CONVERSION_CONTRACT_VERSION_MISMATCH';
  end if;

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

  select count(distinct b.deal_key) into v_distinct from public.conversion_parse_batch_v3(p_rows) b;
  if v_distinct <> v_len or exists (select 1 from public.conversion_parse_batch_v3(p_rows) b where b.deal_key is null) then
    raise exception 'CONVERSION_DUPLICATE_DEAL_KEY';
  end if;
  if exists (select 1 from public.conversion_parse_batch_v3(p_rows) b where b.contract_version is distinct from p_contract_version) then
    raise exception 'CONVERSION_ROW_CONTRACT_VERSION';
  end if;
  if exists (select 1 from public.conversion_parse_batch_v3(p_rows) b where b.last_observed_at > p_observed_at) then
    raise exception 'CONVERSION_ROW_OBSERVED_AT';
  end if;
  if p_is_baseline and exists (
       select 1 from public.conversion_parse_batch_v3(p_rows) b
        where b.eligibility_status not in ('ELIGIBLE_PENDING', 'PRE_START_EXISTING')
           or b.last_observed_at <> p_observed_at) then
    raise exception 'CONVERSION_BASELINE_STATUS';
  end if;
  if exists (
       select 1
         from public.conversion_parse_batch_v3(p_rows) b
         left join public.conversion_deal_cohort c on c.deal_key = b.deal_key
        where (c.deal_key is null or c.eligibility_status = 'ELIGIBLE_PENDING')
          and ((not p_is_baseline and b.eligibility_status = 'PRE_START_EXISTING')
               or (b.first_qualified_observation_at is not null
                   and b.first_qualified_observation_at <> p_observed_at))) then
    raise exception 'CONVERSION_COHORT_START_INVALID';
  end if;
  -- Gate C2: en NY markering (ny række, eller eksisterende række uden
  -- markering) skal bære præcis denne kørsels observed_at — aldrig et
  -- historisk eller fremtidigt tidspunkt.
  if exists (
       select 1
         from public.conversion_parse_batch_v3(p_rows) b
         left join public.conversion_deal_cohort c on c.deal_key = b.deal_key
        where b.post_enrollment_exclusion_reason is not null
          and (c.deal_key is null or c.post_enrollment_exclusion_reason is null)
          and b.post_enrollment_excluded_at is distinct from p_observed_at) then
    raise exception 'CONVERSION_POST_ENROLLMENT_AT_INVALID';
  end if;

  perform set_config('conversion.active_run', p_run_id::text, true);

  insert into public.conversion_deal_cohort as c (
    deal_key, booking_match_key, first_seen_at, last_observed_at, first_qualified_observation_at,
    exposure_group, exposure_frozen_at, eligibility_status, exclusion_reason,
    booking_conflict_detected_at, post_enrollment_exclusion_reason, post_enrollment_excluded_at,
    outcome_status, first_booked_at, lost_observed_at,
    outcome_conflict_observed_at, contract_version, last_sync_run_id
  )
  select deal_key, booking_match_key, first_seen_at, last_observed_at, first_qualified_observation_at,
         exposure_group, exposure_frozen_at, eligibility_status, exclusion_reason,
         booking_conflict_detected_at, post_enrollment_exclusion_reason, post_enrollment_excluded_at,
         outcome_status, first_booked_at, lost_observed_at,
         outcome_conflict_observed_at, contract_version, p_run_id
    from public.conversion_parse_batch_v3(p_rows)
  on conflict (deal_key) do update set
    booking_match_key                = excluded.booking_match_key,
    first_seen_at                    = excluded.first_seen_at,
    last_observed_at                 = excluded.last_observed_at,
    first_qualified_observation_at   = excluded.first_qualified_observation_at,
    exposure_group                   = excluded.exposure_group,
    exposure_frozen_at               = excluded.exposure_frozen_at,
    eligibility_status               = excluded.eligibility_status,
    exclusion_reason                 = excluded.exclusion_reason,
    booking_conflict_detected_at     = excluded.booking_conflict_detected_at,
    post_enrollment_exclusion_reason = excluded.post_enrollment_exclusion_reason,
    post_enrollment_excluded_at      = excluded.post_enrollment_excluded_at,
    outcome_status                   = excluded.outcome_status,
    first_booked_at                  = excluded.first_booked_at,
    lost_observed_at                 = excluded.lost_observed_at,
    outcome_conflict_observed_at     = excluded.outcome_conflict_observed_at,
    contract_version                 = excluded.contract_version,
    last_sync_run_id                 = excluded.last_sync_run_id;

  select count(*) filter (where last_observed_at = p_observed_at),
         count(*) filter (where eligibility_status = 'ENROLLED'),
         count(*) filter (where eligibility_status = 'EXCLUDED'),
         count(*) filter (where outcome_status = 'BOOKED'),
         count(*) filter (where booking_conflict_detected_at is not null),
         count(*) filter (where post_enrollment_exclusion_reason is not null)
    into v_observed, v_enrolled, v_excluded, v_booked, v_conflicts, v_post
    from public.conversion_parse_batch_v3(p_rows);

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

  return query select v_observed, v_enrolled, v_excluded, v_booked, v_conflicts, v_post;
end;
$function$;

revoke execute on function public.conversion_parse_batch_v3(jsonb) from public;
revoke execute on function public.conversion_parse_batch_v3(jsonb) from anon;
revoke execute on function public.conversion_parse_batch_v3(jsonb) from authenticated;
grant  execute on function public.conversion_parse_batch_v3(jsonb) to service_role;

revoke execute on function public.conversion_commit_sync_run_v3(uuid, bigint, integer, timestamptz, boolean, jsonb) from public;
revoke execute on function public.conversion_commit_sync_run_v3(uuid, bigint, integer, timestamptz, boolean, jsonb) from anon;
revoke execute on function public.conversion_commit_sync_run_v3(uuid, bigint, integer, timestamptz, boolean, jsonb) from authenticated;
grant  execute on function public.conversion_commit_sync_run_v3(uuid, bigint, integer, timestamptz, boolean, jsonb) to service_role;

-- 013's skrivevej kender ikke markeringen ⇒ ingen rolle må længere bruge den.
-- Funktionerne bevares (rollback gen-granter), men kan ikke kaldes af app'en.
revoke execute on function public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb) from service_role;
revoke execute on function public.conversion_parse_batch(jsonb) from service_role;

-- ----------------------------------------------------------------------------
-- 5. Kontraktversion 2 → 3 (kontrolleret)
-- ----------------------------------------------------------------------------
alter table public.conversion_measurement_state alter column contract_version set default 3;

-- Kun en ikke-startet singleton løftes (§0 har allerede afvist en startet
-- måling under anden version). I production findes rækken ikke (0 rækker) ⇒
-- no-op. Opretter ALDRIG en række.
update public.conversion_measurement_state
   set contract_version = 3
 where id = 1
   and contract_version <> 3
   and status = 'NOT_STARTED'
   and measurement_started_at is null;

comment on column public.conversion_measurement_state.contract_version is
  'Skal være lig runtime CONTRACT_VERSION i src/lib/conversion/contract.ts (pt. 3, løftet af migration 014). Uoverensstemmelse ⇒ sync afvises (CONTRACT_VERSION_MISMATCH).';

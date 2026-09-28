-- ============================================================================
-- ROLLBACK for migration 014 (Gate C2, Issue #86) — IKKE en migration.
-- ============================================================================
-- Køres kun efter Rickos eksplicitte godkendelse og SAMMEN med en rollback af
-- app-koden (koden efter PR'en kalder conversion_commit_sync_run_v3 og læser
-- post_enrollment_*-kolonnerne; mod et 013-skema fejler den lukket — ingen
-- skrivning, admin viser "degraded" hvis målingen er startet).
--
-- Gendanner præcis 013-tilstanden (verificeret i
-- src/lib/conversion/migration014.sql.test.ts: katalog efter 014 + denne fil
-- = katalog efter ren 013).
--
-- IRREVERSIBELT/BLOKERET MED VILJE: findes der blot én markeret række, afbrydes
-- rollback (CONVERSION_014_ROLLBACK_WOULD_DROP_AUDIT_TRAIL) — at droppe
-- kolonnerne ville slette revisionssporet. Er målingen startet under v3,
-- afbrydes også (CONVERSION_014_ROLLBACK_REQUIRES_NOT_STARTED): rækker skrevet
-- under kontrakt 3 må ikke stiltiende blive "v2". Begge kræver en separat
-- beslutning. Alt kører i én transaktion.
-- ============================================================================
begin;

do $$
begin
  if exists (select 1 from public.conversion_deal_cohort where post_enrollment_exclusion_reason is not null) then
    raise exception 'CONVERSION_014_ROLLBACK_WOULD_DROP_AUDIT_TRAIL';
  end if;
  if exists (select 1 from public.conversion_measurement_state
              where status <> 'NOT_STARTED' or measurement_started_at is not null) then
    raise exception 'CONVERSION_014_ROLLBACK_REQUIRES_NOT_STARTED';
  end if;
end;
$$;

-- Skrivevej: 013 tilbage, v3 væk.
grant execute on function public.conversion_commit_sync_run(uuid, bigint, integer, timestamptz, boolean, jsonb) to service_role;
grant execute on function public.conversion_parse_batch(jsonb) to service_role;
drop function if exists public.conversion_commit_sync_run_v3(uuid, bigint, integer, timestamptz, boolean, jsonb);
drop function if exists public.conversion_parse_batch_v3(jsonb);

-- Triggere og triggerfunktioner.
drop trigger if exists conversion_deal_cohort_truncate_guard on public.conversion_deal_cohort;
drop trigger if exists conversion_deal_cohort_post_enrollment_guard on public.conversion_deal_cohort;
drop function if exists public.conversion_deal_cohort_truncate_guard();
drop function if exists public.conversion_deal_cohort_post_enrollment_guard();

-- Constraints og kolonner (tomme — kontrolleret ovenfor).
alter table public.conversion_deal_cohort
  drop constraint if exists conversion_deal_cohort_post_enrollment_reason_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_pair_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_requires_enrolled_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_order_check,
  drop constraint if exists conversion_deal_cohort_post_enrollment_contract_check;
alter table public.conversion_deal_cohort
  drop column if exists post_enrollment_excluded_at,
  drop column if exists post_enrollment_exclusion_reason;

-- Kontraktversion 3 → 2 (kun en ikke-startet singleton; opretter aldrig en række).
alter table public.conversion_measurement_state alter column contract_version set default 2;
update public.conversion_measurement_state
   set contract_version = 2
 where id = 1 and contract_version = 3 and status = 'NOT_STARTED' and measurement_started_at is null;

-- 013's kommentarer (ordret).
comment on table public.conversion_deal_cohort is
  'Én pseudonymiseret række pr. HubSpot-deal (Gate B, Issue #80). ALDRIG rå deal-id, bookingnummer i klartekst, kundenavn, e-mail eller payloads. Kan KUN skrives inde i conversion_commit_sync_run (trigger). Frosne felter (eligibility, årsag, kohortestart, eksponering, bookingnøgle, booket, tabt, konflikter) håndhæves af triggeren conversion_deal_cohort_guard.';
comment on column public.conversion_measurement_state.contract_version is
  'Skal være lig runtime CONTRACT_VERSION i src/lib/conversion/contract.ts (pt. 2). Uoverensstemmelse ⇒ sync afvises (CONTRACT_VERSION_MISMATCH).';

commit;

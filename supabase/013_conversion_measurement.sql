-- ============================================================================
-- Migration 013: prospektiv konverteringsmåling (Vision 3.0 Fase 5, Gate B —
-- Issue #80, barn af Gate A/Issue #78, PR #79)
-- ============================================================================
-- GATE B1: denne fil er BYGGET SOM FIL MEN IKKE ANVENDT. Ingen `supabase db
-- push`/SQL Editor-kørsel er sket i denne PR. Anvendelse i production kræver
-- Gate B2 (Rickos eksplicitte, separate godkendelse) — se
-- docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md og
-- docs/VISION-3.0-PHASE-5-GATE-B1-RUNBOOK.md.
--
-- Filnavn følger repoets egen, dokumenterede nummereringskonvention
-- (supabase/README.md §Regler: "Ny DDL = ny nummereret fil"). "013" er det
-- deterministisk næste tal efter 012. Idempotent (`if not exists` / `drop ...
-- if exists` / `or replace`), som resten af mappen.
--
-- ARKITEKTUR (Gate B0, ADR A — se docs/VISION-3.0-PHASE-5-GATE-B0-ADR.md):
-- direkte, read-only HubSpot-læsning i DETTE projekt (Online Rejseplan). Ingen
-- Marketing Dashboard-afhængighed, ingen nyt tværrepo-secret. Samme
-- trust-model som Analytics Bridge (Issue #45): server-side-only secrets,
-- service-role-only DB-adgang, ingen kundedata i klientkode.
--
-- BINDENDE FAKTA FRA GATE A (Issue #78, PR #79) — gentages IKKE som ny
-- beslutning her, kun som kontrakt denne tabelstruktur håndhæver:
--   · Historisk rekonstruktion er UNUSABLE og bruges ALDRIG som datagrundlag.
--   · Målingen starter prospektivt ved første succesfulde, GODKENDTE
--     produktionssynkronisering (Gate D, separat fra denne migration).
--   · Pipeline 754595640 · "Tilbud sendt" = stage 1098732868 ·
--     "Opdateret tilbud" = stage 1169407502 (nulstiller aldrig kohorten) ·
--     bookingfelt unique_travel_bookingno · outcome afgøres af
--     unique_travel_dealstatus + hs_is_closed/hs_is_closed_won, ALDRIG af
--     dealstage alene.
--   · Screened tæller aldrig som "tilbud sendt".
--   · Eksponeringsgruppen (ONLINE/PDF_ONLY) fryses ved første kvalificerede
--     observation og ændres ALDRIG bagudrettet.
--   · Systemet må sige "online rejseplan eksisterede/oprettet" — ALDRIG at
--     kunden modtog eller åbnede linket.
--
-- INGEN KUNDEDATA, INGEN RÅ HUBSPOT-ID'ER: samme never-store-disciplin som
-- 009-012. Se hver tabels kommentar nedenfor for den præcise never-store-liste.
-- ============================================================================

-- ============================================================================
-- TABEL 1: conversion_measurement_state — singleton måle-konfiguration
-- ============================================================================
-- Præcis ÉN række (id = 1, håndhævet af CHECK). Ingen secrets her — kun
-- driftsstatus. `measurement_started_at` er det ENESTE, uforanderlige
-- prospektive nulpunkt (Gate D sætter den; herefter er den frosset — se
-- triggeren nedenfor).

create table if not exists public.conversion_measurement_state (
  id                       integer     primary key default 1
                             constraint conversion_measurement_state_singleton check (id = 1),
  status                   text        not null default 'NOT_STARTED'
                             constraint conversion_measurement_state_status_check
                             check (status in ('NOT_STARTED', 'ACTIVE', 'PAUSED')),
  contract_version         integer     not null default 1,
  measurement_started_at   timestamptz,
  last_successful_sync_at  timestamptz,
  updated_at               timestamptz not null default now()
);

comment on table public.conversion_measurement_state is
  'Singleton (id=1) driftsstatus for Vision 3.0 Fase 5 konverteringsmåling (Gate B, Issue #80). Ingen secrets, ingen kundedata. measurement_started_at er det uforanderlige prospektive nulpunkt — sættes ÉN gang ved Gate D og kan herefter aldrig ændres (håndhæves af trigger nedenfor). Gate B1 efterlader status=NOT_STARTED og measurement_started_at=null.';
comment on column public.conversion_measurement_state.status is
  'NOT_STARTED = målingen er ikke startet (Gate B/B1-tilstand). ACTIVE = officiel prospektiv måling kører (sat ved Gate D). PAUSED = midlertidigt sat på pause af Ricko (fremtidig drift, ikke brugt i Gate B1).';
comment on column public.conversion_measurement_state.contract_version is
  'Versioneret pipeline-/stage-/feltkontrakt (pipeline 754595640, stage-id''er, bookingfelt) — se src/lib/conversion/contract.ts. Kontraktdrift (fx et ændret stage-id) skal bumpe denne version og fail-closed hele sync''en, ikke stille skifte betydning.';
comment on column public.conversion_measurement_state.measurement_started_at is
  'Sættes ÉN gang, af den første succesfulde, GODKENDTE produktionssynkronisering (Gate D). Uforanderlig herefter (trigger). NULL indtil da — dette ER "ikke startet"-tilstanden Gate B1 leverer.';

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
-- Ingen DELETE: singleton-rækken slettes aldrig af app-kode.

-- Håndhæv "measurement_started_at er uforanderlig, når den først er sat" i
-- databasen, ikke kun i applikationskoden — en fremtidig kodefejl må ikke
-- kunne flytte det prospektive nulpunkt.
create or replace function public.conversion_measurement_state_guard_started_at()
returns trigger
language plpgsql
as $function$
begin
  if old.measurement_started_at is not null
     and new.measurement_started_at is distinct from old.measurement_started_at then
    raise exception 'measurement_started_at er uforanderlig, når den er sat (var %, forsøgt %)',
      old.measurement_started_at, new.measurement_started_at;
  end if;
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists conversion_measurement_state_guard on public.conversion_measurement_state;
create trigger conversion_measurement_state_guard
  before update on public.conversion_measurement_state
  for each row execute function public.conversion_measurement_state_guard_started_at();

-- Singleton-rækken oprettes IKKE af denne migration (bevidst) — appen
-- læser en manglende række som "ikke startet" (samme fail-closed-mønster
-- som manglende trip_visits-række = "ikke åbnet endnu" ELLER "ikke målt",
-- afhængig af TRACKING_SINCE). En eksplicit seed-INSERT sker først ved
-- Gate B2/D-runbooken, aldrig automatisk her.

-- ============================================================================
-- TABEL 2: conversion_deal_cohort — én række pr. pseudonymiseret HubSpot-deal
-- ============================================================================
-- ALDRIG rå HubSpot deal-id, bookingnummer i klartekst, kundenavn, e-mail
-- eller andre feltværdier. `deal_key` er en domæneadskilt HMAC (se
-- src/lib/conversion/dealKey.ts) — samme princip som Analytics Bridges
-- booking_match_key (Issue #45), men med sin EGEN, uafhængige secret
-- (HUBSPOT_DEAL_KEY_SECRET), så de to nøglerum aldrig kan krydses eller
-- roteres sammen ved en fejl.

create table if not exists public.conversion_deal_cohort (
  deal_key                        text        primary key,
  booking_match_key               text,
  first_seen_at                   timestamptz not null,
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
                                       'CONTRACT_DRIFT'
                                     )),
  outcome_status                  text        not null default 'NOT_BOOKED'
                                     constraint conversion_deal_cohort_outcome_check
                                     check (outcome_status in ('NOT_BOOKED', 'BOOKED')),
  first_booked_at                 timestamptz,
  lost_observed_at                timestamptz,
  contract_version                integer     not null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  -- Eksponeringsgruppen må kun sættes SAMMEN MED sit frys-tidsstempel, og
  -- aldrig det ene uden det andet — forhindrer en "halvt frosset" række.
  constraint conversion_deal_cohort_exposure_pair_check
    check ((exposure_group is null) = (exposure_frozen_at is null)),
  -- ENROLLED kræver en frosset eksponeringsgruppe og en kvalificeret
  -- observation; EXCLUDED kræver en årsag; de to er gensidigt udelukkende
  -- invarianter håndhævet i databasen, ikke kun i applikationskoden.
  constraint conversion_deal_cohort_enrolled_requires_exposure_check
    check (eligibility_status <> 'ENROLLED' or exposure_group is not null),
  constraint conversion_deal_cohort_excluded_requires_reason_check
    check (eligibility_status <> 'EXCLUDED' or exclusion_reason is not null),
  constraint conversion_deal_cohort_non_excluded_no_reason_check
    check (eligibility_status = 'EXCLUDED' or exclusion_reason is null),
  -- "Booket kan gå fra falsk til sand" — first_booked_at kan kun være sat
  -- når outcome_status = 'BOOKED', og omvendt.
  constraint conversion_deal_cohort_booked_pair_check
    check ((outcome_status = 'BOOKED') = (first_booked_at is not null))
);

comment on table public.conversion_deal_cohort is
  'Én pseudonymiseret række pr. HubSpot-deal, Vision 3.0 Fase 5 (Gate B, Issue #80). ALDRIG rå HubSpot deal-id, bookingnummer i klartekst, kundenavn, e-mail eller HubSpot-payloads. deal_key er domæneadskilt HMAC (egen secret, ikke booking_match_key-secreten). Skrives kun af sync-motoren via service_role; idempotent upsert på deal_key (primærnøgle). Eksponeringsgruppen (ONLINE/PDF_ONLY) fryses permanent ved første kvalificerede observation og kan aldrig ændres af en normal sync (håndhæves af applikationslogik + reviewet i tests — se src/lib/conversion/classify.ts).';
comment on column public.conversion_deal_cohort.deal_key is
  'HMAC-SHA256(HUBSPOT_DEAL_KEY_SECRET, "dealkey:v1:" || hubspot_deal_id) — aldrig det rå deal-id. Egen secret, uafhængig af booking_match_key, så nøglerummene kan roteres uafhængigt (samme princip som ANALYTICS_BRIDGE_API_KEY ≠ BOOKING_MATCH_SECRET, jf. docs/ANALYTICS-BRIDGE-API.md).';
comment on column public.conversion_deal_cohort.booking_match_key is
  'Samme HMAC-kontrakt som Analytics Bridges booking_match_key (Issue #45) — sat KUN når et gyldigt, ikke-delt bookingnummer blev normaliseret og hashet ved første kvalificerede observation. NULL for ekskluderede/endnu ikke kvalificerede deals.';
comment on column public.conversion_deal_cohort.first_seen_at is
  'Første gang denne deal blev observeret i en sync, uanset kvalifikationstilstand — bruges kun til drift/audit, ALDRIG som kohorte-nulpunkt (det er first_qualified_observation_at).';
comment on column public.conversion_deal_cohort.first_qualified_observation_at is
  'Første gang dealen blev observeret som havende passeret stage 1098732868 ("Tilbud sendt") eller senere, PÅ ELLER EFTER conversion_measurement_state.measurement_started_at. Dette ER kohorte-nulpunktet for denne deal. Sættes ÉN gang, ændres aldrig.';
comment on column public.conversion_deal_cohort.exposure_group is
  'ONLINE = en matchende online rejseplan eksisterede (trips.created_at <= first_qualified_observation_at) på observationstidspunktet. PDF_ONLY = ingen matchende online rejseplan på det tidspunkt. Frosset permanent sammen med exposure_frozen_at — en SENERE oprettet online rejseplan ændrer IKKE denne værdi (Gate A''s eksplicitte krav).';
comment on column public.conversion_deal_cohort.eligibility_status is
  'PRE_START_EXISTING = dealen var allerede på "Tilbud sendt" eller senere FØR measurement_started_at — udelukkes permanent fra konverteringsmålingen (forhindrer skjult historisk backfill). ELIGIBLE_PENDING = endnu ikke kvalificeret (fx Screened) eller observeret før baseline var sat — kan senere optages, hvis/når dealen når "Tilbud sendt" EFTER measurement_started_at. ENROLLED = optaget præcis én gang i konverteringsmålingen, med frosset eksponeringsgruppe. EXCLUDED = permanent udelukket med en eksplicit årsagskode (aldrig stiltiende PDF_ONLY).';
comment on column public.conversion_deal_cohort.exclusion_reason is
  'Kun sat når eligibility_status = EXCLUDED. MISSING_BOOKING_NO/INVALID_BOOKING_NO_FORMAT/SHARED_BOOKING_REFERENCE = bookingnummeret kunne ikke bruges pålideligt til at afgøre ONLINE/PDF_ONLY — dealen bliver ALDRIG automatisk PDF_ONLY af den grund. CONTRACT_DRIFT = pipeline/stage-kontrakten stemte ikke overens med live HubSpot-metadata på observationstidspunktet.';
comment on column public.conversion_deal_cohort.outcome_status is
  'Binært hovedudfald (Gate A/B''s forenklede model): BOOKED eller NOT_BOOKED. Kan gå fra NOT_BOOKED til BOOKED, ALDRIG tilbage — en allerede registreret booking må aldrig fjernes ved senere kildedrift.';
comment on column public.conversion_deal_cohort.first_booked_at is
  'Første observerede tidspunkt for unique_travel_dealstatus i UT''s solgt-buckets ELLER hs_is_closed_won=true (jf. Gate A''s outcome-definition). Sat sammen med outcome_status=BOOKED; ændres aldrig efter det er sat.';
comment on column public.conversion_deal_cohort.lost_observed_at is
  'Sekundært DATAKVALITETS-signal, ikke en del af hovedudfaldet (Gate B''s eksplicitte instruks: "tabt/afvist må gerne registreres separat som datakvalitet"). Sættes hvis HubSpot rapporterer hs_is_closed=true og hs_is_closed_won=false for en deal der ikke er BOOKED. Bruges IKKE til at beregne konverteringsprocenten — kun til datakvalitetsrapportering i adminvisningen.';
comment on column public.conversion_deal_cohort.contract_version is
  'Pipeline-/stage-/feltkontraktversionen dealen sidst blev klassificeret under — se conversion_measurement_state.contract_version.';

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
-- Ingen DELETE: en optaget/ekskluderet deal fjernes aldrig af normal drift.

create index if not exists conversion_deal_cohort_eligibility_idx
  on public.conversion_deal_cohort (eligibility_status);
create index if not exists conversion_deal_cohort_exposure_idx
  on public.conversion_deal_cohort (exposure_group)
  where exposure_group is not null;
create index if not exists conversion_deal_cohort_qualified_at_idx
  on public.conversion_deal_cohort (first_qualified_observation_at)
  where first_qualified_observation_at is not null;

-- updated_at holdes ajour af samme genbrugte helper som trips (001).
drop trigger if exists conversion_deal_cohort_set_updated_at on public.conversion_deal_cohort;
create trigger conversion_deal_cohort_set_updated_at
  before update on public.conversion_deal_cohort
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TABEL 3: conversion_sync_runs — én revisionsrække pr. synkroniseringskørsel
-- ============================================================================
-- Ingen credentials, bookingnumre, kundedata eller rå HubSpot-payloads —
-- kun sikre aggregater og fejlkoder. Bruges til admin-visningens
-- "seneste succesfulde synkronisering"/friskhed samt drift-audit.

create table if not exists public.conversion_sync_runs (
  id                      uuid        primary key default gen_random_uuid(),
  started_at              timestamptz not null default now(),
  finished_at             timestamptz,
  status                  text        not null default 'RUNNING'
                            constraint conversion_sync_runs_status_check
                            check (status in ('RUNNING', 'SUCCEEDED', 'FAILED')),
  contract_version        integer     not null,
  watermark               text,
  error_code              text,
  deals_observed_count    integer,
  deals_enrolled_count    integer,
  deals_excluded_count    integer,
  deals_booked_count      integer,
  created_at              timestamptz not null default now(),
  constraint conversion_sync_runs_finished_requires_status_check
    check (status = 'RUNNING' or finished_at is not null),
  constraint conversion_sync_runs_failed_requires_error_check
    check (status <> 'FAILED' or error_code is not null)
);

comment on table public.conversion_sync_runs is
  'Revisionsrække pr. HubSpot-synkroniseringskørsel, Vision 3.0 Fase 5 (Gate B, Issue #80). Kun sikre aggregater (tal) og fejlkoder — ALDRIG credentials, bookingnumre, kundedata eller rå HubSpot-payloads. "Fuld kilde eller ingen commit af kørslen": en fejlet/afbrudt kørsel efterlader status=FAILED og rører IKKE conversion_deal_cohort (se src/lib/conversion/syncEngine.ts for den transaktionelle garanti).';
comment on column public.conversion_sync_runs.watermark is
  'Opaque, ikke-følsom pagineringsmarkør/cursor til fejlsøgning af en afbrudt kørsel — aldrig et bookingnummer eller deal-id i klartekst.';
comment on column public.conversion_sync_runs.error_code is
  'Sikker, kategorisk fejlkode (fx CONTRACT_DRIFT, HTTP_401, HTTP_429, HTTP_5XX, NETWORK_ERROR, PAGE_INCONSISTENT, TOTAL_MISMATCH) — aldrig en rå exception-besked eller stack trace, der kan indeholde interne detaljer.';

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
-- Ingen DELETE: retention for denne tabel er en separat, fremtidig
-- release-/policy-beslutning (samme princip som 010b/012's retention-note) —
-- ikke defineret eller aktiveret i denne migration.

create index if not exists conversion_sync_runs_started_at_idx
  on public.conversion_sync_runs (started_at desc);

-- ============================================================================
-- RETENTION — bevidst IKKE en del af denne migration
-- ============================================================================
-- Ingen pg_cron/retention-mekanisme for nogen af de tre tabeller aktiveres
-- her — samme princip som 010b/012. Datamængden er lille (én række pr. deal
-- i én HubSpot-pipeline, én række pr. daglig sync-kørsel), og retention er
-- en separat, fremtidig release-/policy-beslutning, der kræver Rickos
-- eksplicitte godkendelse.
-- ============================================================================

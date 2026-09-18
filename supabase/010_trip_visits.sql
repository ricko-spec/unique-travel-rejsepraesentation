-- ============================================================================
-- Migration 010: trip_visits — cookie-fri kundeåbninger (Vision 3.0 Fase 1B, Issue #65)
-- ============================================================================
-- IKKE kørt live endnu. Idempotent — klar til at køres i SQL Editor når Ricko
-- godkender release-rækkefølgen (se docs/VISION-3.0-EVENT-MODEL.md §12 og
-- PR-beskrivelsen for Issue #65). Denne fil opretter KUN tabel, RLS-policy,
-- index og skriv-RPC'en — INGEN retention/pg_cron. Retention-mekanismen er
-- bevidst versioneret i en SEPARAT fil (010b_trip_visits_retention.sql) der
-- IKKE må køres sammen med denne, og som kræver Rickos særskilte godkendelse.
--
-- Design- og beslutningsgrundlag: docs/VISION-3.0-EVENT-MODEL.md (revideret
-- af Issue #63/PR #64, anbefaler Model B) + Issue #65 (Rickos godkendelse af
-- Model B, 2026-09-17). Model B er nu VALGT — ikke længere kun anbefalet.
--
-- Model B kort: ingen ny analytics-cookie, ingen persistent kunde-/
-- sessionidentifikator, ingen middleware-udvidelse til kundesider. Et besøg
-- er en sammenhængende læseperiode PR. REJSEPLAN (ikke pr. browser/enhed),
-- afgrænset af 30 minutters inaktivitet, registreret server-side i
-- src/app/[bookingId]/page.tsx EFTER den eksisterende adgangskontrol
-- (hasValidTripAccess) — aldrig før.
--
-- Bevidst egen tabel, ikke kolonner på trips: trips har en BEFORE UPDATE-
-- trigger (trips_set_updated_at, supabase/001_trips.sql) der sætter
-- updated_at ved enhver ændring — og updated_at betyder i dag "sælgeren
-- ændrede rejseplanen" (admin/api/trips-listen bruger det sådan). Kolonner
-- på trips ville lade hver kundeåbning bumpe det felt og gøre admin-listens
-- "senest ændret" ubrugelig. Samme mønster som audit_log, rate_limits,
-- parse_failures, upload_events: hver tværgående bekymring får sin egen
-- service-role-only tabel.
--
-- Ingen kundedata gemmes: ingen booking_no (hverken klartekst eller hash),
-- ingen slug, ingen IP, ingen User-Agent, intet navn, ingen cookie-/
-- session-id. Kun trip_id (allerede intern) + tre tidsstempler + to heltal.
-- ============================================================================

create table if not exists public.trip_visits (
  trip_id               uuid primary key
                          references public.trips(id) on delete cascade,
  first_opened_at       timestamptz not null default now(),
  last_visit_started_at timestamptz not null default now(),
  last_opened_at        timestamptz not null default now(),
  visit_count           integer     not null default 1,
  open_count            integer     not null default 1
);

comment on table public.trip_visits is
  'Kundeåbninger pr. rejseplan (Vision 3.0 Fase 1B, Issue #65). Én række pr. trip — aldrig pr. person, enhed eller session. Ingen identifikator af nogen art: ingen cookie, ingen IP, ingen user-agent, intet bookingnummer, intet navn. Skrives kun via record_trip_visit(). Service-role-only. Retention: 12 måneder efter last_opened_at, se 010b_trip_visits_retention.sql (IKKE aktiveret).';
comment on column public.trip_visits.trip_id is
  'FK til trips.id, on delete cascade — en slettet rejseplan tager sine besøgsdata med sig. Ingen anden identifikator er nødvendig eller gemt.';
comment on column public.trip_visits.first_opened_at is
  'Første kvalificerede kundeåbning. Sættes på insert-grenen i record_trip_visit() og opdateres ALDRIG efterfølgende.';
comment on column public.trip_visits.last_visit_started_at is
  'Starttidspunkt for den seneste besøgsperiode (opdateres kun når et NYT besøg starter, dvs. når last_opened_at var mere end 30 minutter gammel).';
comment on column public.trip_visits.last_opened_at is
  'Tidspunkt for seneste kvalificerede render, uanset om det var et nyt besøg eller en fortsættelse af det aktuelle. Opdateres ved HVER kvalificeret skrivning.';
comment on column public.trip_visits.visit_count is
  'Antal besøgsperioder. Et nyt besøg tælles kun når der er gået mere end 30 minutter siden last_opened_at — på tværs af alle enheder, jf. Model B (Issue #63/#65). Kan ikke manipuleres af klienten: håndhævet udelukkende mod serverens eget ur og den låste rækkes tilstand i record_trip_visit().';
comment on column public.trip_visits.open_count is
  'Samlet antal kvalificerede sidevisninger. Blødt signal: refresh og flere enheder inden for samme 30-minutters besøg tæller her, men rører aldrig visit_count.';

-- Ingen trigger på denne tabel (specifikt ikke trips_set_updated_at-mønstret)
-- — last_opened_at ER "sidst rørt"-feltet, sat eksplicit i RPC'en nedenfor.

alter table public.trip_visits enable row level security;

drop policy if exists "service_role full access trip_visits" on public.trip_visits;
create policy "service_role full access trip_visits"
  on public.trip_visits for all
  to service_role
  using (true)
  with check (true);

-- Dækker: WHERE trip_id = ... (primærnøgle, allerede dækket) og en fremtidig
-- Fase 1C-sortering/-filtrering af admin-listen på seneste aktivitet.
create index if not exists trip_visits_last_opened_idx
  on public.trip_visits (last_opened_at desc);

-- ============================================================================
-- record_trip_visit(p_trip_id uuid) — den atomare skrive-operation
-- ============================================================================
-- Ét statement. Intet SELECT forud, intet læs-så-skriv — hverken i Node eller
-- i selve SQL'en. Kaldes UDELUKKENDE fra src/lib/trip-visit-write.ts
-- (recordTripVisit()), aldrig direkte fra klientkode.
--
-- Samme begrundelse for RPC frem for supabase.from().upsert() som
-- increment_rate_limit (migration 005): klientbiblioteket kan ikke udtrykke
-- "open_count + 1" eller et betinget CASE-udtryk på konfliktgrenen.
--
-- Sammenligning med increment_rate_limit (migration 005, i produktion siden
-- 2026-06-15, samme mønster genbrugt her — ikke nyudviklet arkitektur):
--   increment_rate_limit: on conflict (key) do update
--     set count = case when rate_limits.reset_at < now() then 1
--                       else rate_limits.count + 1 end
--   record_trip_visit:    on conflict (trip_id) do update
--     set visit_count = tv.visit_count
--                        + (case when tv.last_opened_at < now() - interval '30 minutes'
--                                then 1 else 0 end)
-- Begge er "tidsbetinget tæller på en låst række" — record_trip_visit har
-- blot et RULLENDE prædikat (sammenlignet mod last_opened_at, der selv
-- flytter sig ved hvert kald) i stedet for increment_rate_limit's ABSOLUTTE
-- prædikat (sammenlignet mod et fast reset_at sat ved vinduets start).
--
-- UR-VALG: clock_timestamp(), IKKE now() (review-fund på PR #66, rettet).
-- now()/transaction_timestamp() er FAST ved transaktionens/statementets
-- START — ikke ved det tidspunkt SET-udtrykkene faktisk evalueres. En
-- transaktion der må VENTE på rækkelåsen (fordi en anden transaktion nåede
-- konfliktgrenen først) ville derfor kunne skrive last_opened_at med SIT
-- EGET, ældre now()-tidspunkt — selvom en anden transaktion i mellemtiden
-- allerede har committet en nyere last_opened_at. En transaktion der startede
-- FØR en anden, men låser EFTER den, kunne dermed i princippet skrive
-- last_opened_at BAGLÆNS. clock_timestamp() er IKKE fast: den returnerer det
-- faktiske ur-tidspunkt ved hvert kald. Fordi SET-udtrykkene for
-- ON CONFLICT DO UPDATE først evalueres EFTER rækkelåsen er taget (punkt 2
-- nedenfor), reflekterer et clock_timestamp()-kald i SET-udtrykket altid
-- "nu" på det tidspunkt hvor DENNE transaktion rent faktisk fik lov at
-- skrive — aldrig et tidspunkt fra før den ventede.
-- greatest(tv.last_opened_at, clock_timestamp()) er derudover et eksplicit,
-- ubetinget værn: selv i en hypotetisk urskævheds-situation kan
-- last_opened_at/last_visit_started_at aldrig gå baglæns, uanset urets
-- opførsel.
--
-- Race-sikkerhed (revideret bevis, PR #66 — erstatter en tidligere version
-- der fejlagtigt antog at now() var "frisk" på tidspunktet for lock-wait):
--   1. trip_id er primærnøgle. ON CONFLICT DO UPDATE tager rækkelås på den
--      konfliktende række FØR SET-udtrykkene evalueres (speculative
--      insertion) — to transaktioner kan aldrig evaluere SET-grenen for
--      samme trip_id samtidig.
--   2. SET-udtrykkenes clock_timestamp()-kald evalueres EFTER låsen er
--      taget — ikke ved statementets/transaktionens start. En transaktion
--      der har ventet på låsen, ser derfor et clock_timestamp()-tidspunkt
--      der er SENERE end det tidspunkt hvor den forrige transaktion
--      committede sin skrivning, aldrig et ældre.
--   3. tv.-referencen i øvrigt (last_opened_at, open_count, visit_count,
--      last_visit_started_at på højre side af tildelingerne) er rækken SOM
--      DEN ER LIGE NU, efter låsen er taget — ikke et snapshot fra
--      statementets start.
--   4. Første besøg / dobbeltklik: rækken findes ikke, begge forsøger
--      insert, unikhedsindekset (primærnøglen) lader én vinde, den anden
--      falder i konfliktgrenen og ser den friske last_opened_at → ingen
--      ekstra visit_count-forøgelse.
-- Resultat: uanset hvor mange samtidige requests der rammer samme trip_id,
-- og uanset i hvilken rækkefølge de faktisk får låsen, er der aldrig risiko
-- for dobbelttælling, en tabt opdatering, eller et last_opened_at/
-- last_visit_started_at der går baglæns i tid.
--
-- FÆLDE for en fremtidig udvidelse: i en RETURNING-klausul refererer
-- tv-alias'et til rækken EFTER opdateringen — "returning (tv.last_opened_at
-- < clock_timestamp() - interval '30 minutes')" er derfor ALTID falsk og kan
-- ikke bruges til at rapportere "var dette et nyt besøg". Fase 1B har ikke
-- brug for den returværdi (fail-open ignorerer resultatet uanset), men en
-- fremtidig Fase 2 der har brug for det, skal bruge xmax = 0-mønstret eller
-- en PL/pgSQL-variant med en eksplicit variabel — ikke RETURNING på alias'et.
--
-- 30-minutters-vinduet beregnes UDELUKKENDE i Postgres (clock_timestamp() +
-- fast interval) — Node sender ingen tidsstempler og ingen varighed. Bevidst
-- forskel fra checkRateLimit() (src/lib/rate-limit.ts), som beregner sit
-- vindue i Node; det ville her blande to ure (Node vs. Postgres) i samme
-- sammenligning. VISIT_WINDOW_MINUTES = 30 eksporteres som konstant i
-- src/lib/trip-visit.ts UDELUKKENDE til dokumentation/UI-tekst — den sendes
-- aldrig over ledningen og styrer intet i denne funktion.
-- ============================================================================

create or replace function public.record_trip_visit(p_trip_id uuid)
returns void
language sql
volatile
security definer
set search_path = public, pg_catalog
as $function$
  insert into public.trip_visits as tv (trip_id)
  values (p_trip_id)
  on conflict (trip_id) do update
    set last_opened_at        = greatest(tv.last_opened_at, clock_timestamp()),
        open_count            = tv.open_count + 1,
        visit_count           = tv.visit_count
                                  + (case when tv.last_opened_at < clock_timestamp() - interval '30 minutes'
                                          then 1 else 0 end),
        last_visit_started_at = case when tv.last_opened_at < clock_timestamp() - interval '30 minutes'
                                     then greatest(tv.last_visit_started_at, clock_timestamp())
                                     else tv.last_visit_started_at end;
$function$;

revoke execute on function public.record_trip_visit(uuid) from public;
revoke execute on function public.record_trip_visit(uuid) from anon;
revoke execute on function public.record_trip_visit(uuid) from authenticated;
grant  execute on function public.record_trip_visit(uuid) to service_role;

-- ============================================================================
-- Migration 010: trip_visits — cookie-fri kundeåbninger (Vision 3.0 Fase 1B, Issue #65)
-- ============================================================================
-- KØRT I PRODUCTION: iunixfpthdftmkgpugex, migration
-- 20260918113114_trip_visits_usage_tracking, DB-infrastructure-tidspunkt
-- 2026-09-18T11:31:14Z. Idempotent. Denne fil opretter KUN tabel, RLS-policy,
-- index og skriv-RPC'en — INGEN retention/pg_cron. Retention-mekanismen er
-- bevidst versioneret i en SEPARAT fil (010b_trip_visits_retention.sql) der
-- IKKE må køres sammen med denne, og som fortsat IKKE er kørt — kræver
-- Rickos særskilte godkendelse. Se PR-beskrivelsen for Issue #65/PR #66 for
-- den fulde release-historik.
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
-- PL/pgSQL med ÉN eksplicit variabel (v_now), IKKE ren SQL med flere
-- clock_timestamp()-kald (review-fund #2 på PR #66, rettet — se "ÉT
-- TIDSSTEMPEL PR. KALD" nedenfor). Intet SELECT forud, intet læs-så-skriv —
-- hverken i Node eller i selve SQL'en. Kaldes UDELUKKENDE fra
-- src/lib/trip-visit-write.ts (recordTripVisit()), aldrig direkte fra
-- klientkode.
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
--                        + (case when tv.last_opened_at < v_now - interval '30 minutes'
--                                then 1 else 0 end)
-- Begge er "tidsbetinget tæller på en låst række" — record_trip_visit har
-- blot et RULLENDE prædikat (sammenlignet mod last_opened_at, der selv
-- flytter sig ved hvert kald) i stedet for increment_rate_limit's ABSOLUTTE
-- prædikat (sammenlignet mod et fast reset_at sat ved vinduets start).
--
-- UR-VALG: clock_timestamp(), IKKE now() (review-fund #1 på PR #66, rettet).
-- now()/transaction_timestamp() er FAST ved transaktionens/statementets
-- START — ikke ved det tidspunkt UPDATE'en faktisk sker. En transaktion der
-- må VENTE på rækkelåsen (fordi en anden transaktion nåede konfliktgrenen
-- først) ville derfor kunne skrive last_opened_at med sit eget, ældre
-- now()-tidspunkt — selvom en anden transaktion i mellemtiden allerede har
-- committet en nyere last_opened_at. clock_timestamp() er IKKE fast: den
-- returnerer det faktiske ur-tidspunkt på kaldetidspunktet.
--
-- ÉT TIDSSTEMPEL PR. KALD (review-fund #2 på PR #66): den forrige udgave
-- kaldte clock_timestamp() FLERE gange i samme SET-klausul (én gang til
-- last_opened_at, én gang til visit_count-prædikatet, én gang til
-- last_visit_started_at-prædikatet). Hvert kald er et selvstændigt, frisk
-- ur-opslag — ved den PRÆCISE 30-minutters-grænse kunne de derfor i teorien
-- returnere forskellige værdier få mikrosekunder fra hinanden, så
-- visit_count-prædikatet og last_visit_started_at-prædikatet endte med at
-- være UENIGE om hvorvidt et nyt besøg startede. Løsningen: `v_now` sættes
-- ÉN gang ved funktionens indgang og genbruges bogstaveligt (samme variabel,
-- samme værdi) alle fire steder — last_opened_at, BEGGE 30-minutters-
-- prædikater (nu tekstuelt identiske udtryk: `tv.last_opened_at < v_now -
-- interval '30 minutes'`, så de aldrig kan give forskelligt svar) og
-- last_visit_started_at. `greatest(tv.-kolonne, v_now)` er stadig et
-- eksplicit, ubetinget værn mod at gå baglæns i tid: selv om `v_now` (ligesom
-- enhver captured værdi) i et sjældent scenarie skulle vise sig ældre end en
-- allerede committet last_opened_at (fx en transaktion der ventede usædvanligt
-- længe på rækkelåsen), erstatter greatest() blot IKKE den nyere, eksisterende
-- værdi denne ene gang — feltet går aldrig baglæns, det undlader i så fald
-- bare at rykke sig under akkurat dét kald. En ubetydelig, ikke-korrumperende
-- konsekvens for et fail-open analytics-tal; næste kundeåbning opdaterer det
-- som normalt. Af samme grund kan et v_now der er en anelse "gammelt" i et
-- ekstremt sjældent scenarie (lang lock-ventetid) i teorien få et nyt besøg
-- der reelt lige er startet til at blive talt med i det FORRIGE besøg i
-- stedet (en undertælling, aldrig en overtælling — prædikatet bliver kun
-- MINDRE tilbøjeligt til at sige "nyt besøg" ved et ældre v_now, aldrig
-- mere). Samme "tæt på eksakte, ikke garanteret komplette"-præmis som resten
-- af denne fase (docs/VISION-3.0-EVENT-MODEL.md §9).
--
-- Race-sikkerhed (bevis, revideret på PR #66):
--   1. trip_id er primærnøgle. ON CONFLICT DO UPDATE tager rækkelås på den
--      konfliktende række FØR SET-udtrykkene evalueres (speculative
--      insertion) — to transaktioner kan aldrig evaluere SET-grenen for
--      samme trip_id samtidig.
--   2. tv.-referencen i SET-udtrykket er rækken SOM DEN ER LIGE NU, efter
--      låsen er taget — ikke et snapshot fra statementets start. En
--      ventende transaktion ser derfor altid den værdi den foregående netop
--      skrev.
--   3. visit_count og last_visit_started_at bruger samme v_now og samme
--      tekstuelle prædikat — de kan pr. konstruktion aldrig være uenige om
--      hvorvidt dette var et nyt besøg.
--   4. Første besøg / dobbeltklik: rækken findes ikke, begge forsøger
--      insert, unikhedsindekset (primærnøglen) lader én vinde, den anden
--      falder i konfliktgrenen og ser den friske last_opened_at → ingen
--      ekstra visit_count-forøgelse.
-- Resultat: uanset hvor mange samtidige requests der rammer samme trip_id,
-- er der aldrig risiko for dobbelttælling, en tabt opdatering, et
-- last_opened_at/last_visit_started_at der går baglæns i tid, eller intern
-- uenighed mellem visit_count og last_visit_started_at.
--
-- FÆLDE for en fremtidig udvidelse: i en RETURNING-klausul refererer
-- tv-alias'et til rækken EFTER opdateringen — "returning (tv.last_opened_at
-- < v_now - interval '30 minutes')" er derfor ALTID falsk og kan ikke bruges
-- til at rapportere "var dette et nyt besøg". Fase 1B har ikke brug for den
-- returværdi (fail-open ignorerer resultatet uanset); en fremtidig Fase 2
-- der har brug for det, kan tilføje en eksplicit `v_new_visit boolean`-
-- variabel (sat fra samme `tv.last_opened_at < v_now - interval '30
-- minutes'`-udtryk FØR insert/update) og returnere den, i stedet for at
-- forsøge RETURNING på alias'et.
--
-- 30-minutters-vinduet beregnes UDELUKKENDE i Postgres (v_now + fast
-- interval) — Node sender ingen tidsstempler og ingen varighed. Bevidst
-- forskel fra checkRateLimit() (src/lib/rate-limit.ts), som beregner sit
-- vindue i Node; det ville her blande to ure (Node vs. Postgres) i samme
-- sammenligning. VISIT_WINDOW_MINUTES = 30 eksporteres som konstant i
-- src/lib/trip-visit.ts UDELUKKENDE til dokumentation/UI-tekst — den sendes
-- aldrig over ledningen og styrer intet i denne funktion.
--
-- SECURITY INVOKER, IKKE SECURITY DEFINER (review-fund #3 på PR #66,
-- rettet). Funktionen kaldes UDELUKKENDE via getSupabaseService() i
-- src/lib/trip-visit-write.ts, som autentificerer som Postgres-rollen
-- `service_role` — samme rolle EXECUTE er grantet til nedenfor. `service_role`
-- har allerede fuld adgang til trip_visits via RLS-policyen ovenfor (og har,
-- som Supabases konvention, BYPASSRLS), så der er intet behov for at
-- funktionen kører med definer-ejerens forhøjede rettigheder. INVOKER er
-- mindste-privilegie-princippet i praksis her — RLS'en, de tre revoke's og
-- den ene grant nedenfor er uændrede og er den reelle adgangskontrol,
-- ikke SECURITY DEFINER/INVOKER-valget i sig selv.
-- ============================================================================

create or replace function public.record_trip_visit(p_trip_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.trip_visits as tv
    (trip_id, first_opened_at, last_visit_started_at, last_opened_at, visit_count, open_count)
  values
    (p_trip_id, v_now, v_now, v_now, 1, 1)
  on conflict (trip_id) do update
    set last_opened_at        = greatest(tv.last_opened_at, v_now),
        open_count            = tv.open_count + 1,
        visit_count           = tv.visit_count
                                  + (case when tv.last_opened_at < v_now - interval '30 minutes'
                                          then 1 else 0 end),
        last_visit_started_at = case when tv.last_opened_at < v_now - interval '30 minutes'
                                     then greatest(tv.last_visit_started_at, v_now)
                                     else tv.last_visit_started_at end;
end;
$function$;

revoke execute on function public.record_trip_visit(uuid) from public;
revoke execute on function public.record_trip_visit(uuid) from anon;
revoke execute on function public.record_trip_visit(uuid) from authenticated;
grant  execute on function public.record_trip_visit(uuid) to service_role;

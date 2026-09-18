-- ============================================================================
-- Migration 012: trip_contact_intent — kontakt-intent (Vision 3.0 Fase 3,
-- Issue #73)
-- ============================================================================
-- IKKE kørt live. Kun versioneret i denne PR — Rickos særskilte, eksplicitte
-- godkendelse kræves før den køres i production (samme kontrollerede
-- release-flow som migration 010/011). Idempotent.
-- Denne fil opretter KUN tabel, eksplicitte table grants/revokes, RLS-policy,
-- CHECK-constraint og skriv-RPC'en. schema-baseline.json opdateres FØRST efter
-- migrationen faktisk er kørt live.
-- Ingen retention-mekanisme — se "RETENTION" nederst. 010b/pg_cron røres ikke.
--
-- Filnavn: fortsætter repoets EGEN, dokumenterede nummererings-konvention
-- (supabase/README.md §Regler: "Ny DDL = ny nummereret fil"; samme valg og
-- begrundelse som 011, se docs/VISION-3.0-PHASE-2.md) — INGEN parallel
-- `supabase/migrations/`-historik. "012" er det deterministisk næste tal
-- efter 011.
--
-- Fase 3 svarer på: forsøgte kunden at TAGE KONTAKT? (Fase 2 svarer på om
-- kunden SÅ kontaktsektionen — det holdes helt adskilt, i sin egen tabel.)
-- Kun to stærke, konkrete intent-signaler:
--   email — det eksisterende mailto-link i ContactCTA
--   phone — faktiske tel:-links (rådgiverens direkte nummer i ContactCTA og
--           "Ring" i ActionBar; begge er samme forretningssignal, så der
--           gemmes IKKE hvilken knap der blev brugt)
-- Det interne "Kontakt os"-link (#kontakt) er kun navigation og tæller IKKE.
--
-- Model B, fortsat: ingen ny analytics-cookie, ingen persistent kunde-/
-- sessionidentifikator, ingen middleware-udvidelse. Registreres server-side
-- af et dedikeret endpoint under kundens EGEN slug-path
-- (src/app/[bookingId]/intent/route.ts, IKKE under /api/…), EFTER samme
-- adgangskontrol som selve kundesiden.
--
-- Bevidst AGGREGERET, ikke en rå kliklog: højst TO rækker pr. trip (én pr.
-- kanal), aldrig én række pr. klik. INGEN click_count — vi vil vide
-- om/hvornår kunden brugte email eller telefon, ikke hvor mange gange et
-- gentaget klik kunne få et tal til at stige.
--
-- Ingen kundedata gemmes: ingen booking_no (hverken klartekst eller hash),
-- ingen slug, ingen IP, ingen User-Agent, intet navn, ingen device/viewport/
-- referrer, ingen cookie-/session-/page-load-id, intet source/surface-felt.
-- Kun trip_id (allerede intern) + en kontrolleret enum-streng + to
-- tidsstempler.
-- ============================================================================

create table if not exists public.trip_contact_intent (
  trip_id           uuid        not null
                       references public.trips(id) on delete cascade,
  channel           text        not null
                       constraint trip_contact_intent_channel_check
                       check (channel in ('email', 'phone')),
  first_clicked_at  timestamptz not null default now(),
  last_clicked_at   timestamptz not null default now(),
  primary key (trip_id, channel)
);

comment on table public.trip_contact_intent is
  'Kontakt-intent pr. rejseplan (Vision 3.0 Fase 3, Issue #73). Højst 2 rækker pr. trip_id — én pr. kanal (email/phone), aldrig én pr. klik. Ingen click_count, ingen identifikator af nogen art: ingen cookie, ingen IP, ingen user-agent, intet bookingnummer, ingen slug, intet navn, ingen source/surface. Skrives kun via record_trip_contact_intent(). Service-role-only på BÅDE Postgres GRANT-laget (kun service_role har table privileges: SELECT/INSERT/UPDATE) og RLS-laget. Retention er endnu IKKE aktiveret (bevidst, separat release-/policy-beslutning) — se driftsnoten i supabase/README.md.';
comment on column public.trip_contact_intent.trip_id is
  'FK til trips.id, on delete cascade — en slettet rejseplan tager sin kontakt-intent med sig.';
comment on column public.trip_contact_intent.channel is
  'Kontrolleret enum, håndhævet af CHECK-constraint: email | phone. email = mailto-linket i ContactCTA; phone = tel:-links (rådgiverens nummer i ContactCTA og "Ring" i ActionBar). Det interne "Kontakt os"-link (#kontakt) er navigation og registreres IKKE.';
comment on column public.trip_contact_intent.first_clicked_at is
  'Første gang kunden brugte denne kanal. Sættes på insert-grenen i record_trip_contact_intent() og opdateres ALDRIG efterfølgende.';
comment on column public.trip_contact_intent.last_clicked_at is
  'Seneste gang kunden brugte denne kanal. Opdateres ved hver kvalificeret registrering (fx efter et refresh) og går aldrig baglæns i tid.';

alter table public.trip_contact_intent enable row level security;

drop policy if exists "service_role full access trip_contact_intent" on public.trip_contact_intent;
create policy "service_role full access trip_contact_intent"
  on public.trip_contact_intent for all
  to service_role
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- TABLE GRANTS — mindste privilegium, eksplicit (Postgres' GRANT-lag)
-- ----------------------------------------------------------------------------
-- GRANT og RLS er to SEPARATE adgangslag. RLS + service_role-policyen ovenfor
-- alene gør IKKE tabellen "service-role-only": projektets default ACL for nye
-- public-tabeller (Supabase-standard) uddeler automatisk table privileges til
-- anon, authenticated OG service_role (ALL). Derfor håndhæves least privilege
-- eksplicit her (samme mønster som 011, review-fund på PR #72), uafhængigt af
-- default ACL'en:
--
--   1) REVOKE ALL fra PUBLIC, anon og authenticated.
--   2) REVOKE ALL fra service_role og GRANT derefter KUN det, der reelt
--      bruges (så default-ACL'ens DELETE/TRUNCATE/REFERENCES/TRIGGER ikke
--      bliver hængende hos service_role):
--        SELECT — admin-detaljesiden læser kontakt-intent
--                 (src/app/admin/trips/[id]/page.tsx); ON CONFLICT DO UPDATE
--                 i RPC'en læser desuden den eksisterende række
--        INSERT — record_trip_contact_intent() (første registrering)
--        UPDATE — record_trip_contact_intent() (konfliktgrenen:
--                 last_clicked_at)
--      DELETE gives BEVIDST IKKE: intet direkte app-use-case sletter fra
--      tabellen. FK'ens ON DELETE CASCADE (trips.id) kræver det ikke — den
--      udføres af Postgres' interne RI-triggere med tabel-ejerens
--      rettigheder, ikke som service_role.
--
-- Idempotent. RLS-policyen ovenfor bevares som defense in depth.
revoke all on table public.trip_contact_intent from public;
revoke all on table public.trip_contact_intent from anon;
revoke all on table public.trip_contact_intent from authenticated;
revoke all on table public.trip_contact_intent from service_role;
grant select, insert, update on table public.trip_contact_intent to service_role;

-- Intet ekstra index: primærnøglen (trip_id, channel) er allerede en btree med
-- trip_id som ledende kolonne, så "alle kanaler for denne trip" (det eneste
-- læsemønster i denne fase) er dækket. Cross-trip-læsning kommer først i
-- Fase 4.

-- ============================================================================
-- record_trip_contact_intent(p_trip_id uuid, p_channel text) — den atomare
-- skrive-operation
-- ============================================================================
-- Samme afprøvede mønster som record_trip_section_engagement (011) og
-- record_trip_visit (010, to review-runder): PL/pgSQL, ÉT eksplicit
-- v_now := clock_timestamp() pr. kald, atomar INSERT ... ON CONFLICT DO
-- UPDATE (intet forudgående SELECT), og greatest() som ubetinget værn mod at
-- last_clicked_at nogensinde går baglæns i tid. Se 010/011 for det fulde
-- ur-/race-ræsonnement; det er identisk her.
--
-- first_clicked_at ændres ALDRIG på konfliktgrenen (kun sat ved selve
-- insertet). last_clicked_at = greatest(eksisterende værdi, v_now).
--
-- Ugyldig channel kan ikke gemmes: CHECK-constrainten afviser den, uanset om
-- et kald skulle omgå Zod-valideringen i endpointet — to uafhængige lag.
--
-- SECURITY INVOKER, IKKE SECURITY DEFINER: funktionen kaldes udelukkende via
-- getSupabaseService() (src/lib/contact-intent-write.ts), som autentificerer
-- som Postgres-rollen `service_role` — samme rolle EXECUTE er grantet til
-- nedenfor. `service_role` har allerede de nødvendige table privileges
-- (SELECT/INSERT/UPDATE) og RLS-policy, så der er intet behov for
-- definer-ejerens forhøjede rettigheder.
-- ============================================================================

create or replace function public.record_trip_contact_intent(p_trip_id uuid, p_channel text)
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.trip_contact_intent as tci
    (trip_id, channel, first_clicked_at, last_clicked_at)
  values
    (p_trip_id, p_channel, v_now, v_now)
  on conflict (trip_id, channel) do update
    set last_clicked_at = greatest(tci.last_clicked_at, v_now);
end;
$function$;

revoke execute on function public.record_trip_contact_intent(uuid, text) from public;
revoke execute on function public.record_trip_contact_intent(uuid, text) from anon;
revoke execute on function public.record_trip_contact_intent(uuid, text) from authenticated;
grant  execute on function public.record_trip_contact_intent(uuid, text) to service_role;

-- ============================================================================
-- RETENTION — bevidst IKKE en del af denne migration
-- ============================================================================
-- Ingen retention-mekanisme (pg_cron eller andet) aktiveres af denne fil.
-- Dette er en EKSPLICIT, dokumenteret beslutning — ikke en stiltiende "gem
-- for evigt": trip_contact_intent har højst 2 rækker pr. trip, så der er
-- intet teknisk lagringspres der kræver automatisk sletning nu.
--
-- Om/hvornår en retention-politik for trip_contact_intent skal indføres (fx
-- samme 12-måneders-vindue som trip_visits, eller en anden periode) er en
-- SEPARAT, fremtidig release-/policy-beslutning, som kræver Rickos
-- eksplicitte godkendelse — akkurat som 010b. 010b/pg_cron er IKKE aktiveret,
-- og ingen pg_cron-fil oprettes for denne tabel i denne PR.
-- ============================================================================

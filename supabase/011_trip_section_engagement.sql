-- ============================================================================
-- Migration 011: trip_section_engagement — sektionsengagement (Vision 3.0
-- Fase 2, Issue #71)
-- ============================================================================
-- Kørt i production 2026-09-18 via migration
-- `20260918184105_trip_section_engagement` (projekt iunixfpthdftmkgpugex),
-- efter Rickos eksplicitte godkendelse og samme kontrollerede release-flow som
-- migration 010. Read-only verificeret efter kørslen: tabel, RLS, PK, FK
-- (on delete cascade), CHECK, table grants (kun service_role: SELECT/INSERT/
-- UPDATE) og RPC-grants. Ingen syntetiske engagement-rækker skrevet (0 rækker
-- efter migrationen). SQL'en nedenfor er uændret siden kørslen; kun denne
-- statuskommentar er opdateret. Idempotent.
-- Denne fil opretter KUN tabel, eksplicitte table grants/revokes, RLS-policy,
-- CHECK-constraint og skriv-RPC'en.
-- Ingen retention-mekanisme i denne omgang — se "RETENTION" nederst i denne
-- fil for hvorfor det er en bevidst, separat senere beslutning, ikke en
-- stiltiende "gem for evigt".
--
-- Filnavn: fortsætter repoets EGEN, dokumenterede nummererings-konvention
-- (supabase/README.md §Regler: "Ny DDL = ny nummereret fil") frem for
-- Supabase CLI's `supabase migration new`-mappe/navnekonvention
-- (supabase/migrations/<timestamp>_<navn>.sql). Begge blev overvejet: CLI'et
-- er installeret og virker teknisk i dette repo (`supabase migration new`
-- kører uden fejl selv uden en `supabase/config.toml`), men repoet har
-- ALDRIG brugt CLI'ets migrations-mappe — alle ti eksisterende migrationer
-- (001-010b) er flade, manuelt nummererede filer i supabase/, kørt manuelt i
-- SQL Editor og dokumenteret i supabase/README.md's tabel. At introducere en
-- parallel `supabase/migrations/`-mappe nu ville splitte migrationshistorikken
-- i to inkonsistente strukturer uden nogen reel fordel. "011" er derfor ikke
-- et gæt — det er det deterministisk næste tal i den etablerede,
-- dokumenterede sekvens (010, 010b -> 011).
--
-- Design- og beslutningsgrundlag: Issue #71 (barn af Issue #41, Vision 3.0
-- Customer Engagement & Sales Intelligence). Bygger videre på Fase 1B
-- (trip_visits, migration 010, Issue #65) og Fase 1C (visningslag, Issue #69)
-- — men er en helt separat tabel med sit eget, snævrere formål: ikke "blev
-- rejseplanen åbnet", men "nåede kunden frem til disse fem navngivne
-- hovedafsnit".
--
-- Model B, fortsat: ingen ny analytics-cookie, ingen persistent kunde-/
-- sessionidentifikator, ingen middleware-udvidelse. Registreres server-side
-- af et dedikeret endpoint under kundens EGEN slug-path (IKKE under /api/…,
-- se src/app/[bookingId]/engagement/route.ts), EFTER samme adgangskontrol
-- som selve kundesiden.
--
-- Bevidst AGGREGERET, ikke en rå eventlog: højst FEM rækker pr. trip (én pr.
-- sektion), ikke ét rækker-pr-visning. Ingen view_count i denne version —
-- kun "er dette hovedafsnit nået" + første/seneste gang, akkurat som
-- produktmålet i Issue #71 beder om. Sammenlign med trip_visits (migration
-- 010), som af samme grund er én række pr. TRIP, ikke én række pr. åbning.
--
-- Ingen kundedata gemmes: ingen booking_no (hverken klartekst eller hash),
-- ingen slug, ingen IP, ingen User-Agent, intet navn, ingen cookie-/
-- session-id, ingen page-load-id, ingen viewport/scroll-position. Kun
-- trip_id (allerede intern) + en kontrolleret enum-streng + to tidsstempler.
-- ============================================================================

create table if not exists public.trip_section_engagement (
  trip_id        uuid        not null
                    references public.trips(id) on delete cascade,
  section        text        not null
                    constraint trip_section_engagement_section_check
                    check (section in ('itinerary', 'gallery', 'hotels', 'price', 'contact')),
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (trip_id, section)
);

comment on table public.trip_section_engagement is
  'Sektionsengagement pr. rejseplan (Vision 3.0 Fase 2, Issue #71). Højst 5 rækker pr. trip_id — én pr. hovedafsnit, aldrig én pr. visning. Ingen identifikator af nogen art: ingen cookie, ingen IP, ingen user-agent, intet bookingnummer, intet navn. Skrives kun via record_trip_section_engagement(). Service-role-only på BÅDE Postgres GRANT-laget (kun service_role har table privileges: SELECT/INSERT/UPDATE) og RLS-laget. Retention er endnu IKKE aktiveret (bevidst, separat release-/policy-beslutning) — se driftsnoten i supabase/README.md.';
comment on column public.trip_section_engagement.trip_id is
  'FK til trips.id, on delete cascade — en slettet rejseplan tager sit sektionsengagement med sig.';
comment on column public.trip_section_engagement.section is
  'Kontrolleret enum, håndhævet af CHECK-constraint: itinerary | gallery | hotels | price | contact. Svarer til DOM-ankrene #rejseplan/#billeder/#hoteller/#pris/#kontakt i kundesiden (src/lib/section-engagement.ts har den delte mapping). IKKE intro — en kvalificeret åbning er allerede dækket af trip_visits (Fase 1B).';
comment on column public.trip_section_engagement.first_seen_at is
  'Første gang denne sektion blev registreret set. Sættes på insert-grenen i record_trip_section_engagement() og opdateres ALDRIG efterfølgende.';
comment on column public.trip_section_engagement.last_seen_at is
  'Seneste gang denne sektion blev registreret set. Opdateres ved hver kvalificeret registrering (fx efter et refresh).';

alter table public.trip_section_engagement enable row level security;

drop policy if exists "service_role full access trip_section_engagement" on public.trip_section_engagement;
create policy "service_role full access trip_section_engagement"
  on public.trip_section_engagement for all
  to service_role
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- TABLE GRANTS — mindste privilegium, eksplicit (Postgres' GRANT-lag)
-- ----------------------------------------------------------------------------
-- GRANT og RLS er to SEPARATE adgangslag. RLS + service_role-policyen ovenfor
-- alene gør IKKE tabellen "service-role-only": projektets nuværende default
-- ACL for nye public-tabeller (Supabase-standard) giver automatisk table
-- privileges til anon, authenticated OG service_role (ALL). RLS ville i dag
-- blokere anon/authenticated rækkerne, men selve privilegierne ville stadig
-- være uddelt — og en fremtidig fejlkonfigureret policy ville så være den
-- eneste barriere. Derfor håndhæves least privilege eksplicit her, i
-- migrationen, uafhængigt af hvad default ACL'en måtte være på det tidspunkt
-- den køres:
--
--   1) REVOKE ALL fra PUBLIC, anon og authenticated — ingen af dem skal
--      kunne røre tabellen direkte.
--   2) REVOKE ALL fra service_role og GRANT derefter KUN det, der reelt
--      bruges (så slutresultatet er præcist og uafhængigt af default ACL —
--      ellers ville default-ACL'ens DELETE/TRUNCATE/REFERENCES/TRIGGER blive
--      hængende hos service_role):
--        SELECT — admin-detaljesiden læser sektionsengagement
--                 (src/app/admin/trips/[id]/page.tsx); ON CONFLICT DO UPDATE
--                 i RPC'en læser desuden den eksisterende række
--        INSERT — record_trip_section_engagement() (første registrering)
--        UPDATE — record_trip_section_engagement() (konfliktgrenen:
--                 last_seen_at)
--      DELETE gives BEVIDST IKKE: intet direkte app-use-case sletter fra
--      tabellen. FK'ens ON DELETE CASCADE (trips.id) kræver ikke, at
--      service_role har DELETE her — kaskaden udføres af Postgres' interne
--      RI-triggere med tabel-ejerens rettigheder, ikke som service_role.
--      Retention (en evt. senere sletning) er en separat beslutning, se
--      "RETENTION" nederst, og skal i givet fald selv tilføje sit privilegium.
--
-- Idempotent: REVOKE/GRANT kan køres igen uden at ændre slutresultatet.
-- RLS-policyen ovenfor bevares som defense in depth (service_role har i øvrigt
-- BYPASSRLS, så policyen er ikke det, der giver den adgang — det er GRANT'et).
revoke all on table public.trip_section_engagement from public;
revoke all on table public.trip_section_engagement from anon;
revoke all on table public.trip_section_engagement from authenticated;
revoke all on table public.trip_section_engagement from service_role;
grant select, insert, update on table public.trip_section_engagement to service_role;

-- Intet ekstra index: primærnøglen (trip_id, section) er allerede en btree
-- med trip_id som ledende kolonne, så "alle sektioner for denne trip"
-- (den eneste læsemønster admin-detaljesiden bruger, src/app/admin/trips/
-- [id]/page.tsx) allerede er dækket. Et ekstra index ville ikke understøtte
-- noget faktisk read-mønster i denne fase (ingen cross-trip-sortering/filter
-- før Fase 4, se Issue #71).

-- ============================================================================
-- record_trip_section_engagement(p_trip_id uuid, p_section text) — den
-- atomare skrive-operation
-- ============================================================================
-- Samme afprøvede mønster som record_trip_visit (migration 010, Issue #65,
-- to review-runder): PL/pgSQL, ÉT eksplicit v_now := clock_timestamp() pr.
-- kald (undgår den samme "flere ur-opslag i samme SET-klausul kan give
-- indbyrdes uenige felter"-fælde som blev rettet i trip_visits), atomar
-- INSERT ... ON CONFLICT DO UPDATE (intet forudgående SELECT, intet
-- læs-så-skriv), og greatest() som eksplicit, ubetinget værn mod at
-- last_seen_at nogensinde går baglæns i tid — uanset præcis hvornår v_now
-- blev evalueret i forhold til en eventuel rækkelås-ventetid. Se
-- supabase/010_trip_visits.sql for det fulde, tidligere reviewede
-- ur-/race-ræsonnement; det er identisk her, blot uden 30-minutters-vinduet
-- (denne tabel har intet "nyt besøg"-begreb — kun "set" eller "ikke set").
--
-- first_seen_at ændres ALDRIG på konfliktgrenen (kun sat ved selve insertet).
-- last_seen_at = greatest(eksisterende værdi, v_now) på konfliktgrenen.
--
-- Ugyldig section kan ikke gemmes: CHECK-constrainten på tabellen afviser
-- den, uanset om et kald skulle omgå Zod-valideringen i endpointet
-- (src/app/[bookingId]/engagement/route.ts) — to uafhængige lag, ikke kun
-- klient-/applikationslaget.
--
-- SECURITY INVOKER, IKKE SECURITY DEFINER: funktionen kaldes udelukkende via
-- getSupabaseService() (src/lib/section-engagement-write.ts), som
-- autentificerer som Postgres-rollen `service_role` — samme rolle EXECUTE er
-- grantet til nedenfor. `service_role` har allerede de nødvendige table
-- privileges (SELECT/INSERT/UPDATE, se TABLE GRANTS ovenfor) og RLS-policy
-- (og har, som Supabases konvention, BYPASSRLS), så der er intet behov for
-- definer-ejerens forhøjede rettigheder. Samme begrundelse og samme valg som record_trip_visit
-- (review-fund på PR #66).
-- ============================================================================

create or replace function public.record_trip_section_engagement(p_trip_id uuid, p_section text)
returns void
language plpgsql
volatile
security invoker
set search_path = public, pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
begin
  insert into public.trip_section_engagement as tse
    (trip_id, section, first_seen_at, last_seen_at)
  values
    (p_trip_id, p_section, v_now, v_now)
  on conflict (trip_id, section) do update
    set last_seen_at = greatest(tse.last_seen_at, v_now);
end;
$function$;

revoke execute on function public.record_trip_section_engagement(uuid, text) from public;
revoke execute on function public.record_trip_section_engagement(uuid, text) from anon;
revoke execute on function public.record_trip_section_engagement(uuid, text) from authenticated;
grant  execute on function public.record_trip_section_engagement(uuid, text) to service_role;

-- ============================================================================
-- RETENTION — bevidst IKKE en del af denne migration
-- ============================================================================
-- Ingen retention-mekanisme (pg_cron eller andet) aktiveres af denne fil.
-- Dette er en EKSPLICIT, dokumenteret beslutning — ikke en stiltiende "gem
-- for evigt": trip_section_engagement har højst 5 rækker pr. trip (mod
-- trip_visits' 1 række pr. trip, som allerede har sin egen, separate,
-- IKKE-aktiverede retention-fil, 010b_trip_visits_retention.sql), så der er
-- intet teknisk lagringspres der kræver automatisk sletning nu.
--
-- Om/hvornår en retention-politik for trip_section_engagement skal
-- indføres (fx samme 12-måneders-vindue som trip_visits, eller en anden
-- periode) er en SEPARAT, fremtidig release-/policy-beslutning, som kræver
-- Rickos eksplicitte godkendelse — akkurat som 010b. Ingen pg_cron-fil
-- oprettes for denne tabel i denne PR.
-- ============================================================================

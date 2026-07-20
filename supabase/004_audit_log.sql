-- ============================================================================
-- Migration 004: audit_log — revisionsspor
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-06-15 (security-featuren d660f0c);
-- DDL versioneret i repo 2026-07-20. Idempotent.
--
-- Skrives kun via service_role fra server-side kode (writeAudit i
-- src/app/[bookingId]/actions.ts og src/app/admin/api/trips/[id]/intro/route.ts).
-- Best-effort: audit må aldrig blokere forretningshandlingen.
--
-- Implementerede actions pr. 2026-07-20: unlock_success, unlock_failed,
-- unlock_rate_limited, intro_edited. Kommentaren nedenfor lister også
-- planlagte actions der endnu IKKE skrives af koden (trip_viewed,
-- trip_created, trip_updated, pdf_parsed, admin_login, admin_login_failed,
-- unlock_attempt).
-- ============================================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor       text not null,
  action      text not null,
  resource    text,
  ip          text,
  user_agent  text,
  metadata    jsonb
);

comment on table public.audit_log is
  'Audit log over PII-adgang og admin-handlinger. Skrives kun via service_role fra server-side kode. Ingen PII må gemmes her.';
comment on column public.audit_log.actor is
  'Hvem udførte handlingen: admin:{email}, customer:{slug}, eller system';
comment on column public.audit_log.action is
  'Hvilken type handling: trip_viewed, trip_created, trip_updated, pdf_parsed, admin_login, admin_login_failed, unlock_attempt, unlock_success, unlock_failed, unlock_rate_limited, intro_edited';
comment on column public.audit_log.resource is
  'Hvilket objekt blev påvirket — typisk slug eller booking_no';
comment on column public.audit_log.metadata is
  'Ekstra non-sensitive kontekst i JSON';

create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_action_idx      on public.audit_log (action);
create index if not exists audit_log_resource_idx    on public.audit_log (resource);

alter table public.audit_log enable row level security;

drop policy if exists "service_role full access" on public.audit_log;
create policy "service_role full access"
  on public.audit_log for all
  to service_role
  using (true)
  with check (true);

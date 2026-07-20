-- ============================================================================
-- Migration 007: parse_failures — dead-letter for fejlede PDF-parses
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-07-04 (ERR-2 del 1 fra Fable-review).
-- Idempotent. (Oprindeligt udleveret som "004_parse_failures.sql" fra Cowork-
-- sessionen — omnummereret til 007 i denne serie.)
--
-- Formål: dead-letter for fejlede PDF-parses så vi kan re-processe og
-- analysere mønstre — det var det der drev preamble-salvage-fixet i maj.
-- I dag går fejl kun til Vercel-runtime-logs som roterer.
--
-- Backend-integration (UDESTÅR pr. 2026-07-20 — tabellen har 0 rækker,
-- koden skriver ikke til den endnu):
--   src/app/admin/api/parse/route.ts — insert i BEGGE fejlgrene
--   (invalid_json og schema_mismatch), samme best-effort-mønster som writeAudit.
--   Ved max_tokens (jf. ERR-1) insertes kind = 'max_tokens'.
--
--   Eksempel:
--     await supabase.from('parse_failures').insert({
--       actor: `admin:${user.email}`,
--       kind: 'invalid_json',
--       raw_response: rawResp?.slice(0, 8000) ?? null,
--       pdf_name: file.name,
--     });
--
-- Oprydning: sæt Supabase-cron-job der sletter rækker > 30 dage.
--   delete from public.parse_failures where occurred_at < now() - interval '30 days';
--
-- SIKKERHED: raw_response kan indeholde kundedata. RLS er service-role-only,
-- så tabellen er utilgængelig fra anon/authenticated. Klienten må ALDRIG
-- læse den — kun server-side diagnostik.
-- ============================================================================

create table if not exists public.parse_failures (
  id           uuid primary key default gen_random_uuid(),
  occurred_at  timestamptz not null default now(),
  actor        text not null,
  kind         text not null,
  raw_response text,
  issues       jsonb,
  pdf_name     text
);

comment on table public.parse_failures is
  'Dead-letter for fejlede PDF-parses. Rå-svaret kan indeholde kundedata — service-role-only, oprydes > 30 dage.';
comment on column public.parse_failures.actor is
  'admin:{email} — hvem der forsøgte parsen';
comment on column public.parse_failures.kind is
  'Fejlkategori: invalid_json | schema_mismatch | max_tokens | anthropic_error';
comment on column public.parse_failures.raw_response is
  'Første 8000 tegn af Claudes rå response (kan indeholde PII — RLS beskytter).';
comment on column public.parse_failures.issues is
  'Zod-issues array ved schema_mismatch; ellers NULL.';

alter table public.parse_failures enable row level security;

drop policy if exists "service_role full access parse_failures" on public.parse_failures;
create policy "service_role full access parse_failures"
  on public.parse_failures for all
  to service_role
  using (true)
  with check (true);

create index if not exists parse_failures_occurred_at_idx
  on public.parse_failures (occurred_at desc);

create index if not exists parse_failures_kind_idx
  on public.parse_failures (kind);

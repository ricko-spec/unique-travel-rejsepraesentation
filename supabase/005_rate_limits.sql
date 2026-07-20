-- ============================================================================
-- Migration 005: rate_limits + increment_rate_limit RPC
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-06-15 (security-featuren d660f0c);
-- DDL versioneret i repo 2026-07-20. Idempotent.
--
-- Kaldes fra src/lib/rate-limit.ts (checkRateLimit). Vindue/max styres i
-- TypeScript (10 forsøg / 15 min) — DB'en kender kun key/count/reset_at.
-- Eneste anvendelse pr. 2026-07-20: kunde-unlock ("unlock:{ip}:{slug}").
--
-- OBS: der findes ingen oprydning af udløbne rækker — rate_limits_reset_at_idx
-- er forberedt til et evt. cron-job:
--   delete from public.rate_limits where reset_at < now() - interval '1 day';
-- ============================================================================

create table if not exists public.rate_limits (
  key        text primary key,
  count      integer not null default 0,
  reset_at   timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.rate_limits is
  'Generic rate limiter. Key er typisk "{action}:{ip}:{resource}". Resettes når reset_at < now().';

create index if not exists rate_limits_reset_at_idx on public.rate_limits (reset_at);

alter table public.rate_limits enable row level security;

drop policy if exists "service_role full access" on public.rate_limits;
create policy "service_role full access"
  on public.rate_limits for all
  to service_role
  using (true)
  with check (true);

-- Atomic increment: INSERT ... ON CONFLICT DO UPDATE i ét statement — ingen
-- race mellem samtidige forsøg. Udløbet vindue nulstiller til 1 med nyt
-- reset_at; aktivt vindue incrementer og beholder eksisterende reset_at.
create or replace function public.increment_rate_limit(
  p_key text,
  p_new_reset_at timestamptz
)
returns table (count integer, reset_at timestamptz)
language plpgsql
security definer
as $function$
begin
  return query
  insert into public.rate_limits (key, count, reset_at)
  values (p_key, 1, p_new_reset_at)
  on conflict (key) do update set
    count = case
      when public.rate_limits.reset_at < now() then 1
      else public.rate_limits.count + 1
    end,
    reset_at = case
      when public.rate_limits.reset_at < now() then excluded.reset_at
      else public.rate_limits.reset_at
    end
  returning public.rate_limits.count, public.rate_limits.reset_at;
end;
$function$;

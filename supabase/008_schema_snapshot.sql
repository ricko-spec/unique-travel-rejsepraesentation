-- ============================================================================
-- Migration 008: schema_snapshot() RPC — grundlag for drift-tjek
-- ============================================================================
-- Kørt live på iunixfpthdftmkgpugex 2026-07-20. Idempotent.
--
-- Returnerer al DDL-metadata for public-skemaet som ét deterministisk jsonb-
-- objekt: kolonner, RLS-policies, indexes, constraints, funktioner, triggers
-- og kommentarer. Kaldes af scripts/check-schema-drift.mjs, der diffner mod
-- den committede baseline i supabase/schema-baseline.json.
--
-- Determinisme: alle arrays er sorteret i SQL'en, og jsonb sorterer selv
-- objekt-nøgler — samme skema giver altid byte-identisk JSON.
--
-- Begrænsning: kun public-skemaet. Triggeren on_auth_user_created ligger på
-- auth.users og fanges derfor ikke her (men dens funktion handle_new_user
-- ligger i public og er med under "functions").
--
-- SIKKERHED: metadata-only (ingen rækkedata), men EXECUTE er alligevel
-- begrænset til service_role.
-- ============================================================================

create or replace function public.schema_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $function$
select jsonb_build_object(
  'columns', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', table_name,
      'column', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
  ), '[]'::jsonb),

  'policies', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'cmd', cmd,
      'roles', roles::text,
      'using', qual,
      'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
  ), '[]'::jsonb),

  'indexes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', indexname,
      'def', indexdef
    ) order by indexname)
    from pg_indexes
    where schemaname = 'public'
  ), '[]'::jsonb),

  'constraints', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', conrelid::regclass::text,
      'name', conname,
      'def', pg_get_constraintdef(oid)
    ) order by conrelid::regclass::text, conname)
    from pg_constraint
    where connamespace = 'public'::regnamespace
  ), '[]'::jsonb),

  'functions', coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.proname,
      'def', pg_get_functiondef(p.oid)
    ) order by p.proname)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
  ), '[]'::jsonb),

  'triggers', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', c.relname,
      'name', t.tgname,
      'def', pg_get_triggerdef(t.oid)
    ) order by c.relname, t.tgname)
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    where c.relnamespace = 'public'::regnamespace
      and not t.tgisinternal
  ), '[]'::jsonb),

  'comments', coalesce((
    select jsonb_agg(jsonb_build_object(
      'table', relname,
      'column', attname,
      'comment', cmt
    ) order by relname, attname nulls first)
    from (
      -- tabel-kommentarer
      select c.relname, null::text as attname, obj_description(c.oid) as cmt
      from pg_class c
      where c.relnamespace = 'public'::regnamespace
        and c.relkind = 'r'
        and obj_description(c.oid) is not null
      union all
      -- kolonne-kommentarer
      select c.relname, a.attname, col_description(c.oid, a.attnum)
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      where c.relnamespace = 'public'::regnamespace
        and c.relkind = 'r'
        and col_description(c.oid, a.attnum) is not null
    ) x
  ), '[]'::jsonb)
);
$function$;

revoke execute on function public.schema_snapshot() from public;
revoke execute on function public.schema_snapshot() from anon;
revoke execute on function public.schema_snapshot() from authenticated;
grant execute on function public.schema_snapshot() to service_role;

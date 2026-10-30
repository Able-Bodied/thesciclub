-- ============================================================================
-- Rules read the signed-in user once (20261029170000)
-- ============================================================================
-- No rule in public or storage calls auth.uid() bare, which runs once per
-- row: each says (select auth.uid()), once per query. This is the check
-- behind Supabase's auth_rls_initplan warning, so a new rule written the old
-- way fails here. The photo read rule reads is_member() once too.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/rules-read-the-user-once.sql
--
-- Every check prints PASS or stops the script with FAIL. Reads only.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

do $$
declare bare text;
begin
  -- Every wrapped call printed back, removed; whatever auth.uid() is left is bare.
  select string_agg(format('%s.%s: %s', n.nspname, c.relname, p.polname), '; ')
    into bare
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in ('public', 'storage')
     and regexp_replace(
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
           '\(\s*SELECT auth\.uid\(\) AS uid\)', '', 'g') ~ 'auth\.uid\(\)';
  if bare is not null then
    raise exception 'FAIL: auth.uid() read once per row in %', bare;
  end if;
  raise notice 'PASS: no rule reads auth.uid() once per row';

  if not exists (
    select 1 from pg_policy p
     where p.polrelid = 'storage.objects'::regclass
       and p.polname = 'a signed-in account reads the photographs it may see'
       and pg_get_expr(p.polqual, p.polrelid) ~ 'SELECT (public\.)?is_member\(\) AS is_member'
  ) then
    raise exception 'FAIL: the photo read rule calls is_member() once per row';
  end if;
  raise notice 'PASS: the photo read rule reads is_member() once';
end $$;

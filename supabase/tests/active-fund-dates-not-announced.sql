-- ============================================================================
-- Kelly Brush's Active Fund: the next dates are not announced (20261028320000)
-- ============================================================================
-- The summary says the dates are not out and that KBF's page signs you up to
-- be told; it no longer names February and July; the grant has no window.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/active-fund-dates-not-announced.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

\echo ''
\echo '== 1. the summary (expect t | t | f | 0) =='
select g.summary like '%The next dates are not announced yet; their page lets you sign up to be told when the next round opens.' as not_announced,
       g.summary like 'For US residents paralyzed by a spinal cord injury:%' as rest_kept,
       g.summary ~ 'February|July|2027' as old_dates,
       (select count(*) from public.organization_grant_windows w where w.grant_id = g.id) as windows
  from public.organization_grants g
  join public.organizations o on o.id = g.organization_id
 where o.short_code = 'KBF' and g.name = 'Active Fund';

rollback;

-- ============================================================================
-- Stats & controls says who each upcoming event is for (20261106060000)
-- ============================================================================
-- organization_event_notices returns each event's audience and series, still
-- only to the organization's org admins.
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/stats-event-audience.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-5a75-0000-0000-00000000000a', 'peer', 'active', 'Org Rep',  '19990000e00', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-5a75-0000-0000-00000000000b', 'peer', 'active', 'Ordinary', '19990000e01', '1981-01-01', 'C5–C8', 'CA');

insert into public.organizations (id, short_code, name, city, state)
values ('11111111-5a75-0000-0000-000000000001', 'PRSA', 'Probe Stats', 'Oakland', 'CA');
insert into public.organization_representatives (organization_id, member_id)
values ('11111111-5a75-0000-0000-000000000001', 'aaaaaaaa-5a75-0000-0000-00000000000a');

insert into public.event_series (id, series_key, title, repeat_unit, repeat_every, first_start, template)
values ('55555555-5a75-0000-0000-000000000005', 'probe-stats-series', 'Probe weekly',
        'week', 1, now() + interval '5 days', '{}'::jsonb);

insert into public.events (id, title, start_time, organization_id, event_format, location, audience, series_id)
values
  ('eeeeeeee-5a75-0000-0000-000000000001', 'Probe club', now() + interval '3 days',
   '11111111-5a75-0000-0000-000000000001', 'in_person', 'Oakland', 'club', null),
  ('eeeeeeee-5a75-0000-0000-000000000002', 'Probe invite', now() + interval '4 days',
   '11111111-5a75-0000-0000-000000000001', 'in_person', 'Oakland', 'people', null),
  ('eeeeeeee-5a75-0000-0000-000000000003', 'Probe weekly', now() + interval '5 days',
   '11111111-5a75-0000-0000-000000000001', 'online', '', 'club', '55555555-5a75-0000-0000-000000000005');

\echo ''
\echo '== 1. the org rep (expect Probe club | club | (null); Probe invite | people | (null); Probe weekly | club | 55555555-…) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5a75-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select title, audience, series_id from public.organization_event_notices('11111111-5a75-0000-0000-000000000001');
reset role;

\echo ''
\echo '== 2. an ordinary member (expect ERROR: Only its org admins can see this.) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-5a75-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint ordinary;
select count(*) from public.organization_event_notices('11111111-5a75-0000-0000-000000000001');
rollback to savepoint ordinary;
reset role;

\echo ''
\echo '== 3. signed out (expect ERROR permission denied) =='
set local role anon;
savepoint anon_call;
select count(*) from public.organization_event_notices('11111111-5a75-0000-0000-000000000001');
rollback to savepoint anon_call;
reset role;

rollback;

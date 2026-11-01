-- ============================================================================
-- An organization's events one by one, and turnout. Run as members, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/organization-events-stats.sql
--
-- 20261031120000. Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-e0e0-0000-0000-000000000001', 'peer', 'active', 'Orla Admin', '19990009001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-e0e0-0000-0000-000000000002', 'peer', 'active', 'Ana Going',  '19990009002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('cccccccc-e0e0-0000-0000-000000000003', 'peer', 'active', 'Bo Going',   '19990009003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('dddddddd-e0e0-0000-0000-000000000004', 'peer', 'active', 'Cy Walkin',  '19990009004', '1983-01-01', 'L1–S5',  'CA', true, false);

insert into public.organizations (id, name, short_code, can_invite)
values ('0e000000-0000-0000-0000-00000000000a', 'Probe Org', 'PRE', false),
       ('0e000000-0000-0000-0000-00000000000b', 'Other Org', 'PEO', false);
insert into public.organization_representatives (organization_id, member_id)
values ('0e000000-0000-0000-0000-00000000000a', 'aaaaaaaa-e0e0-0000-0000-000000000001');

-- Yesterday's: two said Going, one of them came, and a walk-in came too.
-- Last week's, with nobody. Next week's, not held yet. Another organization's.
insert into public.events (id, title, start_time, end_time, organization_id)
values
  ('0e000000-0000-0000-0000-0000000000e1', 'Yesterday Ride', now() - interval '20 hours', now() - interval '19 hours', '0e000000-0000-0000-0000-00000000000a'),
  ('0e000000-0000-0000-0000-0000000000e2', 'Last Week Ride', now() - interval '6 days',   now() - interval '6 days',   '0e000000-0000-0000-0000-00000000000a'),
  ('0e000000-0000-0000-0000-0000000000e3', 'Next Week Ride', now() + interval '6 days',   now() + interval '6 days',   '0e000000-0000-0000-0000-00000000000a'),
  ('0e000000-0000-0000-0000-0000000000e4', 'Someone Elses',  now() - interval '2 days',   now() - interval '2 days',   '0e000000-0000-0000-0000-00000000000b');
insert into public.event_rsvps (event_id, member_id, status) values
  ('0e000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-e0e0-0000-0000-000000000002', 'going'),
  ('0e000000-0000-0000-0000-0000000000e1', 'cccccccc-e0e0-0000-0000-000000000003', 'going');
insert into public.event_check_ins (event_id, member_id) values
  ('0e000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-e0e0-0000-0000-000000000002'),
  ('0e000000-0000-0000-0000-0000000000e1', 'dddddddd-e0e0-0000-0000-000000000004');

\set org '0e000000-0000-0000-0000-00000000000a'
\set other '0e000000-0000-0000-0000-00000000000b'

\set QUIET off
\echo ''
\echo '== 0. an org admin, signed in =='
\echo '   expect: authenticated | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-e0e0-0000-0000-000000000001","role":"authenticated"}';
select current_user, public.is_admin() as admin;

\echo ''
\echo '== 1. THE STEP: one row an event held, newest first; next week is not held =='
\echo '   expect: Yesterday Ride | 2 going | 2 checked in | 1 said going and came;'
\echo '   then Last Week Ride | 0 | 0 | 0.'
select title, going, checked_in, said_going_and_came
  from public.my_organization_events(:'org', 30);

\echo ''
\echo '== 2. THE STEP: a walk-in does not lift turnout past those who said Going =='
\echo '   expect: 2 held | 2 going | 2 checked in | 1 said going and came.'
select events_held, going, checked_in, said_going_and_came
  from public.my_organization_stats(:'org', 30);

\echo ''
\echo '== 3. the past 24 hours holds only yesterday''s =='
\echo '   expect: Yesterday Ride alone; then 1 held.'
select title from public.my_organization_events(:'org', 1);
select events_held from public.my_organization_stats(:'org', 1);

\echo ''
\echo '== 4. nothing of an organization that is not theirs =='
\echo '   expect: 0, 0.'
select (select count(*) from public.my_organization_events(:'other', 30)) as events,
       (select count(*) from public.my_organization_stats(:'other', 30)) as stats;

\echo ''
\echo '== 5. a plain member sees nothing, and nobody signed in reaches it =='
\echo '   expect: 0; then ERROR permission denied.'
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-e0e0-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select count(*) as rows from public.my_organization_events(:'org', 30);
set local role postgres;
set local role anon;
savepoint anon_events;
select * from public.my_organization_events(:'org', 30);
rollback to savepoint anon_events;

rollback;

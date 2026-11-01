-- ============================================================================
-- The numbers added to Stats & controls: a mentor's reach and how soon, who
-- came back, and an organization's weeks. Run as members, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/stats-and-controls-numbers.sql
--
-- 20261031130000. Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin, created_at)
values
  ('aaaaaaaa-5e5e-0000-0000-000000000001', 'peer',   'active', 'Pat Connector', '19990010001', '1980-01-01', 'T1–T6',  'CA', true, false, now() - interval '40 days'),
  ('bbbbbbbb-5e5e-0000-0000-000000000002', 'peer',   'active', 'Ana Peer',      '19990010002', '1981-01-01', 'C5–C8',  'CA', true, false, now() - interval '20 days'),
  ('cccccccc-5e5e-0000-0000-000000000003', 'peer',   'active', 'Bo Peer',       '19990010003', '1982-01-01', 'T7–T12', 'CA', true, false, now() - interval '20 days'),
  ('dddddddd-5e5e-0000-0000-000000000004', 'peer',   'active', 'Cy Peer',       '19990010004', '1983-01-01', 'L1–S5',  'CA', true, false, now() - interval '20 days'),
  ('eeeeeeee-5e5e-0000-0000-000000000005', 'mentor', 'active', 'Max Mentor',    '19990010005', '1984-01-01', 'T1–T6',  'CA', true, false, now() - interval '30 days'),
  ('ffffffff-5e5e-0000-0000-000000000006', 'mentor', 'active', 'Mo Mentor',     '19990010006', '1985-01-01', 'T1–T6',  'CA', true, false, now() - interval '30 days');

insert into public.club_partners (member_id, title)
values ('aaaaaaaa-5e5e-0000-0000-000000000001', 'Peer support lead');

-- Ana met a mentor 2 days in, Bo 6 days in; Cy has not; Max, a mentor, met a
-- mentor too and must count for nothing here.
insert into public.introductions (introduced_by, first_id, second_id, note, opened_at, created_at)
values
  ('aaaaaaaa-5e5e-0000-0000-000000000001', 'bbbbbbbb-5e5e-0000-0000-000000000002', 'eeeeeeee-5e5e-0000-0000-000000000005', 'One', now() - interval '18 days', now() - interval '18 days'),
  ('aaaaaaaa-5e5e-0000-0000-000000000001', 'cccccccc-5e5e-0000-0000-000000000003', 'eeeeeeee-5e5e-0000-0000-000000000005', 'Two', now() - interval '14 days', now() - interval '14 days'),
  ('aaaaaaaa-5e5e-0000-0000-000000000001', 'eeeeeeee-5e5e-0000-0000-000000000005', 'ffffffff-5e5e-0000-0000-000000000006', 'Three', now() - interval '10 days', now() - interval '10 days'),
  ('aaaaaaaa-5e5e-0000-0000-000000000001', 'dddddddd-5e5e-0000-0000-000000000004', 'bbbbbbbb-5e5e-0000-0000-000000000002', 'Four', now() - interval '9 days', now() - interval '9 days');

insert into public.organizations (id, name, short_code, can_invite)
values ('0d000000-0000-0000-0000-00000000000a', 'Probe Org', 'PRN', false);
insert into public.organization_representatives (organization_id, member_id)
values ('0d000000-0000-0000-0000-00000000000a', 'aaaaaaaa-5e5e-0000-0000-000000000001');

-- Ten weeks ago, Ana came. Two days ago Ana came back and Bo came first.
insert into public.events (id, title, start_time, end_time, organization_id) values
  ('0d000000-0000-0000-0000-0000000000e1', 'Old',    now() - interval '70 days', now() - interval '70 days', '0d000000-0000-0000-0000-00000000000a'),
  ('0d000000-0000-0000-0000-0000000000e2', 'Recent', now() - interval '2 days',  now() - interval '2 days',  '0d000000-0000-0000-0000-00000000000a');
insert into public.event_check_ins (event_id, member_id) values
  ('0d000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-5e5e-0000-0000-000000000002'),
  ('0d000000-0000-0000-0000-0000000000e2', 'bbbbbbbb-5e5e-0000-0000-000000000002'),
  ('0d000000-0000-0000-0000-0000000000e2', 'cccccccc-5e5e-0000-0000-000000000003');
insert into public.event_rsvps (event_id, member_id, status) values
  ('0d000000-0000-0000-0000-0000000000e2', 'bbbbbbbb-5e5e-0000-0000-000000000002', 'going');

\set org '0d000000-0000-0000-0000-00000000000a'

\set QUIET off
\echo ''
\echo '== 0. a partner and org admin, signed in =='
\echo '   expect: authenticated | t partner | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5e5e-0000-0000-000000000001","role":"authenticated"}';
select current_user, public.i_am_partner() as partner, public.is_admin() as admin;

\echo ''
\echo '== 1. THE STEP: a mentor''s reach, leaving mentors out =='
\echo '   expect: 2 with a mentor | 3 who could have one | 4.0 days (median of 2 and 6).'
\echo '   Cy has none; Max is a mentor and counts for nothing.'
select with_mentor, could_have_mentor, days_to_mentor from public.my_partner_stats(30);

\echo ''
\echo '== 2. THE STEP: who came back, and who came first =='
\echo '   expect: 1 first-timer (Bo) | 1 came back (Ana). Over 30 days.'
select first_timers, came_back from public.my_organization_stats(:'org', 30);

\echo ''
\echo '== 3. the period counts where they came, not when they first did =='
\echo '   expect: 0 | 0 over the past day, when nobody came.'
select first_timers, came_back from public.my_organization_stats(:'org', 1);

\echo ''
\echo '== 4. its weeks, newest first, eight by default =='
\echo '   expect: 8 weeks; 1 of them with an event, 2 checked in, 1 going, 1 of them came;'
\echo '   the Old event, ten weeks back, is in none of them.'
select count(*) as weeks, sum(events) as events, sum(checked_in) as checked_in,
       sum(going) as going, sum(said_going_and_came) as came,
       (select w.week from public.my_organization_weeks(:'org') w limit 1) = max(week) as newest_first
  from public.my_organization_weeks(:'org');

\echo ''
\echo '== 5. nothing for somebody else, nor anybody signed out =='
\echo '   expect: 0 weeks; then ERROR permission denied.'
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-5e5e-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select count(*) as weeks from public.my_organization_weeks(:'org');
set local role postgres;
set local role anon;
savepoint anon_weeks;
select * from public.my_organization_weeks(:'org');
rollback to savepoint anon_weeks;

rollback;

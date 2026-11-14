-- ============================================================================
-- Can't go, on the club's own event page
-- ============================================================================
-- 20261114080000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/cant-go.sql
--
-- Rolls back. Do not point it at the live project. Checked on the test
-- project, 2026-11-14: as expected below.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1416-0000-0000-00000000000a', 'peer', 'active', 'Ada', 'ada1416', null, '1980-01-01', 'C5–C8', 'CA', true),
  ('aaaaaaaa-1416-0000-0000-00000000000b', 'peer', 'active', 'Bo',  'bo1416',  null, '1981-01-01', 'C5–C8', 'CA', false);
insert into public.organizations (id, name, short_code) values
  ('bbbbbbbb-1416-0000-0000-000000000001', 'Probe org 1416', 'PQZY');
insert into public.events (id, title, start_time, audience, added_by, organization_id) values
  ('cccccccc-1416-0000-0000-000000000001', 'Probe picnic 1416', now() + interval '8 days', 'club',
   'aaaaaaaa-1416-0000-0000-00000000000a', 'bbbbbbbb-1416-0000-0000-000000000001');

set local role anon;
\echo ''
\echo '== 1. nobody signed out says Can''t go (expect ERROR: permission denied) =='
select public.set_event_declined('cccccccc-1416-0000-0000-000000000001', true);
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1416-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
insert into public.event_rsvps (event_id, member_id, status) values
  ('cccccccc-1416-0000-0000-000000000001', 'aaaaaaaa-1416-0000-0000-00000000000b', 'going');
\echo ''
\echo '== 2. Bo can''t go: it takes back his Going (expect t | 0) =='
select public.set_event_declined('cccccccc-1416-0000-0000-000000000001', true);
select public.my_event_declined('cccccccc-1416-0000-0000-000000000001'),
       (select count(*) from public.event_rsvps
         where event_id = 'cccccccc-1416-0000-0000-000000000001'
           and member_id = 'aaaaaaaa-1416-0000-0000-00000000000b');
\echo ''
\echo '== 3. a member who is not an organizer cannot read who can''t go (expect ERROR: Only the event''s organizers can see this, then permission denied) =='
select * from public.event_declines_for('cccccccc-1416-0000-0000-000000000001');
select count(*) from public.event_declines;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1416-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 4. the organizer sees it (expect Bo) =='
select name from public.event_declines_for('cccccccc-1416-0000-0000-000000000001');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1416-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 5. Going again, as a store build writes it, clears Can''t go (expect f) =='
insert into public.event_rsvps (event_id, member_id, status) values
  ('cccccccc-1416-0000-0000-000000000001', 'aaaaaaaa-1416-0000-0000-00000000000b', 'going');
select public.my_event_declined('cccccccc-1416-0000-0000-000000000001');
reset role;

rollback;

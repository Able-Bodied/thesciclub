-- ============================================================================
-- A missed check-in reaches the event's organizer, else an administrator
-- ============================================================================
-- 20261113100000: check-in stays open a day after the event; in the week after
-- that, check_in_missed opens a conversation with whoever added the event, or
-- else (no organizer, or one the member blocked) a club administrator. Never
-- while check-in is open, and never for somebody who checked in.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/check-in-missed.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1113-0000-0000-00000000000a', 'peer', 'active', 'Ana (missed it)',  '19990111300', '1980-01-01', 'C5–C8', 'CA', false),
  ('bbbbbbbb-1113-0000-0000-00000000000b', 'peer', 'active', 'Bo (organizer)',   '19990111301', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-1113-0000-0000-00000000000c', 'peer', 'active', 'Cy (admin)',       '19990111302', '1982-01-01', 'C5–C8', 'CA', true);

insert into public.events (id, title, host_name, start_time, end_time, added_by) values
  -- Ended two days ago: check-in closed a day ago.
  ('13131313-1113-0000-0000-000000000001', 'Probe closed', 'Probe host',
   now() - interval '2 days 2 hours', now() - interval '2 days', 'bbbbbbbb-1113-0000-0000-00000000000b'),
  -- Ended an hour ago: check-in still open.
  ('13131313-1113-0000-0000-000000000002', 'Probe open', 'Probe host',
   now() - interval '3 hours', now() - interval '1 hour', 'bbbbbbbb-1113-0000-0000-00000000000b'),
  -- Imported, nobody added it.
  ('13131313-1113-0000-0000-000000000003', 'Probe imported', 'Probe host',
   now() - interval '2 days 2 hours', now() - interval '2 days', null);

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1113-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 1. an hour after the end, Ana can still check in (expect a row, null) =='
select public.check_in_to_event('13131313-1113-0000-0000-000000000002');

\echo ''
\echo '== 2. ...so there is nothing to ask (expect ERROR: Check-in for this event is still open.) =='
select public.check_in_missed('13131313-1113-0000-0000-000000000002');

\echo ''
\echo '== 3. a day after the end, check-in has closed (expect ERROR: Check-in for this event has closed.) =='
select public.check_in_to_event('13131313-1113-0000-0000-000000000001');

\echo ''
\echo '== 4. missing it reaches Bo, who added it (expect t) =='
select exists (
  select 1 from public.chat_thread_members m
   where m.thread_id = public.check_in_missed('13131313-1113-0000-0000-000000000001')
     and m.member_id = 'bbbbbbbb-1113-0000-0000-00000000000b'
) as reaches_organizer;

\echo ''
\echo '== 5. an imported event reaches an administrator (expect t) =='
select exists (
  select 1 from public.chat_thread_members m
   where m.thread_id = public.check_in_missed('13131313-1113-0000-0000-000000000003')
     and m.member_id in (select id from public.members where is_admin and status = 'active')
) as reaches_admin;

\echo ''
\echo '== 6. somebody who checked in has nothing to ask (expect ERROR: You checked in to this event.) =='
insert into public.event_check_ins (event_id, member_id)
values ('13131313-1113-0000-0000-000000000001', 'aaaaaaaa-1113-0000-0000-00000000000a');
select public.check_in_missed('13131313-1113-0000-0000-000000000001');

rollback;

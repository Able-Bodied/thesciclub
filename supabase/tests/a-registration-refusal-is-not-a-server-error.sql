-- ============================================================================
-- A registration refusal is not a server error (20261103180000)
-- ============================================================================
-- Under 20261029110000, steps 1 and 2 answered P0002 and step 5 54000, which
-- PostgREST sends as HTTP 500. Now 22023 and P0001 (both 400), same words.
-- Step 3 must still save the registration.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/a-registration-refusal-is-not-a-server-error.sql
--
-- One transaction, rolled back; signed out (anon), as the public page is.
-- Each call catches its own refusal and prints the SQLSTATE and message.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off

begin;

-- ------------------------------------------------------------------ set-up --
update public.club_joining set open = false;

insert into public.events (id, title, host_name, start_time, end_time) values
  ('12121212-1803-0000-0000-000000000001', 'Ended probe', 'Probe host',
   now() - interval '3 days', now() - interval '2 days'),
  ('12121212-1803-0000-0000-000000000002', 'Upcoming probe', 'Probe host',
   now() + interval '3 days', null);

create function pg_temp.try(event uuid, status text default 'going', email text default 'guest@refusal.test')
returns text language plpgsql as $$
begin
  perform public.register_for_event(event, 'Guest', email, null, status);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on function pg_temp.try(uuid, text, text) to anon;

set local role anon;

\echo '== 1. an event that ended two days ago (expect 22023 This event is not taking registrations.) =='
select pg_temp.try('12121212-1803-0000-0000-000000000001') as answer;

\echo '== 2. an event that does not exist (expect 22023 This event is not taking registrations.) =='
select pg_temp.try('12121212-1803-0000-0000-0000000000ff') as answer;

\echo '== 3. an upcoming event (expect ok) =='
select pg_temp.try('12121212-1803-0000-0000-000000000002') as answer;

\echo '== 4. neither Going nor Interested (expect 22023 Choose Going or Interested.) =='
select pg_temp.try('12121212-1803-0000-0000-000000000002', 'maybe') as answer;

reset role;

\echo '== 3b. the registration from step 3 is kept (expect 1 | going) =='
select count(*), min(status) from public.event_registrations
 where event_id = '12121212-1803-0000-0000-000000000002' and email = 'guest@refusal.test';

-- Thirty in the last minute, as a burst would leave them.
insert into public.event_registrations (event_id, name, email, status)
select '12121212-1803-0000-0000-000000000002', 'Burst ' || n, 'burst' || n || '@refusal.test', 'going'
  from generate_series(1, 30) n;

set local role anon;
\echo '== 5. the thirty-first in a minute (expect P0001 Too many registrations just now. Try again in a minute.) =='
select pg_temp.try('12121212-1803-0000-0000-000000000002', 'going', 'late@refusal.test') as answer;
reset role;

\echo '== 6. what comes next for step 3''s address (expect request) =='
set local role anon;
select public.registration_next_step('12121212-1803-0000-0000-000000000002', 'guest@refusal.test') as next_step;
reset role;

rollback;

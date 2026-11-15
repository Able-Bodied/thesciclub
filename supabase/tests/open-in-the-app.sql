-- ============================================================================
-- Open in the app: the code a browser's sign-in is carried in by
-- ============================================================================
-- 20261115100000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/open-in-the-app.sql
--
-- Rolls back. Do not point it at the live project. Checked on the test
-- project, 2026-11-15: as expected below.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-1515-0000-0000-00000000000a', 'ada1515@example.com', now());
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('dddddddd-1515-0000-0000-00000000000a', 'aaaaaaaa-1515-0000-0000-00000000000a', now(), now());

set local role anon;
\echo ''
\echo '== 1. nobody signed out gets a code (expect ERROR: permission denied) =='
select public.issue_app_handoff();
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1515-0000-0000-00000000000a","role":"authenticated","session_id":"eeeeeeee-1515-0000-0000-000000000000"}',
  true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 2. nor a token whose session has signed out (expect ERROR: Sign in first.) =='
select public.issue_app_handoff();
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1515-0000-0000-00000000000a","role":"authenticated","session_id":"dddddddd-1515-0000-0000-00000000000a"}',
  true) is not null as ok;
set local role authenticated;
select public.issue_home_screen_handoff() is not null as home_screen_code;
select set_config('probe.first', public.issue_app_handoff(), true) is not null as first_press;
select set_config('probe.latest', public.issue_app_handoff(), true) is not null as second_press;
reset role;

\echo ''
\echo '== 3. the Home Screen code stays; of the presses only the latest, for two minutes (expect 2 | 00:02:00) =='
select count(*), date_trunc('second', min(expires_at - now()))
  from public.home_screen_handoffs where user_id = 'aaaaaaaa-1515-0000-0000-00000000000a';
\echo ''
\echo '== 4. the earlier press no longer signs in; the latest does, once (expect null, ada1515@example.com, null) =='
select public.redeem_home_screen_handoff(current_setting('probe.first'));
select public.redeem_home_screen_handoff(current_setting('probe.latest'));
select public.redeem_home_screen_handoff(current_setting('probe.latest'));

rollback;

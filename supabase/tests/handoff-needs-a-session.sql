-- ============================================================================
-- Is a Home Screen hand-off made for a token whose session has signed out?
-- ============================================================================
-- 20261018040000 (security scan of 2026-10-17, F15). Before it, steps 3 to 5
-- succeeded: an access token is accepted until it expires, even after its
-- session signs out, and what these two functions make is traded at
-- home-screen-handoff for a brand-new session. Steps 1 and 2 have to keep
-- working, or the iPhone hand-off and the Google pairing are broken.
--
-- Run as the signed-in account, not as the superuser. Every expected refusal
-- has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/handoff-needs-a-session.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('bbbbbbbb-1822-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'handoff.session@probe.test', now());
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('5e550000-1822-0000-0000-000000000001', 'bbbbbbbb-1822-0000-0000-00000000000b', now(), now());

-- ================================================ a token whose session lives
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1822-0000-0000-00000000000b","role":"authenticated","session_id":"5e550000-1822-0000-0000-000000000001"}',
  true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. the iPhone hand-off is made (expect 43, the code''s length) =='
select char_length(public.issue_home_screen_handoff()) as code_length;

\echo ''
\echo '== 2. and the Google pairing is filled (expect t) =='
select public.pair_home_screen_app(repeat('a', 64)) as paired;

reset role;

-- =========================================== the same token, signed out since
delete from auth.sessions where id = '5e550000-1822-0000-0000-000000000001';

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1822-0000-0000-00000000000b","role":"authenticated","session_id":"5e550000-1822-0000-0000-000000000001"}',
  true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 3. no hand-off for a session that signed out =='
\echo '   expect: ERROR, sign in first'
savepoint signed_out_issue;
select public.issue_home_screen_handoff();
rollback to savepoint signed_out_issue;

\echo ''
\echo '== 4. (a token with no session id at all is refused the same way) =='
\echo '   expect: ERROR, sign in first'
savepoint no_session_issue;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1822-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
select public.issue_home_screen_handoff();
rollback to savepoint no_session_issue;

\echo ''
\echo '== 5. nor a pairing =='
\echo '   expect: ERROR, sign in first'
savepoint signed_out_pair;
select public.pair_home_screen_app(repeat('b', 64));
rollback to savepoint signed_out_pair;

reset role;

\echo ''
\echo '== 6. what was made: one hand-off, one pairing, both from step 1–2 (expect 1 | 1) =='
select (select count(*) from public.home_screen_handoffs where user_id = 'bbbbbbbb-1822-0000-0000-00000000000b') as handoffs,
       (select count(*) from public.home_screen_pairings where user_id = 'bbbbbbbb-1822-0000-0000-00000000000b') as pairings;

rollback;

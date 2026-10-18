-- ============================================================================
-- Home Screen handoff codes (20261012100000)
-- ============================================================================
-- issue_home_screen_handoff() for a signed-in account, redeem_home_screen_
-- handoff(code) for the service role (the edge function) only. Each answer is
-- printed and read against its expect line:
--
--   1. a signed-in account gets a 43-character code; a second replaces the first
--   2. the service role redeems it once: the confirmed address, then null
--   3. a replaced, expired, empty or unknown code answers null alike
--   4. grants: anon cannot issue; anon and authenticated cannot redeem or read
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/home-screen-handoff.sql
--
-- One transaction, rolled back; each refusal in its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '<null>'

begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1210-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'handoff@probe.test', now());
-- A live session for each, named in its token: a hand-off is made only while
-- the token's session exists (20261018040000).
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('5e550000-1210-0000-0000-000000000001', 'aaaaaaaa-1210-0000-0000-000000000001', now(), now());

create temp table codes (label text primary key, code text);
grant all on codes to authenticated, service_role, anon;

\echo '== 1. signed in: expect t, then t (a second code), then 1 row left for the account =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1210-0000-0000-000000000001","role":"authenticated","session_id":"5e550000-1210-0000-0000-000000000001"}', true) is not null as ok;
insert into codes select 'first', public.issue_home_screen_handoff();
insert into codes select 'second', public.issue_home_screen_handoff();
reset role;
select code ~ '^[A-Za-z0-9_-]{43}$' as well_formed from codes where label = 'first';
select code ~ '^[A-Za-z0-9_-]{43}$' as well_formed from codes where label = 'second';
select count(*) as rows_for_account from public.home_screen_handoffs where user_id = 'aaaaaaaa-1210-0000-0000-000000000001';

\echo '== 2. the service role redeems the latest once: expect handoff@probe.test, then <null> =='
set local role service_role;
select public.redeem_home_screen_handoff((select code from codes where label = 'second')) as first_use;
select public.redeem_home_screen_handoff((select code from codes where label = 'second')) as second_use;

\echo '== 3. expect <null> on every line: replaced, expired, empty, unknown =='
select public.redeem_home_screen_handoff((select code from codes where label = 'first')) as replaced;
reset role;
set local role authenticated;
insert into codes select 'expired', public.issue_home_screen_handoff();
reset role;
update public.home_screen_handoffs set expires_at = now() - interval '1 second'
 where user_id = 'aaaaaaaa-1210-0000-0000-000000000001';
set local role service_role;
select public.redeem_home_screen_handoff((select code from codes where label = 'expired')) as expired;
select public.redeem_home_screen_handoff('') as empty;
select public.redeem_home_screen_handoff(repeat('x', 43)) as unknown;
reset role;

\echo '== 4. grants: expect four permission ERRORs =='
savepoint anon_issue;
set local role anon;
select public.issue_home_screen_handoff();
rollback to savepoint anon_issue;

savepoint anon_redeem;
set local role anon;
select public.redeem_home_screen_handoff('whatever');
rollback to savepoint anon_redeem;

savepoint member_redeem;
set local role authenticated;
select public.redeem_home_screen_handoff('whatever');
rollback to savepoint member_redeem;

savepoint member_read;
set local role authenticated;
select * from public.home_screen_handoffs;
rollback to savepoint member_read;

rollback;

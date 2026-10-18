-- ============================================================================
-- Home Screen pairings (20261015010000)
-- ============================================================================
-- pair_home_screen_app(pairing) for a signed-in account, redeem_home_screen_
-- pairing(secret) for the service role (the edge function) only. Each answer
-- is printed and read against its expect line:
--
--   1. before the browser has filled it, the secret answers null
--   2. a signed-in account fills a pairing: t; the same account again renews it, t
--   3. another account cannot take over a filled pairing: f, still one row
--   4. the service role redeems it once: the address, then null
--   5. a second pairing replaces the account's first; expired, malformed,
--      empty and wrong secrets answer null or f alike
--   6. grants: anon cannot pair; anon and authenticated cannot redeem or read
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/home-screen-pairing.sql
--
-- One transaction, rolled back; each refusal in its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '<null>'

begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1015-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pairing@probe.test', now()),
  ('aaaaaaaa-1015-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@probe.test', now());
-- A live session for each, named in its token: a hand-off is made only while
-- the token's session exists (20261018040000).
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('5e550000-1015-0000-0000-000000000001', 'aaaaaaaa-1015-0000-0000-000000000001', now(), now()),
  ('5e550000-1015-0000-0000-000000000002', 'aaaaaaaa-1015-0000-0000-000000000002', now(), now());

-- The app's secrets, and the pairing each gives the browser.
create temp table secrets (label text primary key, secret text, pairing text);
insert into secrets
select label, secret, encode(extensions.digest(secret, 'sha256'), 'hex')
  from (values ('first', 'probe-secret-first-aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
               ('second', 'probe-secret-second-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
               ('late', 'probe-secret-late-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')) as s (label, secret);
grant all on secrets to authenticated, service_role, anon;

\echo '== 1. not filled yet: expect <null> =='
set local role service_role;
select public.redeem_home_screen_pairing((select secret from secrets where label = 'first')) as not_yet;
reset role;

\echo '== 2. signed in: expect t, then t (the same account renews it), 1 row =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1015-0000-0000-000000000001","role":"authenticated","session_id":"5e550000-1015-0000-0000-000000000001"}', true) is not null as ok;
select public.pair_home_screen_app((select pairing from secrets where label = 'first')) as filled;
select public.pair_home_screen_app((select pairing from secrets where label = 'first')) as again;
reset role;
select count(*) as rows_for_account from public.home_screen_pairings
 where user_id = 'aaaaaaaa-1015-0000-0000-000000000001';

\echo '== 3. another account on the same pairing: expect f, then 1 row, still pairing@ =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1015-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-1015-0000-0000-000000000002"}', true) is not null as ok;
select public.pair_home_screen_app((select pairing from secrets where label = 'first')) as taken_over;
reset role;
select count(*) as rows_for_pairing from public.home_screen_pairings
 where pairing_hash = (select pairing from secrets where label = 'first');
select u.email as holder from public.home_screen_pairings p join auth.users u on u.id = p.user_id
 where p.pairing_hash = (select pairing from secrets where label = 'first');

\echo '== 4. the service role redeems once: expect pairing@probe.test, then <null> =='
set local role service_role;
select public.redeem_home_screen_pairing((select secret from secrets where label = 'first')) as first_use;
select public.redeem_home_screen_pairing((select secret from secrets where label = 'first')) as second_use;
reset role;

\echo '== 5. expect t, t, 1 row, <null> (replaced), t, <null> (expired), f, <null>, <null>, <null> =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1015-0000-0000-000000000001","role":"authenticated","session_id":"5e550000-1015-0000-0000-000000000001"}', true) is not null as ok;
select public.pair_home_screen_app((select pairing from secrets where label = 'first')) as refilled;
select public.pair_home_screen_app((select pairing from secrets where label = 'second')) as replaced_by;
reset role;
select count(*) as rows_for_account from public.home_screen_pairings
 where user_id = 'aaaaaaaa-1015-0000-0000-000000000001';
set local role service_role;
select public.redeem_home_screen_pairing((select secret from secrets where label = 'first')) as replaced;
reset role;
set local role authenticated;
select public.pair_home_screen_app((select pairing from secrets where label = 'late')) as late_filled_hidden;
reset role;
update public.home_screen_pairings set expires_at = now() - interval '1 second'
 where user_id = 'aaaaaaaa-1015-0000-0000-000000000001';
set local role service_role;
select public.redeem_home_screen_pairing((select secret from secrets where label = 'late')) as expired;
reset role;
set local role authenticated;
select public.pair_home_screen_app('not-a-pairing') as malformed;
reset role;
set local role service_role;
select public.redeem_home_screen_pairing('') as empty;
select public.redeem_home_screen_pairing((select pairing from secrets where label = 'second')) as pairing_not_secret;
select public.redeem_home_screen_pairing(repeat('x', 43)) as unknown;
reset role;

\echo '== 6. grants: expect four permission ERRORs =='
savepoint anon_pair;
set local role anon;
select public.pair_home_screen_app((select pairing from secrets where label = 'second'));
rollback to savepoint anon_pair;

savepoint anon_redeem;
set local role anon;
select public.redeem_home_screen_pairing('whatever');
rollback to savepoint anon_redeem;

savepoint member_redeem;
set local role authenticated;
select public.redeem_home_screen_pairing('whatever');
rollback to savepoint member_redeem;

savepoint member_read;
set local role authenticated;
select * from public.home_screen_pairings;
rollback to savepoint member_read;

rollback;

-- ============================================================================
-- Only a phone number makes an account
-- ============================================================================
-- 20261007010000. The Before User Created hook lets a sign-up by text message
-- through and refuses one without a number — an unlinked Google sign-in — and
-- nobody but the auth server may call it.
--
-- The calls run as the superuser: postgres may not become supabase_auth_admin,
-- the role the auth server calls hooks as, so step 0 asks whether that role may
-- call it instead. The refusals run as the roles refused.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/only-a-phone-makes-an-account.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

\echo '== 0. only the auth server may call it (expect t | f | f) =='
select has_function_privilege('supabase_auth_admin', 'public.only_a_phone_makes_an_account(jsonb)', 'execute'),
       has_function_privilege('authenticated', 'public.only_a_phone_makes_an_account(jsonb)', 'execute'),
       has_function_privilege('anon', 'public.only_a_phone_makes_an_account(jsonb)', 'execute');

\echo '== 1. a phone sign-up passes (expect {}) =='
select public.only_a_phone_makes_an_account(
  '{"user": {"phone": "14085558001", "app_metadata": {"provider": "phone"}}}'::jsonb
);

\echo '== 2. a Google sign-up with no phone is refused (expect 403 | Sign in with your phone number first, then link Google from Me.) =='
select r -> 'error' ->> 'http_code', r -> 'error' ->> 'message'
from public.only_a_phone_makes_an_account(
  '{"user": {"email": "someone@gmail.com", "app_metadata": {"provider": "google"}}}'::jsonb
) r;

\echo '== 3. an empty phone is no phone (expect 403) =='
select public.only_a_phone_makes_an_account(
  '{"user": {"phone": "", "email": "someone@gmail.com"}}'::jsonb
) -> 'error' ->> 'http_code';

\echo '== 4. a number that is on no list passes the same as one that is (expect {}) =='
select public.only_a_phone_makes_an_account('{"user": {"phone": "15555550100"}}'::jsonb);

\echo '== 5. signed in, a member cannot call it (expect ERROR: permission denied for function) =='
set local role authenticated;
savepoint member_call;
select public.only_a_phone_makes_an_account('{"user": {}}'::jsonb);
rollback to savepoint member_call;

\echo '== 6. signed out, nobody can call it (expect ERROR: permission denied for function) =='
reset role;
set local role anon;
savepoint anon_call;
select public.only_a_phone_makes_an_account('{"user": {}}'::jsonb);
rollback to savepoint anon_call;

rollback;

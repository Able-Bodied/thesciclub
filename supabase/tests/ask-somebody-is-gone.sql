-- ============================================================================
-- "Ask somebody" is gone, and joining still works (20261012020000)
-- ============================================================================
-- The migration drops find_inviters, my_number_is_invited, invite_lookups and
-- members.findable_for_invites. What has to be true afterwards:
--
--   1-4. none of the four exists
--   5.   nothing left in public or private refers to them (functions, views)
--   6.   a signed-in member cannot call find_inviters or write the column:
--        "does not exist", not a permission answer
--   7.   joining is unaffected: an invited, confirmed account still inserts
--        its member row through the members policy
--   8.   an uninvited one is still refused
--
-- Run against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/ask-somebody-is-gone.sql
--
-- One transaction, rolled back. Read every log against its `expect` line.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '<null>'

begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1015-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'joiner@probe.test',   now()),
  ('aaaaaaaa-1015-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@probe.test', now());

-- The inviter: an administrator, so the invite trigger accepts it.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1015-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test', now());
insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, is_admin)
values ('aaaaaaaa-1015-0000-0000-000000000003', 'mentor', 'active', 'Admin', 'probe.admin3', '1980-01-01', 'T1–T6', 'CA', true);

insert into public.invites (email, invited_by_member_id, note)
values ('joiner@probe.test', 'aaaaaaaa-1015-0000-0000-000000000003', 'probe');

\echo ''
\echo '== 1. find_inviters is gone (expect <null>) =='
select to_regprocedure('public.find_inviters(text[])') as find_inviters;

\echo '== 2. my_number_is_invited is gone (expect <null>) =='
select to_regprocedure('public.my_number_is_invited()') as my_number_is_invited;

\echo '== 3. invite_lookups is gone (expect <null>) =='
select to_regclass('public.invite_lookups') as invite_lookups;

\echo '== 4. members.findable_for_invites is gone (expect 0) =='
select count(*) as columns_left
  from information_schema.columns
 where table_schema = 'public' and table_name = 'members' and column_name = 'findable_for_invites';

\echo '== 5. nothing refers to them (expect 0 functions, 0 views) =='
select count(*) as functions_mentioning
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private') and p.prokind = 'f'
   and pg_get_functiondef(p.oid) ~* '(find_inviters|my_number_is_invited|invite_lookups|findable_for_invites)';
select count(*) as views_mentioning
  from pg_views
 where schemaname in ('public', 'private')
   and definition ~* '(find_inviters|my_number_is_invited|invite_lookups|findable_for_invites)';

-- As the joiner, signed in.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1015-0000-0000-000000000001","role":"authenticated","email":"joiner@probe.test"}', true) is not null as ok;

\echo '== 6a. calling find_inviters (expect: ERROR function public.find_inviters(...) does not exist) =='
savepoint a;
select * from public.find_inviters(array['14085550150']);
rollback to a;

\echo '== 6b. writing the column (expect: ERROR column "findable_for_invites" ... does not exist) =='
savepoint b;
update public.members set findable_for_invites = false where id = auth.uid();
rollback to b;

\echo '== 7. the invited, confirmed joiner still inserts their member row (expect INSERT 0 1) =='
insert into public.members (id, type, status, display_name, username, birth_date, level_range, state)
values ('aaaaaaaa-1015-0000-0000-000000000001', 'peer', 'active', 'Joiner', 'probe.joiner', '1980-01-01', 'T1–T6', 'CA');

\echo '== 8. an uninvited account is still refused (expect: ERROR new row violates row-level security policy) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1015-0000-0000-000000000002","role":"authenticated","email":"stranger@probe.test"}', true) is not null as ok;
savepoint c;
insert into public.members (id, type, status, display_name, username, birth_date, level_range, state)
values ('aaaaaaaa-1015-0000-0000-000000000002', 'peer', 'active', 'Stranger', 'probe.stranger', '1980-01-01', 'T1–T6', 'CA');
rollback to c;

rollback;

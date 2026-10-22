-- ============================================================================
-- Deleting an account forgets its sign-ins
-- ============================================================================
-- 20261022100000. Deleting your own account, or an administrator removing a
-- member, also deletes every auth.audit_log_entries row naming that account,
-- by id or by email address, IP address and all. Everybody else's rows stay,
-- and nobody can call the forgetting directly.
--
-- Run as the signed-in members doing it, not as the superuser: the functions
-- are definers, and a superuser caller would hide a missing permission. The
-- superuser writes the log rows first and counts them after. Every expected
-- refusal has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/sign-in-log-forgotten.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- Leaver deletes themselves; Removed is removed by Admin; Other stays.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-9191-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leaver@probe.test', now()),
  ('bbbbbbbb-9191-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'removed@probe.test', now()),
  ('cccccccc-9191-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@probe.test', now()),
  ('eeeeeeee-9191-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test', now());

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-9191-0000-0000-000000000001', 'peer', 'active', 'Leaver',  '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-9191-0000-0000-000000000002', 'peer', 'active', 'Removed', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-9191-0000-0000-000000000003', 'peer', 'active', 'Other',   '1982-01-01', 'C5–C8', 'CA', false),
  ('eeeeeeee-9191-0000-0000-000000000005', 'peer', 'active', 'Admin',   '1983-01-01', 'T1–T6', 'CA', true);

-- Payloads as this Supabase writes them (auth.audit_log_entries.payload is
-- json): the actor's id and email, or, for an action on the account by
-- somebody else, traits.user_id and traits.user_email.
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  -- Leaver: a sign-in, a sign-up from an earlier account at the same
  -- address (another id, upper case), and an action naming them in traits.
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"aaaaaaaa-9191-0000-0000-000000000001","actor_username":"leaver@probe.test","log_type":"account"}', now(), '203.0.113.1'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"user_signedup","actor_id":"aaaaaaaa-9191-0000-0000-0000000000ff","actor_username":"Leaver@Probe.test","log_type":"team"}', now(), '203.0.113.2'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"user_invited","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","log_type":"team","traits":{"user_id":"aaaaaaaa-9191-0000-0000-000000000001","user_email":"leaver@probe.test"}}', now(), '203.0.113.3'),
  -- Removed: two sign-ins.
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"bbbbbbbb-9191-0000-0000-000000000002","actor_username":"removed@probe.test","log_type":"account"}', now(), '203.0.113.4'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"token_refreshed","actor_id":"bbbbbbbb-9191-0000-0000-000000000002","actor_username":"removed@probe.test","log_type":"token"}', now(), '203.0.113.4'),
  -- Other, and an address that only starts like Leaver's: both stay.
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"cccccccc-9191-0000-0000-000000000003","actor_username":"other@probe.test","log_type":"account"}', now(), '203.0.113.5'),
  ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),
   '{"action":"login","actor_id":"dddddddd-9191-0000-0000-000000000004","actor_username":"leaver@probe.test.example","log_type":"account"}', now(), '203.0.113.6');

create temporary view probe_counts as
select
  count(*) filter (where payload::text ilike '%aaaaaaaa-9191-0000-0000-000000000001%'
                      or payload::text ilike '%"leaver@probe.test"%') as leaver,
  count(*) filter (where payload::text ilike '%bbbbbbbb-9191-%') as removed,
  count(*) filter (where payload::text ilike '%other@probe.test%') as other,
  count(*) filter (where payload::text ilike '%leaver@probe.test.example%') as lookalike
from auth.audit_log_entries;
grant select on probe_counts to authenticated;

\echo ''
\echo '== 0. before (expect 3 | 2 | 1 | 1) =='
select leaver, removed, other, lookalike from probe_counts;

\echo ''
\echo '== 1. a member cannot call the forgetting directly (expect ERROR: permission denied) =='
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-9191-0000-0000-000000000003","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint direct_call;
select private.forget_sign_in_log('aaaaaaaa-9191-0000-0000-000000000001');
rollback to savepoint direct_call;
reset role;

\echo ''
\echo '== 2. Leaver deletes their account (expect one row, delete_my_account empty) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-9191-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.delete_my_account();
reset role;

\echo ''
\echo '== 3. every row naming Leaver is gone, nobody else''s (expect 0 | 2 | 1 | 1) =='
select leaver, removed, other, lookalike from probe_counts;

\echo ''
\echo '== 4. Leaver''s account is gone, and their IP addresses with it (expect 0 | 0) =='
select (select count(*) from auth.users where id = 'aaaaaaaa-9191-0000-0000-000000000001') as account,
       (select count(*) from auth.audit_log_entries
         where ip_address in ('203.0.113.1', '203.0.113.2', '203.0.113.3')) as ips;

\echo ''
\echo '== 5. a member who is not an administrator cannot remove Removed (expect ERROR: Not an administrator) =='
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-9191-0000-0000-000000000003","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint not_admin;
select public.admin_delete_member('bbbbbbbb-9191-0000-0000-000000000002');
rollback to savepoint not_admin;
reset role;

\echo ''
\echo '== 6. ...and Removed''s rows are still there (expect 2) =='
select removed from probe_counts;

\echo ''
\echo '== 7. Admin removes Removed (expect one row, admin_delete_member empty) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-9191-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.admin_delete_member('bbbbbbbb-9191-0000-0000-000000000002');
reset role;

\echo ''
\echo '== 8. Removed''s rows are gone, Other''s and the lookalike stay (expect 0 | 0 | 1 | 1) =='
select leaver, removed, other, lookalike from probe_counts;

\echo ''
\echo '== 9. Other''s IP address is untouched (expect 1) =='
select count(*) from auth.audit_log_entries where ip_address = '203.0.113.5';

rollback;

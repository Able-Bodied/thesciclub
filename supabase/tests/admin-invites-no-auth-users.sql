-- ============================================================================
-- admin_invites without auth.users in it
-- ============================================================================
-- 20260929000000, after Supabase's `auth_users_exposed` advisor finding. Run
-- as signed-in roles, because what matters is who can read what through the
-- API, and `postgres` is BYPASSRLS and can execute anything:
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-invites-no-auth-users.sql
--
-- Rolls back. Steps 1, 3, 4 and 5 are the ones that matter: the administrator
-- still gets an answer (the first draft of the migration broke exactly that),
-- an ordinary member gets nothing through the view or around it, and anon
-- cannot reach the lookup at all.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- Two members and an account for one invited number. The account is written
-- as the superuser, the way GoTrue would; nothing below runs as postgres.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values ('aaaaaaaa-3333-3333-3333-333333333333', 'peer', 'active', 'Club Admin',
        '19990000040', '1980-01-01', 'T1–T6', 'CA', true),
       ('bbbbbbbb-3333-3333-3333-333333333333', 'peer', 'active', 'Ordinary',
        '19990000041', '1980-01-01', 'T1–T6', 'CA', false);

insert into auth.users (id, phone, created_at, aud, role)
values ('cccccccc-3333-3333-3333-333333333333', '14085553100', '2026-09-01 12:00+00',
        'authenticated', 'authenticated');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-3333-3333-3333-333333333333","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;

select public.admin_create_invite('4085553100', null, null, 'Has an account') is not null as made;
select public.admin_create_invite('4085553200', null, null, 'Has none') is not null as made;

\echo ''
\echo '== 1. an administrator still sees whether a number has signed up =='
\echo '   expect: 14085553100 | t | 2026-09-01 ...   and   14085553200 | f | (empty)'
select phone, has_account, account_created_at
  from public.admin_invites where phone in ('14085553100', '14085553200') order by phone;

\echo ''
\echo '== 2. one row per invite — the lookup cannot multiply them =='
\echo '   expect: 2'
select count(*) from public.admin_invites where phone in ('14085553100', '14085553200');

\echo ''
\echo '== 3. an ordinary member reads no rows at all =='
\echo '   expect: authenticated | 0'
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-3333-3333-3333-333333333333","role":"authenticated"}', true) is not null as ok;
select current_user, count(*) from public.admin_invites;

\echo ''
\echo '== 4. and calling the lookup directly answers nothing =='
\echo '   expect: (empty) — the function checks is_admin() itself'
select private.account_created_at('14085553100') as created_at;

\echo ''
\echo '== 5. nor can anon, nor read the view =='
\echo '   expect: two ERRORs — permission denied for schema private, then for view admin_invites'
reset role;
set local role anon;
select current_user;
savepoint anon_calls_lookup;
select private.account_created_at('14085553100');
rollback to savepoint anon_calls_lookup;
savepoint anon_reads_view;
select count(*) from public.admin_invites;
rollback to savepoint anon_reads_view;

\echo ''
\echo '== 6. no view the API can reach names auth.users =='
\echo '   expect: (no rows)'
reset role;
select schemaname || '.' || viewname
  from pg_views
 where definition ilike '%auth.users%'
   and schemaname in ('public', 'graphql_public');

\echo ''
\echo '== 7. and the view is a security barrier, read-only to members =='
\echo '   expect: {security_barrier=true}   then   authenticated | SELECT only'
select reloptions from pg_class where oid = 'public.admin_invites'::regclass;
select grantee, string_agg(privilege_type, ', ') from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'admin_invites' and grantee in ('anon', 'authenticated')
 group by grantee;

rollback;

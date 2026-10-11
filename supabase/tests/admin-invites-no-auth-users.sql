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
-- Rolls back. Since 20261012000000 an invite names an email address, and the
-- view also answers has_account from a CONFIRMED account at that address (or
-- the account that claimed the link); the old phone invites still read by
-- number. Steps 1, 3, 4 and 5 are the ones that matter: the administrator
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

insert into auth.users (id, phone, email, email_confirmed_at, created_at, aud, role)
values ('cccccccc-3333-3333-3333-333333333333', '14085553100', null, null, '2026-09-01 12:00+00',
        'authenticated', 'authenticated'),
       ('dddddddd-3333-3333-3333-333333333333', null, 'has.account@probe.test', '2026-09-02 12:00+00', '2026-09-02 12:00+00',
        'authenticated', 'authenticated'),
       ('eeeeeeee-3333-3333-3333-333333333333', null, 'unconfirmed@probe.test', null, '2026-09-03 12:00+00',
        'authenticated', 'authenticated');

-- An old phone invite, as a row (nothing writes one any more).
insert into public.invites (phone_raw, invited_by_member_id, note)
values ('4085553100', 'aaaaaaaa-3333-3333-3333-333333333333', 'Old phone invite with an account');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-3333-3333-3333-333333333333","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user;

select (public.admin_create_invite('has.account@probe.test', null, 'Has an account')).id is not null as made;
select (public.admin_create_invite('has.none@probe.test', null, 'Has none')).id is not null as made;
select (public.admin_create_invite('unconfirmed@probe.test', null, 'Account never confirmed')).id is not null as made;

\echo ''
\echo '== 1. an administrator still sees whether an invite has signed up =='
\echo '   expect: has.account@probe.test | t | 2026-09-02 ...'
\echo '           has.none@probe.test    | f | (null)'
\echo '           unconfirmed@probe.test | f | (null)   (an address nobody has confirmed is not an account)'
\echo '           (null)                 | t | 2026-09-01 ...   (the old phone invite, by number)'
\pset null '(null)'
select email, has_account, account_created_at
  from public.admin_invites
 where email in ('has.account@probe.test', 'has.none@probe.test', 'unconfirmed@probe.test')
    or phone = '14085553100'
 order by email nulls last;

\echo ''
\echo '== 2. one row per invite — the lookup cannot multiply them =='
\echo '   expect: 4'
select count(*) from public.admin_invites
 where email in ('has.account@probe.test', 'has.none@probe.test', 'unconfirmed@probe.test')
    or phone = '14085553100';

\echo ''
\echo '== 3. an ordinary member reads no rows at all =='
\echo '   expect: authenticated | 0'
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-3333-3333-3333-333333333333","role":"authenticated"}', true) is not null as ok;
select current_user, count(*) from public.admin_invites;

\echo ''
\echo '== 4. and calling the lookup directly answers nothing =='
\echo '   expect: three (null)s — the functions check is_admin() themselves'
select private.account_created_at('14085553100') as by_phone,
       private.account_created_at_for_invite(null, 'has.account@probe.test') as by_email,
       private.account_email('dddddddd-3333-3333-3333-333333333333') as the_address;

\echo ''
\echo '== 5. nor can anon, nor read the view =='
\echo '   expect: two ERRORs — permission denied for schema private, then for view admin_invites'
\echo '   (and none of this reaches admin_members.email: a view that named auth.users would be flagged)'
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

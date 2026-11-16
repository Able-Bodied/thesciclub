-- ============================================================================
-- Only an administrator sees who has the iPhone app (20261116210000)
-- ============================================================================
-- A member is refused; an administrator sees the member seen in the app, with
-- when, and the member with only a notification token, with no date, and not
-- the member with neither. Run against the test project on 2026-11-16 as a
-- probe, as expected.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admins-see-who-has-the-app.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-a990-0000-0000-00000000000a', 'probe-app-admin@example.com'),
  ('aaaaaaaa-a990-0000-0000-00000000000b', 'probe-app-seen@example.com'),
  ('aaaaaaaa-a990-0000-0000-00000000000c', 'probe-app-token@example.com'),
  ('aaaaaaaa-a990-0000-0000-00000000000d', 'probe-app-none@example.com');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-a990-0000-0000-00000000000a', 'peer', 'active', 'Probe admin', '19990009a01', '1980-01-01', 'T1–T6', 'CA', 'Oakland', true),
  ('aaaaaaaa-a990-0000-0000-00000000000b', 'peer', 'active', 'Probe seen', '19990009a02', '1980-01-01', 'T1–T6', 'CA', 'Oakland', false),
  ('aaaaaaaa-a990-0000-0000-00000000000c', 'peer', 'active', 'Probe token', '19990009a03', '1980-01-01', 'T1–T6', 'CA', 'Oakland', false),
  ('aaaaaaaa-a990-0000-0000-00000000000d', 'peer', 'active', 'Probe none', '19990009a04', '1980-01-01', 'T1–T6', 'CA', 'Oakland', false);
insert into private.app_seen (user_id, at) values ('aaaaaaaa-a990-0000-0000-00000000000b', now() - interval '2 days');
insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
values ('aaaaaaaa-a990-0000-0000-00000000000c', 'apns:sandbox:abababababababababababababababababababababababababababababababab', null, null);

\echo ''
\echo '== 1. a member (expect ERROR: Not an administrator) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-a990-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member;
select * from public.admin_members_with_the_app();
rollback to savepoint member;
reset role;

\echo ''
\echo '== 2. an administrator (expect Probe seen with a time, Probe token with none; no Probe none) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-a990-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select m.display_name, a.last_seen is not null as has_a_time
  from public.admin_members_with_the_app() a
  join public.members m on m.id = a.member_id
 where m.display_name like 'Probe %'
 order by m.display_name;
reset role;

rollback;

-- ============================================================================
-- Only an administrator makes staff, and only of an organization (20261117000000)
-- ============================================================================
-- A member is refused; an administrator is refused with no organization, and
-- then makes the member staff of one, keeping the profession they wrote. Run
-- against the test project on 2026-11-16 as a probe, as expected.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/staff-of-an-organization.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-5ff0-0000-0000-00000000000a', 'probe-staff-admin@example.com'),
  ('aaaaaaaa-5ff0-0000-0000-00000000000b', 'probe-staff-member@example.com');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-5ff0-0000-0000-00000000000a', 'peer', 'active', 'Probe admin', '19990005f01', '1980-01-01', 'T1–T6', 'CA', 'Oakland', true),
  ('aaaaaaaa-5ff0-0000-0000-00000000000b', 'peer', 'active', 'Probe member', '19990005f02', '1980-01-01', 'T1–T6', 'CA', 'Oakland', false);
insert into public.organizations (id, short_code, name, city, description)
values ('5ff00000-0000-0000-0000-000000000001', 'PRBS', 'Probe hospital', 'Oakland', 'For the probe.');
insert into public.club_partners (member_id, title)
values ('aaaaaaaa-5ff0-0000-0000-00000000000b', 'Physical therapist');

\echo ''
\echo '== 1. a member (expect ERROR: Not an administrator) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-5ff0-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member;
select public.admin_set_staff('aaaaaaaa-5ff0-0000-0000-00000000000b', '5ff00000-0000-0000-0000-000000000001');
rollback to savepoint member;
reset role;

\echo ''
\echo '== 2. an administrator, with no organization, then with one (expect ERROR: Choose an organization, then Probe hospital and the profession kept) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-5ff0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint no_organization;
select public.admin_set_staff('aaaaaaaa-5ff0-0000-0000-00000000000b', null);
rollback to savepoint no_organization;
select public.admin_set_staff('aaaaaaaa-5ff0-0000-0000-00000000000b', '5ff00000-0000-0000-0000-000000000001');
reset role;
select o.name as staff_of, p.title
  from public.club_partners p
  join public.organizations o on o.id = p.organization_id
 where p.member_id = 'aaaaaaaa-5ff0-0000-0000-00000000000b';

rollback;

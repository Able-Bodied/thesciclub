-- ============================================================================
-- A mentor is an organization's (20261028950000)
-- ============================================================================
-- An org admin makes mentors of their own organization and of no other; the
-- member's type follows; browse_members carries the organization; a club
-- administrator's Make mentor makes a mentor of The SCI Club.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/organization-mentors.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city)
values
  ('aaaaaaaa-e1e1-0000-0000-00000000000a', 'peer', 'active', 'Org admin of A', '19990000e01', '1980-01-01', 'T1–T6', 'CA', 'Oakland'),
  ('aaaaaaaa-e1e1-0000-0000-00000000000b', 'peer', 'active', 'A peer', '19990000e02', '1980-01-01', 'T1–T6', 'CA', 'Oakland'),
  ('aaaaaaaa-e1e1-0000-0000-00000000000c', 'peer', 'active', 'Club admin', '19990000e03', '1980-01-01', 'T1–T6', 'CA', 'Oakland');
update public.members set is_admin = true where id = 'aaaaaaaa-e1e1-0000-0000-00000000000c';

insert into public.organizations (id, short_code, name, city) values
  ('bbbbbbbb-e1e1-0000-0000-00000000000a', 'PRMA', 'Probe Org A', 'Oakland'),
  ('bbbbbbbb-e1e1-0000-0000-00000000000b', 'PRMB', 'Probe Org B', 'Oakland');
insert into public.organization_representatives (organization_id, member_id)
values ('bbbbbbbb-e1e1-0000-0000-00000000000a', 'aaaaaaaa-e1e1-0000-0000-00000000000a');

\echo ''
\echo '== 0. the club is an organization (expect 1) =='
select count(*) from public.organizations where is_the_club;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-e1e1-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. an org admin makes a mentor of their organization (expect mentor, Probe Org A) =='
select public.grant_mentor('bbbbbbbb-e1e1-0000-0000-00000000000a', 'aaaaaaaa-e1e1-0000-0000-00000000000b');
select type, mentor_organizations->0->>'name' as of
  from public.browse_members where id = 'aaaaaaaa-e1e1-0000-0000-00000000000b';

\echo ''
\echo '== 2. and not of another organization (expect ERROR: Only that organization''s admins) =='
savepoint other_org;
select public.grant_mentor('bbbbbbbb-e1e1-0000-0000-00000000000b', 'aaaaaaaa-e1e1-0000-0000-00000000000b');
rollback to savepoint other_org;

\echo ''
\echo '== 3. the table is not readable directly (expect ERROR: permission denied) =='
savepoint direct;
select count(*) from public.organization_mentors;
rollback to savepoint direct;

\echo ''
\echo '== 4. taking the last one away makes a peer again (expect peer, 0) =='
select public.revoke_mentor('bbbbbbbb-e1e1-0000-0000-00000000000a', 'aaaaaaaa-e1e1-0000-0000-00000000000b');
select type, jsonb_array_length(mentor_organizations)
  from public.browse_members where id = 'aaaaaaaa-e1e1-0000-0000-00000000000b';

\echo ''
\echo '== 5. a club administrator''s Make mentor is The SCI Club''s (expect mentor, t) =='
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-e1e1-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.admin_set_member_type('aaaaaaaa-e1e1-0000-0000-00000000000b', 'mentor');
reset role;
select m.type, exists (
         select 1 from public.organization_mentors g
         join public.organizations o on o.id = g.organization_id and o.is_the_club
        where g.member_id = m.id) as the_clubs
  from public.members m where m.id = 'aaaaaaaa-e1e1-0000-0000-00000000000b';

\echo ''
\echo '== 6. Make peer takes every mentor organization away (expect peer, 0) =='
set local role authenticated;
select public.admin_set_member_type('aaaaaaaa-e1e1-0000-0000-00000000000b', 'peer');
reset role;
select m.type, (select count(*) from public.organization_mentors g where g.member_id = m.id)
  from public.members m where m.id = 'aaaaaaaa-e1e1-0000-0000-00000000000b';

rollback;

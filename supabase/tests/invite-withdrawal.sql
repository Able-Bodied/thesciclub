-- ============================================================================
-- Whoever sent an invite can withdraw it
-- ============================================================================
-- The owner, 2026-10-22: invites do not expire, so anybody who can invite (a
-- mentor, an organization account, a linked representative, an administrator)
-- must be able to withdraw one they sent while nobody has used it. The policy
-- "mentors can revoke their own pending invites" is by sender, not by kind of
-- member, so it already covers all four; this holds it to that. Nobody can
-- withdraw somebody else's, or one already used.
--
-- Run as each signed-in sender: postgres is BYPASSRLS, so the policy is only
-- tested under a role. The superuser writes the invites first.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/invite-withdrawal.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-9292-0000-0000-000000000001', 'mentor',       'active', 'Mentor',         '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-9292-0000-0000-000000000002', 'organization', 'active', 'Org account',    '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-9292-0000-0000-000000000003', 'peer',         'active', 'Representative', '1982-01-01', 'T1–T6', 'CA', false),
  ('eeeeeeee-9292-0000-0000-000000000005', 'peer',         'active', 'Admin',          '1983-01-01', 'T1–T6', 'CA', true);

insert into public.organization_representatives (organization_id, member_id)
select id, 'cccccccc-9292-0000-0000-000000000003' from public.organizations where short_code = 'NCS';

-- One pending invite from each, and one the mentor sent that was used.
insert into public.invites (id, email, invited_by_member_id) values
  ('92920000-0000-0000-0000-00000000000a', 'from-mentor@probe.test',  'aaaaaaaa-9292-0000-0000-000000000001'),
  ('92920000-0000-0000-0000-00000000000b', 'from-org@probe.test',     'bbbbbbbb-9292-0000-0000-000000000002'),
  ('92920000-0000-0000-0000-00000000000c', 'from-rep@probe.test',     'cccccccc-9292-0000-0000-000000000003'),
  ('92920000-0000-0000-0000-00000000000e', 'from-admin@probe.test',   'eeeeeeee-9292-0000-0000-000000000005');
insert into public.invites (id, email, invited_by_member_id, status, consumed_at) values
  ('92920000-0000-0000-0000-0000000000a2', 'joined@probe.test', 'aaaaaaaa-9292-0000-0000-000000000001', 'consumed', now());

\echo ''
\echo '== 1. the organization account withdraws the representative''s invite (expect UPDATE 0) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-9292-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000c';
reset role;

\echo ''
\echo '== 2. the mentor withdraws an invite somebody used (expect UPDATE 0) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-9292-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-0000000000a2';
reset role;

\echo ''
\echo '== 3. the mentor withdraws their own (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-9292-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000a';
reset role;

\echo ''
\echo '== 4. the organization account withdraws its own (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-9292-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000b';
reset role;

\echo ''
\echo '== 5. the representative withdraws their own (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"cccccccc-9292-0000-0000-000000000003","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000c';
reset role;

\echo ''
\echo '== 6. the administrator withdraws their own, as the Invites screen does (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-9292-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000e';
reset role;

\echo ''
\echo '== 7. what each invite is now (expect 0a, 0b, 0c, 0e revoked; a2 consumed) =='
select right(id::text, 2) as invite, status from public.invites
 where id::text like '92920000-%' order by 1;

rollback;

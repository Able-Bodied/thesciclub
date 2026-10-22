-- ============================================================================
-- Whoever sent an invite can withdraw it, and do nothing else to it
-- ============================================================================
-- The owner, 2026-10-22: invites do not expire, so anybody who can invite (a
-- mentor, an organization account, a linked representative, an administrator)
-- must be able to withdraw one they sent while nobody has used it. Nobody can
-- withdraw somebody else's, or one already used.
--
-- 20261022140000: withdrawing (pending to revoked) is all an inviter may do.
-- Before it, steps 3 and 4 were UPDATE 1 (a mentor marked their own invite
-- used, or rewrote its revoked_at) and step 10 kept the caller's revoked_at.
-- Steps 14 and 15: administrators and claiming are unchanged.
--
-- Run as each signed-in sender: postgres is BYPASSRLS, so the policy is only
-- tested under a role. The superuser writes the invites first. Every expected
-- error has its own savepoint.
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

-- One pending invite from each, a second from the mentor, and one the mentor
-- sent that was used and one already withdrawn. c2 is the representative's,
-- with a link somebody joins on.
insert into public.invites (id, email, invited_by_member_id) values
  ('92920000-0000-0000-0000-00000000000a', 'from-mentor@probe.test',  'aaaaaaaa-9292-0000-0000-000000000001'),
  ('92920000-0000-0000-0000-00000000000f', 'mentor-two@probe.test',   'aaaaaaaa-9292-0000-0000-000000000001'),
  ('92920000-0000-0000-0000-00000000000b', 'from-org@probe.test',     'bbbbbbbb-9292-0000-0000-000000000002'),
  ('92920000-0000-0000-0000-00000000000c', 'from-rep@probe.test',     'cccccccc-9292-0000-0000-000000000003'),
  ('92920000-0000-0000-0000-00000000000e', 'from-admin@probe.test',   'eeeeeeee-9292-0000-0000-000000000005');
insert into public.invites (id, email, invited_by_member_id, status, consumed_at) values
  ('92920000-0000-0000-0000-0000000000a2', 'joined@probe.test', 'aaaaaaaa-9292-0000-0000-000000000001', 'consumed', now());
insert into public.invites (id, email, invited_by_member_id, status, revoked_at) values
  ('92920000-0000-0000-0000-00000000000d', 'withdrawn@probe.test', 'aaaaaaaa-9292-0000-0000-000000000001', 'revoked', '2026-01-01');
insert into public.invites (id, email, invited_by_member_id, token_hash) values
  ('92920000-0000-0000-0000-0000000000c2', 'linked@probe.test', 'cccccccc-9292-0000-0000-000000000003',
   encode(extensions.digest('probe-token-9292', 'sha256'), 'hex'));

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('dddddddd-9292-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'newcomer-9292@other.test', now());

\echo ''
\echo '== 1. the organization account withdraws the representative''s invite (expect UPDATE 0) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-9292-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000c';
reset role;

-- ================================================ the mentor, trying the rest
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-9292-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. the mentor withdraws an invite somebody used (expect UPDATE 0) =='
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-0000000000a2';

\echo ''
\echo '== 3. the mentor marks their own unused invite used =='
\echo '   expect: ERROR, new row violates row-level security policy'
savepoint mark_used;
update public.invites set status = 'consumed' where id = '92920000-0000-0000-0000-00000000000f';
rollback to savepoint mark_used;

\echo ''
\echo '== 4. leaves it pending but sets revoked_at, both ways =='
\echo '   expect: two ERRORs, new row violates row-level security policy'
savepoint stamp_only;
update public.invites set revoked_at = now() where id = '92920000-0000-0000-0000-00000000000f';
rollback to savepoint stamp_only;
savepoint pending_again;
update public.invites set status = 'pending', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000f';
rollback to savepoint pending_again;

\echo ''
\echo '== 5. edits another column, alone and while withdrawing =='
\echo '   expect: two ERRORs, permission denied for table invites'
savepoint other_column;
update public.invites set note = 'mine now' where id = '92920000-0000-0000-0000-00000000000f';
rollback to savepoint other_column;
savepoint withdraw_and_more;
update public.invites set status = 'revoked', claimed_by = 'aaaaaaaa-9292-0000-0000-000000000001'
 where id = '92920000-0000-0000-0000-00000000000f';
rollback to savepoint withdraw_and_more;

\echo ''
\echo '== 6. sets the used one back to pending (expect UPDATE 0) =='
update public.invites set status = 'pending' where id = '92920000-0000-0000-0000-0000000000a2';

\echo ''
\echo '== 7. puts the withdrawn one back, then re-withdraws it with another date (expect UPDATE 0, UPDATE 0) =='
update public.invites set status = 'pending' where id = '92920000-0000-0000-0000-00000000000d';
update public.invites set status = 'revoked', revoked_at = '2000-01-01' where id = '92920000-0000-0000-0000-00000000000d';

reset role;

\echo ''
\echo '== 8. none of it changed anything (expect 0d revoked 2026-01-01 | 0f pending, null | a2 consumed, null, null) =='
select right(id::text, 2) as invite, status, revoked_at::date as revoked, claimed_by, note
  from public.invites where id in ('92920000-0000-0000-0000-00000000000d',
    '92920000-0000-0000-0000-00000000000f', '92920000-0000-0000-0000-0000000000a2') order by 1;

-- ================================================== every kind still withdraws
\echo ''
\echo '== 9. the mentor withdraws their own, sending an old date (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-9292-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = '2000-01-01' where id = '92920000-0000-0000-0000-00000000000a';
reset role;

\echo ''
\echo '== 10. the date is the database''s, not the one sent (expect t) =='
select revoked_at = now() as stamped_now from public.invites where id = '92920000-0000-0000-0000-00000000000a';

\echo ''
\echo '== 11. the organization account withdraws its own (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-9292-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000b';
reset role;

\echo ''
\echo '== 12. the representative withdraws their own (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"cccccccc-9292-0000-0000-000000000003","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000c';
reset role;

\echo ''
\echo '== 13. the administrator withdraws their own, as the Invites screen does (expect t, then UPDATE 1) =='
select set_config('request.jwt.claims', '{"sub":"eeeeeeee-9292-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select can_invite from public.my_invite_permissions();
update public.invites set status = 'revoked', revoked_at = now() where id = '92920000-0000-0000-0000-00000000000e';

\echo ''
\echo '== 14. and revokes the mentor''s other one from Admin (expect no error) =='
select public.admin_revoke_invite('92920000-0000-0000-0000-00000000000f');
reset role;

-- ======================================================= claiming still works
\echo ''
\echo '== 15. a newcomer claims the representative''s link and joins (expect t, then INSERT 0 1) =='
select set_config('request.jwt.claims', '{"sub":"dddddddd-9292-0000-0000-000000000004","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.claim_invite('probe-token-9292') as claimed;
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('dddddddd-9292-0000-0000-000000000004', 'Newcomer', 'newcomer.9292', '1985-01-01', 'T1–T6', 'CA');
reset role;

\echo ''
\echo '== 16. what each invite is now =='
\echo '   expect: 0a 0b 0c 0e 0f revoked, t | 0d revoked, f | a2 consumed | c2 consumed, by the newcomer'
select right(id::text, 2) as invite, status, revoked_at = now() as revoked_now,
       claimed_by = 'dddddddd-9292-0000-0000-000000000004' as by_newcomer
  from public.invites where id::text like '92920000-%' order by 1;

rollback;

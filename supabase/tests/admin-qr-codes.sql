-- ============================================================================
-- An administrator's QR code (20261014020000)
-- ============================================================================
-- Run as anon and as signed-in roles with request.jwt.claims set; the
-- superuser only writes rows and reads results between role switches. Read
-- every answer against its expect line:
--
--   1. making a code: administrators only; the event is optional; the email
--      is checked and stored lowercase; nobody reads another's codes
--   2. what a code says: name, event, open or not, and the email only while
--      joining is closed; a turned-off code, an unknown one and one whose
--      maker is no longer an administrator say nothing
--   3. claiming: only a signed-in account that is not a member, only a live code
--   4. joining open: a walk-in from a code is credited to its administrator,
--      with its event; the administrator is notified, and the notification
--      opens Admin; with no event, and with no code, as they should be
--   5. a real invite wins over a code; a code turned off after the claim
--      still credits; turning off somebody else's code is refused
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/admin-qr-codes.sql
--
-- One transaction, rolled back; each expected refusal in its own savepoint.
-- Never against the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '<null>'

begin;

-- ------------------------------------------------------------------ set-up --
-- 01 and 02 administrators, 03 a member; 04 to 09 accounts that will join.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1015-0000-0000-0000000000' || n)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', e, now()
  from (values ('01', 'admin1@probe.test'), ('02', 'admin2@probe.test'), ('03', 'member@probe.test'),
               ('04', 'expo@probe.test'), ('05', 'noevent@probe.test'), ('06', 'nocode@probe.test'),
               ('07', 'invited@probe.test'), ('08', 'late@probe.test'), ('09', 'demoted@probe.test')) v(n, e);

insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1015-0000-0000-000000000001', 'peer', 'active', 'Alfred Probe', 'probe.admin1015a', '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1015-0000-0000-000000000002', 'peer', 'active', 'Sam Probe',    'probe.admin1015b', '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1015-0000-0000-000000000003', 'peer', 'active', 'Plain Member', 'probe.member1015', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.invites (email, status, invited_by_member_id) values
  ('invited@probe.test', 'pending', 'aaaaaaaa-1015-0000-0000-000000000002');

update public.club_joining set open = false;

create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-1015-0000-0000-0000000000' || n, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.join_as(n text, uname text) returns void language sql as $$
  insert into public.members (id, display_name, username, birth_date, level_range)
  values (('aaaaaaaa-1015-0000-0000-0000000000' || n)::uuid, 'Joiner ' || n, uname, '1990-01-01', 'T7–T12');
$$;
grant execute on function pg_temp.as_member(text), pg_temp.join_as(text, text) to anon, authenticated;

-- ========================================================== 1. making ======
\echo '== 1. making a code =='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
\echo '   expect: ERROR: permission denied for function admin_create_qr_code'
savepoint anon_make;
select public.admin_create_qr_code('Expo', 'a@probe.test');
rollback to savepoint anon_make;

set local role authenticated;
select pg_temp.as_member('03');
\echo '   expect: ERROR: Only an administrator can do that.'
savepoint member_make;
select public.admin_create_qr_code('Expo', 'a@probe.test');
rollback to savepoint member_make;

select pg_temp.as_member('01');
\echo '   expect: ERROR: Enter an email address people can write to. (twice)'
savepoint bad_email;
select public.admin_create_qr_code('Expo', 'not an address');
rollback to savepoint bad_email;
savepoint no_email;
select public.admin_create_qr_code('Expo', null);
rollback to savepoint no_email;
\echo '   expect: ERROR: Keep the event name to 80 characters.'
savepoint long_event;
select public.admin_create_qr_code(repeat('x', 81), 'a@probe.test');
rollback to savepoint long_event;

\echo '   expect: Abilities Expo LA | hello@probe.test (trimmed, lowercase), then <null> | admin1@probe.test (blank event is none)'
select event_name, contact_email from public.admin_create_qr_code('  Abilities Expo LA ', ' Hello@Probe.TEST ');
select event_name, contact_email from public.admin_create_qr_code('   ', 'admin1@probe.test');
select pg_temp.as_member('02');
select event_name from public.admin_create_qr_code('Other Expo', 'admin2@probe.test');
select event_name from public.admin_create_qr_code('Leaving soon', 'admin2@probe.test');

reset role;
-- Keep the codes for the steps below.
select (select code from public.qr_codes where event_name = 'Abilities Expo LA') as expo_code \gset
select (select code from public.qr_codes where admin_id = 'aaaaaaaa-1015-0000-0000-000000000001' and event_name is null) as noevent_code \gset
select (select code from public.qr_codes where event_name = 'Other Expo') as other_code \gset
select (select id from public.qr_codes where event_name = 'Abilities Expo LA') as expo_id \gset
select (select code from public.qr_codes where event_name = 'Leaving soon') as leaving_code \gset

set local role authenticated;
select pg_temp.as_member('01');
\echo '   expect: 2 (an administrator reads only their own two)'
select count(*) from public.qr_codes;
select pg_temp.as_member('03');
\echo '   expect: 0 (a member reads none), then ERROR: permission denied for table qr_codes (no writes)'
select count(*) from public.qr_codes;
savepoint member_write;
update public.qr_codes set turned_off_at = now();
rollback to savepoint member_write;
\echo '   expect: ERROR: permission denied for table qr_code_claims'
savepoint member_claims;
select * from public.qr_code_claims;
rollback to savepoint member_claims;

-- ======================================================= 2. what it says ===
\echo '== 2. what a code says =='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
\echo '   expect: Alfred Probe | Abilities Expo LA | f | hello@probe.test (closed: the email to ask)'
select * from public.qr_code_details(:'expo_code');
\echo '   expect: Alfred Probe | <null> | f | admin1@probe.test'
select * from public.qr_code_details(:'noevent_code');
\echo '   expect: 0 rows twice (unknown, empty)'
select * from public.qr_code_details('not-a-code');
select * from public.qr_code_details('');
reset role;
update public.club_joining set open = true;
set local role anon;
\echo '   expect: Alfred Probe | Abilities Expo LA | t | <null> (open: no email)'
select * from public.qr_code_details(:'expo_code');

-- ========================================================= 3. claiming =====
\echo '== 3. claiming =='
\echo '   expect: ERROR: permission denied for function claim_qr_code'
savepoint anon_claim;
select public.claim_qr_code(:'expo_code');
rollback to savepoint anon_claim;
set local role authenticated;
select pg_temp.as_member('03');
\echo '   expect: f (already a member)'
select public.claim_qr_code(:'expo_code');
select pg_temp.as_member('04');
\echo '   expect: f (unknown), then t, then t (claiming again is fine)'
select public.claim_qr_code('not-a-code');
select public.claim_qr_code(:'expo_code');
select public.claim_qr_code(:'expo_code');
select pg_temp.as_member('05');
select public.claim_qr_code(:'noevent_code') as noevent_claimed;
select pg_temp.as_member('07');
select public.claim_qr_code(:'other_code') as invited_also_claims;
select pg_temp.as_member('08');
select public.claim_qr_code(:'expo_code') as late_claimed;
select pg_temp.as_member('09');
select public.claim_qr_code(:'leaving_code') as demoted_claimed;

-- ====================================================== 4. joining open ====
\echo '== 4. joining open =='
select pg_temp.as_member('04');
\echo '   expect: join_as | (one empty row) for each of 04, 05, 06'
select pg_temp.join_as('04', 'expo.1015');
select pg_temp.as_member('05');
select pg_temp.join_as('05', 'noevent.1015');
select pg_temp.as_member('06');
select pg_temp.join_as('06', 'nocode.1015');
reset role;
\echo '   expect three rows, by email:'
\echo '     expo@probe.test     | Alfred Probe | Abilities Expo LA | t'
\echo '     nocode@probe.test   | <null>       | <null>            | t'
\echo '     noevent@probe.test  | Alfred Probe | <null>            | t'
select i.email, m.display_name as invited_by, q.event_name, i.joined_while_open
  from public.invites i
  left join public.members m on m.id = i.invited_by_member_id
  left join public.qr_codes q on q.id = i.qr_code_id
 where i.email in ('expo@probe.test', 'noevent@probe.test', 'nocode@probe.test')
 order by i.email;
\echo '   expect two rows for Alfred: Joiner 04 | qr:Abilities Expo LA, Joiner 05 | qr: (nobody is notified for 06)'
select j.display_name, n.detail
  from public.notifications n join public.members j on j.id = n.joined_id
 where n.kind = 'invite_joined' and j.display_name like 'Joiner 0%'
   and n.member_id = 'aaaaaaaa-1015-0000-0000-000000000001'
 order by j.display_name;
\echo '   expect: 0 (nobody else was notified about them)'
select count(*) from public.notifications n join public.members j on j.id = n.joined_id
 where n.kind = 'invite_joined' and j.display_name like 'Joiner 0%'
   and n.member_id <> 'aaaaaaaa-1015-0000-0000-000000000001';

set local role authenticated;
select pg_temp.as_member('01');
\echo '   expect: Joiner 05 | qr: | /admin?tab=invites, then Joiner 04 | qr:Abilities Expo LA | /admin?tab=invites'
select place, detail, url from public.my_notifications() where kind = 'invite_joined' and place like 'Joiner 0%';
\echo '   expect: expo@probe.test | t | Abilities Expo LA | Alfred Probe (Admin''s list)'
select email, from_qr_code, qr_event_name, invited_by_member
  from public.admin_invites where email = 'expo@probe.test';
\echo '   expect: nocode@probe.test | f | <null>'
select email, from_qr_code, qr_event_name from public.admin_invites where email = 'nocode@probe.test';

-- ================================================== 5. the edges ===========
\echo '== 5. edges =='
select pg_temp.as_member('07');
select pg_temp.join_as('07', 'invited.1015');
reset role;
\echo '   expect: consumed | f | <null> | Sam Probe (the real invite won; the code gave nothing)'
select i.status, i.joined_while_open, i.qr_code_id, m.display_name
  from public.invites i join public.members m on m.id = i.invited_by_member_id
 where i.email = 'invited@probe.test';

set local role authenticated;
select pg_temp.as_member('02');
\echo '   expect: ERROR: No such code. (Sam cannot turn off Alfred''s)'
savepoint not_mine;
select public.admin_turn_off_qr_code(:'expo_id');
rollback to savepoint not_mine;
select pg_temp.as_member('01');
select public.admin_turn_off_qr_code(:'expo_id');
select public.admin_turn_off_qr_code(:'expo_id') as again_is_fine;
\echo '   expect: t (turned off, dated)'
select turned_off_at is not null from public.qr_codes where id = :'expo_id';
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
\echo '   expect: 0 rows (a turned-off code says nothing)'
select * from public.qr_code_details(:'expo_code');
set local role authenticated;
select pg_temp.as_member('06');
\echo '   expect: f (cannot be claimed any more)'
select public.claim_qr_code(:'expo_code');

select pg_temp.as_member('08');
select pg_temp.join_as('08', 'late.1015');
reset role;
\echo '   expect: Alfred Probe | Abilities Expo LA (claimed while live, turned off before joining: still credited)'
select m.display_name, q.event_name
  from public.invites i join public.members m on m.id = i.invited_by_member_id
  join public.qr_codes q on q.id = i.qr_code_id
 where i.email = 'late@probe.test';

-- Sam stops being an administrator.
update public.members set is_admin = false where id = 'aaaaaaaa-1015-0000-0000-000000000002';
set local role anon;
\echo '   expect: 0 rows (the maker is no longer an administrator)'
select * from public.qr_code_details(:'leaving_code');
set local role authenticated;
select pg_temp.as_member('09');
select pg_temp.join_as('09', 'demoted.1015');
reset role;
\echo '   expect: <null> | <null> | t (claimed earlier, but no credit to somebody no longer an administrator)'
select i.invited_by_member_id, i.qr_code_id, i.joined_while_open from public.invites i where i.email = 'demoted@probe.test';

rollback;

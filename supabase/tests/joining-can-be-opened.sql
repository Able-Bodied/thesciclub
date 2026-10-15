-- ============================================================================
-- Joining can be opened to anybody, and closed again (20261014000000)
-- Somebody who joins while it is open goes on the list (20261014010000)
-- ============================================================================
-- One switch, read by the sign-up hook (signup_needs_an_invite) and by
-- i_am_invited (my_invite_status and the members insert policy). The hook is
-- called directly as its owner, as signup-needs-an-invite.sql does; everything
-- else runs as anon or a signed-in role with request.jwt.claims set. Read every
-- answer against its expect line:
--
--   1. closed, as it starts: nobody uninvited passes; an invite still does
--   2. refusals: anon and a member cannot flip it; neither can read the row
--   3. an administrator opens it, and reads who did
--   4. open: an uninvited email sign-up passes and joins, and goes on the
--      list as a used invite marked joined_while_open; a blocked address, an
--      unconfirmed account and phone, anonymous and provider-less sign-ups
--      are still refused, and leave nothing on the list
--   5. closed again: the door shuts for the next one; who joined stays
--   6. the walk-in's invite, edge cases: an address already on the list as
--      used joins without one; a row made by the superuser gets none
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/joining-can-be-opened.sql
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
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1014-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test',    now()),
  ('aaaaaaaa-1014-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'member@probe.test',   now()),
  ('aaaaaaaa-1014-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'walkin@probe.test',   now()),
  ('aaaaaaaa-1014-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconf@probe.test',   null),
  ('aaaaaaaa-1014-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blocked@probe.test',  now()),
  ('aaaaaaaa-1014-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invited@probe.test',  now()),
  ('aaaaaaaa-1014-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'latecomer@probe.test', now()),
  ('aaaaaaaa-1014-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leftover@probe.test', now()),
  ('aaaaaaaa-1014-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'scripted@probe.test', now());

insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1014-0000-0000-000000000001', 'peer', 'active', 'Probe Admin',  'probe.admin1014',  '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1014-0000-0000-000000000002', 'peer', 'active', 'Probe Member', 'probe.member1014', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.invites (email, status, invited_by_member_id) values
  ('invited@probe.test', 'pending', 'aaaaaaaa-1014-0000-0000-000000000001');
-- Used once, by an account since gone: still the address's one live entry.
insert into public.invites (email, status, consumed_at, invited_by_member_id) values
  ('leftover@probe.test', 'consumed', now(), 'aaaaaaaa-1014-0000-0000-000000000001');
insert into public.blocked_emails (email, note) values ('blocked@probe.test', 'probe');

-- The payload GoTrue sends (confirmed 2026-10-11), cut down to what is read.
create function pg_temp.ev(provider text, address text)
returns jsonb language sql as $$
  select jsonb_build_object('user', jsonb_build_object(
    'email', coalesce(address, ''),
    'phone', '',
    'app_metadata', case when provider is null then '{}'::jsonb else jsonb_build_object('provider', provider) end,
    'user_metadata', '{}'::jsonb
  ));
$$;
create function pg_temp.answer(event jsonb)
returns text language sql as $$
  select coalesce(r -> 'error' ->> 'http_code', r::text)
    from (select public.signup_needs_an_invite(event) as r) x;
$$;
grant execute on function pg_temp.ev(text, text), pg_temp.answer(jsonb) to anon, authenticated;

-- ========================================================== 1. closed ======
\echo '== 1. closed, as it starts =='
\echo '   expect: f (the stored default)'
select open from public.club_joining;
\echo '   expect: 403 | {} (uninvited refused, invited passes)'
select pg_temp.answer(pg_temp.ev('email', 'walkin@probe.test')) as uninvited,
       pg_temp.answer(pg_temp.ev('email', 'invited@probe.test')) as invited;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
\echo '   expect: f (anon may ask whether joining is open)'
select public.joining_is_open() as open_to_anon;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000003","role":"authenticated","email":"walkin@probe.test"}';
\echo '   expect: f (an uninvited, confirmed account is not let in)'
select invited from public.my_invite_status();
\echo '   expect: ERROR: new row violates row-level security policy for table "members"'
savepoint closed_insert;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000003', 'Walk In', 'walk.in1014', '1990-01-01', 'T7–T12');
rollback to savepoint closed_insert;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000006","role":"authenticated","email":"invited@probe.test"}';
\echo '   expect: t (an invite works as before)'
select invited from public.my_invite_status();

-- ======================================================== 2. refusals ======
\echo '== 2. refusals =='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
\echo '   expect: ERROR: permission denied for function admin_set_joining_open'
savepoint anon_flip;
select public.admin_set_joining_open(true);
rollback to savepoint anon_flip;
\echo '   expect: ERROR: permission denied for table club_joining'
savepoint anon_read;
select * from public.club_joining;
rollback to savepoint anon_read;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000002","role":"authenticated","email":"member@probe.test"}';
\echo '   expect: ERROR: Only an administrator can do that.'
savepoint member_flip;
select public.admin_set_joining_open(true);
rollback to savepoint member_flip;
\echo '   expect: 0 (a member reads no row)'
select count(*) from public.club_joining;
\echo '   expect: ERROR: permission denied for table club_joining (no write grant)'
savepoint member_write;
update public.club_joining set open = true;
rollback to savepoint member_write;
\echo '   expect: f (still closed after all of that)'
select public.joining_is_open();

-- ============================================================ 3. opens =====
\echo '== 3. an administrator opens it =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
\echo '   expect: ERROR: Say whether joining is open.'
savepoint admin_null;
select public.admin_set_joining_open(null);
rollback to savepoint admin_null;
select public.admin_set_joining_open(true);
\echo '   expect: t | t | t (open, by this administrator, just now)'
select open, changed_by = 'aaaaaaaa-1014-0000-0000-000000000001' as by_me, changed_at is not null as dated
  from public.club_joining;

-- ============================================================= 4. open =====
\echo '== 4. open =='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
\echo '   expect: t'
select public.joining_is_open() as open_to_anon;

reset role;
\echo '   expect: {} | {} | 403 | 403 | 403 | 403 (uninvited and invited pass; blocked, phone, anonymous and provider-less do not)'
select pg_temp.answer(pg_temp.ev('email', 'walkin@probe.test'))  as uninvited,
       pg_temp.answer(pg_temp.ev('email', 'invited@probe.test')) as invited,
       pg_temp.answer(pg_temp.ev('email', 'Blocked@Probe.test')) as blocked,
       pg_temp.answer(pg_temp.ev('phone', null))                 as phone,
       pg_temp.answer(pg_temp.ev('anonymous', null))             as anonymous,
       pg_temp.answer(pg_temp.ev(null, 'walkin@probe.test'))     as no_provider;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000004","role":"authenticated","email":"unconf@probe.test"}';
\echo '   expect: f (an unconfirmed address is not let in)'
select invited from public.my_invite_status();
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000005","role":"authenticated","email":"blocked@probe.test"}';
\echo '   expect: f (a blocked address is not let in)'
select invited from public.my_invite_status();
\echo '   expect: ERROR: new row violates row-level security policy for table "members"'
savepoint blocked_insert;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000005', 'Blocked', 'blocked.1014', '1990-01-01', 'T7–T12');
rollback to savepoint blocked_insert;

set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000003","role":"authenticated","email":"walkin@probe.test"}';
\echo '   expect: t (the uninvited, confirmed account is let in)'
select invited from public.my_invite_status();
\echo '   expect: INSERT 0 1'
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000003', 'Walk In', 'walk.in1014', '1990-01-01', 'T7–T12');

set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000006","role":"authenticated","email":"invited@probe.test"}';
\echo '   expect: INSERT 0 1 (somebody invited joins as before)'
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000006', 'Invited', 'invited.1014', '1990-01-01', 'T7–T12');

reset role;
\echo '   expect: walkin@probe.test | consumed | t | t | t (the walk-in is on the list, used, by them, marked, and their row points at it)'
select i.email, i.status, i.joined_while_open, i.claimed_by = m.id as claimed_by_them, m.invite_id = i.id as member_points_at_it
  from public.members m join public.invites i on i.email = 'walkin@probe.test'
 where m.id = 'aaaaaaaa-1014-0000-0000-000000000003';
\echo '   expect: consumed | f (the invited member used their own invite, not marked)'
select status, joined_while_open from public.invites where email = 'invited@probe.test';
\echo '   expect: 0 (the refused blocked and unconfirmed accounts left nothing on the list)'
select count(*) from public.invites where email in ('blocked@probe.test', 'unconf@probe.test') and status <> 'pending';

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
\echo '   expect: walkin@probe.test | t | <null> | <null> | Walk In (admin_invites: marked, nobody vouched, held by the walk-in)'
select email, joined_while_open, invited_by_member, invited_by_organization, held_by
  from public.admin_invites where email = 'walkin@probe.test';
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000002","role":"authenticated","email":"member@probe.test"}';
\echo '   expect: 0 (a member sees none of it)'
select count(*) from public.admin_invites;
reset role;

-- ====================================================== 5. closed again ====
\echo '== 5. closed again =='
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
select public.admin_set_joining_open(false);
\echo '   expect: f'
select public.joining_is_open();
reset role;
\echo '   expect: 403 (the next uninvited sign-up is refused)'
select pg_temp.answer(pg_temp.ev('email', 'latecomer@probe.test')) as latecomer;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000007","role":"authenticated","email":"latecomer@probe.test"}';
\echo '   expect: f'
select invited from public.my_invite_status();
\echo '   expect: ERROR: new row violates row-level security policy for table "members"'
savepoint late_insert;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000007', 'Latecomer', 'late.1014', '1990-01-01', 'T7–T12');
rollback to savepoint late_insert;
reset role;
\echo '   expect: active | t (who joined while it was open stays, and stays on the list)'
select m.status, i.joined_while_open
  from public.members m join public.invites i on i.id = m.invite_id
 where m.id = 'aaaaaaaa-1014-0000-0000-000000000003';
\echo '   expect: 0 (the refused latecomer is not on the list)'
select count(*) from public.invites where email = 'latecomer@probe.test';

-- ============================================== 6. the walk-in's invite ====
\echo '== 6. edge cases, open again =='
update public.club_joining set open = true;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1014-0000-0000-000000000008","role":"authenticated","email":"leftover@probe.test"}';
\echo '   expect: INSERT 0 1 (an address already on the list as used still joins)'
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000008', 'Leftover', 'leftover.1014', '1990-01-01', 'T7–T12');
reset role;
\echo '   expect: t | 1 (with no invite_id, and the old entry is still the only one)'
select (select invite_id is null from public.members where id = 'aaaaaaaa-1014-0000-0000-000000000008') as no_invite,
       (select count(*) from public.invites where email = 'leftover@probe.test') as entries;
set local request.jwt.claims = '{}';
\echo '   expect: INSERT 0 1, then t | 0 (a row the superuser makes is not a walk-in)'
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1014-0000-0000-000000000009', 'Scripted', 'scripted.1014', '1990-01-01', 'T7–T12');
select (select invite_id is null from public.members where id = 'aaaaaaaa-1014-0000-0000-000000000009') as no_invite,
       (select count(*) from public.invites where email = 'scripted@probe.test') as entries;
\echo '   expect: ERROR: An invite must come from a member organization or a mentor (still, unless marked)'
savepoint nobody_vouched;
insert into public.invites (email) values ('nobody-vouched@probe.test');
rollback to savepoint nobody_vouched;

rollback;

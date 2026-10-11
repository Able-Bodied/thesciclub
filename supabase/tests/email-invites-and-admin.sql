-- ============================================================================
-- The email address is the account (20261012000000) — the rest of the contract
-- ============================================================================
-- email-is-the-account.sql proves the gate. This one proves what stands around
-- it, from EMAIL-SIGN-IN-PLAN.md's Contract:
--
--   1. the invites table: one live invite per address, an address that is
--      always lowercase, no invite for nothing, one token per invite
--   2. admin_revoke_invite, which judged "already used" by the invite's number
--   3. delete_my_account, which frees an email invite and must NOT free a
--      stranger's phone invite just because the member typed that number
--   4. admin_block_number, which must find a member by the number Auth
--      verified, not by the number they typed
--   5. event_host_contacts, admin only, Going members only
--   6. the admin views and browse_members show the new columns, to the
--      right people
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/email-invites-and-admin.sql
--
-- One transaction, rolled back; every refusal in its own savepoint. Everything
-- after set-up runs as `authenticated` with request.jwt.claims set, except
-- where a step says it is reading as the superuser (an administrator has no
-- select policy on `invites`, so reading it as one proves nothing).
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off
\pset null '<null>'

begin;

-- ------------------------------------------------------------------ set-up --
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, phone) values
  ('aaaaaaaa-1013-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test',   now(), null),
  ('aaaaaaaa-1013-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'leaver@probe.test',  now(), null),
  ('aaaaaaaa-1013-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'claimer@relay.test', now(), null),
  ('aaaaaaaa-1013-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'typist@probe.test',  now(), null),
  ('aaaaaaaa-1013-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', null,                  null,  '14085557200'),
  ('aaaaaaaa-1013-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'going@probe.test',    now(), null),
  ('aaaaaaaa-1013-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'interested@probe.test', now(), null);

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1013-0000-0000-000000000001', 'mentor', 'active', 'Admin',      'probe.admin2',   null,              '1980-01-01', 'T1–T6', 'CA', true),
  -- Leaver typed the number of somebody else's old phone invite as their contact number.
  ('aaaaaaaa-1013-0000-0000-000000000002', 'peer',   'active', 'Leaver',     'probe.leaver',   '(408) 555-7000',  '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1013-0000-0000-000000000003', 'peer',   'active', 'Claimer',    'probe.claimer',  null,              '1980-01-01', 'T1–T6', 'CA', false),
  -- Typist typed a number that belongs to Phoned (below); Phoned really signed in with it.
  ('aaaaaaaa-1013-0000-0000-000000000004', 'peer',   'active', 'Typist',     'probe.typist',   '(408) 555-7100',  '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1013-0000-0000-000000000005', 'peer',   'active', 'Phoned',     'probe.phoned',   '14085557200',     '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1013-0000-0000-000000000006', 'peer',   'active', 'Going Guest', 'probe.going',    '(555) 010-4242',  '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1013-0000-0000-000000000007', 'peer',   'active', 'Interested Guest', 'probe.interested', null,       '1980-01-01', 'T1–T6', 'CA', false);

insert into public.invites (email, phone_raw, status, invited_by_member_id, consumed_at, claimed_by, claimed_at) values
  -- consumed by their members: Leaver at their own address, Claimer through a link at another address
  ('leaver@probe.test',       null,           'consumed', 'aaaaaaaa-1013-0000-0000-000000000001', now(), null, null),
  ('someone.else@probe.test', null,           'consumed', 'aaaaaaaa-1013-0000-0000-000000000001', now(), 'aaaaaaaa-1013-0000-0000-000000000003', now()),
  -- a pending invite to withdraw
  ('torevoke@probe.test',     null,           'pending',  'aaaaaaaa-1013-0000-0000-000000000001', null, null, null),
  -- somebody else's old phone invite, on the number Leaver typed
  (null,                      '4085557000',   'pending',  'aaaaaaaa-1013-0000-0000-000000000001', null, null, null);
update public.members set invite_id = (select id from public.invites where email = 'leaver@probe.test')
 where id = 'aaaaaaaa-1013-0000-0000-000000000002';
update public.members set invite_id = (select id from public.invites where email = 'someone.else@probe.test')
 where id = 'aaaaaaaa-1013-0000-0000-000000000003';

insert into public.events (id, feed_id, external_id, title, start_time)
select 'eeeeeeee-1013-0000-0000-00000000000e', f.id, 'probe-1013', 'Probe ride', now() + interval '3 days'
  from public.data_feeds f where f.feed_type = 'norcalsci-events';
insert into public.event_rsvps (event_id, member_id, status) values
  ('eeeeeeee-1013-0000-0000-00000000000e', 'aaaaaaaa-1013-0000-0000-000000000006', 'going'),
  ('eeeeeeee-1013-0000-0000-00000000000e', 'aaaaaaaa-1013-0000-0000-000000000007', 'interested');

-- ============================================== 1. the invites table itself --
\echo '== 1. the invites table (superuser: these are constraints, not policies) =='
\echo '   expect: four ERRORs (23514 check: neither email nor phone; 23514 check: uppercase address;'
\echo '   23514 check: not an address; 23505 duplicate: a second live invite for leaver@probe.test)'
savepoint nothing_at_all;
insert into public.invites (invited_by_member_id) values ('aaaaaaaa-1013-0000-0000-000000000001');
rollback to nothing_at_all;
savepoint uppercase;
insert into public.invites (email, invited_by_member_id) values ('Upper@Probe.test', 'aaaaaaaa-1013-0000-0000-000000000001');
rollback to uppercase;
savepoint shape;
insert into public.invites (email, invited_by_member_id) values ('not an address', 'aaaaaaaa-1013-0000-0000-000000000001');
rollback to shape;
savepoint twice;
insert into public.invites (email, invited_by_member_id) values ('leaver@probe.test', 'aaaaaaaa-1013-0000-0000-000000000001');
rollback to twice;

\echo '   expect: INSERT 0 1 (a REVOKED invite does not hold the address: it can be invited again), then'
\echo '   INSERT 0 2 (two invites with no phone coexist: an email invite has phone NULL, not an empty string)'
insert into public.invites (email, invited_by_member_id, status, revoked_at)
values ('leaver@probe.test', 'aaaaaaaa-1013-0000-0000-000000000001', 'revoked', now());
insert into public.invites (email, invited_by_member_id)
values ('coexist.one@probe.test', 'aaaaaaaa-1013-0000-0000-000000000001'),
       ('coexist.two@probe.test', 'aaaaaaaa-1013-0000-0000-000000000001');
\echo '   expect: 0 (no email invite got a phone)'
select count(*) from public.invites where email is not null and phone is not null;

\echo '   expect: INSERT 0 1, then ERROR 23505 duplicate key on invites_token_hash_unique (one token, one invite)'
insert into public.invites (email, invited_by_member_id, token_hash)
values ('token.one@probe.test', 'aaaaaaaa-1013-0000-0000-000000000001', repeat('a', 64));
savepoint same_token;
insert into public.invites (email, invited_by_member_id, token_hash)
values ('token.two@probe.test', 'aaaaaaaa-1013-0000-0000-000000000001', repeat('a', 64));
rollback to same_token;

set local role authenticated;

-- ======================================================= 2. revoking invites --
\echo ''
\echo '== 2. admin_revoke_invite =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000001","role":"authenticated"}';
\echo '   expect: ERROR ... already been used (the invite Leaver joined on; it has an EMAIL, no number to look up)'
savepoint used;
select public.admin_revoke_invite(id) from public.admin_invites where email = 'leaver@probe.test' and status = 'consumed';
rollback to used;
\echo '   expect: revoked (a pending one is withdrawn)'
select public.admin_revoke_invite(id) from public.admin_invites where email = 'torevoke@probe.test';
select status from public.admin_invites where email = 'torevoke@probe.test';
\echo '   expect: ERROR ... Not an administrator'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000004","role":"authenticated"}';
savepoint not_admin;
select public.admin_revoke_invite(gen_random_uuid());
rollback to not_admin;

-- =================================================== 3. deleting my account --
\echo ''
\echo '== 3. delete_my_account =='
\echo '   expect before: 1 | 1 | 1 (Leaver''s invite, Claimer''s invite, and the stranger''s old phone invite on the number Leaver typed)'
reset role;
select (select count(*) from public.invites where email = 'leaver@probe.test' and status = 'consumed') as leavers_invite,
       (select count(*) from public.invites where email = 'someone.else@probe.test') as claimers_invite,
       (select count(*) from public.invites where phone = '14085557000') as strangers_phone_invite;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000002","role":"authenticated"}';
select public.delete_my_account();
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000003","role":"authenticated"}';
select public.delete_my_account();
\echo '   expect after: 0 | 0 | 1  (both of theirs are freed -- Claimer''s through the link, at an address that is not theirs --'
\echo '   but the number Leaver TYPED freed nothing of anybody else''s)'
reset role;
select (select count(*) from public.invites where email = 'leaver@probe.test' and status = 'consumed') as leavers_invite,
       (select count(*) from public.invites where email = 'someone.else@probe.test') as claimers_invite,
       (select count(*) from public.invites where phone = '14085557000') as strangers_phone_invite;
\echo '   expect: 0 | 0 (their accounts and member rows are gone)'
select (select count(*) from auth.users where id in ('aaaaaaaa-1013-0000-0000-000000000002', 'aaaaaaaa-1013-0000-0000-000000000003')) as accounts,
       (select count(*) from public.members where id in ('aaaaaaaa-1013-0000-0000-000000000002', 'aaaaaaaa-1013-0000-0000-000000000003')) as members;
set local role authenticated;
\echo '   expect: ERROR ... administrator''s account cannot be deleted'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000001","role":"authenticated"}';
savepoint admin_leaves;
select public.delete_my_account();
rollback to admin_leaves;

-- ================================================ 4. blocking a number, still --
\echo ''
\echo '== 4. admin_block_number finds a member by the number Auth verified =='
\echo '   expect: 1 | 1 (Typist and Phoned both there) then 1 | 0'
\echo '   (Typist typed Phoned''s number: blocking it removes Phoned, who signed in with it, and not Typist)'
select count(*) filter (where id = 'aaaaaaaa-1013-0000-0000-000000000004') as typist,
       count(*) filter (where id = 'aaaaaaaa-1013-0000-0000-000000000005') as phoned
  from public.admin_members;
select public.admin_block_number('(408) 555-7200', 'probe');
select count(*) filter (where id = 'aaaaaaaa-1013-0000-0000-000000000004') as typist,
       count(*) filter (where id = 'aaaaaaaa-1013-0000-0000-000000000005') as phoned
  from public.admin_members;
\echo '   expect: 1 | 2 (and blocking the number Typist merely TYPED removes nobody, though both numbers are now blocked)'
select public.admin_block_number('(408) 555-7100', 'probe typed');
select count(*) filter (where id = 'aaaaaaaa-1013-0000-0000-000000000004') as typist,
       (select count(*) from public.admin_blocked_numbers where phone in ('14085557100', '14085557200')) as numbers_blocked
  from public.admin_members;

-- ============================================== 5. event_host_contacts --
\echo ''
\echo '== 5. event_host_contacts =='
\echo '   expect: one row: Going Guest | going@probe.test | (555) 010-4242  (the Interested member is not passed to the host)'
select display_name, email, phone from public.event_host_contacts('eeeeeeee-1013-0000-0000-00000000000e');
\echo '   expect: ERROR ... Not an administrator (a member asks)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000006","role":"authenticated"}';
savepoint a_member_asks;
select * from public.event_host_contacts('eeeeeeee-1013-0000-0000-00000000000e');
rollback to a_member_asks;
\echo '   expect: ERROR ... permission denied for function event_host_contacts (signed out)'
reset role;
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
savepoint signed_out;
select * from public.event_host_contacts('eeeeeeee-1013-0000-0000-00000000000e');
rollback to signed_out;
reset role;
set local role authenticated;

-- ================================================================ 6. views --
\echo ''
\echo '== 6. the views =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000001","role":"authenticated"}';
\echo '   expect: probe.admin2 | admin@probe.test  (an administrator reads a member''s email and username)'
select username, email from public.admin_members where id = 'aaaaaaaa-1013-0000-0000-000000000001';
\echo '   expect: coexist.one@probe.test | pending | <null> | <null> | <null> | f'
\echo '   (the invite list shows the new columns; nobody has an account at that address)'
select email, status, claimed_by, claimed_at, sent_at, has_account from public.admin_invites where email = 'coexist.one@probe.test';
\echo '   expect: probe.going  (members see each other''s @username)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1013-0000-0000-000000000007","role":"authenticated"}';
select username from public.browse_members where id = 'aaaaaaaa-1013-0000-0000-000000000006';
\echo '   expect: 0 | 0 (a member reads no admin rows, and so no email)'
select (select count(*) from public.admin_members) as admin_members, (select count(*) from public.admin_invites) as admin_invites;

rollback;

-- ============================================================================
-- The email address is the account (20261012000000) — the invite gate
-- ============================================================================
-- The six things EMAIL-SIGN-IN-PLAN.md, Workstream A, says must be proven:
--
--   1. a stranger cannot learn whether an address is invited
--   2. an unconfirmed email does not match
--   3. a claimed token cannot be claimed twice
--   4. a blocked email cannot be invited or matched
--   5. the members insert refuses an uninvited account
--   6. usernames collide without regard to case
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/email-is-the-account.sql
--
-- One transaction, rolled back, so it leaves nothing behind. Every refusal has
-- its own savepoint. Everything after the set-up runs as the `authenticated`
-- (or `anon`) role with request.jwt.claims set, as PostgREST does: as the
-- superuser every policy below would be inert and every refusal would turn into
-- a pass. The JWT claims carry an `email` on purpose: nothing may read it.
--
-- Each step prints what it should say; read the output against those lines.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off
\pset null '<null>'

begin;

-- ------------------------------------------------------------------ set-up --
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1012-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test',    now()),
  ('aaaaaaaa-1012-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mentor@probe.test',   now()),
  ('aaaaaaaa-1012-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conf@probe.test',     now()),
  ('aaaaaaaa-1012-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unconf@probe.test',   null),
  ('aaaaaaaa-1012-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@probe.test',    now()),
  ('aaaaaaaa-1012-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hidden@relay.test',   now()),
  ('aaaaaaaa-1012-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@probe.test', now()),
  ('aaaaaaaa-1012-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blk@probe.test',      now()),
  ('aaaaaaaa-1012-0000-0000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blk2@probe.test',     now()),
  ('aaaaaaaa-1012-0000-0000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blk4@probe.test',     now());

insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1012-0000-0000-000000000001', 'mentor', 'active', 'Probe Admin',  'probe.admin',  '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1012-0000-0000-000000000002', 'mentor', 'active', 'Probe Mentor', 'probe.mentor', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1012-0000-0000-000000000099', 'peer',   'active', 'Probe Jose',    'jose',         '1980-01-01', 'T1–T6', 'CA', false);

insert into public.invites (email, invited_by_member_id, token_hash, status, revoked_at) values
  ('conf@probe.test',          'aaaaaaaa-1012-0000-0000-000000000002', null, 'pending', null),
  ('unconf@probe.test',        'aaaaaaaa-1012-0000-0000-000000000002', null, 'pending', null),
  ('tokened@probe.test',       'aaaaaaaa-1012-0000-0000-000000000002', encode(extensions.digest('tok-ABC', 'sha256'), 'hex'), 'pending', null),
  ('revoked@probe.test',       'aaaaaaaa-1012-0000-0000-000000000002', encode(extensions.digest('tok-REV', 'sha256'), 'hex'), 'revoked', now()),
  ('blk2@probe.test',          'aaaaaaaa-1012-0000-0000-000000000002', null, 'pending', null),
  ('friend@probe.test',        'aaaaaaaa-1012-0000-0000-000000000002', encode(extensions.digest('tok-FRIEND', 'sha256'), 'hex'), 'pending', null),
  ('someone.else@probe.test',  'aaaaaaaa-1012-0000-0000-000000000002', null, 'pending', null);

\echo '== 0. set-up: six live email invites and one revoked, none of them with a phone (expect 6 | 1 | 0) =='
\echo '   (only the probe''s own; a seeded stack has two more, which a stranger must not see either)'
select count(*) filter (where status = 'pending') as pending,
       count(*) filter (where status = 'revoked') as revoked,
       count(*) filter (where phone is not null) as with_a_phone
  from public.invites where invited_by_member_id = 'aaaaaaaa-1012-0000-0000-000000000002';

set local role anon;

\echo '== 1a. SIGNED OUT cannot ask, cannot claim (expect three ERRORs: permission denied for function) =='
set local request.jwt.claims = '{"role":"anon"}';
savepoint s1;
select public.my_invite_status();
rollback to s1;
savepoint s2;
select public.i_am_invited();
rollback to s2;
savepoint s3;
select public.claim_invite('tok-ABC');
rollback to s3;

reset role;
set local role authenticated;

\echo '== 1b. a signed-in STRANGER is told only about themself, and no function takes an address =='
\echo '   expect: authenticated, then f, then 0'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000007","role":"authenticated","email":"conf@probe.test"}';
select current_user;
select invited from public.my_invite_status();
select count(*) as functions_that_take_an_argument
  from pg_proc where pronamespace = 'public'::regnamespace and proname in ('i_am_invited', 'my_invite_status') and pronargs <> 0;

\echo '   expect: f | f  (the helpers that take an address are not executable by a signed-in member)'
select has_function_privilege('authenticated', 'public.is_blocked_email(text)', 'execute') as is_blocked_email,
       has_function_privilege('authenticated', 'public.has_active_invite(text)', 'execute') as has_active_invite;

\echo '   expect: 0 | 0 (other people''s invites are invisible, though several exist) then ERROR permission denied for table blocked_emails'
select count(*) as invites_i_can_see from public.invites;
select count(*) as admin_view_rows from public.admin_invites;
savepoint s4;
select count(*) from public.blocked_emails;
rollback to s4;

\echo '== 2. an UNCONFIRMED address does not match, a confirmed one does =='
\echo '   expect: t (confirmed conf@probe.test, invited)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000003","role":"authenticated","email":"conf@probe.test"}';
select invited from public.my_invite_status();
\echo '   expect: f (unconf@probe.test is invited by exact address, but never confirmed; the JWT even says it is theirs)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000004","role":"authenticated","email":"unconf@probe.test"}';
select invited from public.my_invite_status();
\echo '   expect: f (a confirmed account whose JWT claims conf@probe.test is still not conf@probe.test)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000005","role":"authenticated","email":"conf@probe.test"}';
select invited from public.my_invite_status();
\echo '   expect: t (control: confirm unconf@probe.test and nothing else changes)'
reset role;
update auth.users set email_confirmed_at = now() where id = 'aaaaaaaa-1012-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000004","role":"authenticated","email":"unconf@probe.test"}';
select invited from public.my_invite_status();
reset role;
update auth.users set email_confirmed_at = null where id = 'aaaaaaaa-1012-0000-0000-000000000004';
set local role authenticated;

\echo '== 3. a link is claimed once =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000006","role":"authenticated","email":"hidden@relay.test"}';
\echo '   expect: f (hidden@relay.test is on no invite)'
select invited from public.my_invite_status();
\echo '   expect: f | f | f | f (a wrong token, an empty one, none, and a REVOKED one: all the same answer, no error)'
select public.claim_invite('wrong-token') as wrong,
       public.claim_invite('') as empty,
       public.claim_invite(null) as nothing,
       public.claim_invite('tok-REV') as revoked;
\echo '   expect: t | t (the real token claims it; being invited follows, although the address differs)'
select public.claim_invite('tok-ABC') as claimed;
select invited from public.my_invite_status();
\echo '   expect: f | f (a different signed-in account cannot claim the same token, and gets no hint why)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000005","role":"authenticated","email":"other@probe.test"}';
select public.claim_invite('tok-ABC') as second_claimer;
select invited from public.my_invite_status();
\echo '   expect: t (the first holder claiming again is harmless) then t (claimed_by is still them, seen as the superuser)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000006","role":"authenticated","email":"hidden@relay.test"}';
select public.claim_invite('tok-ABC') as holder_again;
reset role;
select claimed_by = 'aaaaaaaa-1012-0000-0000-000000000006' as still_the_first from public.invites where email = 'tokened@probe.test';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000006","role":"authenticated","email":"hidden@relay.test"}';

\echo '== 3b. joining on the claimed invite makes the member and consumes it (expect INSERT 0 1, then consumed | t) =='
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000006', 'Hidden Joiner', 'hidden.joiner', '1990-01-01', 'T7–T12');
reset role;
select i.status, m.invite_id = i.id as member_points_at_it
  from public.invites i join public.members m on m.id = 'aaaaaaaa-1012-0000-0000-000000000006' where i.email = 'tokened@probe.test';
set local role authenticated;
\echo '   expect: f | f (a used token cannot be claimed by someone else, nor by the member it made)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000005","role":"authenticated","email":"other@probe.test"}';
select public.claim_invite('tok-ABC') as someone_else_after_use;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000006","role":"authenticated","email":"hidden@relay.test"}';
select public.claim_invite('tok-ABC') as the_member_after_use;

\echo '== 4. a BLOCKED address can be neither invited nor matched =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
\echo '   expect: blk@probe.test | pending  (an administrator invites a mixed-case address; it is stored lowercase)'
select email, status from public.admin_create_invite('  Blk@Probe.test ', null, 'probe');
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000008","role":"authenticated","email":"blk@probe.test"}';
\echo '   expect: t (control: invited before the block)'
select invited from public.my_invite_status();
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
select public.admin_block_email('BLK@probe.test', 'probe');
\echo '   expect: blk@probe.test (one blocked address, stored lowercase), then revoked (its invite went with the block)'
select email from public.admin_blocked_emails;
reset role;
select status from public.invites where email = 'blk@probe.test';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000008","role":"authenticated","email":"blk@probe.test"}';
\echo '   expect: f (no longer invited)'
select invited from public.my_invite_status();
\echo '   expect: three ERRORs: blocked (an administrator inviting it, a mentor inviting it, and a raw insert by the superuser)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
savepoint s5;
select public.admin_create_invite('blk@probe.test');
rollback to s5;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000002","role":"authenticated","email":"mentor@probe.test"}';
savepoint s6;
select public.create_my_invite('Blk@probe.test');
rollback to s6;
reset role;
savepoint s7;
insert into public.invites (email, invited_by_member_id) values ('blk@probe.test', 'aaaaaaaa-1012-0000-0000-000000000002');
rollback to s7;
set local role authenticated;

\echo '   expect: t | f | t  (blk2 is invited; a row in blocked_emails, written directly, makes the SAME pending invite stop matching; removing it restores it)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000009","role":"authenticated","email":"blk2@probe.test"}';
select invited as before_block from public.my_invite_status();
reset role;
insert into public.blocked_emails (email) values ('blk2@probe.test');
set local role authenticated;
select invited as while_blocked from public.my_invite_status();
reset role;
delete from public.blocked_emails where email = 'blk2@probe.test';
set local role authenticated;
select invited as after_unblock from public.my_invite_status();

\echo '   expect: f | t  (a BLOCKED account cannot claim a valid token; the same token claims once they are unblocked)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000010","role":"authenticated","email":"blk4@probe.test"}';
reset role;
insert into public.blocked_emails (email) values ('blk4@probe.test');
set local role authenticated;
select public.claim_invite('tok-FRIEND') as while_blocked;
reset role;
delete from public.blocked_emails where email = 'blk4@probe.test';
set local role authenticated;
select public.claim_invite('tok-FRIEND') as after_unblock;

\echo '   expect: ERROR Not an administrator (a member blocks an address), ERROR (an administrator blocks their own), ERROR (unblocking one that is not blocked)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000002","role":"authenticated","email":"mentor@probe.test"}';
savepoint s8;
select public.admin_block_email('anyone@probe.test');
rollback to s8;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000001","role":"authenticated","email":"admin@probe.test"}';
savepoint s9;
select public.admin_block_email('admin@probe.test');
rollback to s9;
savepoint s10;
select public.admin_unblock_email('never-blocked@probe.test');
rollback to s10;
\echo '   expect: blk@probe.test | pending  (control: unblocked, the same invite is accepted again)'
select public.admin_unblock_email('BLK@probe.test');
select email, status from public.admin_create_invite('blk@probe.test');

\echo '== 5. the members insert refuses an UNINVITED account =='
\echo '   expect: ERROR new row violates row-level security policy (stranger@probe.test is on no invite, and others exist)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000007","role":"authenticated","email":"stranger@probe.test"}';
savepoint s11;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000007', 'Stranger', 'stranger.one', '1990-01-01', 'T7–T12');
rollback to s11;
\echo '   expect: ERROR row-level security (an invited account cannot insert a row for somebody else'' id)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000003","role":"authenticated","email":"conf@probe.test"}';
savepoint s12;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000007', 'Not me', 'not.me', '1990-01-01', 'T7–T12');
rollback to s12;
\echo '   expect: ERROR Choose a username | ERROR That username is taken (reserved) | ERROR A new member joins as an active peer'
savepoint s13;
insert into public.members (id, display_name, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000003', 'Conf User', '1990-01-01', 'T7–T12');
rollback to s13;
savepoint s14;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000003', 'Conf User', 'Admin', '1990-01-01', 'T7–T12');
rollback to s14;
savepoint s15;
insert into public.members (id, display_name, username, birth_date, level_range, is_admin)
values ('aaaaaaaa-1012-0000-0000-000000000003', 'Conf User', 'conf.user', '1990-01-01', 'T7–T12', true);
rollback to s15;
\echo '   expect: pending (every refused insert rolled its consumption of the invite back)'
reset role;
select status from public.invites where email = 'conf@probe.test';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000003","role":"authenticated","email":"conf@probe.test"}';
\echo '   expect: INSERT 0 1 (the invited, confirmed account joins; the typed phone is not checked against anything)'
insert into public.members (id, display_name, username, phone, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000003', 'Conf User', 'Conf.User', '(555) 010-0000', '1990-01-01', 'T7–T12');
\echo '   expect: conf.user | consumed | t  (the username is stored lowercase; the invite is consumed and linked)'
reset role;
select m.username::text, i.status, m.invite_id = i.id as linked
  from public.members m join public.invites i on i.email = 'conf@probe.test'
 where m.id = 'aaaaaaaa-1012-0000-0000-000000000003';
set local role authenticated;

\echo '   expect: INSERT 0 1 (a second member may share that phone: a household line)'
reset role;
update auth.users set email_confirmed_at = now() where id = 'aaaaaaaa-1012-0000-0000-000000000004';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000004","role":"authenticated","email":"unconf@probe.test"}';
insert into public.members (id, display_name, username, phone, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000004', 'Unconf User', 'unconf.user', '(555) 010-0000', '1990-01-01', 'T7–T12');

\echo '== 5b. a member edits their own phone but not their username =='
\echo '   expect: UPDATE 1 | UPDATE 1 (set, then cleared), then ERROR Your username is changed with set_my_username'
update public.members set phone = '(555) 010-9999' where id = 'aaaaaaaa-1012-0000-0000-000000000004';
update public.members set phone = null where id = 'aaaaaaaa-1012-0000-0000-000000000004';
savepoint s16;
update public.members set username = 'sneaky.change' where id = 'aaaaaaaa-1012-0000-0000-000000000004';
rollback to s16;

\echo '== 6. usernames collide without regard to case =='
\echo '   expect: f | t | f  (conf.user exists: CONF.USER is taken; unconf.user may keep its own; and conf.user is taken for them)'
select public.username_available('CONF.USER') as other_case_of_taken;
select public.username_available('Unconf.User') as my_own_name;
select public.username_available('conf.user') as someone_elses;
\echo '   expect: f | f | f | f | f | t  (reserved, too short, a space, leading dot, doubled dot; then a good one)'
select public.username_available('admin') as reserved,
       public.username_available('ab') as too_short,
       public.username_available('has space') as space,
       public.username_available('.lead') as leading_dot,
       public.username_available('a..b') as double_dot,
       public.username_available('ok_name.1') as good;
\echo '   expect: ERROR 23505 That username is taken (twice: another case of a taken name, and a reserved one), ERROR 22023 (bad shape), ERROR 42501 (not a member)'
savepoint s17;
select public.set_my_username('CONF.User');
rollback to s17;
savepoint s18;
select public.set_my_username('administrator');
rollback to s18;
savepoint s19;
select public.set_my_username('x');
rollback to s19;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000007","role":"authenticated","email":"stranger@probe.test"}';
savepoint s20;
select public.set_my_username('stranger.name');
rollback to s20;
\echo '   expect: new.name (a member changes theirs through the function; stored lowercase)'
set local request.jwt.claims = '{"sub":"aaaaaaaa-1012-0000-0000-000000000004","role":"authenticated","email":"unconf@probe.test"}';
select public.set_my_username('New.Name');
select username from public.browse_members where id = 'aaaaaaaa-1012-0000-0000-000000000004';

\echo '   expect: josegarcialopez | jose.garcialopez | jose_garcialopez | joseg  then t | 5 | t'
\echo '   (José García-López: accents stripped, "jose" is taken so it is left out, four named forms, then name + two digits)'
select string_agg(s, ' | ' order by n) filter (where n <= 4) as first_four,
       count(*) as how_many,
       bool_and(public.username_available(s)) as all_free_and_valid
  from public.suggest_usernames('José  García-López') with ordinality as t (s, n);
select (array_agg(s order by n))[5] ~ '^josegarcialopez[0-9]{2}$' as fifth_is_name_plus_digits
  from public.suggest_usernames('José  García-López') with ordinality as t (s, n);
\echo '   expect: 5 | t  (a name too short to be a username still gets five valid, free suggestions) then 0 | 0 (nothing to go on)'
select count(*) as how_many, bool_and(public.username_available(s)) as all_valid
  from public.suggest_usernames('Al') as t (s);
select count(*) as for_empty from public.suggest_usernames('');
select count(*) as for_null from public.suggest_usernames(null);

reset role;
\echo '   expect: t | t | t, then ERROR 23505 duplicate key ... "members_username_key"'
\echo '   (the unique index itself is case-insensitive: the shape check and the lowercasing trigger are taken away'
\echo '   inside this transaction, and a differently-cased duplicate is refused by the index alone)'
select (select a.atttypid::regtype::text from pg_attribute a where a.attrelid = 'public.members'::regclass and a.attname = 'username') ~ 'citext' as column_is_citext,
       exists (select 1 from pg_indexes where indexname = 'members_username_key' and indexdef ilike '%unique%') as index_is_unique,
       to_regprocedure('public.only_a_phone_makes_an_account(jsonb)') is null as phone_hook_function_is_gone;
alter table public.members drop constraint members_username_shape;
alter table public.members disable trigger members_a_a_username;
savepoint s21;
insert into public.members (id, type, status, display_name, username, birth_date, level_range)
values ('aaaaaaaa-1012-0000-0000-000000000098', 'peer', 'active', 'Dup Jose', 'JOSE', '1980-01-01', 'T1–T6');
rollback to s21;

rollback;

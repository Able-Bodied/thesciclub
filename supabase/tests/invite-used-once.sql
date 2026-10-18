-- ============================================================================
-- Does one invite let in one account?
-- ============================================================================
-- 20261018010000 (security scan of 2026-10-17, F1). Before it, a consumed
-- invite counted for anybody it named or who had claimed it, so:
--   step 5 was t and step 6 joined: Bob used Alice's forwarded link, and
--     Alice could still join on the same invite;
--   step 9 was t: Dora moved her account to another address, and a new
--     account on her old one passed the gate with no invite.
-- Steps 1–3 and 7 have to keep working: a forwarded link still lets in the
-- one who uses it, and an invite by address still lets in that address.
-- Steps 10–12 show a deleted member's invite is revoked and keeps them out.
--
-- Run as the signed-in account in each section, not as the superuser. Every
-- expected refusal has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/invite-used-once.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-1819-0000-0000-00000000000a', 'mentor', 'active', 'Admin',  '19990001901', '1980-01-01', 'T1–T6', 'CA', true),
  ('eeeeeeee-1819-0000-0000-00000000000e', 'mentor', 'active', 'Mentor', '19990001902', '1981-01-01', 'C5–C8', 'CA', false);

insert into public.invites (email, invited_by_member_id, note, token_hash)
values
  ('alice.used@probe.test', 'eeeeeeee-1819-0000-0000-00000000000e', 'probe',
   encode(extensions.digest('probe-token-alice-1819', 'sha256'), 'hex')),
  ('carol.used@probe.test', 'eeeeeeee-1819-0000-0000-00000000000e', 'probe', null),
  ('dora.used@probe.test',  'eeeeeeee-1819-0000-0000-00000000000e', 'probe', null);

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values
  ('b0b00000-1819-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bob.used@other.test',   now()),
  ('a11ce000-1819-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'alice.used@probe.test', now()),
  ('ca401000-1819-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'carol.used@probe.test', now()),
  ('d0a00000-1819-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dora.used@probe.test',  now());

-- ====================================================== as Bob, with the link
select set_config('request.jwt.claims',
  '{"sub":"b0b00000-1819-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. Bob claims the forwarded link (expect t) =='
select public.claim_invite('probe-token-alice-1819') as claimed;

\echo ''
\echo '== 2. and is invited (expect t) =='
select public.i_am_invited() as invited;

\echo ''
\echo '== 3. and joins (expect INSERT 0 1) =='
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('b0b00000-1819-0000-0000-00000000000b', 'Bob', 'bob.used', '1985-01-01', 'T1–T6', 'CA');

reset role;

\echo ''
\echo '== 4. the invite is used, by Bob (expect consumed | t | t) =='
select status, claimed_by = 'b0b00000-1819-0000-0000-00000000000b' as by_bob,
       (select invite_id from public.members where id = 'b0b00000-1819-0000-0000-00000000000b') = i.id as on_his_row
  from public.invites i where email = 'alice.used@probe.test';

-- ================================================ as Alice, the address on it
select set_config('request.jwt.claims',
  '{"sub":"a11ce000-1819-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 5. Alice is no longer invited: Bob used it (expect f) =='
select public.i_am_invited() as invited;

\echo ''
\echo '== 6. and cannot join on it =='
\echo '   expect: ERROR, new row violates row-level security policy'
savepoint alice_joins;
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('a11ce000-1819-0000-0000-00000000000a', 'Alice', 'alice.used', '1985-01-01', 'T1–T6', 'CA');
rollback to savepoint alice_joins;

reset role;

-- ======================================= as Carol, invited by address alone
select set_config('request.jwt.claims',
  '{"sub":"ca401000-1819-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 7. an invite by address still lets that address join (expect INSERT 0 1) =='
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('ca401000-1819-0000-0000-00000000000c', 'Carol', 'carol.used', '1985-01-01', 'T1–T6', 'CA');

reset role;

\echo ''
\echo '== 8. and the invite names her as who used it (expect consumed | t) =='
select status, claimed_by = 'ca401000-1819-0000-0000-00000000000c' as by_carol
  from public.invites where email = 'carol.used@probe.test';

-- ========================== Dora joins, then moves her account to a new address
select set_config('request.jwt.claims',
  '{"sub":"d0a00000-1819-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
insert into public.members (id, display_name, username, birth_date, level_range, state)
values ('d0a00000-1819-0000-0000-00000000000d', 'Dora', 'dora.used', '1985-01-01', 'T1–T6', 'CA');
reset role;

update auth.users set email = 'dora.moved@probe.test' where id = 'd0a00000-1819-0000-0000-00000000000d';
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('d0a20000-1819-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'dora.used@probe.test', now());

select set_config('request.jwt.claims',
  '{"sub":"d0a20000-1819-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 9. a new account on Dora''s old address is not invited (expect f) =='
select public.i_am_invited() as invited;

reset role;

-- ================================================== as the administrator
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1819-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 10. the administrator deletes Bob (expect no error) =='
select public.admin_delete_member('b0b00000-1819-0000-0000-00000000000b');

reset role;

\echo ''
\echo '== 11. the invite he used is revoked (expect revoked) =='
select status from public.invites where email = 'alice.used@probe.test';

select set_config('request.jwt.claims',
  '{"sub":"b0b00000-1819-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 12. so Bob is not invited any more (expect f) =='
select public.i_am_invited() as invited;

reset role;

rollback;

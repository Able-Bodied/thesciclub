-- ============================================================================
-- The invite link can say which address it was sent to (20261012030000)
-- ============================================================================
-- public.invite_address_for_token(token) is callable by `anon`, because the
-- person opening an invite has no session yet. What guards it is the token.
-- This proves it answers for a live, unclaimed invite's token and for nothing
-- else, and that the same null comes back for every other reason, so the
-- function cannot be used to learn anything about an address or an invite:
--
--   1. a pending, unclaimed invite's token answers its address, to anon and to
--      a signed-in stranger, with the token trimmed as claim_invite trims it
--   2. everything else answers null: unknown, empty, whitespace, NULL, the
--      stored hash, an address typed as if it were a token
--   3. an invite that is claimed, used, revoked, to a blocked address, or
--      phone-only answers null
--   4. the grants: anon can call it and still cannot read `invites`
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/invite-address-for-link.sql
--
-- One transaction, rolled back; every refusal in its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off
\pset null '<null>'

begin;

-- ------------------------------------------------------------------ set-up --
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1031-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inviter@probe.test',  now()),
  ('aaaaaaaa-1031-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@probe.test', now());

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1031-0000-0000-000000000001', 'mentor', 'active', 'Inviter', 'probe.inviter3', null, '1980-01-01', 'T1–T6', 'CA', false);

-- Each invite's token is the text after "probe-token-": its hash is what is stored.
insert into public.invites (email, phone_raw, status, invited_by_member_id, token_hash, claimed_by, claimed_at, consumed_at, revoked_at) values
  ('pending@probe.test',  null, 'pending',  'aaaaaaaa-1031-0000-0000-000000000001', encode(extensions.digest('probe-token-pending',  'sha256'), 'hex'), null, null, null, null),
  ('claimed@probe.test',  null, 'pending',  'aaaaaaaa-1031-0000-0000-000000000001', encode(extensions.digest('probe-token-claimed',  'sha256'), 'hex'), 'aaaaaaaa-1031-0000-0000-000000000002', now(), null, null),
  ('used@probe.test',     null, 'consumed', 'aaaaaaaa-1031-0000-0000-000000000001', encode(extensions.digest('probe-token-used',     'sha256'), 'hex'), null, null, now(), null),
  ('revoked@probe.test',  null, 'revoked',  'aaaaaaaa-1031-0000-0000-000000000001', encode(extensions.digest('probe-token-revoked',  'sha256'), 'hex'), null, null, null, now()),
  ('blocked@probe.test',  null, 'pending',  'aaaaaaaa-1031-0000-0000-000000000001', encode(extensions.digest('probe-token-blocked',  'sha256'), 'hex'), null, null, null, null),
  (null, '4085559031',         'pending',  'aaaaaaaa-1031-0000-0000-000000000001', encode(extensions.digest('probe-token-phone',    'sha256'), 'hex'), null, null, null, null);
-- Blocked after the invite went out, and not revoked: the function must not hand the address back.
insert into public.blocked_emails (email, note) values ('blocked@probe.test', 'probe');

-- ===================================================== 1. a live invite's token --
\echo '== 1. as anon, the token of a pending, unclaimed invite (expect pending@probe.test, then pending@probe.test with spaces round it) =='
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
select public.invite_address_for_token('probe-token-pending') as address;
\echo '   spaces round it are trimmed, as claim_invite trims them'
select public.invite_address_for_token('  probe-token-pending ') as address;
\echo '   expect <null>: a newline is NOT trimmed here, the same as in claim_invite. The client trims the token'
\echo '   (captureInviteToken uses JavaScript trim()), so the database is never given one.'
select public.invite_address_for_token(E'probe-token-pending\n') as address;

\echo ''
\echo '== 1b. as a signed-in stranger (expect pending@probe.test) =='
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1031-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
select public.invite_address_for_token('probe-token-pending') as address;

-- ================================================= 2. everything else is null --
\echo ''
\echo '== 2. nothing that is not a live token answers (expect <null> on all seven) =='
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
select public.invite_address_for_token('probe-token-nobody') as unknown_token,
       public.invite_address_for_token('')                   as empty,
       public.invite_address_for_token('   ')                as whitespace,
       public.invite_address_for_token(null)                 as is_null,
       public.invite_address_for_token(encode(extensions.digest('probe-token-pending', 'sha256'), 'hex')) as the_stored_hash,
       public.invite_address_for_token('pending@probe.test') as an_address_as_a_token,
       public.invite_address_for_token('PROBE-TOKEN-PENDING') as the_wrong_case;

-- ============================================= 3. a live token that is spent --
\echo ''
\echo '== 3. each is a real token for a real invite, and each answers null (expect <null> on all five) =='
select public.invite_address_for_token('probe-token-claimed') as claimed_by_somebody,
       public.invite_address_for_token('probe-token-used')    as already_used,
       public.invite_address_for_token('probe-token-revoked') as revoked,
       public.invite_address_for_token('probe-token-blocked') as blocked_address,
       public.invite_address_for_token('probe-token-phone')   as phone_only;

-- ================================================================ 4. grants --
\echo ''
\echo '== 4. anon may call it and may not read the invites behind it =='
\echo '   expect: t | t (the two roles the page runs as)'
reset role;
select has_function_privilege('anon', 'public.invite_address_for_token(text)', 'execute') as anon_can,
       has_function_privilege('authenticated', 'public.invite_address_for_token(text)', 'execute') as authenticated_can;
\echo '   expect: 6 or more as the superuser (this probe adds six, the seed has its own), then 0 as anon (no policy lets'
\echo '   it see any: the lookup'
\echo '   is the only way in)'
select count(*) as invites_that_exist from public.invites;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
select count(*) as invites_anon_can_see from public.invites;
\echo '   expect: ERROR 42501 permission denied for function (the address oracle stays shut)'
savepoint oracle;
select public.is_blocked_email('pending@probe.test');
rollback to savepoint oracle;

reset role;
rollback;

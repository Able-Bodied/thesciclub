-- ============================================================================
-- Apple's notices (20261022170000), and joining by Apple or Google
-- ============================================================================
-- 1–9: apple_notification_record, called only by the apple-notifications
-- function (service role). Consent revoked or Apple Account deleted drops the
-- stored tokens and tells administrators; the account and member stay. Hide
-- My Email turning off or on is told only when the account's own address is
-- that relay. Administrators read the notices; members cannot.
--
-- 10–14: the native app signs in with an ID token, as the website's Google
-- widget already does, so joining is unchanged: the sign-up hook lets Google
-- and Apple through (it has no invite token to judge), and the gate is after
-- sign-in. An uninvited Apple or Google account is refused membership; one
-- that claims a live invite's token is let in.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/apple-notices-and-joining.sql
--
-- Rolls back. Each expected refusal has its own savepoint. Do not point it at
-- the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1700-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x7k2@privaterelay.appleid.com', now()),
  ('bbbbbbbb-1700-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'noor@probe.test', now()),
  ('eeeeeeee-1700-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@probe.test', now()),
  -- Signed in with Apple or Google, no member row yet.
  ('11111111-1700-0000-0000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'apple.walkin@probe.test', now()),
  ('22222222-1700-0000-0000-000000000022', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'google.walkin@probe.test', now()),
  ('33333333-1700-0000-0000-000000000033', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'apple.invited@probe.test', now());

insert into auth.identities (provider_id, user_id, identity_data, provider) values
  ('apple.relay', 'aaaaaaaa-1700-0000-0000-000000000001', '{"sub":"apple.relay"}', 'apple'),
  ('apple.noor',  'bbbbbbbb-1700-0000-0000-000000000002', '{"sub":"apple.noor"}',  'apple'),
  ('apple.walk',  '11111111-1700-0000-0000-000000000011', '{"sub":"apple.walk"}',  'apple'),
  ('google.walk', '22222222-1700-0000-0000-000000000022', '{"sub":"google.walk"}', 'google'),
  ('apple.inv',   '33333333-1700-0000-0000-000000000033', '{"sub":"apple.inv"}',   'apple');

insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1700-0000-0000-000000000001', 'peer', 'active', 'Relay', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-1700-0000-0000-000000000002', 'peer', 'active', 'Noor',  '1981-01-01', 'C5–C8', 'CA', false),
  ('eeeeeeee-1700-0000-0000-000000000005', 'peer', 'active', 'Admin', '1984-01-01', 'T1–T6', 'CA', true);

insert into private.apple_tokens (user_id, apple_sub, client_id, refresh_token) values
  ('aaaaaaaa-1700-0000-0000-000000000001', 'apple.relay', 'com.thesciclub.app', 'rt-relay-app'),
  ('aaaaaaaa-1700-0000-0000-000000000001', 'apple.relay', 'com.thesciclub.web', 'rt-relay-web'),
  ('bbbbbbbb-1700-0000-0000-000000000002', 'apple.noor',  'com.thesciclub.app', 'rt-noor');

-- A live invite sent to another address; its token is "probe-token-1700".
insert into public.invites (email, status, invited_by_member_id, token_hash) values
  ('somewhere.else@probe.test', 'pending', 'eeeeeeee-1700-0000-0000-000000000005',
   encode(extensions.digest('probe-token-1700', 'sha256'), 'hex'));

create function pg_temp.ev(provider text, address text)
returns jsonb language sql as $$
  select jsonb_build_object('user', jsonb_build_object(
    'email', address, 'phone', '',
    'app_metadata', jsonb_build_object('provider', provider),
    'user_metadata', '{}'::jsonb));
$$;

\echo ''
\echo '== 1. a member cannot record a notice (expect ERROR: permission denied for function apple_notification_record) =='
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1700-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member_records;
select public.apple_notification_record('apple.noor', 'account-delete', null);
rollback to savepoint member_records;
reset role;

\echo ''
\echo '== 2. Relay stops using Sign in with Apple (expect t) =='
set local role service_role;
select public.apple_notification_record('apple.relay', 'consent-revoked', null);

\echo ''
\echo '== 3. Hide My Email stops forwarding to Relay''s own address (expect t) =='
select public.apple_notification_record('apple.relay', 'email-disabled', 'X7K2@privaterelay.appleid.com');

\echo ''
\echo '== 4. ...to a relay address Noor''s account does not use (expect f) =='
select public.apple_notification_record('apple.noor', 'email-disabled', 'other@privaterelay.appleid.com');

\echo ''
\echo '== 5. a kind Apple does not send, and a stranger''s Apple ID (expect f | f) =='
select public.apple_notification_record('apple.noor', 'surprise', null),
       public.apple_notification_record('apple.nobody', 'account-delete', null);
reset role;

\echo ''
\echo '== 6. Relay''s two tokens are gone, Noor''s stays, nothing was queued to revoke (expect rt-noor | 0) =='
select string_agg(refresh_token, ',') as tokens,
       (select count(*) from private.apple_revocations where refresh_token like 'rt-relay%') as queued
  from private.apple_tokens where apple_sub like 'apple.%';

\echo ''
\echo '== 7. Relay is still a member with an account (expect 1 | 1) =='
select (select count(*) from public.members where id = 'aaaaaaaa-1700-0000-0000-000000000001') as member,
       (select count(*) from auth.users where id = 'aaaaaaaa-1700-0000-0000-000000000001') as account;

\echo ''
\echo '== 8. Admin reads the notices (expect email-disabled Relay, consent-revoked Relay) =='
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-1700-0000-0000-000000000005","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select kind, display_name from public.admin_apple_notices() order by kind desc;
reset role;

\echo ''
\echo '== 9. Noor cannot: the function refuses and the table shows nothing (expect ERROR: Only an administrator can do that., then 0) =='
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1700-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member_reads;
select * from public.admin_apple_notices();
rollback to savepoint member_reads;
select count(*) from public.apple_account_notices;
reset role;

\echo ''
\echo '== 10. the sign-up hook lets Apple and Google through, uninvited, as before (expect {} | {}) =='
select public.signup_needs_an_invite(pg_temp.ev('apple', 'apple.walkin@probe.test')) as apple,
       public.signup_needs_an_invite(pg_temp.ev('google', 'google.walkin@probe.test')) as google;

\echo ''
\echo '== 11. an uninvited Apple account is not invited, and cannot make itself a member (expect f, then ERROR: new row violates row-level security policy for table "members") =='
select set_config('request.jwt.claims',
  '{"sub":"11111111-1700-0000-0000-000000000011","role":"authenticated","email":"apple.walkin@probe.test"}', true) is not null as ok;
set local role authenticated;
select invited from public.my_invite_status();
savepoint apple_walkin;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('11111111-1700-0000-0000-000000000011', 'Apple Walkin', 'apple.walk1700', '1990-01-01', 'T7–T12');
rollback to savepoint apple_walkin;
reset role;

\echo ''
\echo '== 12. nor can an uninvited Google account (expect f, then ERROR: new row violates row-level security policy for table "members") =='
select set_config('request.jwt.claims',
  '{"sub":"22222222-1700-0000-0000-000000000022","role":"authenticated","email":"google.walkin@probe.test"}', true) is not null as ok;
set local role authenticated;
select invited from public.my_invite_status();
savepoint google_walkin;
insert into public.members (id, display_name, username, birth_date, level_range)
values ('22222222-1700-0000-0000-000000000022', 'Google Walkin', 'google.walk1700', '1990-01-01', 'T7–T12');
rollback to savepoint google_walkin;
reset role;

\echo ''
\echo '== 13. an Apple account holding the invite link''s token claims it and is invited (expect t, then t) =='
select set_config('request.jwt.claims',
  '{"sub":"33333333-1700-0000-0000-000000000033","role":"authenticated","email":"apple.invited@probe.test"}', true) is not null as ok;
set local role authenticated;
select public.claim_invite('probe-token-1700') as claimed;
select invited from public.my_invite_status();

\echo ''
\echo '== 14. ...and becomes a member (expect INSERT 0 1) =='
insert into public.members (id, display_name, username, birth_date, level_range)
values ('33333333-1700-0000-0000-000000000033', 'Apple Invited', 'apple.inv1700', '1990-01-01', 'T7–T12');
reset role;

\echo ''
\echo '== 15. deleting Relay''s member row takes the notices with it (expect 0) =='
delete from public.members where id = 'aaaaaaaa-1700-0000-0000-000000000001';
select count(*) from public.apple_account_notices where member_id = 'aaaaaaaa-1700-0000-0000-000000000001';

rollback;

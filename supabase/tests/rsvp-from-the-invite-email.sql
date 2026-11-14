-- ============================================================================
-- Answering an event invite from its email, and the email a member gets
-- ============================================================================
-- 20261114070000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/rsvp-from-the-invite-email.sql
--
-- Rolls back. Do not point it at the live project. Checked on the test
-- project, 2026-11-14: as expected below.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, email, email_confirmed_at) values
  ('aaaaaaaa-1415-0000-0000-00000000000a', 'ada1415@example.com', now()),
  ('aaaaaaaa-1415-0000-0000-00000000000b', 'bo1415@example.com', now()),
  ('aaaaaaaa-1415-0000-0000-00000000000c', 'cy1415@example.com', now());
insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1415-0000-0000-00000000000a', 'peer', 'active', 'Ada',    'ada1415', null, '1980-01-01', 'C5–C8', 'CA', true),
  ('aaaaaaaa-1415-0000-0000-00000000000b', 'peer', 'active', 'Bo Lin', 'bo1415',  null, '1981-01-01', 'C5–C8', 'CA', false),
  ('aaaaaaaa-1415-0000-0000-00000000000c', 'peer', 'active', 'Cy',     'cy1415',  null, '1982-01-01', 'C5–C8', 'CA', false);
insert into public.organizations (id, name, short_code) values
  ('bbbbbbbb-1415-0000-0000-000000000001', 'Probe org 1415', 'PQZX');
insert into public.events (id, title, start_time, organization_id, audience, added_by) values
  ('cccccccc-1415-0000-0000-000000000001', 'Probe dinner 1415', now() + interval '8 days',
   'bbbbbbbb-1415-0000-0000-000000000001', 'people', 'aaaaaaaa-1415-0000-0000-00000000000a');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1415-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select count(*) from jsonb_array_elements(public.event_invite_list(
  'cccccccc-1415-0000-0000-000000000001', '[{"email":"out1415@example.com"}]'));
reset role;
update public.invites set token_hash = encode(extensions.digest('tok1415', 'sha256'), 'hex')
 where email = 'out1415@example.com';

set local role anon;
\echo ''
\echo '== 1. a guessed link answers nothing (expect ERROR: This invite link has been used) =='
select public.rsvp_event_invite('guessed', 'going');
\echo ''
\echo '== 2. only Going, Maybe or Can''t go (expect ERROR: Answer Going, Maybe or Can''t go) =='
select public.rsvp_event_invite('tok1415', 'maybe');
\echo ''
\echo '== 3. Going from the email, with no name given (expect going) =='
select public.rsvp_event_invite('tok1415', 'going') is not null as saved, public.event_invite_answer('tok1415');
\echo ''
\echo '== 4. nobody signed out reaches the member emails (expect ERROR: permission denied, twice) =='
select * from public.event_invite_emails('x', '{}');
select count(*) from public.event_invite_emails_sent;
\echo ''
\echo '== 5. Can''t go: no registration left, and the answer is no (expect 0 | no) =='
select public.rsvp_event_invite('tok1415', 'no') is not null as saved;
reset role;
select count(*) from public.event_registrations where event_id = 'cccccccc-1415-0000-0000-000000000001';
set local role anon;
select public.event_invite_answer('tok1415');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1415-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 6. the organizer sees Can''t go (expect no) =='
select rsvp from public.event_invite_tracking('cccccccc-1415-0000-0000-000000000001')
 where email = 'out1415@example.com';
-- Ada invites Bo and Cy by name.
select public.set_event_visibility('cccccccc-1415-0000-0000-000000000001', 'people', '{}', '{}',
  array['aaaaaaaa-1415-0000-0000-00000000000b', 'aaaaaaaa-1415-0000-0000-00000000000c']::uuid[]);
reset role;
-- Cy has already answered.
insert into public.event_rsvps (event_id, member_id, status) values
  ('cccccccc-1415-0000-0000-000000000001', 'aaaaaaaa-1415-0000-0000-00000000000c', 'going');

\echo ''
\echo '== 7. Bo is emailed, once; not Cy, who answered, nor Ada, who invited (expect bo1415 | Bo Lin | Ada, then 0) =='
select email, name, inviter_name from public.event_invite_emails(
  (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret'),
  '{"event_id":"cccccccc-1415-0000-0000-000000000001"}');
select count(*) from public.event_invite_emails(
  (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret'),
  '{"event_id":"cccccccc-1415-0000-0000-000000000001"}');

rollback;

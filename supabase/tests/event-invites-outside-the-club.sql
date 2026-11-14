-- ============================================================================
-- Inviting people outside the club to an event: who may, and what a link opens
-- ============================================================================
-- 20261114020000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/event-invites-outside-the-club.sql
--
-- Rolls back. Do not point it at the live project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1412-0000-0000-00000000000a', 'peer', 'active', 'Ada', 'ada1412', '19990114200', '1980-01-01', 'C5–C8', 'CA', true),
  ('aaaaaaaa-1412-0000-0000-00000000000b', 'peer', 'active', 'Bo',  'bo1412',  '19990114201', '1981-01-01', 'C5–C8', 'CA', false),
  ('aaaaaaaa-1412-0000-0000-00000000000c', 'peer', 'active', 'Cy',  'cy1412',  '19990114202', '1982-01-01', 'C5–C8', 'CA', false);
insert into public.organizations (id, name, short_code) values
  ('bbbbbbbb-1412-0000-0000-000000000001', 'Probe org 1412', 'P1412');
-- Invite only: public_event shows it to nobody.
insert into public.events (id, title, start_time, organization_id, audience, added_by) values
  ('cccccccc-1412-0000-0000-000000000001', 'Probe dinner', now() + interval '8 days',
   'bbbbbbbb-1412-0000-0000-000000000001', 'people', 'aaaaaaaa-1412-0000-0000-00000000000a');

-- As Bo, who does not organize it.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1412-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. somebody who does not organize it cannot (expect ERROR: Only the event''s organizers) =='
select public.event_invite_list('cccccccc-1412-0000-0000-000000000001', '[{"email":"out1412@example.com"}]');
reset role;

-- As Ada, an administrator.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1412-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. the organizer invites a list (expect added) =='
select r ->> 'outcome' as outcome
  from jsonb_array_elements(public.event_invite_list(
    'cccccccc-1412-0000-0000-000000000001',
    '[{"email":"out1412@example.com","name":"Ana"}]', 'Come along')) r;
reset role;

-- The token the email would carry.
update public.invites set token_hash = encode(extensions.digest('tok1412', 'sha256'), 'hex')
 where email = 'out1412@example.com';

set local role anon;

\echo ''
\echo '== 3. the page is private to everybody else (expect 0 rows), and a wrong token opens nothing (expect 0) =='
select count(*) from public.public_event('cccccccc-1412-0000-0000-000000000001');
select count(*) from public.event_invite_page('guessed');

\echo ''
\echo '== 4. the invite link opens it, filled in (expect Probe dinner, out1412@example.com, Ana, Ada) =='
select title, guest_email, guest_name, inviter_name from public.event_invite_page('tok1412');

\echo ''
\echo '== 5. accepting makes a Going registration (expect going, Ana) =='
select public.accept_event_invite('tok1412', 'Ana Ruiz', null) is not null as accepted;
reset role;
select status, name from public.event_registrations
 where event_id = 'cccccccc-1412-0000-0000-000000000001' and email = 'out1412@example.com';

\echo ''
\echo '== 6. once she is a member her registration is claimed and she is invited (expect 1) =='
update public.event_registrations set member_id = 'aaaaaaaa-1412-0000-0000-00000000000c'
 where event_id = 'cccccccc-1412-0000-0000-000000000001' and email = 'out1412@example.com';
select count(*) from public.event_invitees
 where event_id = 'cccccccc-1412-0000-0000-000000000001'
   and member_id = 'aaaaaaaa-1412-0000-0000-00000000000c';

-- How the invites did (20261114030000).
update public.invites set sent_at = now() where email = 'out1412@example.com';

\echo ''
\echo '== 7. opening the link was noted (expect t) =='
select link_opened_at is not null from public.invites where email = 'out1412@example.com';

set local role anon;
\echo ''
\echo '== 8. only the open picture''s function marks opened (expect ERROR: permission denied) =='
select public.invite_opened((select open_key from public.invites where email = 'out1412@example.com'));
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1412-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 9. somebody who does not organize it sees none of its invites (expect ERROR: Only the event''s organizers) =='
select count(*) from public.event_invite_tracking('cccccccc-1412-0000-0000-000000000001');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1412-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 10. its organizer sees each and how far they got (expect going, viewed t) =='
select rsvp, link_opened_at is not null as viewed
  from public.event_invite_tracking('cccccccc-1412-0000-0000-000000000001')
 where email = 'out1412@example.com';
\echo ''
\echo '== 11. and it is not among the administrator''s club invites (expect 0) =='
select count(*) from public.admin_invite_tracking() where email = 'out1412@example.com';
reset role;

rollback;

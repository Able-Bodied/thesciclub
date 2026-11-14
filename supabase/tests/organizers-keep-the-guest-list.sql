-- ============================================================================
-- Organizers tick who came, add guests, and remove them
-- ============================================================================
-- 20261113110000: whoever may change an event (its organizers, the club's
-- administrators) ticks guests as there once it has started, with no end;
-- adds a guest by name; and removes one at any time. Nobody else can.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/organizers-keep-the-guest-list.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1311-0000-0000-00000000000a', 'peer', 'active', 'Ana (guest)', '19990113100', '1980-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-1311-0000-0000-00000000000c', 'peer', 'active', 'Cy (admin)',  '19990113102', '1982-01-01', 'C5–C8', 'CA', true);

insert into public.events (id, title, host_name, start_time, end_time) values
  -- Over a month ago: no time limit on ticking.
  ('14141414-1311-0000-0000-000000000001', 'Probe last month', 'Probe host',
   now() - interval '40 days', now() - interval '40 days' + interval '2 hours'),
  ('14141414-1311-0000-0000-000000000002', 'Probe next week', 'Probe host',
   now() + interval '7 days', now() + interval '7 days 2 hours');

insert into public.event_rsvps (event_id, member_id, status) values
  ('14141414-1311-0000-0000-000000000001', 'aaaaaaaa-1311-0000-0000-00000000000a', 'going'),
  ('14141414-1311-0000-0000-000000000002', 'aaaaaaaa-1311-0000-0000-00000000000a', 'going');

-- As Ana, a guest.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1311-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 1. a guest cannot tick herself in (expect ERROR: Only the event''s organizers can check guests in.) =='
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', true, 'aaaaaaaa-1311-0000-0000-00000000000a', null);

\echo ''
\echo '== 2. ...nor add or remove guests (expect two ERRORs: Only the event''s organizers ...) =='
select public.event_guest_add('14141414-1311-0000-0000-000000000001', 'Somebody');
select public.event_guest_remove('14141414-1311-0000-0000-000000000001', 'aaaaaaaa-1311-0000-0000-00000000000a', null);

-- As Cy, an administrator.
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1311-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 3. not before it starts (expect ERROR: Guests can be checked in once the event has started.) =='
select public.event_guest_check_in('14141414-1311-0000-0000-000000000002', true, 'aaaaaaaa-1311-0000-0000-00000000000a', null);

\echo ''
\echo '== 4. a month after, Ana is ticked, by Cy (expect t, t) =='
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', true, 'aaaaaaaa-1311-0000-0000-00000000000a', null);
select checked_in from public.event_guest_list('14141414-1311-0000-0000-000000000001', true)
 where member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';
select checked_in_by = 'cccccccc-1311-0000-0000-00000000000c' as by_cy
  from public.event_check_ins
 where event_id = '14141414-1311-0000-0000-000000000001' and member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';

\echo ''
\echo '== 4b. Ana is told Cy checked her in (expect 1) (20261113120000) =='
select count(*) from public.notifications
 where member_id = 'aaaaaaaa-1311-0000-0000-00000000000a' and kind = 'checked_in'
   and actor_id = 'cccccccc-1311-0000-0000-00000000000c'
   and event_id = '14141414-1311-0000-0000-000000000001';

\echo ''
\echo '== 4c. Cy, an organizer, reads the check-in itself, as the live guest list does (expect 1) =='
set local role authenticated;
select count(*) from public.event_check_ins
 where event_id = '14141414-1311-0000-0000-000000000001';
reset role;

\echo ''
\echo '== 5. a guest added at the door, with no email, ticked (expect t) =='
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', true, null,
  public.event_guest_add('14141414-1311-0000-0000-000000000001', 'Door guest'));
select checked_in from public.event_guest_list('14141414-1311-0000-0000-000000000001', true)
 where name = 'Door guest';

\echo ''
\echo '== 6. removing Ana takes her RSVP and check-in (expect 0, 0) =='
select public.event_guest_remove('14141414-1311-0000-0000-000000000001', 'aaaaaaaa-1311-0000-0000-00000000000a', null);
select count(*) from public.event_rsvps
 where event_id = '14141414-1311-0000-0000-000000000001' and member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';
select count(*) from public.event_check_ins
 where event_id = '14141414-1311-0000-0000-000000000001' and member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';

\echo ''
\echo '== 7. an older app asks with the event alone and still gets its list (expect 1 row: Door guest) =='
select name from public.event_guest_list('14141414-1311-0000-0000-000000000001');

-- 20261113130000, after the Fable review.
\echo ''
\echo '== 8. Ana''s email typed in and ticked; once it is hers, she is still ticked (expect t) =='
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', true, null,
  public.event_guest_add('14141414-1311-0000-0000-000000000001', 'Ana', 'ana-1311@example.com'));
insert into auth.users (id, aud, role, email, email_confirmed_at)
values ('aaaaaaaa-1311-0000-0000-00000000000a', 'authenticated', 'authenticated',
        'ana-1311@example.com', now())
on conflict (id) do update set email = excluded.email, email_confirmed_at = excluded.email_confirmed_at;
select private.claim_event_registrations_for('aaaaaaaa-1311-0000-0000-00000000000a') is not null as claimed;
select checked_in from public.event_guest_list('14141414-1311-0000-0000-000000000001', true)
 where member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';

\echo ''
\echo '== 9. ticked again after a Going an organizer typed in: told, not joined, pushed once (expect 1, 0, 1) =='
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', false, 'aaaaaaaa-1311-0000-0000-00000000000a', null);
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', true, 'aaaaaaaa-1311-0000-0000-00000000000a', null);
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', false, 'aaaaaaaa-1311-0000-0000-00000000000a', null);
select public.event_guest_check_in('14141414-1311-0000-0000-000000000001', true, 'aaaaaaaa-1311-0000-0000-00000000000a', null);
select count(*) from public.notifications
 where member_id = 'aaaaaaaa-1311-0000-0000-00000000000a' and kind = 'checked_in' and read_at is null;
select count(*) from public.organization_members where member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';
select count(*) from private.checked_in_pushed where member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';

\echo ''
\echo '== 10. a check-in after the 10am follow-up still gets it (expect 1) =='
insert into public.events (id, title, host_name, start_time, end_time) values
  ('14141414-1311-0000-0000-000000000003', 'Probe two days ago', 'Probe host',
   now() - interval '2 days 3 hours', now() - interval '2 days 1 hour');
insert into public.event_rsvps (event_id, member_id, status) values
  ('14141414-1311-0000-0000-000000000003', 'aaaaaaaa-1311-0000-0000-00000000000a', 'going');
select public.event_guest_check_in('14141414-1311-0000-0000-000000000003', true, 'aaaaaaaa-1311-0000-0000-00000000000a', null);
reset role;
select public.push_event_reminders();
select count(*) from public.event_followups_sent
 where event_id = '14141414-1311-0000-0000-000000000003' and member_id = 'aaaaaaaa-1311-0000-0000-00000000000a';

rollback;

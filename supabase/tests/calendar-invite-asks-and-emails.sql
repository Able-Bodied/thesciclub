-- ============================================================================
-- An invitation asks its guests who have not answered, and keeps its emails
-- (20261117150000)
-- ============================================================================
-- The owner, 2026-11-17: guests on a calendar invitation who are members and
-- have not answered are sent the event in their chat with the organizer, and
-- whoever may change the event can read the emails it came from.
--
-- Steps 1, 2 and 4 are the ones that matter: one message and only to somebody
-- who may be messaged, never a second one, and the emails are for the
-- event's organizers only, without anybody's address but the sender's.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/calendar-invite-asks-and-emails.sql
--
-- All in one transaction, so every line has the same time and their order is
-- not shown here; and each sign-in is private.act_as, which the invitation's
-- own act_as would otherwise outlast. Rolls back. Do not point it at the
-- hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c6-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@probe.example'),
  ('bbbbbbbb-c0c6-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'yes@probe.example'),
  ('cccccccc-c0c6-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'quiet@probe.example'),
  ('dddddddd-c0c6-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'blocker@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-c0c6-0000-0000-00000000000a', 'peer', 'active', 'Owner', '19990000c61', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-c0c6-0000-0000-00000000000b', 'peer', 'active', 'Yes', '19990000c62', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('cccccccc-c0c6-0000-0000-00000000000c', 'peer', 'active', 'Quiet', '19990000c63', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('dddddddd-c0c6-0000-0000-00000000000d', 'peer', 'active', 'Blocker', '19990000c64', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.organizations (id, short_code, name, city) values
  ('eeeeeeee-c0c6-0000-0000-00000000000e', 'PRAS', 'Probe Asks Org', 'Sacramento');
insert into public.organization_representatives (organization_id, member_id) values
  ('eeeeeeee-c0c6-0000-0000-00000000000e', 'aaaaaaaa-c0c6-0000-0000-00000000000a');
-- One guest has blocked the organizer.
insert into public.member_blocks (blocker_id, blocked_id) values
  ('dddddddd-c0c6-0000-0000-00000000000d', 'aaaaaaaa-c0c6-0000-0000-00000000000a');

create temporary table probe_payload as
select jsonb_build_object(
  'uid', 'probe-asks@google.com',
  'sequence', 0, 'method', 'REQUEST', 'cancelled', false, 'recurrenceId', null,
  'title', 'Probe Asks', 'description', 'Weekly',
  'location', '', 'url', 'https://meet.google.com/abc-defg-hij', 'format', 'online',
  'city', null, 'state', null,
  'starts', to_jsonb(date_trunc('hour', now() + interval '2 days')),
  'ends', to_jsonb(date_trunc('hour', now() + interval '2 days') + interval '1 hour'),
  'allDay', false, 'timezone', 'America/Los_Angeles',
  'repeat', jsonb_build_object('unit', 'week', 'every', 1, 'endsOn', null, 'endsAfter', null),
  'repeatNote', null,
  'guests', jsonb_build_array(
    jsonb_build_object('email', 'yes@probe.example', 'answer', 'yes'),
    jsonb_build_object('email', 'quiet@probe.example', 'answer', 'none'),
    jsonb_build_object('email', 'blocker@probe.example', 'answer', 'none'),
    jsonb_build_object('email', 'stranger@elsewhere.example', 'answer', 'none'))
) as base;
grant select on probe_payload to service_role;

\echo ''
\echo '== 1. THE ONE THAT MATTERS: the invitation arrives (expect added; one message, Owner to Quiet, three lines ending in the event link; Blocker none; Quiet has no RSVP, Yes is going) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null, base) r
    from probe_payload) s;
reset role;
select a.display_name as from_, string_agg(o.display_name, ',') as to_, count(distinct m.id) as messages,
       bool_and(m.body like E'You''re invited: Probe Asks\n%\nhttps://thesciclub.com/events/%') as says_it
  from public.chat_messages m
  join public.members a on a.id = m.author_id
  join public.chat_thread_members tm on tm.thread_id = m.thread_id and tm.member_id <> m.author_id
  join public.members o on o.id = tm.member_id
 where m.author_id = 'aaaaaaaa-c0c6-0000-0000-00000000000a'
 group by 1;
select (select count(*) from public.calendar_invite_asks a where a.base_uid = 'probe-asks@google.com') as asked,
       (select count(*) from public.event_rsvps v join public.events e on e.id = v.event_id
         where e.title = 'Probe Asks' and v.member_id = 'cccccccc-c0c6-0000-0000-00000000000c') as quiet_rsvps,
       (select count(*) > 0 from public.event_rsvps v join public.events e on e.id = v.event_id
         where e.title = 'Probe Asks' and v.member_id = 'bbbbbbbb-c0c6-0000-0000-00000000000b'
           and v.status = 'going') as yes_going;

\echo ''
\echo '== 2. THE ONE THAT MATTERS: the invitation changes twice, once as "this and following" (expect updated, updated; still 1 message) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || '{"sequence":1,"description":"New words"}') r from probe_payload) s;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-asks_R20270101T230000@google.com', 'sequence', 1,
      'description', 'Later words',
      'starts', to_jsonb(public.event_series_step('week', 1, (base ->> 'starts')::timestamptz, 2)),
      'ends', to_jsonb(public.event_series_step('week', 1, (base ->> 'starts')::timestamptz, 2) + interval '1 hour'))) r
    from probe_payload) s;
reset role;
select count(*) as messages from public.chat_messages m
 where m.author_id = 'aaaaaaaa-c0c6-0000-0000-00000000000a';

\echo ''
\echo '== 3. a guest who has answered in the club is not asked (expect added; still 1 message) =='
insert into public.events (id, title, description, description_html, start_time, location, event_format, added_by, organization_id)
values ('ffffffff-c0c6-0000-0000-00000000000f', 'Probe Answered', '', '', date_trunc('hour', now() + interval '3 days'),
        '', 'online', 'aaaaaaaa-c0c6-0000-0000-00000000000a', 'eeeeeeee-c0c6-0000-0000-00000000000e');
insert into public.event_rsvps (event_id, member_id, status)
values ('ffffffff-c0c6-0000-0000-00000000000f', 'cccccccc-c0c6-0000-0000-00000000000c', 'going');
select private.calendar_ask_guests('ffffffff-c0c6-0000-0000-00000000000f',
  jsonb_build_object('uid', 'probe-answered@google.com', 'guestMembers', jsonb_build_array(
    jsonb_build_object('member', 'cccccccc-c0c6-0000-0000-00000000000c', 'answer', 'none'))), null) is not null as ran;
select count(*) as messages from public.chat_messages m
 where m.author_id = 'aaaaaaaa-c0c6-0000-0000-00000000000a';

\echo ''
\echo '== 4. THE ONE THAT MATTERS: the organizer reads the emails, newest first, with nobody in them; another member reads none (expect added,updated,updated; guests f; then 0) =='
select private.act_as('aaaaaaaa-c0c6-0000-0000-00000000000a') is not null as ok;
set local role authenticated;
select string_agg(l.outcome, ',' order by l.outcome) as outcomes,
       count(*) as emails, min(l.sender_email) as sender
  from public.events e
  cross join lateral public.event_invitation_emails(e.id) l
 where e.id = (select min(e2.id::text)::uuid from public.events e2 where e2.title = 'Probe Asks');
reset role;
select bool_or(l.payload ? 'guests' or l.payload ? 'guestMembers' or l.payload::text like '%quiet@%') as guests
  from public.calendar_invite_emails l where l.base_uid = 'probe-asks@google.com';
select private.act_as('bbbbbbbb-c0c6-0000-0000-00000000000b') is not null as ok;
set local role authenticated;
select count(*) as another_member_reads
  from public.events e
  cross join lateral public.event_invitation_emails(e.id) l
 where e.title = 'Probe Asks';
reset role;

\echo ''
\echo '== 5. one that could not be verified waits, and is approved (expect held; then lines approved,held, approved by Owner) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', false, null,
    base || '{"uid":"probe-asks-held@google.com","title":"Probe Asks Held","guests":[]}') r from probe_payload) s;
reset role;
select private.act_as('aaaaaaaa-c0c6-0000-0000-00000000000a') is not null as ok;
set local role authenticated;
select public.decide_calendar_invite(h.id, true, h.organization_id) is not null as approved
  from public.my_held_calendar_invites() h where h.title = 'Probe Asks Held';
reset role;
select string_agg(l.outcome, ',' order by l.outcome) as outcomes,
       max(m.display_name) as approved_by
  from public.calendar_invite_emails l
  left join public.members m on m.id = l.decided_by
 where l.base_uid = 'probe-asks-held@google.com';

\echo ''
\echo '== 6. THE ONE THAT MATTERS (20261117170000): Can''t go in the club is an answer. Yes accepted in their calendar, then said Can''t go to the first date; Blocker, no longer blocking, said Can''t go and is put on the invitation afterwards (expect added, updated; still 1 message; Yes not going to the first date, going to a later one; 2 can''t-gos left) =='
delete from public.member_blocks where blocker_id = 'dddddddd-c0c6-0000-0000-00000000000d';
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-asks-cant@google.com', 'title', 'Probe Cant',
      'guests', jsonb_build_array(jsonb_build_object('email', 'yes@probe.example', 'answer', 'yes')))) r
    from probe_payload) s;
reset role;
select private.act_as('bbbbbbbb-c0c6-0000-0000-00000000000b') is not null as ok;
set local role authenticated;
select public.set_event_declined(
  (select e.id from public.events e where e.title = 'Probe Cant' order by e.start_time limit 1), true) as yes_cant_go;
reset role;
insert into public.event_declines (event_id, member_id)
select e.id, 'dddddddd-c0c6-0000-0000-00000000000d'
  from public.events e where e.title = 'Probe Cant' order by e.start_time limit 1;
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-asks-cant@google.com', 'title', 'Probe Cant',
      'sequence', 1, 'description', 'New words',
      'guests', jsonb_build_array(
        jsonb_build_object('email', 'yes@probe.example', 'answer', 'yes'),
        jsonb_build_object('email', 'blocker@probe.example', 'answer', 'none')))) r
    from probe_payload) s;
reset role;
select (select count(*) from public.chat_messages m
         where m.author_id = 'aaaaaaaa-c0c6-0000-0000-00000000000a') as messages,
       (select count(*) from public.event_rsvps v
         where v.member_id = 'bbbbbbbb-c0c6-0000-0000-00000000000b'
           and v.event_id = (select e.id from public.events e where e.title = 'Probe Cant'
                              order by e.start_time limit 1)) as yes_first_date_rsvps,
       (select count(*) > 0 from public.event_rsvps v join public.events e on e.id = v.event_id
         where e.title = 'Probe Cant' and v.member_id = 'bbbbbbbb-c0c6-0000-0000-00000000000b'
           and v.status = 'going') as yes_going_later,
       (select count(*) from public.event_declines d join public.events e on e.id = d.event_id
         where e.title = 'Probe Cant') as cant_gos;

rollback;

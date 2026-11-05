-- ============================================================================
-- An invitation joins the event already there (20261105120000, 20261105140000)
-- ============================================================================
-- The owner, 2026-11-05: "The SCI Club Weekly" was on the calendar twice,
-- once added in the club and once from a Google Calendar invitation. Combine
-- them, with the invitation's meeting link and the club event's organization.
--
-- Steps 1, 8, 9 and 10 are the ones that matter: one event, not two, keeping its
-- organization and who is coming.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/calendar-invite-joins.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c2-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@probe.example'),
  ('cccccccc-c0c2-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'other-rep@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-c0c2-0000-0000-00000000000a', 'peer', 'active', 'Admin', '19990000c21', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', true),
  ('bbbbbbbb-c0c2-0000-0000-00000000000b', 'peer', 'active', 'Going', '19990000c22', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('cccccccc-c0c2-0000-0000-00000000000c', 'peer', 'active', 'Other rep', '19990000c23', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.organizations (id, short_code, name, city) values
  ('dddddddd-c0c2-0000-0000-00000000000d', 'PRJH', 'Probe Host Org', 'Sacramento'),
  ('eeeeeeee-c0c2-0000-0000-00000000000e', 'PRJO', 'Probe Other Org', 'Sacramento');
insert into public.organization_representatives (organization_id, member_id)
values ('eeeeeeee-c0c2-0000-0000-00000000000e', 'cccccccc-c0c2-0000-0000-00000000000c');

-- The event added in the club, two days ahead, with two people going.
create temporary table probe_t as
select date_trunc('hour', now() + interval '2 days') as t,
       '10000000-c0c2-0000-0000-000000000001'::uuid as hand;
grant select on probe_t to service_role;
insert into public.events (id, title, description, description_html, start_time, end_time, location,
                           organization_id, event_format, added_by)
select hand, 'Probe Weekly', 'Made in the club', '', t, t + interval '1 hour', '',
       'dddddddd-c0c2-0000-0000-00000000000d', 'online', 'aaaaaaaa-c0c2-0000-0000-00000000000a'
  from probe_t;
insert into public.event_rsvps (event_id, member_id, status)
select hand, m, 'going' from probe_t,
  unnest(array['aaaaaaaa-c0c2-0000-0000-00000000000a', 'bbbbbbbb-c0c2-0000-0000-00000000000b']::uuid[]) m;

create temporary table probe_payload as
select jsonb_build_object(
  'sequence', 0, 'method', 'REQUEST', 'cancelled', false, 'recurrenceId', null,
  'title', 'Probe Weekly', 'description', 'From Google, with the notes doc',
  'location', '', 'url', 'https://meet.google.com/abc-defg-hij', 'format', 'online',
  'city', null, 'state', null,
  'starts', to_jsonb(t), 'ends', to_jsonb(t + interval '1 hour'),
  'allDay', false, 'timezone', 'America/Los_Angeles', 'repeat', null, 'repeatNote', null
) as base from probe_t;
grant select on probe_payload to service_role;

\echo ''
\echo '== 1. THE ONE THAT MATTERS: same title and start joins it (expect added | true | hand event; 1 event; Probe Host Org; the Meet; From Google; 2 going) =='
set local role service_role;
select r ->> 'outcome', r ->> 'joined', (r ->> 'event')::uuid = (select hand from probe_t) as hand_event,
       r ->> 'organization'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || '{"uid":"probe-join@google.com"}') r from probe_payload) s;
reset role;
select (select count(*) from public.events e, probe_t where e.title = 'Probe Weekly' and e.start_time = t) as events,
       o.name, e.url, e.description, e.event_format,
       (select count(*) from public.event_rsvps v where v.event_id = e.id) as going
  from public.events e join public.organizations o on o.id = e.organization_id, probe_t
 where e.id = hand;

\echo ''
\echo '== 2. a change moves it in place (expect updated | true; same event, an hour later, still 2 going) =='
set local role service_role;
select r ->> 'outcome', r ->> 'joined'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-join@google.com', 'sequence', 1,
      'starts', to_jsonb(t + interval '1 hour'), 'ends', to_jsonb(t + interval '2 hours'))) r
  from probe_payload, probe_t) s;
reset role;
select e.start_time - t as moved, (select count(*) from public.event_rsvps v where v.event_id = e.id) as going,
       i.event_id = hand as same_event
  from public.events e, probe_t, public.calendar_invites i
 where e.id = hand and i.uid = 'probe-join@google.com';

\echo ''
\echo '== 3. cancelling leaves the club''s event (expect cancelled | true; the event still there) =='
set local role service_role;
select r ->> 'outcome', r ->> 'kept'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || '{"uid":"probe-join@google.com","sequence":2,"cancelled":true}') r from probe_payload) s;
reset role;
select count(*) as still_there from public.events e, probe_t where e.id = hand;

\echo ''
\echo '== 4. a different title makes its own, hosted by the club''s organization (expect added | false; is_the_club t, no host name) =='
set local role service_role;
select r ->> 'outcome', r ->> 'joined'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || '{"uid":"probe-own@google.com","title":"Probe Something Else"}') r from probe_payload) s;
reset role;
select o.is_the_club, e.host_name
  from public.calendar_invites i join public.events e on e.id = i.event_id
  left join public.organizations o on o.id = e.organization_id
 where i.uid = 'probe-own@google.com';

\echo ''
\echo '== 5. and cancelling that one takes it off, as before (expect cancelled | false; 0) =='
set local role service_role;
select r ->> 'outcome', coalesce(r ->> 'kept', 'false')
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || '{"uid":"probe-own@google.com","title":"Probe Something Else","sequence":1,"cancelled":true}') r from probe_payload) s;
reset role;
select count(*) from public.events e where e.title = 'Probe Something Else';

\echo ''
\echo '== 6. a sender who cannot change the club''s event makes their own (expect added | false; 2 events then) =='
set local role service_role;
select r ->> 'outcome', r ->> 'joined'
  from (select public.calendar_invite_receive('other-rep@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-other@google.com', 'starts', to_jsonb(t + interval '1 hour'),
      'ends', to_jsonb(t + interval '2 hours'))) r from probe_payload, probe_t) s;
reset role;
select count(*) as events from public.events e, probe_t
 where e.title = 'Probe Weekly' and e.start_time = t + interval '1 hour';

\echo ''
\echo '== 7. two that match is no match: it makes its own (expect added | false) =='
insert into public.events (title, description, description_html, start_time, location, organization_id, event_format, added_by)
select 'Probe Twice', '', '', t + interval '3 hours', '', 'dddddddd-c0c2-0000-0000-00000000000d', 'online',
       'aaaaaaaa-c0c2-0000-0000-00000000000a'
  from probe_t, generate_series(1, 2);
set local role service_role;
select r ->> 'outcome', r ->> 'joined'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-twice@google.com', 'title', 'Probe Twice',
      'starts', to_jsonb(t + interval '3 hours'), 'ends', null)) r from probe_payload, probe_t) s;
reset role;

\echo ''
\echo '== 8. THE REPAIR: a pair made before combines (expect 1; then the invitation''s event gone, 1 event, Probe Host Org, the Meet, 2 going, the chat moved with both in it, joined t; a second run 0) =='
create temporary table probe_pair as
select '10000000-c0c2-0000-0000-000000000002'::uuid as hand2,
       '10000000-c0c2-0000-0000-000000000003'::uuid as theirs,
       '10000000-c0c2-0000-0000-000000000004'::uuid as thread,
       t + interval '5 hours' as t2
  from probe_t;
insert into public.events (id, title, description, description_html, start_time, end_time, location,
                           organization_id, host_name, event_format, added_by)
select hand2, 'Probe Pair', 'Made in the club', '', t2, t2 + interval '1 hour', '',
       'dddddddd-c0c2-0000-0000-00000000000d'::uuid, null, 'online', 'aaaaaaaa-c0c2-0000-0000-00000000000a'::uuid from probe_pair
union all
select theirs, 'Probe Pair', 'From Google', '', t2, t2 + interval '1 hour', '',
       null, 'The SCI Club', 'online', 'aaaaaaaa-c0c2-0000-0000-00000000000a'::uuid from probe_pair;
update public.events e set url = 'https://meet.google.com/pair-link' from probe_pair where e.id = theirs;
insert into public.event_rsvps (event_id, member_id, status)
select hand2, 'bbbbbbbb-c0c2-0000-0000-00000000000b'::uuid, 'going' from probe_pair
union all
select theirs, 'aaaaaaaa-c0c2-0000-0000-00000000000a'::uuid, 'going' from probe_pair;
insert into public.chat_threads (id, kind, name, event_id) select thread, 'group', 'Probe Pair', theirs from probe_pair;
insert into public.chat_thread_members (thread_id, member_id)
select thread, 'aaaaaaaa-c0c2-0000-0000-00000000000a' from probe_pair;
insert into public.chat_messages (thread_id, author_id, body)
select thread, 'aaaaaaaa-c0c2-0000-0000-00000000000a', 'See you there' from probe_pair;
insert into public.calendar_invites (uid, sequence, sender_email, sender_member_id, verified, state, event_id, payload)
select 'probe-pair@google.com', 0, 'admin@probe.example', 'aaaaaaaa-c0c2-0000-0000-00000000000a', true, 'added', theirs,
       base || jsonb_build_object('uid', 'probe-pair@google.com', 'title', 'Probe Pair',
         'url', 'https://meet.google.com/pair-link',
         'starts', to_jsonb(t2), 'ends', to_jsonb(t2 + interval '1 hour'))
  from probe_payload, probe_pair;
select private.calendar_join_duplicates() as combined;
select (select count(*) from public.events e where e.id = theirs) as theirs_left,
       (select count(*) from public.events e where e.title = 'Probe Pair') as events,
       o.name, e.url,
       (select count(*) from public.event_rsvps v where v.event_id = hand2) as going,
       (select t.event_id = hand2 from public.chat_threads t where t.id = thread) as chat_moved,
       (select count(*) from public.chat_thread_members m where m.thread_id = thread) as in_chat,
       (select i.joined and i.event_id = hand2 from public.calendar_invites i where i.uid = 'probe-pair@google.com') as joined
  from probe_pair join public.events e on e.id = hand2 join public.organizations o on o.id = e.organization_id;
select private.calendar_join_duplicates() as second_run;

\echo ''
\echo '== 9. A REPEATING ONE TAKES THE CLUB''S EVENT IN (expect added | false; the club''s event gone; first date: Probe Host Org, the Meet, 1 going, the chat moved; 4 dates) =='
create temporary table probe_series as
select '10000000-c0c2-0000-0000-000000000005'::uuid as hand3,
       '10000000-c0c2-0000-0000-000000000006'::uuid as thread3,
       t + interval '7 hours' as t3
  from probe_t;
grant select on probe_series to service_role;
insert into public.events (id, title, description, description_html, start_time, end_time, location,
                           organization_id, event_format, added_by)
select hand3, 'Probe Series', 'Made in the club', '', t3, t3 + interval '1 hour', '',
       'dddddddd-c0c2-0000-0000-00000000000d'::uuid, 'online', 'aaaaaaaa-c0c2-0000-0000-00000000000a'::uuid
  from probe_series;
insert into public.event_rsvps (event_id, member_id, status)
select hand3, 'bbbbbbbb-c0c2-0000-0000-00000000000b'::uuid, 'going' from probe_series;
insert into public.chat_threads (id, kind, name, event_id) select thread3, 'group', 'Probe Series', hand3 from probe_series;
insert into public.chat_thread_members (thread_id, member_id)
select thread3, 'bbbbbbbb-c0c2-0000-0000-00000000000b'::uuid from probe_series;
insert into public.chat_messages (thread_id, author_id, body)
select thread3, 'bbbbbbbb-c0c2-0000-0000-00000000000b'::uuid, 'Looking forward' from probe_series;
set local role service_role;
select r ->> 'outcome', r ->> 'joined'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-series@google.com', 'title', 'Probe Series',
      'starts', to_jsonb(t3), 'ends', to_jsonb(t3 + interval '1 hour'),
      'repeat', jsonb_build_object('unit', 'week', 'every', 1, 'endsOn', null, 'endsAfter', 4))) r
  from probe_payload, probe_series) s;
reset role;
create temporary table probe_opener as
select i.event_id as opener, e.series_id from public.calendar_invites i join public.events e on e.id = i.event_id
 where i.uid = 'probe-series@google.com';
select (select count(*) from public.events x, probe_series where x.id = hand3) as club_event_left,
       o.name, e.url,
       (select count(*) from public.event_rsvps v where v.event_id = e.id) as going,
       (select t.event_id = e.id from public.chat_threads t, probe_series where t.id = thread3) as chat_moved,
       (select count(*) from public.events x where x.series_id = e.series_id) as dates
  from probe_opener p join public.events e on e.id = p.opener
  join public.organizations o on o.id = e.organization_id;

\echo ''
\echo '== 10. a change moves every date in place (expect updated; same first date; 1 going; 4 dates, all 30 minutes later, all with the new words) =='
set local role service_role;
select r ->> 'outcome'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-series@google.com', 'sequence', 1, 'title', 'Probe Series',
      'description', 'New words', 'starts', to_jsonb(t3 + interval '30 minutes'),
      'ends', to_jsonb(t3 + interval '90 minutes'),
      'repeat', jsonb_build_object('unit', 'week', 'every', 1, 'endsOn', null, 'endsAfter', 4))) r
  from probe_payload, probe_series) s;
reset role;
select i.event_id = p.opener as same_first_date,
       (select count(*) from public.event_rsvps v where v.event_id = p.opener) as going,
       (select count(*) from public.events x where x.series_id = p.series_id) as dates,
       (select count(*) from public.events x, probe_series
         where x.series_id = p.series_id and x.description = 'New words'
           and extract(minute from x.start_time at time zone 'America/Los_Angeles')
             = extract(minute from (t3 + interval '30 minutes') at time zone 'America/Los_Angeles')) as moved_with_new_words
  from probe_opener p, public.calendar_invites i where i.uid = 'probe-series@google.com';

\echo ''
\echo '== 11. a new rule keeps the dates it still makes (expect updated; same first date; 1 going; 2 dates, two weeks apart) =='
set local role service_role;
select r ->> 'outcome'
  from (select public.calendar_invite_receive('admin@probe.example', true, null,
    base || jsonb_build_object('uid', 'probe-series@google.com', 'sequence', 2, 'title', 'Probe Series',
      'description', 'New words', 'starts', to_jsonb(t3 + interval '30 minutes'),
      'ends', to_jsonb(t3 + interval '90 minutes'),
      'repeat', jsonb_build_object('unit', 'week', 'every', 2, 'endsOn', null, 'endsAfter', 2))) r
  from probe_payload, probe_series) s;
reset role;
select i.event_id = p.opener as same_first_date,
       (select count(*) from public.event_rsvps v where v.event_id = p.opener) as going,
       (select count(*) from public.events x where x.series_id = p.series_id) as dates,
       (select max(x.start_time) - min(x.start_time) from public.events x where x.series_id = p.series_id) as apart
  from probe_opener p, public.calendar_invites i where i.uid = 'probe-series@google.com';

\echo ''
\echo '== 12. a one-off invitation''s change keeps its event (expect updated; same event t; 1 going; the new time) =='
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('admin@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-single@google.com', 'title', 'Probe Single',
    'starts', to_jsonb(t + interval '9 hours'), 'ends', null)) r from probe_payload, probe_t) s;
reset role;
create temporary table probe_single as
select event_id as first_event from public.calendar_invites where uid = 'probe-single@google.com';
insert into public.event_rsvps (event_id, member_id, status)
select first_event, 'bbbbbbbb-c0c2-0000-0000-00000000000b'::uuid, 'going' from probe_single;
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('admin@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-single@google.com', 'sequence', 1, 'title', 'Probe Single',
    'starts', to_jsonb(t + interval '10 hours'), 'ends', null)) r from probe_payload, probe_t) s;
reset role;
select i.event_id = p.first_event as same_event,
       (select count(*) from public.event_rsvps v where v.event_id = i.event_id) as going,
       e.start_time - t as starts_after
  from probe_single p, probe_t, public.calendar_invites i join public.events e on e.id = i.event_id
 where i.uid = 'probe-single@google.com';

\echo ''
\echo '== 13. a change keeps the organization it was given (expect held, then the admin chooses: added; then a change: updated, not held; Probe Other Org) =='
insert into public.organization_representatives (organization_id, member_id)
values ('dddddddd-c0c2-0000-0000-00000000000d', 'cccccccc-c0c2-0000-0000-00000000000c');
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('other-rep@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-choose@google.com', 'title', 'Probe Choose',
    'starts', to_jsonb(t + interval '11 hours'), 'ends', null)) r from probe_payload, probe_t) s;
reset role;
select id as choose_id from public.calendar_invites where uid = 'probe-choose@google.com' \gset
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-c0c2-0000-0000-00000000000a', 'role', 'authenticated')::text, true) is not null as signed_in;
set local role authenticated;
select public.decide_calendar_invite(:'choose_id', true, 'eeeeeeee-c0c2-0000-0000-00000000000e') is not null as approved;
reset role;
select set_config('request.jwt.claims', '', true) is not null as signed_out;
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('other-rep@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-choose@google.com', 'sequence', 1, 'title', 'Probe Choose',
    'description', 'Changed', 'starts', to_jsonb(t + interval '11 hours'), 'ends', null)) r from probe_payload, probe_t) s;
reset role;
select i.state, o.name
  from public.calendar_invites i join public.events e on e.id = i.event_id
  join public.organizations o on o.id = e.organization_id
 where i.uid = 'probe-choose@google.com';

rollback;

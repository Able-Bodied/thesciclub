-- ============================================================================
-- A change to an invitation already on the calendar is just applied
-- (20261117120000)
-- ============================================================================
-- The owner, 2026-11-17: "The SCI Club Weekly" was changed in Google Calendar
-- for "this and following events". Google sent the old invitation, ending the
-- day before, and a new one from that Friday on (the old UID with _R<date>).
-- Both waited for an organization, their sender speaking for two; approved,
-- the first deleted every later date and its RSVPs.
--
-- Steps 2, 3, 4 and 7 are the ones that matter: a change is not held, the
-- later part keeps the same dates with their RSVPs and who can see them, the
-- earlier part ending deletes none of them, and the other order keeps the
-- series too.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/calendar-invite-following.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c3-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-c0c3-0000-0000-00000000000a', 'peer', 'active', 'Owner', '19990000c31', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', true),
  ('bbbbbbbb-c0c3-0000-0000-00000000000b', 'peer', 'active', 'Going', '19990000c32', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.organizations (id, short_code, name, city) values
  ('dddddddd-c0c3-0000-0000-00000000000d', 'PRFA', 'Probe First Org', 'Sacramento'),
  ('eeeeeeee-c0c3-0000-0000-00000000000e', 'PRFB', 'Probe Second Org', 'Sacramento');
-- The sender speaks for two, so a new invitation needs a short code.
insert into public.organization_representatives (organization_id, member_id) values
  ('dddddddd-c0c3-0000-0000-00000000000d', 'aaaaaaaa-c0c3-0000-0000-00000000000a'),
  ('eeeeeeee-c0c3-0000-0000-00000000000e', 'aaaaaaaa-c0c3-0000-0000-00000000000a');

-- Weekly, its first date two days ahead; t3 is the third date.
create temporary table probe_t as
select date_trunc('hour', now() + interval '2 days') as t,
       public.event_series_step('week', 1, date_trunc('hour', now() + interval '2 days'), 2) as t3;
grant select on probe_t to service_role;

create temporary table probe_payload as
select jsonb_build_object(
  'sequence', 0, 'method', 'REQUEST', 'cancelled', false, 'recurrenceId', null,
  'title', 'Probe Following', 'description', 'Old words',
  'location', '', 'url', 'https://meet.google.com/abc-defg-hij', 'format', 'online',
  'city', null, 'state', null,
  'starts', to_jsonb(t), 'ends', to_jsonb(t + interval '1 hour'),
  'allDay', false, 'timezone', 'America/Los_Angeles',
  'repeat', jsonb_build_object('unit', 'week', 'every', 1, 'endsOn', null, 'endsAfter', null),
  'repeatNote', null
) as base,
jsonb_build_object(
  'starts', to_jsonb(t3), 'ends', to_jsonb(t3 + interval '1 hour'), 'description', 'From the third on'
) as later,
jsonb_build_object('repeat', jsonb_build_object(
  'unit', 'week', 'every', 1,
  'endsOn', to_jsonb(((t3 at time zone 'America/Los_Angeles')::date - 1)), 'endsAfter', null
)) as ending
from probe_t;
grant select on probe_payload to service_role;

create temporary table probe_ids (name text primary key, id uuid);
grant select on probe_ids to service_role, authenticated;

\echo ''
\echo '== 1. a weekly invitation, with a short code (expect added | Probe First Org; 14 dates or so) =='
set local role service_role;
select r ->> 'outcome' as outcome, r ->> 'organization' as organization
  from (select public.calendar_invite_receive('owner@probe.example', true, 'PRFA',
    base || '{"uid":"probe-following@google.com"}') r from probe_payload) s;
reset role;
insert into probe_ids
select 'series', e.series_id from public.events e
  join public.calendar_invites i on i.event_id = e.id where i.uid = 'probe-following@google.com';
insert into probe_ids
select 'third', e.id from public.events e, probe_t
 where e.series_id = (select id from probe_ids where name = 'series') and e.start_time = t3;
select count(*) as dates from public.events e where e.series_id = (select id from probe_ids where name = 'series');
-- For the club only, and somebody is going to the third date.
update public.events e set audience = 'club' where e.series_id = (select id from probe_ids where name = 'series');
insert into public.event_rsvps (event_id, member_id, status)
select id, 'bbbbbbbb-c0c3-0000-0000-00000000000b', 'going' from probe_ids where name = 'third';

\echo ''
\echo '== 2. THE ONE THAT MATTERS: a change, no short code (expect updated, not held | Probe First Org; every date New words) =='
set local role service_role;
select r ->> 'outcome' as outcome, r ->> 'organization' as organization, r ->> 'reason' as reason
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || '{"uid":"probe-following@google.com","sequence":1,"description":"New words"}') r from probe_payload) s;
reset role;
select e.description, count(*) from public.events e
 where e.series_id = (select id from probe_ids where name = 'series') group by 1 order by 1;

\echo ''
\echo '== 3. THE ONE THAT MATTERS: "this and following" from the third date (expect updated; same third event t; 2 dates New words, the rest From the third on; all club; going 1; one series) =='
set local role service_role;
select r ->> 'outcome' as outcome, (r ->> 'event')::uuid = (select id from probe_ids where name = 'third') as same_third,
       r ->> 'organization' as organization, r ->> 'reason' as reason
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || later || '{"uid":"probe-following_R20270101T230000@google.com","sequence":1}') r from probe_payload) s;
reset role;
select e.description, count(*), min(e.audience) as audience from public.events e
 where e.series_id = (select id from probe_ids where name = 'series') group by 1 order by 1;
select (select count(*) from public.event_rsvps v where v.event_id = (select id from probe_ids where name = 'third')) as going,
       (select count(distinct e.series_id) from public.events e where e.title = 'Probe Following') as series,
       (select count(*) from public.calendar_invites i where i.continues is not null
          and i.uid like 'probe-following%') as continues;

\echo ''
\echo '== 4. THE ONE THAT MATTERS: the earlier part now ends the day before (expect updated; the same counts as 3) =='
set local role service_role;
select r ->> 'outcome' as outcome, r ->> 'reason' as reason
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || ending || '{"uid":"probe-following@google.com","sequence":2,"description":"New words"}') r from probe_payload) s;
reset role;
select e.description, count(*) from public.events e
 where e.series_id = (select id from probe_ids where name = 'series') group by 1 order by 1;

\echo ''
\echo '== 5. the later part is renamed (expect updated; Renamed on its dates only, 2 keep Probe Following) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || later || '{"uid":"probe-following_R20270101T230000@google.com","sequence":2,"title":"Probe Renamed"}') r from probe_payload) s;
reset role;
select e.title, count(*) from public.events e
 where e.series_id = (select id from probe_ids where name = 'series') group by 1 order by 1;

\echo ''
\echo '== 6. the earlier part is cancelled (expect cancelled; its 2 dates gone, the later ones stay) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || ending || '{"uid":"probe-following@google.com","sequence":3,"method":"CANCEL","cancelled":true}') r from probe_payload) s;
reset role;
select e.title, count(*) from public.events e
 where e.series_id = (select id from probe_ids where name = 'series') group by 1 order by 1;

\echo ''
\echo '== 7. THE ONE THAT MATTERS: the other order. The earlier part ends first (2 dates left), then the later part comes (expect updated; one series; its new dates for the club, not public) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, 'PRFA',
    base || '{"uid":"probe-other-order@google.com","title":"Probe Other Order"}') r from probe_payload) s;
reset role;
update public.events e set audience = 'club' where e.title = 'Probe Other Order';
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || ending || '{"uid":"probe-other-order@google.com","title":"Probe Other Order","sequence":1}') r from probe_payload) s;
reset role;
select count(*) as left_after_ending from public.events e where e.title = 'Probe Other Order';
set local role service_role;
select r ->> 'outcome' as outcome, r ->> 'organization' as organization, r ->> 'reason' as reason
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || later || '{"uid":"probe-other-order_R20270101T230000@google.com","title":"Probe Other Order","sequence":1}') r from probe_payload) s;
reset role;
select count(distinct e.series_id) as series, count(*) > 5 as dates_again,
       string_agg(distinct e.audience, ',') as audience,
       count(*) filter (where e.description = 'From the third on') > 3 as later_words
  from public.events e where e.title = 'Probe Other Order';

\echo ''
\echo '== 8. a later part that could not be verified waits, saying which event it changes; approved, it carries the series on (expect held; changes t, Probe First Org; then one series, continues 1) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, 'PRFA',
    base || '{"uid":"probe-held@google.com","title":"Probe Held"}') r from probe_payload) s;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', false, null,
    base || later || '{"uid":"probe-held_R20270101T230000@google.com","title":"Probe Held"}') r from probe_payload) s;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-c0c3-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;
select h.changes_event is not null as changes, h.organization_name
  from public.my_held_calendar_invites() h where h.title = 'Probe Held';
select public.decide_calendar_invite(h.id, true, h.organization_id) is not null as approved
  from public.my_held_calendar_invites() h where h.title = 'Probe Held';
reset role;
select count(distinct e.series_id) as series,
       count(*) filter (where e.description = 'From the third on') > 3 as later_words,
       (select count(*) from public.calendar_invites i where i.uid like 'probe-held%' and i.continues is not null) as continues
  from public.events e where e.title = 'Probe Held';

rollback;

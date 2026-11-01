-- ============================================================================
-- A calendar invitation that changes: a meeting link added after it was sent
-- ============================================================================
-- The owner, 2026-11-01: an invitation sent with no link, then updated with a
-- Google Meet. An update replaces the event, so it has a new id and loses its
-- RSVPs (section 2 says so until that changes).
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/calendar-invite-updates.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c1-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rep@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city)
values
  ('aaaaaaaa-c0c1-0000-0000-00000000000a', 'peer', 'active', 'Rep', '19990000c11', '1980-01-01', 'T1–T6', 'CA', 'Sacramento');
insert into public.organizations (id, short_code, name, city)
values ('bbbbbbbb-c0c1-0000-0000-00000000000b', 'PRCB', 'Probe Update Org', 'Sacramento');
insert into public.organization_representatives (organization_id, member_id)
values ('bbbbbbbb-c0c1-0000-0000-00000000000b', 'aaaaaaaa-c0c1-0000-0000-00000000000a');

-- What a payload holds, the times one day ahead, with no place and no link.
create temporary table probe_payload as
select jsonb_build_object(
  'sequence', 0, 'method', 'REQUEST', 'cancelled', false, 'recurrenceId', null,
  'title', 'A call', 'description', '', 'location', '', 'url', null, 'format', null,
  'city', null, 'state', null,
  'starts', to_jsonb(now() + interval '1 day'), 'ends', to_jsonb(now() + interval '1 day 1 hour'),
  'allDay', false, 'timezone', 'America/Los_Angeles', 'repeat', null, 'repeatNote', null
) as base;
grant select on probe_payload to service_role;

create temporary table probe_ids as select null::uuid as first_event;
grant select on probe_ids to service_role;

\echo ''
\echo '== 1. sent with no link (expect added | null | in_person) =='
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-update@google.com"}') r from probe_payload) s;
reset role;
select e.url, e.event_format from public.events e
  join public.calendar_invites i on i.event_id = e.id where i.uid = 'probe-update@google.com';
update probe_ids set first_event = (select event_id from public.calendar_invites where uid = 'probe-update@google.com');
insert into public.event_rsvps (event_id, member_id, status)
select first_event, 'aaaaaaaa-c0c1-0000-0000-00000000000a', 'going' from probe_ids;

\echo ''
\echo '== 2. updated with a Meet (expect updated, the Meet, online; same event f; RSVPs 0) =='
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-update@google.com","sequence":1,"url":"https://meet.google.com/abc-defg-hij","format":"online"}') r from probe_payload) s;
reset role;
select e.url, e.event_format, e.id = (select first_event from probe_ids) as same_event,
       (select count(*) from public.event_rsvps v where v.event_id = e.id) as rsvps
  from public.events e join public.calendar_invites i on i.event_id = e.id
 where i.uid = 'probe-update@google.com';

\echo ''
\echo '== 3. Google left SEQUENCE alone (expect updated, the Meet) =='
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-same@google.com"}') r from probe_payload) s;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-same@google.com","url":"https://meet.google.com/abc-defg-hij","format":"online"}') r from probe_payload) s;
reset role;
select e.url from public.events e join public.calendar_invites i on i.event_id = e.id
 where i.uid = 'probe-same@google.com';

\echo ''
\echo '== 4. an older copy arriving late (expect ignored, and the Meet stays) =='
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-update@google.com","sequence":0}') r from probe_payload) s;
reset role;
select e.url from public.events e join public.calendar_invites i on i.event_id = e.id
 where i.uid = 'probe-update@google.com';

\echo ''
\echo '== 5. an update that cannot be verified waits (expect held, and the event keeps no link) =='
set local role service_role;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-held@google.com"}') r from probe_payload) s;
select r ->> 'outcome' from (select public.calendar_invite_receive('rep@probe.example', false, null,
  base || '{"uid":"probe-held@google.com","sequence":1,"url":"https://meet.google.com/abc-defg-hij","format":"online"}') r from probe_payload) s;
reset role;
select i.state, e.url from public.calendar_invites i left join public.events e on e.id = i.event_id
 where i.uid = 'probe-held@google.com';

\echo ''
\echo '== 6. one date of a repeating event (expect ignored, with the words handler.ts looks for) =='
set local role service_role;
select r ->> 'outcome', left(r ->> 'reason', 41) from (select public.calendar_invite_receive('rep@probe.example', true, null,
  base || '{"uid":"probe-update@google.com","sequence":2,"recurrenceId":"2026-12-01T00:00:00Z"}') r from probe_payload) s;
reset role;

rollback;

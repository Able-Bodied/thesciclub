-- ============================================================================
-- An invitation brings its guests who are members, and its attached notes
-- (20261117130000)
-- ============================================================================
-- The owner, 2026-11-17: guests on a calendar invitation who are members are
-- RSVPd in the club, and a meeting's attached notes are linked from its page.
--
-- Steps 1, 2 and 3 are the ones that matter: nobody's address is kept but as
-- the member they are, a member's own answer is never changed, and the files
-- are for signed-in members only.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/calendar-invite-guests.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c4-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'owner@probe.example'),
  ('bbbbbbbb-c0c4-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'yes@probe.example'),
  ('cccccccc-c0c4-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'own-answer@probe.example'),
  ('dddddddd-c0c4-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'maybe@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-c0c4-0000-0000-00000000000a', 'peer', 'active', 'Owner', '19990000c41', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', true),
  ('bbbbbbbb-c0c4-0000-0000-00000000000b', 'peer', 'active', 'Yes', '19990000c42', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('cccccccc-c0c4-0000-0000-00000000000c', 'peer', 'active', 'Own answer', '19990000c43', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('dddddddd-c0c4-0000-0000-00000000000d', 'peer', 'active', 'Maybe', '19990000c44', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.organizations (id, short_code, name, city) values
  ('eeeeeeee-c0c4-0000-0000-00000000000e', 'PRGA', 'Probe Guests Org', 'Sacramento');
insert into public.organization_representatives (organization_id, member_id) values
  ('eeeeeeee-c0c4-0000-0000-00000000000e', 'aaaaaaaa-c0c4-0000-0000-00000000000a');

create temporary table probe_payload as
select jsonb_build_object(
  'uid', 'probe-guests@google.com',
  'sequence', 0, 'method', 'REQUEST', 'cancelled', false, 'recurrenceId', null,
  'title', 'Probe Guests', 'description', 'Weekly',
  'location', '', 'url', 'https://meet.google.com/abc-defg-hij', 'format', 'online',
  'city', null, 'state', null,
  'starts', to_jsonb(date_trunc('hour', now() + interval '2 days')),
  'ends', to_jsonb(date_trunc('hour', now() + interval '2 days') + interval '1 hour'),
  'allDay', false, 'timezone', 'America/Los_Angeles',
  'repeat', jsonb_build_object('unit', 'week', 'every', 1, 'endsOn', null, 'endsAfter', null),
  'repeatNote', null,
  'attachments', jsonb_build_array(
    jsonb_build_object('title', 'Notes - Probe Guests', 'url', 'https://docs.google.com/document/d/1AbC/edit'),
    jsonb_build_object('title', 'Not https', 'url', 'http://example.org/plain'))
) as base;
grant select on probe_payload to service_role;

\echo ''
\echo '== 1. THE ONE THAT MATTERS: a member who said yes and a stranger (expect added; kept_guests f, stranger f, guest_members 1; going on every date, 13 or so; nobody else) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || '{"guests":[{"email":"Yes@Probe.example","answer":"yes"},{"email":"stranger@elsewhere.example","answer":"yes"}]}') r
    from probe_payload) s;
reset role;
select i.payload ? 'guests' as kept_guests,
       i.payload::text like '%stranger%' as stranger,
       jsonb_array_length(i.payload -> 'guestMembers') as guest_members
  from public.calendar_invites i where i.uid = 'probe-guests@google.com';
select m.display_name, v.status, count(*) as dates
  from public.event_rsvps v
  join public.events e on e.id = v.event_id and e.title = 'Probe Guests'
  join public.members m on m.id = v.member_id
 group by 1, 2 order by 1;

\echo ''
\echo '== 2. THE ONE THAT MATTERS: a member answers Interested on the first date themself; then the invitation says they said yes (expect updated; Own answer: interested 1, going on the rest; Maybe interested everywhere; Yes unchanged) =='
insert into public.event_rsvps (event_id, member_id, status)
select e.id, 'cccccccc-c0c4-0000-0000-00000000000c', 'interested'
  from public.events e where e.title = 'Probe Guests' order by e.start_time limit 1;
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || '{"sequence":1,"guests":[{"email":"yes@probe.example","answer":"yes"},{"email":"own-answer@probe.example","answer":"yes"},{"email":"maybe@probe.example","answer":"maybe"}]}') r
    from probe_payload) s;
reset role;
select m.display_name, v.status, count(*) as dates
  from public.event_rsvps v
  join public.events e on e.id = v.event_id and e.title = 'Probe Guests'
  join public.members m on m.id = v.member_id
 group by 1, 2 order by 1, 2;

\echo ''
\echo '== 3. THE ONE THAT MATTERS: the notes are on every date, the https one only, and for signed-in members, not the public (expect 1 file on each date; Notes - Probe Guests; member t, anon f) =='
select jsonb_array_length(e.attachments) as files, e.attachments -> 0 ->> 'title' as title, count(*) as dates
  from public.events e where e.title = 'Probe Guests' group by 1, 2;
select has_column_privilege('authenticated', 'public.events', 'attachments', 'select') as member,
       has_column_privilege('anon', 'public.events', 'attachments', 'select') as anon;

\echo ''
\echo '== 4. a date the series makes later has them too (expect 1) =='
insert into public.events (title, description, description_html, start_time, location, event_format, added_by, series_id, organization_id)
select e.title, '', '', e.start_time + interval '200 days', '', 'online', e.added_by, e.series_id, e.organization_id
  from public.events e where e.title = 'Probe Guests' order by e.start_time desc limit 1;
select jsonb_array_length(e.attachments) as files_on_the_new_date
  from public.events e where e.title = 'Probe Guests' order by e.start_time desc limit 1;

\echo ''
\echo '== 5. the file is taken off the invitation (expect updated; no date in the next three months has one) =='
set local role service_role;
select r ->> 'outcome' as outcome
  from (select public.calendar_invite_receive('owner@probe.example', true, null,
    base || '{"sequence":2,"attachments":[]}') r from probe_payload) s;
reset role;
select count(*) as coming_dates_with_files from public.events e
 where e.title = 'Probe Guests' and e.attachments <> '[]'::jsonb and e.start_time < now() + interval '92 days';

rollback;

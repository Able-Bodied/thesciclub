-- ============================================================================
-- An event from a calendar invitation: its place, link, city, and the list
-- ============================================================================
-- 20261023000000: the place keeps only the address, a meeting link goes to the
-- link, a US address gives the city and state, and events already made are
-- repaired once. 20261023010000: such an event is on Events at a distance.
--
-- The invitation arrives as the calendar-inbound function does (service_role);
-- the event is read back as a signed-in member. Every expected refusal sits in
-- its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/calendar-event-place.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c0-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'rep@probe.example');

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city)
values
  ('aaaaaaaa-c0c0-0000-0000-00000000000a', 'peer', 'active', 'Rep', '19990000c01', '1980-01-01', 'T1–T6', 'CA', 'Sacramento');

insert into public.organizations (id, short_code, name, city)
values ('bbbbbbbb-c0c0-0000-0000-00000000000b', 'PRCA', 'Probe Calendar Org', 'Sacramento');
insert into public.organization_representatives (organization_id, member_id)
values ('bbbbbbbb-c0c0-0000-0000-00000000000b', 'aaaaaaaa-c0c0-0000-0000-00000000000a');

insert into public.city_places (city_key, state, latitude, longitude)
values ('sacramento', 'CA', 38.58, -121.49)
on conflict (city_key, state) do update set latitude = excluded.latitude, longitude = excluded.longitude;
-- Settlements, as the import keeps them (20261025020000).
update public.city_places set settlement = true where latitude is not null;
delete from public.city_places where city_key = 'menlo park';

-- What a payload holds, the times one day ahead.
create temporary table probe_payload as
select jsonb_build_object(
  'sequence', 0, 'method', 'REQUEST', 'cancelled', false, 'recurrenceId', null,
  'title', 'SCI Club test event', 'description', '',
  'starts', to_jsonb(now() + interval '1 day'), 'ends', to_jsonb(now() + interval '1 day 1 hour'),
  'allDay', false, 'timezone', 'America/Los_Angeles', 'repeat', null, 'repeatNote', null
) as base;
grant select on probe_payload to service_role, authenticated;

\echo ''
\echo '== 1. the live payload, glued, through receive (expect added) =='
set local role service_role;
select public.calendar_invite_receive('rep@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-glued@google.com', 'url', null,
    'location', '1 Hacker Wy, Menlo Park, CA 94025, USA; https://meet.google.com/rgz-aaxe-xyf'))
  ->> 'outcome' as outcome
  from probe_payload;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-c0c0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. read as a member: the place, the link, hybrid, Menlo Park, CA =='
\echo '   (expect 1 Hacker Wy, Menlo Park, CA 94025, USA | https://meet.google.com/rgz-aaxe-xyf | hybrid | Menlo Park | CA)'
select location, url, event_format, city, state
  from public.events where title = 'SCI Club test event';
reset role;

\echo ''
\echo '== 3. calendar-inbound''s own reading, address with Meet beside it (expect added, then'
\echo '   123 J St, Sacramento, CA 95814 | https://meet.google.com/abc-defg-hij | in_person | Sacramento | CA) =='
set local role service_role;
select public.calendar_invite_receive('rep@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-new@google.com', 'title', 'Probe new',
    'location', '123 J St, Sacramento, CA 95814', 'url', 'https://meet.google.com/abc-defg-hij',
    'format', 'in_person', 'city', 'Sacramento', 'state', 'CA'))
  ->> 'outcome' as outcome
  from probe_payload;
reset role;
select location, url, event_format, city, state from public.events where title = 'Probe new';

\echo ''
\echo '== 4. a link and no place (expect added, then "" | https://us02web.zoom.us/j/8812 | online | null | null) =='
set local role service_role;
select public.calendar_invite_receive('rep@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-zoom@outlook', 'title', 'Probe online',
    'location', 'https://us02web.zoom.us/j/8812'))
  ->> 'outcome' as outcome
  from probe_payload;
reset role;
select quote_literal(location) as location, url, event_format,
       coalesce(city, 'null') as city, coalesce(state, 'null') as state
  from public.events where title = 'Probe online';

\echo ''
\echo '== 5. a city that is not in the address is not believed (expect added, then null | CA, the saver''s state) =='
set local role service_role;
select public.calendar_invite_receive('rep@probe.example', true, null,
  base || jsonb_build_object('uid', 'probe-forged@google.com', 'title', 'Probe forged',
    'location', 'Lakeside Park, Oakland', 'city', 'Palo Alto', 'state', 'CA', 'format', 'in_person'))
  ->> 'outcome' as outcome
  from probe_payload;
reset role;
select coalesce(city, 'null') as city, coalesce(state, 'null') as state
  from public.events where title = 'Probe forged';

\echo ''
\echo '== 6. on Events: Menlo Park is not on the map yet, so it shows at 20 miles (expect t) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-c0c0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select (select id from public.events where title = 'SCI Club test event')
       = any (public.events_within_miles(20)) as listed;
reset role;

\echo ''
\echo '== 7. once Menlo Park is placed, ~90 miles from Sacramento (expect f at 20, t at 150) =='
insert into public.city_places (city_key, state, latitude, longitude, settlement) values ('menlo park', 'CA', 37.45, -122.18, true);
set local role authenticated;
select (select id from public.events where title = 'SCI Club test event')
       = any (public.events_within_miles(20)) as at_20,
       (select id from public.events where title = 'SCI Club test event')
       = any (public.events_within_miles(150)) as at_150;
reset role;

\echo ''
\echo '== 8. an event made the old way is repaired, once (expect 1, then 0) =='
insert into public.events (id, title, start_time, location, organization_id, event_format, added_by)
values ('eeeeeeee-c0c0-0000-0000-00000000000e', 'Probe old', now() + interval '2 days',
        '1 Hacker Wy, Menlo Park, CA 94025, USA; https://meet.google.com/rgz-aaxe-xyf',
        'bbbbbbbb-c0c0-0000-0000-00000000000b', 'in_person', 'aaaaaaaa-c0c0-0000-0000-00000000000a'),
       ('eeeeeeee-c0c0-0000-0000-0000000000ff', 'Probe edited', now() + interval '2 days',
        'Changed by hand', 'bbbbbbbb-c0c0-0000-0000-00000000000b', 'in_person',
        'aaaaaaaa-c0c0-0000-0000-00000000000a');
insert into public.calendar_invites (uid, sender_email, verified, state, event_id, payload)
select u.uid, 'rep@probe.example', true, 'added', u.event_id,
       base || jsonb_build_object('uid', u.uid, 'url', null,
         'location', '1 Hacker Wy, Menlo Park, CA 94025, USA; https://meet.google.com/rgz-aaxe-xyf')
  from probe_payload,
       (values ('probe-old@google.com', 'eeeeeeee-c0c0-0000-0000-00000000000e'::uuid),
               ('probe-edited@google.com', 'eeeeeeee-c0c0-0000-0000-0000000000ff'::uuid)) u(uid, event_id);
select private.calendar_repair_events() as first_run;
select private.calendar_repair_events() as second_run;

\echo ''
\echo '== 9. what the repair left (expect Probe edited | Changed by hand | null | in_person | null;'
\echo '   Probe old | 1 Hacker Wy, Menlo Park, CA 94025, USA | https://meet.google.com/rgz-aaxe-xyf | hybrid | Menlo Park) =='
select title, location, coalesce(url, 'null') as url, event_format, coalesce(city, 'null') as city
  from public.events where id in ('eeeeeeee-c0c0-0000-0000-00000000000e', 'eeeeeeee-c0c0-0000-0000-0000000000ff')
 order by title;

\echo ''
\echo '== 10. a member cannot run the repair (expect ERROR: permission denied) =='
set local role authenticated;
savepoint member_repair;
select private.calendar_repair_events();
rollback to savepoint member_repair;
reset role;

rollback;

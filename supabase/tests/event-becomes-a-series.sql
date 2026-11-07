-- ============================================================================
-- An event already on the calendar can be made to repeat (20261106090000)
-- ============================================================================
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/event-becomes-a-series.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-5e71-0000-0000-00000000000a', 'peer', 'active', 'Org Rep',  '15105550120', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-5e71-0000-0000-00000000000b', 'peer', 'active', 'Ordinary', '15105550121', '1981-01-01', 'C5–C8', 'CA'),
  ('cccccccc-5e71-0000-0000-00000000000c', 'peer', 'active', 'Invitee',  '15105550122', '1982-01-01', 'C5–C8', 'CA');

insert into public.organizations (id, short_code, name, city, state)
values ('11111111-5e71-0000-0000-000000000001', 'PRMR', 'Probe Repeat', 'Oakland', 'CA');
insert into public.organization_representatives (organization_id, member_id)
values ('11111111-5e71-0000-0000-000000000001', 'aaaaaaaa-5e71-0000-0000-00000000000a');

insert into public.events (id, title, start_time, end_time, organization_id, event_format, location,
                           audience, photo_path, photo_alt, meeting_url, added_by)
values
  ('eeeeeeee-5e71-0000-0000-000000000001', 'Probe coffee', now() + interval '2 days',
   now() + interval '2 days 1 hour', '11111111-5e71-0000-0000-000000000001', 'online', '',
   'people', 'events/eeeeeeee-5e71-0000-0000-000000000001/c.webp', 'A cup',
   'https://zoom.us/j/555', 'aaaaaaaa-5e71-0000-0000-00000000000a'),
  ('eeeeeeee-5e71-0000-0000-000000000002', 'Probe past', now() - interval '2 days',
   null, '11111111-5e71-0000-0000-000000000001', 'online', '', 'club', null, null, null,
   'aaaaaaaa-5e71-0000-0000-00000000000a');
insert into public.event_invitees (event_id, member_id)
values ('eeeeeeee-5e71-0000-0000-000000000001', 'cccccccc-5e71-0000-0000-00000000000c');

\echo ''
\echo '== 1. an ordinary member (expect ERROR: You cannot change this event.) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-5e71-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint ordinary;
select public.make_event_repeat('eeeeeeee-5e71-0000-0000-000000000001', 'week', 1, null, 4);
rollback to savepoint ordinary;
reset role;

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5e71-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. a past event (expect ERROR: Only an event that has not started yet can be made to repeat.) =='
savepoint past;
select public.make_event_repeat('eeeeeeee-5e71-0000-0000-000000000002', 'week', 1, null, 4);
rollback to savepoint past;

\echo ''
\echo '== 3. ends both ways (expect ERROR: Say when it ends one way, not both.) =='
savepoint two_ends;
select public.make_event_repeat('eeeeeeee-5e71-0000-0000-000000000001', 'week', 1, (now() + interval '60 days')::date, 4);
rollback to savepoint two_ends;

\echo ''
\echo '== 4. the rep makes it weekly, 4 dates in all (expect 3 made) =='
select public.make_event_repeat('eeeeeeee-5e71-0000-0000-000000000001', 'week', 1, null, 4) as made;
reset role;

\echo ''
\echo '== 5. every date: same series, a week apart, people, the invitee, the picture and the call (expect 4 rows: 0,7,14,21 | people | 1 | c.webp | https://zoom.us/j/555 | 1h) =='
select round(extract(epoch from e.start_time - f.start_time) / 86400) as days_after,
       e.audience,
       (select count(*) from public.event_invitees i where i.event_id = e.id) as invitees,
       right(e.photo_path, 6) as picture,
       e.meeting_url,
       e.end_time - e.start_time as lasts
  from public.events e
  join public.events f on f.id = 'eeeeeeee-5e71-0000-0000-000000000001'
 where e.series_id = f.series_id
 order by e.start_time;

\echo ''
\echo '== 6. again (expect ERROR: This event already repeats.) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5e71-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint again;
select public.make_event_repeat('eeeeeeee-5e71-0000-0000-000000000001', 'week', 1, null, 4);
rollback to savepoint again;
reset role;

rollback;

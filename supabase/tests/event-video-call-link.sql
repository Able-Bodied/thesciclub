-- ============================================================================
-- An event has a video call link (20261106070000)
-- ============================================================================
-- set_event_meeting_link: who may, https only, a date of a series and every
-- later one, the template, a date the series makes later, and clearing it.
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/event-video-call-link.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-1de0-0000-0000-00000000000a', 'peer', 'active', 'Org Rep',  '19990000f00', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-1de0-0000-0000-00000000000b', 'peer', 'active', 'Ordinary', '19990000f01', '1981-01-01', 'C5–C8', 'CA');

insert into public.organizations (id, short_code, name, city, state)
values ('11111111-1de0-0000-0000-000000000001', 'PRVC', 'Probe Video', 'Oakland', 'CA');
insert into public.organization_representatives (organization_id, member_id)
values ('11111111-1de0-0000-0000-000000000001', 'aaaaaaaa-1de0-0000-0000-00000000000a');

insert into public.event_series (id, series_key, title, repeat_unit, repeat_every, first_start, template)
values ('55555555-1de0-0000-0000-000000000005', 'probe-video-series', 'Probe weekly',
        'week', 1, now() + interval '7 days', '{"title": "Probe weekly"}'::jsonb);

insert into public.events (id, title, start_time, organization_id, event_format, location, series_id)
values
  ('eeeeeeee-1de0-0000-0000-000000000001', 'Probe weekly', now() + interval '7 days',
   '11111111-1de0-0000-0000-000000000001', 'online', '', '55555555-1de0-0000-0000-000000000005'),
  ('eeeeeeee-1de0-0000-0000-000000000002', 'Probe weekly', now() + interval '14 days',
   '11111111-1de0-0000-0000-000000000001', 'online', '', '55555555-1de0-0000-0000-000000000005'),
  ('eeeeeeee-1de0-0000-0000-000000000003', 'Probe weekly', now() + interval '21 days',
   '11111111-1de0-0000-0000-000000000001', 'online', '', '55555555-1de0-0000-0000-000000000005');

\echo ''
\echo '== 1. an ordinary member (expect ERROR: You cannot change this event.) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-1de0-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint ordinary;
select public.set_event_meeting_link('eeeeeeee-1de0-0000-0000-000000000002', 'https://zoom.us/j/1');
rollback to savepoint ordinary;
reset role;

\echo ''
\echo '== 2. the rep, http (expect ERROR: The video call link has to start with https://.) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1de0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint plain_http;
select public.set_event_meeting_link('eeeeeeee-1de0-0000-0000-000000000002', 'http://zoom.us/j/1');
rollback to savepoint plain_http;

\echo ''
\echo '== 3. the rep sets it on the second date (expect dates 1 none, 2 and 3 the link; template the link) =='
select public.set_event_meeting_link('eeeeeeee-1de0-0000-0000-000000000002', ' https://zoom.us/j/777 ');
reset role;
select right(id::text, 1) as date, meeting_url from public.events
 where series_id = '55555555-1de0-0000-0000-000000000005' order by start_time;
select template ->> 'meeting_url' as template from public.event_series
 where id = '55555555-1de0-0000-0000-000000000005';

\echo ''
\echo '== 4. a date the series makes later (expect https://zoom.us/j/777) =='
insert into public.events (id, title, start_time, organization_id, event_format, location, series_id)
values ('eeeeeeee-1de0-0000-0000-000000000004', 'Probe weekly', now() + interval '28 days',
        '11111111-1de0-0000-0000-000000000001', 'online', '', '55555555-1de0-0000-0000-000000000005');
select meeting_url from public.events where id = 'eeeeeeee-1de0-0000-0000-000000000004';

\echo ''
\echo '== 5. members read it (expect https://zoom.us/j/777) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-1de0-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select meeting_url from public.events where id = 'eeeeeeee-1de0-0000-0000-000000000003';
reset role;

\echo ''
\echo '== 6. the rep clears it from the third date (expect 2 the link, 3 and 4 none) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1de0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.set_event_meeting_link('eeeeeeee-1de0-0000-0000-000000000003', '');
reset role;
select right(id::text, 1) as date, meeting_url from public.events
 where series_id = '55555555-1de0-0000-0000-000000000005' and id <> 'eeeeeeee-1de0-0000-0000-000000000001'
 order by start_time;

rollback;

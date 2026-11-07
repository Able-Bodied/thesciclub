-- ============================================================================
-- Private events (20261106030000)
-- ============================================================================
-- Who may make an event private, who then sees it in the app and from its
-- link, and who is told.
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/private-events.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-9e9e-0000-0000-000000000001', 'peer', 'active', 'Ada Admin',  '19990e9e001', '1980-01-01', 'T1–T6', 'CA', true, false),
  ('bbbbbbbb-9e9e-0000-0000-000000000002', 'peer', 'active', 'Bo OrgA',    '19990e9e002', '1981-01-01', 'C5–C8', 'CA', true, false),
  ('cccccccc-9e9e-0000-0000-000000000003', 'peer', 'active', 'Cy OrgB',    '19990e9e003', '1982-01-01', 'C5–C8', 'CA', true, false),
  ('dddddddd-9e9e-0000-0000-000000000004', 'peer', 'active', 'Dee Guest',  '19990e9e004', '1983-01-01', 'C5–C8', 'CA', true, false),
  ('eeeeeeee-9e9e-0000-0000-000000000005', 'peer', 'active', 'Eve Nobody', '19990e9e005', '1984-01-01', 'C5–C8', 'CA', true, false),
  ('ffffffff-9e9e-0000-0000-000000000006', 'peer', 'active', 'Fay Club',   '19990e9e006', '1985-01-01', 'C5–C8', 'CA', true, true),
  ('99999999-9e9e-0000-0000-000000000007', 'peer', 'active', 'Gus OrgC',   '19990e9e007', '1986-01-01', 'C5–C8', 'CA', true, false);

insert into public.organizations (id, short_code, name, city, state)
values
  ('11111111-9e9e-0000-0000-000000000001', 'PVAX', 'Probe Org A', 'Oakland', 'CA'),
  ('22222222-9e9e-0000-0000-000000000002', 'PVBX', 'Probe Org B', 'Oakland', 'CA'),
  ('33333333-9e9e-0000-0000-000000000003', 'PVCX', 'Probe Org C', 'Oakland', 'CA');

insert into public.organization_representatives (organization_id, member_id)
values
  ('11111111-9e9e-0000-0000-000000000001', 'aaaaaaaa-9e9e-0000-0000-000000000001'),
  ('22222222-9e9e-0000-0000-000000000002', 'aaaaaaaa-9e9e-0000-0000-000000000001'),
  ('33333333-9e9e-0000-0000-000000000003', '99999999-9e9e-0000-0000-000000000007');

insert into public.organization_members (organization_id, member_id, joined_via)
values
  ('11111111-9e9e-0000-0000-000000000001', 'bbbbbbbb-9e9e-0000-0000-000000000002', 'join'),
  ('22222222-9e9e-0000-0000-000000000002', 'cccccccc-9e9e-0000-0000-000000000003', 'join');

insert into public.data_feeds (id, name, feed_url, feed_type)
values ('44444444-9e9e-0000-0000-0000000000f1', 'Probe feed',
        'https://example.invalid/probe-private.ics', 'norcalsci-events');

insert into public.event_series (id, series_key, title, repeat_unit, repeat_every, first_start, template)
values ('55555555-9e9e-0000-0000-000000000005', 'probe-private-series', 'Probe weekly',
        'week', 1, now() + interval '7 days', '{}'::jsonb);

insert into public.events (id, title, start_time, organization_id, event_format, location, feed_id, external_id, series_id, photo_path)
values
  ('eeeeeeee-9e9e-0000-0000-0000000000e1', 'Probe dinner', now() + interval '3 days',
   '11111111-9e9e-0000-0000-000000000001', 'in_person', 'Lake Merritt', null, null, null,
   'events/eeeeeeee-9e9e-0000-0000-0000000000e1/cover.webp'),
  ('eeeeeeee-9e9e-0000-0000-0000000000e2', 'Probe imported ride', now() + interval '4 days',
   '11111111-9e9e-0000-0000-000000000001', 'in_person', 'Trail', '44444444-9e9e-0000-0000-0000000000f1',
   'probe-imported', null, null),
  ('eeeeeeee-9e9e-0000-0000-0000000000e3', 'Probe open day', now() + interval '5 days',
   '11111111-9e9e-0000-0000-000000000001', 'in_person', 'Hall', null, null, null, null),
  ('eeeeeeee-9e9e-0000-0000-0000000000e4', 'Probe weekly', now() + interval '7 days',
   '11111111-9e9e-0000-0000-000000000001', 'online', '', null, null,
   '55555555-9e9e-0000-0000-000000000005', null),
  ('eeeeeeee-9e9e-0000-0000-0000000000e5', 'Probe weekly', now() + interval '14 days',
   '11111111-9e9e-0000-0000-000000000001', 'online', '', null, null,
   '55555555-9e9e-0000-0000-000000000005', null);

set local role authenticated;

\echo ''
\echo '== 1. an org admin of another organization (expect ERROR You cannot change who sees this event) =='
set local request.jwt.claims = '{"sub":"99999999-9e9e-0000-0000-000000000007","role":"authenticated"}';
savepoint s1;
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1', 'people',
  '{}', '{}', array['dddddddd-9e9e-0000-0000-000000000004']::uuid[]);
rollback to savepoint s1;

set local request.jwt.claims = '{"sub":"aaaaaaaa-9e9e-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 2. Ada makes the imported ride private to Org A and Org B (expect 0, nobody newly invited) =='
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e2', 'organizations',
  '{}', array['11111111-9e9e-0000-0000-000000000001', '22222222-9e9e-0000-0000-000000000002']::uuid[]);

\echo ''
\echo '== 3. but cannot choose Org C, which is not hers (expect ERROR only organizations you are an org admin of) =='
savepoint s3;
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e2', 'organizations',
  '{}', array['33333333-9e9e-0000-0000-000000000003']::uuid[]);
rollback to savepoint s3;

\echo ''
\echo '== 4. and the old writer still cannot touch an imported event (expect ERROR You cannot change) =='
savepoint s4;
select public.set_event_audience('eeeeeeee-9e9e-0000-0000-0000000000e2', 'club', '{}');
rollback to savepoint s4;

\echo ''
\echo '== 5. Ada invites Dee to the dinner (expect 1 newly invited) =='
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1', 'people',
  '{}', '{}', array['dddddddd-9e9e-0000-0000-000000000004']::uuid[]);

\echo ''
\echo '== 6. Dee and Eve: only Eve is new (expect 1) =='
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1', 'people',
  '{}', '{}', array['dddddddd-9e9e-0000-0000-000000000004', 'eeeeeeee-9e9e-0000-0000-000000000005']::uuid[]);

\echo ''
\echo '== 7. each was told once, as an org notice (expect Dee Guest event_notice 1, Eve Nobody event_notice 1) =='
reset role;
select m.display_name, n.kind, count(*) from public.notifications n
  join public.members m on m.id = n.member_id
 where n.event_id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'
 group by 1, 2 order by 1;
set local role authenticated;

\echo ''
\echo '== 8. who sees what in the app (expect, per member: dinner ride open) =='
\echo '   Bo  f t t   Cy  f t t   Dee t f t   Eve t f t   Gus f f t   Fay t t t'
create temporary table seen (who text, dinner boolean, ride boolean, open boolean) on commit drop;
grant all on seen to authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-9e9e-0000-0000-000000000002","role":"authenticated"}';
insert into seen select 'Bo', exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e2'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e3');
set local request.jwt.claims = '{"sub":"cccccccc-9e9e-0000-0000-000000000003","role":"authenticated"}';
insert into seen select 'Cy', exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e2'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e3');
set local request.jwt.claims = '{"sub":"dddddddd-9e9e-0000-0000-000000000004","role":"authenticated"}';
insert into seen select 'Dee', exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e2'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e3');
set local request.jwt.claims = '{"sub":"eeeeeeee-9e9e-0000-0000-000000000005","role":"authenticated"}';
insert into seen select 'Eve', exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e2'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e3');
set local request.jwt.claims = '{"sub":"99999999-9e9e-0000-0000-000000000007","role":"authenticated"}';
insert into seen select 'Gus', exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e2'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e3');
set local request.jwt.claims = '{"sub":"ffffffff-9e9e-0000-0000-000000000006","role":"authenticated"}';
insert into seen select 'Fay', exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e1'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e2'), exists (select 1 from public.events where id = 'eeeeeeee-9e9e-0000-0000-0000000000e3');
select * from seen;

\echo ''
\echo '== 9. the link: signed out, the dinner is not there and the open day is (expect 0 | 1) =='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select (select count(*) from public.public_event('eeeeeeee-9e9e-0000-0000-0000000000e1')) as dinner,
       (select count(*) from public.public_event('eeeeeeee-9e9e-0000-0000-0000000000e3')) as open_day;

\echo ''
\echo '== 10. nor can anyone sign up for it from the link (expect ERROR not taking registrations) =='
savepoint s10;
select public.register_for_event('eeeeeeee-9e9e-0000-0000-0000000000e1', 'Stranger', 'stranger@example.com', null, 'going');
rollback to savepoint s10;

\echo ''
\echo '== 11. its cover is not public; the open day''s would be (expect f) =='
select public.event_cover_is_public('events/eeeeeeee-9e9e-0000-0000-0000000000e1/cover.webp');

\echo ''
\echo '== 12. the link signed in: Dee gets it, Bo does not (expect 1 | 0) =='
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddddddd-9e9e-0000-0000-000000000004","role":"authenticated"}';
select count(*) as dee from public.public_event('eeeeeeee-9e9e-0000-0000-0000000000e1');
set local request.jwt.claims = '{"sub":"bbbbbbbb-9e9e-0000-0000-000000000002","role":"authenticated"}';
select count(*) as bo from public.public_event('eeeeeeee-9e9e-0000-0000-0000000000e1');

\echo ''
\echo '== 13. Bo is told only that it is invite only (expect people, no organization) =='
select audience, organization_name from public.event_audience_hint('eeeeeeee-9e9e-0000-0000-0000000000e1');

\echo ''
\echo '== 14. Bo cannot join its chat (expect ERROR There is no such event) =='
savepoint s14;
select public.chat_join_event_group('eeeeeeee-9e9e-0000-0000-0000000000e1');
rollback to savepoint s14;

\echo ''
\echo '== 15. Dee can (expect t) =='
set local request.jwt.claims = '{"sub":"dddddddd-9e9e-0000-0000-000000000004","role":"authenticated"}';
select public.chat_join_event_group('eeeeeeee-9e9e-0000-0000-0000000000e1') is not null;

\echo ''
\echo '== 16. what Dee reads of who it is for (expect people | f | t | 2) =='
select v ->> 'audience', v ->> 'may_change', v -> 'invitees' = 'null'::jsonb, v ->> 'invitee_count'
  from public.event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1') v;

\echo ''
\echo '== 17. what Ada reads (expect people | t | Dee Guest, Eve Nobody) =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-9e9e-0000-0000-000000000001","role":"authenticated"}';
select v ->> 'audience', v ->> 'may_change',
       (select string_agg(x ->> 'name', ', ') from jsonb_array_elements(v -> 'invitees') x)
  from public.event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1') v;

\echo ''
\echo '== 18. a series: inviting Dee to the first date reaches the later one, and a new date (expect 3 dates with Dee) =='
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e4', 'people',
  '{}', '{}', array['dddddddd-9e9e-0000-0000-000000000004']::uuid[]) as told;
reset role;
insert into public.events (id, title, start_time, organization_id, event_format, location, series_id)
values ('eeeeeeee-9e9e-0000-0000-0000000000e6', 'Probe weekly', now() + interval '21 days',
        '11111111-9e9e-0000-0000-000000000001', 'online', '', '55555555-9e9e-0000-0000-000000000005');
select count(*) as dates_with_dee from public.event_invitees i
  join public.events e on e.id = i.event_id and e.audience = 'people'
 where e.series_id = '55555555-9e9e-0000-0000-000000000005'
   and i.member_id = 'dddddddd-9e9e-0000-0000-000000000004';

\echo ''
\echo '== 19. back to everyone: the list goes, and Eve still sees it (expect club | 0) =='
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-9e9e-0000-0000-000000000001","role":"authenticated"}';
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1', 'club');
reset role;
select e.audience, (select count(*) from public.event_invitees i where i.event_id = e.id)
  from public.events e where e.id = 'eeeeeeee-9e9e-0000-0000-0000000000e1';

\echo ''
\echo '== 20. signed out, nothing to call (expect ERROR permission denied, twice) =='
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
savepoint s20a;
select public.set_event_visibility('eeeeeeee-9e9e-0000-0000-0000000000e1', 'club');
rollback to savepoint s20a;
savepoint s20b;
select * from public.event_invitees;
rollback to savepoint s20b;

rollback;

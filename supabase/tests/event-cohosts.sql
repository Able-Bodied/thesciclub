-- ============================================================================
-- An event has co-hosts (20261105170000)
-- ============================================================================
-- Who may set them, who may step down, what members read, and that the store
-- app's save_event (builds 1.0.5 and 1.2.0) leaves them alone.
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/event-cohosts.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-c0c0-0000-0000-00000000000a', 'peer', 'active', 'The Admin', '19990000c00', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-c0c0-0000-0000-00000000000b', 'peer', 'active', 'Lead Rep',  '19990000c01', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-c0c0-0000-0000-00000000000c', 'peer', 'active', 'Co Rep',    '19990000c02', '1982-01-01', 'C5–C8', 'CA', false),
  ('dddddddd-c0c0-0000-0000-00000000000d', 'peer', 'active', 'Ordinary',  '19990000c03', '1983-01-01', 'C5–C8', 'CA', false);

insert into public.organizations (id, short_code, name, city, state)
values
  ('11111111-c0c0-0000-0000-000000000001', 'PRBL', 'Probe Lead',  'Oakland', 'CA'),
  ('22222222-c0c0-0000-0000-000000000002', 'PRBB', 'Probe Bee',   'Oakland', 'CA'),
  ('33333333-c0c0-0000-0000-000000000003', 'PRBC', 'Probe Cee',   'Oakland', 'CA');
insert into public.organizations (short_code, name, city, state)
select 'PX' || chr(64 + n), 'Probe Extra ' || n, 'Oakland', 'CA' from generate_series(1, 9) n;

insert into public.organization_representatives (organization_id, member_id)
values
  ('11111111-c0c0-0000-0000-000000000001', 'bbbbbbbb-c0c0-0000-0000-00000000000b'),
  ('22222222-c0c0-0000-0000-000000000002', 'cccccccc-c0c0-0000-0000-00000000000c');

insert into public.event_series (id, series_key, title, repeat_unit, repeat_every, first_start, template)
values ('55555555-c0c0-0000-0000-000000000005', 'probe-cohost-series', 'Probe weekly',
        'week', 1, now() + interval '7 days', '{}'::jsonb);

insert into public.events (id, title, start_time, organization_id, event_format, location, series_id)
values
  ('eeeeeeee-c0c0-0000-0000-000000000001', 'Probe picnic', now() + interval '3 days',
   '11111111-c0c0-0000-0000-000000000001', 'in_person', 'Lake Merritt', null),
  ('eeeeeeee-c0c0-0000-0000-000000000011', 'Probe weekly', now() + interval '7 days',
   '11111111-c0c0-0000-0000-000000000001', 'online', '', '55555555-c0c0-0000-0000-000000000005'),
  ('eeeeeeee-c0c0-0000-0000-000000000012', 'Probe weekly', now() + interval '14 days',
   '11111111-c0c0-0000-0000-000000000001', 'online', '', '55555555-c0c0-0000-0000-000000000005'),
  ('eeeeeeee-c0c0-0000-0000-000000000013', 'Probe weekly', now() + interval '21 days',
   '11111111-c0c0-0000-0000-000000000001', 'online', '', '55555555-c0c0-0000-0000-000000000005');

\echo ''
\echo '== 1. signed out (expect ERROR permission denied, twice) =='
set local role anon;
savepoint anon_call;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000001', array['22222222-c0c0-0000-0000-000000000002']::uuid[]);
rollback to savepoint anon_call;
savepoint anon_read;
select count(*) from public.event_cohosts;
rollback to savepoint anon_read;
reset role;

\echo ''
\echo '== 2. an ordinary member sets co-hosts (expect ERROR: Only the hosting organization can choose its co-hosts.) =='
select set_config('request.jwt.claims', '{"sub":"dddddddd-c0c0-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint ordinary_sets;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000001', array['22222222-c0c0-0000-0000-000000000002']::uuid[]);
rollback to savepoint ordinary_sets;
reset role;

\echo ''
\echo '== 3. the lead host''s rep sets Bee, Cee and the lead itself (expect 1; then PRBB, PRBC: the lead is left out) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-c0c0-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000001',
  array['22222222-c0c0-0000-0000-000000000002', '33333333-c0c0-0000-0000-000000000003',
        '11111111-c0c0-0000-0000-000000000001', '22222222-c0c0-0000-0000-000000000002']::uuid[]);
reset role;
select o.short_code from public.event_cohosts c join public.organizations o on o.id = c.organization_id
 where c.event_id = 'eeeeeeee-c0c0-0000-0000-000000000001' order by 1;

\echo ''
\echo '== 4. an ordinary member reads them through the API (expect 2), and writes directly (expect ERROR permission denied) =='
select set_config('request.jwt.claims', '{"sub":"dddddddd-c0c0-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select count(*) as cohosts_read from public.event_cohosts where event_id = 'eeeeeeee-c0c0-0000-0000-000000000001';
savepoint direct_write;
insert into public.event_cohosts (event_id, organization_id)
values ('eeeeeeee-c0c0-0000-0000-000000000001', 'aaaaaaaa-c0c0-0000-0000-00000000000a');
rollback to savepoint direct_write;
reset role;

\echo ''
\echo '== 5. Bee''s rep: setting co-hosts (expect ERROR: Only the hosting...), taking Cee off (expect ERROR: You cannot change who hosts this event.), stepping Bee down (expect 1; then PRBC only) =='
select set_config('request.jwt.claims', '{"sub":"cccccccc-c0c0-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint bee_sets;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000001', array[]::uuid[]);
rollback to savepoint bee_sets;
savepoint bee_removes_cee;
select public.leave_event_cohost('eeeeeeee-c0c0-0000-0000-000000000001', '33333333-c0c0-0000-0000-000000000003');
rollback to savepoint bee_removes_cee;
select public.leave_event_cohost('eeeeeeee-c0c0-0000-0000-000000000001', '22222222-c0c0-0000-0000-000000000002');
reset role;
select o.short_code from public.event_cohosts c join public.organizations o on o.id = c.organization_id
 where c.event_id = 'eeeeeeee-c0c0-0000-0000-000000000001' order by 1;

\echo ''
\echo '== 6. the store app''s save_event changes the picnic (expect its id; then PRBC still a co-host) =='
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-c0c0-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.save_event(
  event => 'eeeeeeee-c0c0-0000-0000-000000000001', organization => '11111111-c0c0-0000-0000-000000000001',
  host => null, title => 'Probe picnic, renamed', description => '', starts => now() + interval '3 days',
  ends => null, format => 'in_person', place => 'Lake Merritt', city => 'Oakland', link => null,
  registration => null);
reset role;
select o.short_code from public.event_cohosts c join public.organizations o on o.id = c.organization_id
 where c.event_id = 'eeeeeeee-c0c0-0000-0000-000000000001' order by 1;

\echo ''
\echo '== 7. eleven co-hosts (expect ERROR: An event can have 10 co-hosts at most.) =='
set local role authenticated;
savepoint too_many;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000001',
  (select array_agg(id) from public.organizations where short_code like 'PX%' or short_code in ('PRBB', 'PRBC')));
rollback to savepoint too_many;
reset role;

\echo ''
\echo '== 8. a repeating event, from its second date with later (expect 2; then dates 1..3 with 0, 1, 1) =='
set local role authenticated;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000012', array['22222222-c0c0-0000-0000-000000000002']::uuid[], true);
reset role;
select e.id, count(c.organization_id) from public.events e
  left join public.event_cohosts c on c.event_id = e.id
 where e.series_id = '55555555-c0c0-0000-0000-000000000005' group by e.id order by e.id;

\echo ''
\echo '== 9. the series adds a fourth date (expect 1: PRBB carried over) =='
insert into public.events (id, title, start_time, organization_id, event_format, location, series_id)
values ('eeeeeeee-c0c0-0000-0000-000000000014', 'Probe weekly', now() + interval '28 days',
        '11111111-c0c0-0000-0000-000000000001', 'online', '', '55555555-c0c0-0000-0000-000000000005');
select count(*) as fourth_date_cohosts from public.event_cohosts where event_id = 'eeeeeeee-c0c0-0000-0000-000000000014';

\echo ''
\echo '== 10. the fourth date''s host becomes Bee (expect 0: a lead is not its own co-host) =='
update public.events set organization_id = '22222222-c0c0-0000-0000-000000000002'
 where id = 'eeeeeeee-c0c0-0000-0000-000000000014';
select count(*) as fourth_date_cohosts from public.event_cohosts where event_id = 'eeeeeeee-c0c0-0000-0000-000000000014';

\echo ''
\echo '== 11. a calendar invitation takes the picnic over (expect PRBC on the new event; the picnic gone) =='
insert into public.events (id, title, start_time, organization_id, event_format, location)
values ('eeeeeeee-c0c0-0000-0000-000000000099', 'Probe picnic', now() + interval '3 days',
        '11111111-c0c0-0000-0000-000000000001', 'in_person', 'Lake Merritt');
select private.calendar_absorb('eeeeeeee-c0c0-0000-0000-000000000001', 'eeeeeeee-c0c0-0000-0000-000000000099');
select o.short_code from public.event_cohosts c join public.organizations o on o.id = c.organization_id
 where c.event_id = 'eeeeeeee-c0c0-0000-0000-000000000099' order by 1;
select count(*) as picnic_left from public.events where id = 'eeeeeeee-c0c0-0000-0000-000000000001';

\echo ''
\echo '== 12. a club administrator clears them (expect 1; then 0) =='
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-c0c0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.set_event_cohosts('eeeeeeee-c0c0-0000-0000-000000000099', array[]::uuid[]);
reset role;
select count(*) from public.event_cohosts where event_id = 'eeeeeeee-c0c0-0000-0000-000000000099';

rollback;

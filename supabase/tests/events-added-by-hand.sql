-- ============================================================================
-- Who can add, change and delete an event by hand, and who speaks for whom
-- ============================================================================
-- 20261005010000: an administrator links a member to an organization, and
-- that member speaks for it. 20261005020000: an administrator adds an event
-- for any organization or for none; a member who speaks for an organization
-- adds events for it alone, and changes or deletes its hand-added ones.
-- Nobody changes a scraped event. Nothing here reaches the representatives
-- table except through the functions.
--
-- Run as real signed-in members, not as the superuser: postgres is BYPASSRLS
-- and owns everything, so every refusal here would be inert. The superuser
-- writes the rows before the first role switch and reads what is left in 15.
-- Every expected refusal sits in its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/events-added-by-hand.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-7777-0000-0000-00000000000a', 'peer', 'active', 'The Admin', '19990000070', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-7777-0000-0000-00000000000b', 'peer', 'active', 'Speaker',   '19990000071', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-7777-0000-0000-00000000000c', 'peer', 'active', 'Ordinary',  '19990000072', '1982-01-01', 'C5–C8', 'CA', false);

-- A scraped event, for 12.
insert into public.events (id, feed_id, external_id, title, start_time)
select 'eeeeeeee-7777-0000-0000-00000000000e', f.id, 'probe-scraped', 'Scraped ride', now() + interval '3 days'
  from public.data_feeds f where f.feed_type = 'norcalsci-events';

\echo ''
\echo '== 1. signed out, none of it is there to call (expect ERROR permission denied, three times) =='
set local role anon;
savepoint anon_save;
select public.save_event(null, null, 'Anyone', 'Picnic', '', now() + interval '1 day', null, 'online', '', null, null, null);
rollback to savepoint anon_save;
savepoint anon_list;
select public.my_organizations();
rollback to savepoint anon_list;
savepoint anon_table;
select count(*) from public.organization_representatives;
rollback to savepoint anon_table;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"cccccccc-7777-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. a member reads the table directly (expect ERROR: permission denied for table organization_representatives) =='
savepoint direct_read;
select count(*) from public.organization_representatives;
rollback to savepoint direct_read;

\echo ''
\echo '== 3. a member makes themself a speaker (expect ERROR: Not an administrator) =='
savepoint self_link;
select public.admin_add_representative(
  (select id from public.organizations where short_code = 'NCS'), 'cccccccc-7777-0000-0000-00000000000c');
rollback to savepoint self_link;

\echo ''
\echo '== 4. nor reads who speaks for whom (expect ERROR: Not an administrator) =='
savepoint list_reps;
select * from public.admin_organization_representatives();
rollback to savepoint list_reps;

\echo ''
\echo '== 5. a member adds an event for an organization (expect ERROR: You cannot add events for that organization.) =='
savepoint ordinary_org;
select public.save_event(null, (select id from public.organizations where short_code = 'NCS'), null,
  'Picnic', '', now() + interval '1 day', null, 'in_person', 'Lake Merritt', 'Oakland', null, null);
rollback to savepoint ordinary_org;

\echo ''
\echo '== 6. or for nobody (expect ERROR: Only an administrator can add an event no organization hosts.) =='
savepoint ordinary_none;
select public.save_event(null, null, 'Me', 'Picnic', '', now() + interval '1 day', null,
  'in_person', 'Lake Merritt', 'Oakland', null, null);
rollback to savepoint ordinary_none;

\echo ''
\echo '== 7. or writes the table directly (expect ERROR: new row violates row-level security policy for table "events") =='
\echo '   Supabase grants insert on the table; no insert policy is what refuses it.'
savepoint direct_insert;
insert into public.events (title, start_time, host_name) values ('Sneaky', now(), 'Me');
rollback to savepoint direct_insert;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-7777-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 8. the administrator links Speaker to NorCal SCI, twice, and reads it (expect one row: Speaker | active) =='
select public.admin_add_representative(
  (select id from public.organizations where short_code = 'NCS'), 'bbbbbbbb-7777-0000-0000-00000000000b');
select public.admin_add_representative(
  (select id from public.organizations where short_code = 'NCS'), 'bbbbbbbb-7777-0000-0000-00000000000b');
select display_name, member_status from public.admin_organization_representatives()
 where member_id = 'bbbbbbbb-7777-0000-0000-00000000000b';

\echo ''
\echo '== 9. the administrator adds a community event with no host named, then with one =='
\echo '   expect ERROR: Say who is hosting it., then a uuid'
savepoint no_host;
select public.save_event(null, null, '  ', 'Coffee', '', now() + interval '2 days', null, 'online', '', null, null, null);
rollback to savepoint no_host;
select public.save_event(null, null, 'The SCI Club', 'Coffee', 'Bring a mug', now() + interval '2 days', null,
  'online', '', null, 'https://example.org/coffee', null) is not null as added;

\echo ''
\echo '== 10. and refuses the shapes a form could get wrong =='
\echo '   expect ERROR: It has to end after it starts., ERROR: Say where it is., ERROR: A link has to be a web address starting https://.'
savepoint backwards;
select public.save_event(null, null, 'Club', 'Late', '', now() + interval '2 days', now() + interval '1 day', 'online', '', null, null, null);
rollback to savepoint backwards;
savepoint nowhere;
select public.save_event(null, null, 'Club', 'Walk', '', now() + interval '2 days', null, 'in_person', ' ', null, null, null);
rollback to savepoint nowhere;
savepoint script_link;
select public.save_event(null, null, 'Club', 'Walk', '', now() + interval '2 days', null, 'online', '', null, 'javascript:alert(1)', null);
rollback to savepoint script_link;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-7777-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 11. Speaker sees NorCal SCI as theirs, and adds an event for it (expect NCS, then added | t) =='
select o.short_code from public.my_organizations() m join public.organizations o on o.id = m;
create temporary table probe_saved on commit drop as
select public.save_event(null, (select id from public.organizations where short_code = 'NCS'), 'ignored',
  'Picnic', 'Food at noon', now() + interval '4 days', now() + interval '4 days 3 hours',
  'in_person', 'Lake Merritt', 'Oakland', null, null) as id;
select id is not null as added from probe_saved;

\echo ''
\echo '== 12. but not for BORP, nor for nobody, nor changes the scraped event =='
\echo '   expect ERROR: You cannot add events for that organization., ERROR: Only an administrator..., ERROR: This event comes from the organization''s own calendar...'
savepoint other_org;
select public.save_event(null, (select id from public.organizations where short_code = 'BORP'), null,
  'Ride', '', now() + interval '1 day', null, 'in_person', 'Berkeley', null, null, null);
rollback to savepoint other_org;
savepoint speaker_none;
select public.save_event(null, null, 'Me', 'Ride', '', now() + interval '1 day', null, 'online', '', null, null, null);
rollback to savepoint speaker_none;
savepoint scraped;
select public.delete_event('eeeeeeee-7777-0000-0000-00000000000e');
rollback to savepoint scraped;

\echo ''
\echo '== 13. nor moves its own event to BORP, nor touches the administrator''s community event =='
\echo '   expect ERROR: You cannot add events for that organization., ERROR: You cannot delete this event.'
savepoint move_org;
select public.save_event((select id from probe_saved), (select id from public.organizations where short_code = 'BORP'), null,
  'Picnic', '', now() + interval '4 days', null, 'in_person', 'Lake Merritt', 'Oakland', null, null);
rollback to savepoint move_org;
savepoint others_event;
select public.delete_event((select id from public.events where title = 'Coffee' and feed_id is null));
rollback to savepoint others_event;

\echo ''
\echo '== 14. Speaker renames the picnic; the host name passed is dropped for the organization (expect Picnic at the lake | null | in_person) =='
select public.save_event((select id from probe_saved), (select id from public.organizations where short_code = 'NCS'), 'ignored',
  'Picnic at the lake', 'Food at noon', now() + interval '4 days', null, 'in_person', 'Lake Merritt', 'Oakland', null, null) is not null as saved;
select title, host_name, event_format from public.events where id = (select id from probe_saved);

\echo ''
\echo '== 15. nobody signed in can read who added it (expect ERROR: permission denied for table events) =='
savepoint added_by;
select added_by from public.events where id = (select id from probe_saved);
rollback to savepoint added_by;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-7777-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 16. the administrator unlinks Speaker; Speaker can no longer change it (expect ERROR: You cannot change this event.) =='
select public.admin_remove_representative(
  (select id from public.organizations where short_code = 'NCS'), 'bbbbbbbb-7777-0000-0000-00000000000b');
reset role;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-7777-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint unlinked;
select public.save_event((select id from probe_saved), (select id from public.organizations where short_code = 'NCS'), null,
  'Hijacked', '', now() + interval '4 days', null, 'online', '', null, null, null);
rollback to savepoint unlinked;

reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-7777-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 17. the administrator deletes the picnic (expect delete_event, then 0) =='
select public.delete_event((select id from probe_saved));
reset role;
select count(*) from public.events where id = (select id from probe_saved);

rollback;

-- ============================================================================
-- A pin follows its address (20261025030000, 20261026000000)
-- ============================================================================
-- A changed place is queued and the Geocode workflow started on GitHub once
-- a transaction; an unrelated edit, the import's own write and an online
-- event are not. Only the service role works the queue, and a pin is
-- written only while the address is still the one asked about.
--
-- The superuser writes the events with a member's or the import's claims, as
-- save_event and the import do; the queue's functions are called as the real
-- roles. "sent" counts workflow starts waiting in pg_net for the probe's
-- repository, and club.geocode_sent is cleared before each step that
-- expects one.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/event-geocode.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

delete from vault.secrets where name in ('geocode_github_repo', 'geocode_github_token');
select vault.create_secret('probe-owner/probe-repo', 'geocode_github_repo') is not null as ok;
select vault.create_secret('github_pat_probe', 'geocode_github_token') is not null as ok;

-- Only the probe's rows are claimed below.
delete from private.geocode_queue;

create temporary view probe_sent as
select count(*) as sent from net.http_request_queue
 where url = 'https://api.github.com/repos/probe-owner/probe-repo/actions/workflows/geocode.yml/dispatches';

\echo ''
\echo '== 1. the key, as geocodeKey in geocode.test.js (expect each t) =='
select k.args, public.geocode_key(k.location, k.city, k.state) is not distinct from k.key as same
  from (values
    ('1', '1 Main St', 'Probetown', 'CA', '1 Main St, Probetown, CA'),
    ('2', '1 Main St, Probetown, CA 95814', 'probetown', 'CA', '1 Main St, Probetown, CA 95814'),
    ('3', '  Gym  ', null, null, 'Gym'),
    ('4', '', 'Davis', 'CA', null),
    ('5', null, 'Davis', 'CA', null),
    ('6', 'Cascade Hall', 'Davis', 'CA', 'Cascade Hall, Davis, CA'),
    ('7', E'\tHall\n', ' Davis ', null, 'Hall, Davis')
  ) as k(args, location, city, state, key)
 order by k.args;

-- As a member, through save_event.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 2. a hand-added event is queued and the Geocode workflow started (expect 1 | 0 | 1) =='
select set_config('club.geocode_sent', '', true) is not null as ok;
insert into public.events (id, title, start_time, location, city, state, event_format, host_name)
values ('eeeeeeee-0c0c-0000-0000-000000000001', 'Hand-added', now() + interval '1 day',
        '1 Main St', 'Probetown', 'CA', 'in_person', 'Probe host');
select (select count(*) from private.geocode_queue
         where target_id = 'eeeeeeee-0c0c-0000-0000-000000000001') as queued,
       (select attempts from private.geocode_queue
         where target_id = 'eeeeeeee-0c0c-0000-0000-000000000001') as attempts,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 2b. the start: POST, the token, GitHub''s headers, main (expect POST | Bearer github_pat_probe |'
\echo '   application/vnd.github+json | 2022-11-28 | thesciclub-geocode | {"ref": "main"})'
select r.method, r.headers ->> 'Authorization' as authorization, r.headers ->> 'Accept' as accept,
       r.headers ->> 'X-GitHub-Api-Version' as version, r.headers ->> 'User-Agent' as agent,
       convert_from(r.body, 'utf8')::jsonb as body
  from net.http_request_queue r
 where r.url = 'https://api.github.com/repos/probe-owner/probe-repo/actions/workflows/geocode.yml/dispatches';

\echo ''
\echo '== 2c. with no token, or no repository, nothing is sent; the queue still fills (expect 1 | 1 | 1 | 1) =='
delete from vault.secrets where name = 'geocode_github_token';
select set_config('club.geocode_sent', '', true) is not null as ok;
update public.events set location = '1 Main Street' where id = 'eeeeeeee-0c0c-0000-0000-000000000001';
select (select sent from probe_sent) as no_token,
       (select count(*) from private.geocode_queue where target_id = 'eeeeeeee-0c0c-0000-0000-000000000001') as queued;
select vault.create_secret('github_pat_probe', 'geocode_github_token') is not null as ok;
delete from vault.secrets where name = 'geocode_github_repo';
select set_config('club.geocode_sent', '', true) is not null as ok;
update public.events set location = '1 Main St' where id = 'eeeeeeee-0c0c-0000-0000-000000000001';
select (select sent from probe_sent) as no_repo,
       (select count(*) from private.geocode_queue where target_id = 'eeeeeeee-0c0c-0000-0000-000000000001') as queued;
select vault.create_secret('probe-owner/probe-repo', 'geocode_github_repo') is not null as ok;

\echo ''
\echo '== 3. a new title is not a new place (expect 1) =='
select set_config('club.geocode_sent', '', true) is not null as ok;
update public.events set title = 'Hand-added, renamed' where id = 'eeeeeeee-0c0c-0000-0000-000000000001';
select sent from probe_sent;

\echo ''
\echo '== 4. a new address queues it again from the start (expect 0 | 2) =='
update private.geocode_queue set attempts = 2 where target_id = 'eeeeeeee-0c0c-0000-0000-000000000001';
select set_config('club.geocode_sent', '', true) is not null as ok;
update public.events set location = '2 Main St' where id = 'eeeeeeee-0c0c-0000-0000-000000000001';
select (select attempts from private.geocode_queue
         where target_id = 'eeeeeeee-0c0c-0000-0000-000000000001') as attempts,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 5. once a transaction: a second change in it asks nothing more (expect 2) =='
update public.events set city = 'Probeburg' where id = 'eeeeeeee-0c0c-0000-0000-000000000001';
select sent from probe_sent;

\echo ''
\echo '== 6. the import writes its own feed event: not queued (expect 0 | 2) =='
select set_config('request.jwt.claims', '{"role":"service_role"}', true) is not null as ok;
select set_config('club.geocode_sent', '', true) is not null as ok;
insert into public.events (id, feed_id, external_id, title, start_time, location, city, state,
                           event_format, host_name)
select 'eeeeeeee-0c0c-0000-0000-000000000002', f.id, 'probe-0c0c', 'Imported', now() + interval '2 days',
       '5 Feed St', 'Probetown', 'CA', 'in_person', 'Probe host'
  from public.data_feeds f order by f.id limit 1;
select (select count(*) from private.geocode_queue
         where target_id = 'eeeeeeee-0c0c-0000-0000-000000000002') as queued,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 7. an administrator moves it: queued (expect 1 | 3) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
select set_config('club.geocode_sent', '', true) is not null as ok;
update public.events set location = '9 New St', admin_override = '{"location": "9 New St"}'
 where id = 'eeeeeeee-0c0c-0000-0000-000000000002';
select (select count(*) from private.geocode_queue
         where target_id = 'eeeeeeee-0c0c-0000-0000-000000000002') as queued,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 8. an online event, and an emptied place, are not looked up (expect 0 | 3) =='
select set_config('club.geocode_sent', '', true) is not null as ok;
insert into public.events (id, title, start_time, location, city, state, event_format, host_name)
values ('eeeeeeee-0c0c-0000-0000-000000000003', 'Online', now() + interval '1 day',
        'Zoom', 'Probetown', 'CA', 'online', 'Probe host'),
       ('eeeeeeee-0c0c-0000-0000-000000000004', 'No place', now() + interval '1 day',
        '  ', 'Probetown', 'CA', 'in_person', 'Probe host');
select (select count(*) from private.geocode_queue
         where target_id in ('eeeeeeee-0c0c-0000-0000-000000000003', 'eeeeeeee-0c0c-0000-0000-000000000004')) as queued,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 9. members and strangers cannot work the queue, read the place or ask (expect 14 ERRORs) =='
\echo '   anon then authenticated: geocode_release, geocode_done, geocodes_claim_for_import, geocodes_enqueue_stale,'
\echo '   geocode_key, geocoded_location (permission denied for table), the send (schema private)'
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
set local role anon;
savepoint a1; select public.geocode_release('event', 'eeeeeeee-0c0c-0000-0000-000000000001'); rollback to savepoint a1;
savepoint a2; select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000001', 'x', 1, 1, 'exact', null); rollback to savepoint a2;
savepoint a3; select * from public.geocodes_claim_for_import(); rollback to savepoint a3;
savepoint a7; select public.geocodes_enqueue_stale(); rollback to savepoint a7;
savepoint a4; select public.geocode_key('a', 'b', 'CA'); rollback to savepoint a4;
savepoint a5; select geocoded_location from public.events limit 1; rollback to savepoint a5;
savepoint a6; select private.geocode_send(); rollback to savepoint a6;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint m1; select public.geocode_release('event', 'eeeeeeee-0c0c-0000-0000-000000000001'); rollback to savepoint m1;
savepoint m2; select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000001', 'x', 1, 1, 'exact', null); rollback to savepoint m2;
savepoint m3; select * from public.geocodes_claim_for_import(); rollback to savepoint m3;
savepoint m7; select public.geocodes_enqueue_stale(); rollback to savepoint m7;
savepoint m4; select public.geocode_key('a', 'b', 'CA'); rollback to savepoint m4;
savepoint m5; select geocoded_location from public.events limit 1; rollback to savepoint m5;
savepoint m6; select private.geocode_send(); rollback to savepoint m6;
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true) is not null as ok;
set local role service_role;

\echo ''
\echo '== 10. the retired function''s door is gone (expect ERROR: function public.geocodes_due(unknown) does not exist) =='
savepoint gone;
select * from public.geocodes_due('anything');
rollback to savepoint gone;

\echo ''
\echo '== 11. the service role claims the probe events, with what to ask =='
\echo '   expect: Hand-added, renamed | 2 Main St, Probeburg, CA | CA'
\echo '           Imported            | 9 New St, Probetown, CA  | CA'
select t.title, d.query, d.state
  from public.geocodes_claim_for_import() d
  join public.events t on t.id = d.target_id
 where d.target_id::text like 'eeeeeeee-0c0c-%'
 order by t.title;

\echo ''
\echo '== 12. a second caller meanwhile gets nothing (expect 0) =='
select count(*) as claimed from public.geocodes_claim_for_import();

\echo ''
\echo '== 12b. the claim outlives a runner''s longest batch (expect t) =='
reset role;
select bool_and(q.claimed_until > now() + interval '3 minutes') as outlives
  from private.geocode_queue q where q.target_id::text like 'eeeeeeee-0c0c-%';
set local role service_role;

\echo ''
\echo '== 12c. a row a runner never reached goes back without counting as a lookup (expect null | 0) =='
set local role service_role;
select public.geocode_release('event', 'eeeeeeee-0c0c-0000-0000-000000000002');
reset role;
select q.claimed_until, (select count(*) from private.geocode_lookups) as lookups
  from private.geocode_queue q where q.target_id = 'eeeeeeee-0c0c-0000-0000-000000000002';
set local role service_role;

\echo ''
\echo '== 13. moved again while asked: the old answer is not written, and it waits again =='
\echo '   expect: f, then null | null | 0 (no pin, released, from the start)'
reset role;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
update public.events set location = '10 Newer St', admin_override = '{"location": "10 Newer St"}'
 where id = 'eeeeeeee-0c0c-0000-0000-000000000002';
select set_config('request.jwt.claims', '{"role":"service_role"}', true) is not null as ok;
set local role service_role;
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000002', '9 New St, Probetown, CA',
                                 38.5555555, -121.5555555, 'exact', null) as written;
reset role;
select e.latitude, q.claimed_until, q.attempts
  from public.events e join private.geocode_queue q on q.target_id = e.id
 where e.id = 'eeeeeeee-0c0c-0000-0000-000000000002';

\echo ''
\echo '== 14. the answer for its address is written, and it leaves the queue =='
\echo '   expect: t, then 38.5555555 | exact | t | 0'
set local role service_role;
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000001', '2 Main St, Probeburg, CA',
                                 38.5555555, -121.5555555, 'exact', null) as written;
reset role;
select e.latitude, e.location_precision,
       e.geocoded_location = public.geocode_key(e.location, e.city, e.state) as current,
       (select count(*) from private.geocode_queue q where q.target_id = e.id) as queued
  from public.events e where e.id = 'eeeeeeee-0c0c-0000-0000-000000000001';

\echo ''
\echo '== 15. a failure keeps the row with its error; half a place is refused =='
\echo '   expect: f, then t | null, then ERROR: A place is two coordinates and a precision, or none.'
set local role service_role;
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000002', '10 Newer St, Probetown, CA',
                                 null, null, null, 'No answer') as written;
reset role;
select q.last_error = 'No answer' as kept, q.claimed_until
  from private.geocode_queue q where q.target_id = 'eeeeeeee-0c0c-0000-0000-000000000002';
set local role service_role;
savepoint half;
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000002', '10 Newer St, Probetown, CA',
                                 38.5, null, 'exact', null);
rollback to savepoint half;

\echo ''
\echo '== 16. nowhere: no pin, and not stale (expect t, then null | null | t) =='
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000002', '10 Newer St, Probetown, CA',
                                 null, null, null, null) as written;
reset role;
select e.latitude, e.location_precision,
       e.geocoded_location = public.geocode_key(e.location, e.city, e.state) as current
  from public.events e where e.id = 'eeeeeeee-0c0c-0000-0000-000000000002';

\echo ''
\echo '== 17. the nightly run queues stale upcoming events only (expect Stale | t, Stale but over | f) =='
update public.events set geocoded_location = null where id = 'eeeeeeee-0c0c-0000-0000-000000000004';
insert into public.events (id, title, start_time, location, city, state, event_format, host_name)
values ('eeeeeeee-0c0c-0000-0000-000000000005', 'Stale', now() + interval '3 days',
        '7 Old Rd', 'Probetown', 'CA', 'in_person', 'Probe host'),
       ('eeeeeeee-0c0c-0000-0000-000000000006', 'Stale but over', now() - interval '3 days',
        '8 Old Rd', 'Probetown', 'CA', 'in_person', 'Probe host');
-- Their own saves queued both; the night queues only the upcoming one.
delete from private.geocode_queue where target_id in ('eeeeeeee-0c0c-0000-0000-000000000005', 'eeeeeeee-0c0c-0000-0000-000000000006');
set local role service_role;
select public.geocodes_enqueue_stale() > 0 as queued_some;
reset role;
select t.title, exists (select 1 from private.geocode_queue q where q.target_id = t.id) as queued
  from public.events t
 where t.id in ('eeeeeeee-0c0c-0000-0000-000000000005', 'eeeeeeee-0c0c-0000-0000-000000000006')
 order by t.title;

\echo ''
\echo '== 18. a hand-added event with no state takes its host''s, else the saver''s (expect NV | CA) =='
insert into public.organizations (id, short_code, name, city, state)
values ('bbbbbbbb-0c0c-0000-0000-000000000001', 'PGEO', 'Probe Geo Reno', 'Reno', 'NV');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city)
values ('aaaaaaaa-0c0c-0000-0000-000000000001', 'peer', 'active', 'Saver', '19990000c0c', '1980-01-01', 'T1–T6', 'CA', 'Davis');
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000001","role":"authenticated"}', true) is not null as ok;
insert into public.events (id, title, start_time, location, city, organization_id, event_format, host_name)
values ('eeeeeeee-0c0c-0000-0000-000000000007', 'Hosted in Reno', now() + interval '1 day',
        '1 Virginia St', 'Reno', 'bbbbbbbb-0c0c-0000-0000-000000000001', 'in_person', null),
       ('eeeeeeee-0c0c-0000-0000-000000000008', 'No host', now() + interval '1 day',
        '1 Main St', 'Davis', null, 'in_person', 'Probe host');
select (select state from public.events where id = 'eeeeeeee-0c0c-0000-0000-000000000007') as hosted,
       (select state from public.events where id = 'eeeeeeee-0c0c-0000-0000-000000000008') as saver;

\echo ''
\echo '== 19. with no state anywhere, nothing is looked up, nor queued at night (expect null | 0, then 0) =='
select set_config('request.jwt.claims', '{"role":"service_role"}', true) is not null as ok;
insert into public.events (id, title, start_time, location, city, event_format, host_name)
values ('eeeeeeee-0c0c-0000-0000-000000000009', 'No state', now() + interval '1 day',
        '1 Main St', 'Springfield', 'in_person', 'Probe host');
select (select coalesce(state, 'null') from public.events where id = 'eeeeeeee-0c0c-0000-0000-000000000009') as state,
       (select count(*) from private.geocode_queue where target_id = 'eeeeeeee-0c0c-0000-0000-000000000009') as queued;
set local role service_role;
select public.geocodes_enqueue_stale() >= 0 as ok;
reset role;
select count(*) as queued from private.geocode_queue where target_id = 'eeeeeeee-0c0c-0000-0000-000000000009';

\echo ''
\echo '== 20. an organization''s public address is queued; a place with no address is not (expect 1 | 0) =='
insert into public.organization_places (id, organization_id, position, address, city, state) values
  ('cccccccc-0c0c-0000-0000-000000000001', 'bbbbbbbb-0c0c-0000-0000-000000000001', 0, '50 Center St', 'Reno', 'NV'),
  ('cccccccc-0c0c-0000-0000-000000000002', 'bbbbbbbb-0c0c-0000-0000-000000000001', 1, null, 'Sparks', 'NV');
select (select count(*) from private.geocode_queue
         where kind = 'place' and target_id = 'cccccccc-0c0c-0000-0000-000000000001') as address,
       (select count(*) from private.geocode_queue
         where kind = 'place' and target_id = 'cccccccc-0c0c-0000-0000-000000000002') as city_only;

\echo ''
\echo '== 21. the place''s answer is written to the place (expect t, then 39.5 | exact | t) =='
set local role service_role;
select public.geocode_done('place', 'cccccccc-0c0c-0000-0000-000000000001', '50 Center St, Reno, NV',
                           39.5, -119.8, 'exact', null) as written;
reset role;
select latitude, location_precision, geocoded_location = public.geocode_key(address, city, state) as current
  from public.organization_places where id = 'cccccccc-0c0c-0000-0000-000000000001';

\echo ''
\echo '== 22. the day''s caps and the spacing, for every runner =='
\echo '   each line: the Stale event | the Reno place (60 Center St), claimed or not'
\echo '   expect: 0 | 1 (5 for one event), 0 | 1 (3 for one address), 1 | 0 (20 for the organization),'
\echo '   0 | 0 (500 for the club), 0 | 0 (a lookup just now), 1 | 1 (2 seconds ago),'
\echo '   1 | 0 (the night''s claim, organization capped), then t (the capped place is still stale)'
delete from private.geocode_lookups;
delete from private.geocode_queue;
insert into public.organization_places (id, organization_id, position, address, city, state) values
  ('cccccccc-0c0c-0000-0000-000000000003', 'bbbbbbbb-0c0c-0000-0000-000000000001', 2, '60 Center St', 'Reno', 'NV');
insert into private.geocode_queue (kind, target_id) values ('event', 'eeeeeeee-0c0c-0000-0000-000000000005')
on conflict do nothing;
create temporary table probe_claimed (stale bigint, reno bigint) on commit drop;
create function pg_temp.probe_reset() returns void language sql as $f$
  delete from private.geocode_lookups;
  update private.geocode_queue set claimed_until = null, attempts = 0, claimed_query = null, claimed_owner = null;
$f$;
create function pg_temp.probe_old(n integer, p_kind text, p_target uuid, p_query text, p_owner uuid)
returns void language sql as $f$
  insert into private.geocode_lookups (kind, target_id, query, owner_id, asked_at)
  select p_kind, p_target, p_query, p_owner, now() - interval '1 hour' from generate_series(1, n);
$f$;

select pg_temp.probe_old(5, 'event', 'eeeeeeee-0c0c-0000-0000-000000000005', 'old', null);
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
select pg_temp.probe_reset();
select pg_temp.probe_old(3, 'event', gen_random_uuid(), '7 Old Rd, Probetown, CA', null);
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
select pg_temp.probe_reset();
select pg_temp.probe_old(20, 'place', gen_random_uuid(), 'elsewhere', 'bbbbbbbb-0c0c-0000-0000-000000000001');
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
select pg_temp.probe_reset();
insert into private.geocode_lookups (kind, target_id, query, owner_id, asked_at)
select 'event', gen_random_uuid(), 'q' || i, gen_random_uuid(), now() - interval '1 hour' from generate_series(1, 500) i;
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
select pg_temp.probe_reset();
insert into private.geocode_lookups (kind, target_id, query) values ('event', gen_random_uuid(), 'just now');
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
update private.geocode_lookups set asked_at = clock_timestamp() - interval '2 seconds';
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
select pg_temp.probe_reset();
select pg_temp.probe_old(20, 'place', gen_random_uuid(), 'elsewhere', 'bbbbbbbb-0c0c-0000-0000-000000000001');
set local role service_role;
select count(*) filter (where target_id = 'eeeeeeee-0c0c-0000-0000-000000000005') as stale,
       count(*) filter (where target_id = 'cccccccc-0c0c-0000-0000-000000000003') as reno
  from public.geocodes_claim_for_import();
reset role;
select geocoded_location is distinct from public.geocode_key(address, city, state) as still_stale
  from public.organization_places where id = 'cccccccc-0c0c-0000-0000-000000000003';

\echo ''
\echo '== 23. the event form may give a state; without one it is kept (expect NV, NV, then OR | 3) =='
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values ('aaaaaaaa-0c0c-0000-0000-000000000002', 'mentor', 'active', 'Admin', '19990000c0d', '1980-01-01', 'T1–T6', 'CA', 'Davis', true);
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.save_event(null, null, 'Probe host', 'Given a state', '', now() + interval '1 day', null,
                         'in_person', '1 Virginia St', 'Reno', null, null, 'nv') as given \gset
reset role;
select state from public.events where id = :'given';
set local role authenticated;
select public.save_event(:'given', null, 'Probe host', 'Given a state', '', now() + interval '1 day', null,
                         'in_person', '1 Virginia St', 'Reno', null, null) is not null as ok;
reset role;
select state from public.events where id = :'given';
set local role authenticated;
select public.save_event_series(null, 'Probe host', 'Weekly in Portland', '', now() + interval '1 day', null,
                                'in_person', '1 Main St', 'Portland', null, null, 'week', 1, null, 3, 'OR')
  as first_date \gset
reset role;
select min(e.state) as state, count(*) as dates
  from public.events e
 where e.series_id = (select series_id from public.events where id = :'first_date')
   and e.state = 'OR';

\echo ''
\echo '== 24. a 52-date series at one address: one claim, one request, every date placed =='
\echo '   expect: 1 claimed, then t, t, then 52 placed | 1 request logged | 0 queued, then 0 claimed'
delete from private.geocode_lookups;
delete from private.geocode_queue;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0c0c-0000-0000-000000000002","role":"authenticated"}', true) is not null as ok;
insert into public.events (title, start_time, location, city, state, event_format, host_name)
select 'Weekly at the pool', now() + (i || ' weeks')::interval, '5 Pool Rd', 'Probeburg', 'CA', 'in_person', 'Probe host'
  from generate_series(1, 52) i;
set local role service_role;
create temporary table probe_series_claim on commit drop as
select * from public.geocodes_claim_for_import();
select count(*) as claimed from probe_series_claim;
select public.geocode_done(c.kind, c.target_id, c.query, 38.55, -121.73, 'exact', null) as written
  from probe_series_claim c;
-- A runner reusing its answer for another date asks nothing new.
select public.geocode_done('event', e.id, '5 Pool Rd, Probeburg, CA', 38.55, -121.73, 'exact', null) as reused
  from public.events e
 where e.title = 'Weekly at the pool' and e.id not in (select target_id from probe_series_claim)
 order by e.start_time limit 1;
reset role;
select (select count(*) from public.events where title = 'Weekly at the pool'
          and geocoded_location = '5 Pool Rd, Probeburg, CA' and latitude = 38.55) as placed,
       (select count(*) from private.geocode_lookups where query = '5 Pool Rd, Probeburg, CA') as requests,
       (select count(*) from private.geocode_queue q join public.events e on e.id = q.target_id
         where e.title = 'Weekly at the pool') as queued;
update private.geocode_lookups set asked_at = clock_timestamp() - interval '2 seconds';
set local role service_role;
select count(*) as claimed_again from public.geocodes_claim_for_import();
reset role;

\echo ''
\echo '== 25. an exact answer far from its own city is stored approximate; near, exact (expect approximate | exact) =='
insert into public.city_places (city_key, state, latitude, longitude, settlement)
values ('probe pool town', 'CA', 38.55, -121.73, true)
on conflict (city_key, state) do update set latitude = excluded.latitude, longitude = excluded.longitude;
insert into public.events (id, title, start_time, location, city, state, event_format, host_name) values
  ('eeeeeeee-0c0c-0000-0000-000000000021', 'Far answer', now() + interval '1 day', '1 Far Rd', 'Probe Pool Town', 'CA', 'in_person', 'Probe host'),
  ('eeeeeeee-0c0c-0000-0000-000000000022', 'Near answer', now() + interval '1 day', '2 Near Rd', 'Probe Pool Town', 'CA', 'in_person', 'Probe host');
set local role service_role;
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000021', '1 Far Rd, Probe Pool Town, CA',
                           32.7157, -117.1611, 'exact', null) is not null as ok;
select public.geocode_done('event', 'eeeeeeee-0c0c-0000-0000-000000000022', '2 Near Rd, Probe Pool Town, CA',
                           38.56, -121.74, 'exact', null) is not null as ok;
reset role;
select (select location_precision from public.events where id = 'eeeeeeee-0c0c-0000-0000-000000000021') as far,
       (select location_precision from public.events where id = 'eeeeeeee-0c0c-0000-0000-000000000022') as near;

rollback;

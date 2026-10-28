-- ============================================================================
-- ParaCliffHangers' meetups and gyms (20261028300000)
-- ============================================================================
-- The migration run again on the club as it was: its reader's feed is
-- registered, Adaptive Rec Hub leaves ParaCliffHangers out and its copies
-- still to come go (a started one and other hosts' stay), and its nineteen
-- gyms are placed, paused ones not, the directory's city untouched, with one
-- Geocode run asked for. Run twice, it adds nothing.
--
-- Includes the migration itself, so it is run with the folder mounted:
--   docker run --rm -i --network host -e PGPASSWORD=postgres -v "$PWD/supabase:/s:ro" \
--     postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f /s/tests/paracliffhangers-meetups.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- The club as it was before the migration.
delete from public.data_feeds where feed_type = 'paracliffhangers-meetups';
update public.data_feeds set options = options - 'exclude_host'
 where feed_type = 'adaptiverechub-events';
delete from public.organization_places op using public.organizations o
 where o.id = op.organization_id and o.short_code = 'PCH';
insert into public.events (feed_id, external_id, title, start_time, location, host_name)
select f.id, v.external_id, v.title, now() + v.starts, 'Pacific Pipe, Oakland, CA', v.host
  from public.data_feeds f
 cross join (values
   ('probe-pch-later', 'Rock Climbing Meetups', interval '20 days', 'ParaCliffHangers – Pacific Pipe'),
   ('probe-pch-started', 'Climbing Meetup', interval '-1 hour', 'ParaCliffHangers – Diablo Rock Gym'),
   ('probe-borp-later', 'Open Gym Program', interval '20 days', 'BORP Adaptive Sports')
 ) as v(external_id, title, starts, host)
 where f.feed_type = 'adaptiverechub-events';
delete from private.geocode_queue;
delete from vault.secrets where name in ('geocode_github_repo', 'geocode_github_token');
select vault.create_secret('probe-owner/probe-repo', 'geocode_github_repo') is not null as ok;
select vault.create_secret('github_pat_probe', 'geocode_github_token') is not null as ok;
select set_config('club.geocode_sent', '', true) is not null as ok;
create temporary view probe_sent as
select count(*) as sent from net.http_request_queue
 where url = 'https://api.github.com/repos/probe-owner/probe-repo/actions/workflows/geocode.yml/dispatches';

\echo ''
\echo '== 0. before: three probe events, no ParaCliffHangers place (expect 3 | 0) =='
select (select count(*) from public.events where external_id like 'probe-%') as events,
       (select count(*) from public.organization_places op join public.organizations o
          on o.id = op.organization_id where o.short_code = 'PCH') as places;

\echo ''
\echo '== 1. the migration (expect ALTER TABLE x2, INSERT 0 1, UPDATE 1, DELETE 1, INSERT 0 19) =='
\ir ../migrations/20261028300000_paracliffhangers_meetups_and_gyms.sql

\echo ''
\echo '== 2. the feed, for ParaCliffHangers (expect paracliffhangers-meetups | PCH | 92 | t) =='
select f.feed_type, o.short_code, f.options ->> 'days' as days, f.is_active
  from public.data_feeds f join public.organizations o on o.id = f.organization_id
 where f.feed_url = 'https://www.paracliffhangers.org/indoor';

\echo ''
\echo '== 3. Adaptive Rec Hub leaves it out (expect ^paracliffhangers) =='
select options ->> 'exclude_host' as exclude_host
  from public.data_feeds where feed_type = 'adaptiverechub-events';

\echo ''
\echo '== 4. its copy still to come is gone; the started one and BORP''s stay (expect probe-borp-later, probe-pch-started) =='
select external_id from public.events where external_id like 'probe-%' order by external_id;

\echo ''
\echo '== 5. nineteen gyms, Berkeley first, Arlington last, labelled with the city (expect 19 | Berkeley Ironworks | Berkeley | Dyno Gym | Arlington, TX) =='
select count(*) as places,
       max(op.address) filter (where op.position = 0) as main,
       max(op.label) filter (where op.position = 0) as main_label,
       max(op.address) filter (where op.position = 18) as last,
       max(op.city || ', ' || op.state) filter (where op.position = 18) as last_town
  from public.organization_places op join public.organizations o on o.id = op.organization_id
 where o.short_code = 'PCH';

\echo ''
\echo '== 6. one place for Mesa Rim Mission Valley, none for the paused gyms (expect 1 | 0) =='
select count(*) filter (where op.address = 'Mesa Rim Mission Valley') as mission_valley,
       count(*) filter (where op.address like 'Gravity Vault%' or op.city in ('Brick', 'Flemington')) as paused
  from public.organization_places op join public.organizations o on o.id = op.organization_id
 where o.short_code = 'PCH';

\echo ''
\echo '== 7. the directory keeps its own city and no state (expect Bay Area | null) =='
select city, coalesce(state, 'null') as state from public.organizations where short_code = 'PCH';

\echo ''
\echo '== 8. each gym queued for a lookup, one Geocode run asked for (expect 19 | 1) =='
select (select count(*) from private.geocode_queue where kind = 'place') as queued,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 9. run again, nothing more (expect INSERT 0 0 twice, then 1 | 19) =='
\ir ../migrations/20261028300000_paracliffhangers_meetups_and_gyms.sql
select (select count(*) from public.data_feeds where feed_type = 'paracliffhangers-meetups') as feeds,
       (select count(*) from public.organization_places op join public.organizations o
          on o.id = op.organization_id where o.short_code = 'PCH') as places;

\echo ''
\echo '== 10. a feed type with no reader is refused (expect ERROR: ... violates check constraint "data_feeds_feed_type_check") =='
savepoint unknown_type;
insert into public.data_feeds (name, feed_url, feed_type) values ('Probe', 'https://probe.test/', 'nobody-reads-this');
rollback to savepoint unknown_type;

rollback;

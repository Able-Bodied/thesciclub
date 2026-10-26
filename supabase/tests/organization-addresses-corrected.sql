-- ============================================================================
-- Organization addresses, corrected (20261026020000)
-- ============================================================================
-- The data migration run again on the places as they were: every changed
-- place is queued and one Geocode run asked for, in the same transaction;
-- run once more, against addresses that are no longer the expected ones, it
-- stops and changes nothing.
--
-- Includes the migration itself, so it is run with the folder mounted:
--   docker run --rm -i --network host -e PGPASSWORD=postgres -v "$PWD/supabase:/s:ro" \
--     postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f /s/tests/organization-addresses-corrected.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- The places as they were before the migration.
update public.organization_places op
   set address = v.was
  from (values
  ('BORP', 0, '3075 Adeline Street, Suite 200'),
  ('CIL', 0, '3075 Adeline Street, Suite 100'),
  ('TF', 0, '27811 Avenue Hopkins Unit 5'),
  ('NXS', 1, '6600 College Blvd. STE 315'),
  ('NXS', 4, '6601 Hillsborough Street, Suite 113'),
  ('BWPV', 0, '3801 Miranda Ave. Bldg. 7 Rm. E-118'),
  ('CHC', 0, '9596 Chesapeake Dr. Unit A'),
  ('ETC', 0, '2 Marina Boulevard, Fort Mason Center, Suite C385'),
  ('POSS', 0, '25455 Barton Rd., Suite 109A'),
  ('PVAC', 0, '5901 E. 7th Street Bldg. 150 Rm. R-204'),
  ('SVIL', 1, '7881 Church St., Ste.C'),
  ('TPS', 0, '764 Indigo Court, Unit A'),
  ('WLAX', 0, '3333 Camino Del Rio South, Suite 330'),
  ('RLA', 0, '7601 E. Imperial Hwy'),
  ('SHC', 0, '2020 Peachtree Road NW'),
  ('USTA', 1, '10000 USTA Boulevard'),
  ('CCAS', 1, '59265 CA-168'),
  ('USTA', 4, '640 8th Avenue'),
  ('SRA', 3, '7600 County Line Road')
  ) as v(short_code, position, was)
  join public.organizations o on o.short_code = v.short_code
 where op.organization_id = o.id and op.position = v.position;
delete from private.geocode_queue;
delete from vault.secrets where name in ('geocode_github_repo', 'geocode_github_token');
select vault.create_secret('probe-owner/probe-repo', 'geocode_github_repo') is not null as ok;
select vault.create_secret('github_pat_probe', 'geocode_github_token') is not null as ok;
select set_config('club.geocode_sent', '', true) is not null as ok;
create temporary view probe_sent as
select count(*) as sent from net.http_request_queue
 where url = 'https://api.github.com/repos/probe-owner/probe-repo/actions/workflows/geocode.yml/dispatches';

\echo ''
\echo '== 1. the migration (expect DO) =='
\ir ../migrations/20261026020000_organization_addresses_corrected.sql

\echo ''
\echo '== 2. nineteen places queued, one Geocode run asked for (expect 19 | 1) =='
select (select count(*) from private.geocode_queue where kind = 'place') as queued,
       (select sent from probe_sent) as sent;

\echo ''
\echo '== 3. what they read now (expect 3075 Adeline Street | Shepherd Center | 11 Times Square) =='
select (select op.address from public.organization_places op join public.organizations o on o.id = op.organization_id
         where o.short_code = 'BORP' and op.position = 0) as borp,
       (select op.address from public.organization_places op join public.organizations o on o.id = op.organization_id
         where o.short_code = 'SHC' and op.position = 0) as shepherd,
       (select op.address from public.organization_places op join public.organizations o on o.id = op.organization_id
         where o.short_code = 'USTA' and op.position = 4) as usta;

\echo ''
\echo '== 4. run against changed data, it stops (expect ERROR: No BORP place 0 with the address ...) =='
savepoint again;
\ir ../migrations/20261026020000_organization_addresses_corrected.sql
rollback to savepoint again;

rollback;

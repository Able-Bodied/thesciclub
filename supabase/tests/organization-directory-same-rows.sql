-- ============================================================================
-- The directory reads its places once (20261105010000)
-- ============================================================================
-- The app's directory read, as PostgREST sends it, from the view and from
-- the table with embedded places (the read until now), compared as each
-- reader: nobody, a member, an org admin, an administrator, a newcomer with
-- no profile, a paused member, a removed member, a member who blocked
-- another and the member they blocked. Then the view's own settings and
-- grants, and how much it reads.
--
-- Probe rows: an organization with places saved out of order, one with
-- none, and one removed.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres \
--     -f - < supabase/tests/organization-directory-same-rows.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.organizations (id, short_code, name, city, state, description) values
  ('0d000000-1105-0000-0000-000000000001', 'PDA', 'Probe Directory Places', 'Probe City', 'CA', 'Three places, saved out of order.'),
  ('0d000000-1105-0000-0000-000000000002', 'PDB', 'Probe Directory Bare', null, null, 'No places.'),
  ('0d000000-1105-0000-0000-000000000003', 'PDC', 'Probe Directory Removed', 'Probe City', 'CA', 'Removed.');
update public.organizations set removed_at = now() where id = '0d000000-1105-0000-0000-000000000003';
insert into public.organization_places (organization_id, position, label, city, state, note, url) values
  ('0d000000-1105-0000-0000-000000000001', 2, 'Third', 'Probe C', 'CA', 'Ask for Sam.', 'https://probe.test/c'),
  ('0d000000-1105-0000-0000-000000000001', 0, null, 'Probe A', 'CA', null, null),
  ('0d000000-1105-0000-0000-000000000001', 1, 'Second', 'Probe B', 'NV', null, 'https://probe.test/b'),
  ('0d000000-1105-0000-0000-000000000003', 0, null, 'Probe Gone', 'CA', null, null);

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('a0000000-1105-0000-0000-000000000001', 'peer', 'active',    'Member',    '19991105001', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1105-0000-0000-000000000002', 'peer', 'active',    'Org admin', '19991105002', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1105-0000-0000-000000000003', 'peer', 'active',    'Admin',     '19991105003', '1980-01-01', 'T1–T6', 'CA', true),
  ('a0000000-1105-0000-0000-000000000004', 'peer', 'suspended', 'Paused',    '19991105004', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1105-0000-0000-000000000005', 'peer', 'removed',   'Removed',   '19991105005', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1105-0000-0000-000000000006', 'peer', 'active',    'Blocker',   '19991105006', '1980-01-01', 'T1–T6', 'CA', false),
  ('a0000000-1105-0000-0000-000000000007', 'peer', 'active',    'Blocked',   '19991105007', '1980-01-01', 'T1–T6', 'CA', false);
insert into public.organization_representatives (organization_id, member_id) values
  ('0d000000-1105-0000-0000-000000000001', 'a0000000-1105-0000-0000-000000000002');
insert into public.member_blocks (blocker_id, blocked_id) values
  ('a0000000-1105-0000-0000-000000000006', 'a0000000-1105-0000-0000-000000000007');

-- The two reads, as PostgREST builds them for organizations.ts.
create function pg_temp.embedded() returns jsonb language sql as $$
  WITH pgrst_source AS ( SELECT "public"."organizations"."id", "public"."organizations"."short_code", "public"."organizations"."name", "public"."organizations"."city", "public"."organizations"."description", "public"."organizations"."tags", "public"."organizations"."can_invite", "public"."organizations"."logo_path", "public"."organizations"."state", "public"."organizations"."category", "public"."organizations"."summary", "public"."organizations"."joins_need_approval", "public"."organizations"."collects_rsvps", "public"."organizations"."anonymous_reviews", COALESCE( "organizations_organization_places_1"."organizations_organization_places_1", '[]') AS "organization_places" FROM "public"."organizations" LEFT JOIN LATERAL ( SELECT json_agg("organizations_organization_places_1")::jsonb AS "organizations_organization_places_1" FROM (SELECT "organization_places_1"."id", "organization_places_1"."position", "organization_places_1"."label", "organization_places_1"."address", "organization_places_1"."city", "organization_places_1"."state", "organization_places_1"."postal_code", "organization_places_1"."note", "organization_places_1"."url" FROM "public"."organization_places" AS "organization_places_1" WHERE "organization_places_1"."organization_id" = "public"."organizations"."id" LIMIT ALL OFFSET 0 ) AS "organizations_organization_places_1" ) AS "organizations_organization_places_1" ON true WHERE "public"."organizations"."removed_at" IS NULL ORDER BY "public"."organizations"."name" ASC, "public"."organizations"."id" ASC LIMIT 1000 OFFSET 0 )
  SELECT coalesce(json_agg(_postgrest_t), '[]')::jsonb FROM ( SELECT * FROM pgrst_source ) _postgrest_t
$$;
create function pg_temp.from_view() returns jsonb language sql as $$
  WITH pgrst_source AS ( SELECT "public"."organization_directory"."id", "public"."organization_directory"."short_code", "public"."organization_directory"."name", "public"."organization_directory"."city", "public"."organization_directory"."description", "public"."organization_directory"."tags", "public"."organization_directory"."can_invite", "public"."organization_directory"."logo_path", "public"."organization_directory"."state", "public"."organization_directory"."category", "public"."organization_directory"."summary", "public"."organization_directory"."joins_need_approval", "public"."organization_directory"."collects_rsvps", "public"."organization_directory"."anonymous_reviews", "public"."organization_directory"."organization_places" FROM "public"."organization_directory" WHERE "public"."organization_directory"."removed_at" IS NULL ORDER BY "public"."organization_directory"."name" ASC, "public"."organization_directory"."id" ASC LIMIT 1000 OFFSET 0 )
  SELECT coalesce(json_agg(_postgrest_t), '[]')::jsonb FROM ( SELECT * FROM pgrst_source ) _postgrest_t
$$;
-- Whether every organization not removed is there, whether any places are,
-- the probe organization's places in order, whether the removed one or the
-- bare one's places show, and whether the two reads are the same.
create function pg_temp.compare()
returns table (all_orgs boolean, any_places boolean, probe_places text, removed_shown boolean, bare_places text, same boolean)
language sql as $$
  select jsonb_array_length(v) = (select count(*) from public.organizations where removed_at is null),
         exists (select 1 from jsonb_array_elements(v) o where jsonb_array_length(o -> 'organization_places') > 0),
         (select string_agg(coalesce(p ->> 'label', '-'), ',' order by n) from jsonb_array_elements(v) o, jsonb_array_elements(o -> 'organization_places') with ordinality p(p, n)
           where o ->> 'id' = '0d000000-1105-0000-0000-000000000001'),
         exists (select 1 from jsonb_array_elements(v) o where o ->> 'id' = '0d000000-1105-0000-0000-000000000003'),
         (select (o -> 'organization_places')::text from jsonb_array_elements(v) o where o ->> 'id' = '0d000000-1105-0000-0000-000000000002'),
         v = e
    from (select pg_temp.from_view() v, pg_temp.embedded() e) r
$$;

\echo '== 1. nobody (expect: t | f | (null) | f | [] | t) =='
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 2. a member (expect: t | t | -,Second,Third | f | [] | t) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000001","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 3. an org admin (expect: as 2) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000002","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 4. an administrator (expect: as 2) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000003","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 5. signed in with no profile yet (expect: as 1) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-0000000000ff","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 6. a paused member, who reads no places (expect: as 1) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000004","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 7. a removed member (expect: as 1) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000005","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 8. a member who blocked another (expect: as 2) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000006","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 9. the member they blocked (expect: as 2) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000007","role":"authenticated"}', true) is null as claims_unset;
select * from pg_temp.compare();
reset role;

\echo ''
\echo '== 10. the view reads as its reader, behind a barrier (expect: t t) =='
select 'security_invoker=true' = any(reloptions) as invoker, 'security_barrier=true' = any(reloptions) as barrier
  from pg_class where oid = 'public.organization_directory'::regclass;

\echo ''
\echo '== 11. anon and authenticated may only read it (expect 0 rows) =='
select r.rolname, p.privilege
  from (values ('anon'), ('authenticated')) as r(rolname)
 cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(privilege)
 where has_table_privilege(r.rolname, 'public.organization_directory', p.privilege);

\echo ''
\echo '== 12. a write through it is refused (expect ERROR:  cannot update view "organization_directory") =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000003","role":"authenticated"}', true) is null as claims_unset;
savepoint write_refused;
\set ON_ERROR_STOP off
update public.organization_directory set name = 'Rewritten' where id = '0d000000-1105-0000-0000-000000000001';
\set ON_ERROR_STOP on
rollback to savepoint write_refused;
reset role;

\echo ''
\echo '== 13. what each read costs a member (expect: view reads under a fifth of the embedded read) =='
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-1105-0000-0000-000000000001","role":"authenticated"}', true) is null as claims_unset;
create function pg_temp.buffers(q text) returns int language plpgsql as $$
declare plan json;
begin
  execute 'explain (analyze, buffers, format json) ' || q into plan;
  return (plan -> 0 -> 'Plan' ->> 'Shared Hit Blocks')::int + (plan -> 0 -> 'Plan' ->> 'Shared Read Blocks')::int;
end $$;
select pg_temp.buffers('select pg_temp.embedded()') as embedded_buffers,
       pg_temp.buffers('select pg_temp.from_view()') as view_buffers,
       pg_temp.buffers('select pg_temp.from_view()') * 5 < pg_temp.buffers('select pg_temp.embedded()') as under_a_fifth;
reset role;

rollback;

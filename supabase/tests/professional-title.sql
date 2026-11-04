-- ============================================================================
-- Probe: a professional names their profession (20261104100000)
-- ============================================================================
-- Every check prints PASS or raises FAIL; a refusal prints its SQLSTATE.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/professional-title.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

-- p professional, q a member, s a paused professional.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1105-0000-0000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'pro-' || x || '@probe.test', now()
  from unnest(array['a', 'b', 'c']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select ('aaaaaaaa-1105-0000-0000-00000000000' || x)::uuid, 'peer', 'active',
       'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', false
  from unnest(array['a', 'b', 'c']) x;
insert into public.club_partners (member_id, title) values
  ('aaaaaaaa-1105-0000-0000-00000000000a', 'Physical therapist'),
  ('aaaaaaaa-1105-0000-0000-00000000000c', 'Peer support lead');
update public.members set status = 'suspended' where id = 'aaaaaaaa-1105-0000-0000-00000000000c';

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.as_member(member text, statement text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', ('aaaaaaaa-1105-0000-0000-00000000000' || member), 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  reset role;
exception when others then
  reset role;
  raise;
end $$;
create function pg_temp.refused_as(member text, statement text, expected text) returns void language plpgsql as $$
begin
  perform pg_temp.as_member(member, statement);
  raise exception 'FAIL: accepted as % %', member, statement;
exception when others then
  if sqlstate = expected then raise notice 'PASS: refused (%) as % %', sqlstate, member, left(statement, 80); return; end if;
  raise;
end $$;
create function pg_temp.title_of(who text) returns text language sql as $$
  select title from public.club_partners where member_id = ('aaaaaaaa-1105-0000-0000-00000000000' || who)::uuid;
$$;

\echo '== who may =='
select pg_temp.refused_as('b', $q$select public.set_my_professional_title('Doctor')$q$, '42501');
select pg_temp.check_true(not exists (select 1 from public.club_partners where member_id = 'aaaaaaaa-1105-0000-0000-00000000000b'),
  'a member is not made a professional by naming a profession');
select pg_temp.refused_as('c', $q$select public.set_my_professional_title('Doctor')$q$, '42501');
select pg_temp.check_true(pg_temp.title_of('c') = 'Peer support lead', 'a paused professional''s stays');
select pg_temp.refused_as('a', $q$select public.set_my_professional_title(' x ')$q$, '22023');
select pg_temp.refused_as('a', $q$select public.set_my_professional_title(repeat('x', 81))$q$, '22023');

\echo '== naming it =='
select pg_temp.as_member('a', $q$select public.set_my_professional_title('  Occupational therapist, SCI-FIT  ')$q$);
select pg_temp.check_true(pg_temp.title_of('a') = 'Occupational therapist, SCI-FIT', 'their own, trimmed');
select pg_temp.check_true(pg_temp.title_of('c') = 'Peer support lead', 'and nobody else''s');

\echo '== done: every line above PASS =='
rollback;

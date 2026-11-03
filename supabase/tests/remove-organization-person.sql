-- ============================================================================
-- Probe: an org admin removes someone (20261103090000)
-- ============================================================================
-- Every check prints PASS or raises FAIL; a refusal prints its SQLSTATE.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/remove-organization-person.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

-- a admin, b second admin, m mentor and member, n member, x outside.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1104-0000-0000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'remove-' || x || '@probe.test', now()
  from unnest(array['a', 'b', 'c', 'd', 'e']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select ('aaaaaaaa-1104-0000-0000-00000000000' || x)::uuid, 'peer', 'active',
       'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', false
  from unnest(array['a', 'b', 'c', 'd', 'e']) x;

insert into public.organizations (id, short_code, name, joins_need_approval)
values ('bbbbbbbb-1104-0000-0000-000000000001', 'RMVX', 'Probe Remove Org', false);
insert into public.organization_representatives (organization_id, member_id) values
  ('bbbbbbbb-1104-0000-0000-000000000001', 'aaaaaaaa-1104-0000-0000-00000000000a'),
  ('bbbbbbbb-1104-0000-0000-000000000001', 'aaaaaaaa-1104-0000-0000-00000000000b');
insert into public.organization_mentors (organization_id, member_id) values
  ('bbbbbbbb-1104-0000-0000-000000000001', 'aaaaaaaa-1104-0000-0000-00000000000c');
insert into public.organization_members (organization_id, member_id, joined_via) values
  ('bbbbbbbb-1104-0000-0000-000000000001', 'aaaaaaaa-1104-0000-0000-00000000000c', 'join'),
  ('bbbbbbbb-1104-0000-0000-000000000001', 'aaaaaaaa-1104-0000-0000-00000000000d', 'join');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.as_member(member text, statement text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', ('aaaaaaaa-1104-0000-0000-00000000000' || member), 'role', 'authenticated')::text, true);
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
create function pg_temp.remove(who text) returns text language sql as $$
  select 'select public.remove_organization_person(''bbbbbbbb-1104-0000-0000-000000000001'', ''aaaaaaaa-1104-0000-0000-00000000000' || who || ''')';
$$;

\echo '== who may =='
select pg_temp.refused_as('d', pg_temp.remove('c'), '42501');
select pg_temp.refused_as('e', pg_temp.remove('d'), '42501');
select pg_temp.refused_as('a', pg_temp.remove('a'), '22023');
select pg_temp.refused_as('a', pg_temp.remove('b'), '42501');

\echo '== removing =='
select pg_temp.check_true(
  exists (select 1 from public.chat_thread_members tm join public.chat_threads t on t.id = tm.thread_id
           where t.organization_id = 'bbbbbbbb-1104-0000-0000-000000000001'
             and tm.member_id = 'aaaaaaaa-1104-0000-0000-00000000000d'),
  'the member is in its group chat before');
select pg_temp.as_member('a', pg_temp.remove('d'));
select pg_temp.check_true(
  (select left_at is not null from public.organization_members
    where organization_id = 'bbbbbbbb-1104-0000-0000-000000000001' and member_id = 'aaaaaaaa-1104-0000-0000-00000000000d'),
  'the member has left');
select pg_temp.check_true(
  not exists (select 1 from public.chat_thread_members tm join public.chat_threads t on t.id = tm.thread_id
               where t.organization_id = 'bbbbbbbb-1104-0000-0000-000000000001'
                 and tm.member_id = 'aaaaaaaa-1104-0000-0000-00000000000d'),
  'and is out of its group chat');

select pg_temp.as_member('a', pg_temp.remove('c'));
select pg_temp.check_true(
  not exists (select 1 from public.organization_mentors
               where organization_id = 'bbbbbbbb-1104-0000-0000-000000000001' and member_id = 'aaaaaaaa-1104-0000-0000-00000000000c')
  and (select left_at is not null from public.organization_members
        where organization_id = 'bbbbbbbb-1104-0000-0000-000000000001' and member_id = 'aaaaaaaa-1104-0000-0000-00000000000c'),
  'the mentor is a mentor no more, and has left');
select pg_temp.check_true(
  (select type from public.members where id = 'aaaaaaaa-1104-0000-0000-00000000000c') = 'peer',
  'and is a peer again');
select pg_temp.check_true(
  (select count(*) from private.organization_people_ids('bbbbbbbb-1104-0000-0000-000000000001')) = 2,
  'only the two org admins are left in its people');

\echo '== done: every line above PASS =='
rollback;

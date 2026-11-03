-- ============================================================================
-- Probe: an organization's mentors are its members (20261103120000)
-- ============================================================================
-- Every check prints PASS or raises FAIL.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/mentor-is-a-member.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

-- a org admin, b and c to be mentors (c already a member), d a member.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1105-0000-0000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'mentor-' || x || '@probe.test', now()
  from unnest(array['a', 'b', 'c', 'd']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select ('aaaaaaaa-1105-0000-0000-00000000000' || x)::uuid, 'peer', 'active',
       'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', false
  from unnest(array['a', 'b', 'c', 'd']) x;
insert into public.organizations (id, short_code, name, joins_need_approval)
values ('bbbbbbbb-1105-0000-0000-000000000001', 'MNTX', 'Probe Mentor Org', true);
insert into public.organization_representatives (organization_id, member_id)
values ('bbbbbbbb-1105-0000-0000-000000000001', 'aaaaaaaa-1105-0000-0000-00000000000a');
insert into public.organization_members (organization_id, member_id, joined_via, reviewed_at) values
  ('bbbbbbbb-1105-0000-0000-000000000001', 'aaaaaaaa-1105-0000-0000-00000000000c', 'join', now()),
  ('bbbbbbbb-1105-0000-0000-000000000001', 'aaaaaaaa-1105-0000-0000-00000000000d', 'join', now());

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.as_a(statement text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-1105-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  reset role;
exception when others then
  reset role;
  raise;
end $$;
create function pg_temp.membership(who text) returns text language sql as $$
  select coalesce((select joined_via || ':' || (left_at is null)::text || ':' || (reviewed_at is not null)::text
                     from public.organization_members
                    where organization_id = 'bbbbbbbb-1105-0000-0000-000000000001'
                      and member_id = ('aaaaaaaa-1105-0000-0000-00000000000' || who)::uuid), 'none');
$$;
create function pg_temp.in_chat(who text) returns boolean language sql as $$
  select exists (select 1 from public.chat_thread_members tm join public.chat_threads t on t.id = tm.thread_id
                  where t.organization_id = 'bbbbbbbb-1105-0000-0000-000000000001'
                    and tm.member_id = ('aaaaaaaa-1105-0000-0000-00000000000' || who)::uuid);
$$;

\echo '== making mentors =='
select pg_temp.check_true(pg_temp.membership('b') = 'none', 'b is not a member before');
select pg_temp.as_a('select public.grant_mentor(''bbbbbbbb-1105-0000-0000-000000000001'', ''aaaaaaaa-1105-0000-0000-00000000000b'')');
select pg_temp.check_true(pg_temp.membership('b') = 'mentor:true:true',
  'a new mentor is a member, approved though joins need approval');
select pg_temp.check_true(pg_temp.in_chat('b'), 'and is in its group chat');
select pg_temp.as_a('select public.grant_mentor(''bbbbbbbb-1105-0000-0000-000000000001'', ''aaaaaaaa-1105-0000-0000-00000000000c'')');
select pg_temp.check_true(pg_temp.membership('c') = 'join:true:true', 'a member made mentor keeps how they joined');

\echo '== stopping =='
select pg_temp.as_a('select public.revoke_mentor(''bbbbbbbb-1105-0000-0000-000000000001'', ''aaaaaaaa-1105-0000-0000-00000000000b'')');
select pg_temp.check_true(pg_temp.membership('b') = 'mentor:false:true', 'stopping ends a membership that came with it');
select pg_temp.check_true(not pg_temp.in_chat('b'), 'and takes them out of the chat');
select pg_temp.as_a('select public.revoke_mentor(''bbbbbbbb-1105-0000-0000-000000000001'', ''aaaaaaaa-1105-0000-0000-00000000000c'')');
select pg_temp.check_true(pg_temp.membership('c') = 'join:true:true', 'one who joined stays a member');

\echo '== mentors made before =='
delete from public.organization_members
 where organization_id = 'bbbbbbbb-1105-0000-0000-000000000001'
   and member_id = 'aaaaaaaa-1105-0000-0000-00000000000d';
alter table public.organization_mentors disable trigger organization_mentors_are_members;
insert into public.organization_mentors (organization_id, member_id)
values ('bbbbbbbb-1105-0000-0000-000000000001', 'aaaaaaaa-1105-0000-0000-00000000000d');
alter table public.organization_mentors enable trigger organization_mentors_are_members;
select private.organization_mentor_is_a_member(g.organization_id, g.member_id)
  from public.organization_mentors g where g.organization_id = 'bbbbbbbb-1105-0000-0000-000000000001';
select pg_temp.check_true(pg_temp.membership('d') = 'mentor:true:true', 'the catch-up makes an older mentor a member');

\echo '== done: every line above PASS =='
rollback;

-- ============================================================================
-- Probe: a verified professional is made without a title (20261104160000)
-- ============================================================================
-- Every check prints PASS or raises FAIL; a refusal prints its SQLSTATE.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/verified-professional.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

-- a an administrator, p to be made one, q a member.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1109-0000-0000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'verified-' || x || '@probe.test', now()
  from unnest(array['a', 'b', 'c']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin)
select ('aaaaaaaa-1109-0000-0000-00000000000' || x)::uuid, 'peer', 'active',
       'Probe ' || x, '1980-01-01', 'T1–T6', 'CA', x = 'a'
  from unnest(array['a', 'b', 'c']) x;

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.as_member(member text, statement text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', ('aaaaaaaa-1109-0000-0000-00000000000' || member), 'role', 'authenticated')::text, true);
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
  select coalesce(title, '(none)') from public.club_partners
   where member_id = ('aaaaaaaa-1109-0000-0000-00000000000' || who)::uuid;
$$;

\echo '== making one =='
select pg_temp.refused_as('c', $q$select public.admin_set_partner('aaaaaaaa-1109-0000-0000-00000000000b', null)$q$, '42501');
select pg_temp.as_member('a', $q$select public.admin_set_partner('aaaaaaaa-1109-0000-0000-00000000000b', null)$q$);
select pg_temp.check_true(pg_temp.title_of('b') = '(none)', 'an administrator makes one with no title');
select pg_temp.check_true(private.is_partner('aaaaaaaa-1109-0000-0000-00000000000b'), 'and they are one');

\echo '== they write it =='
select pg_temp.as_member('b', $q$select public.set_my_professional_title('Physical therapist')$q$);
select pg_temp.check_true(pg_temp.title_of('b') = 'Physical therapist', 'they write their profession on Me');
select pg_temp.as_member('a', $q$select public.admin_set_partner('aaaaaaaa-1109-0000-0000-00000000000b', '  ')$q$);
select pg_temp.check_true(pg_temp.title_of('b') = 'Physical therapist', 'making them one again keeps it');

\echo '== an administrator can still change it =='
select pg_temp.refused_as('a', $q$select public.admin_set_partner('aaaaaaaa-1109-0000-0000-00000000000b', 'x')$q$, '22023');
select pg_temp.as_member('a', $q$select public.admin_set_partner('aaaaaaaa-1109-0000-0000-00000000000b', ' Peer support, SCVMC ')$q$);
select pg_temp.check_true(pg_temp.title_of('b') = 'Peer support, SCVMC', 'trimmed');
select pg_temp.refused_as('c', $q$select public.set_my_professional_title('Doctor')$q$, '42501');

\echo '== done: every line above PASS =='
rollback;

-- ============================================================================
-- Going and interested counts: the shortcut changes no number
-- (20261103120000)
-- ============================================================================
-- For each person, every row of event_rsvp_counts is compared with the view
-- as it was before (20261022180000), rebuilt here as a temporary view run the
-- same way. Any difference, either way, fails. The probe's own four events are
-- also printed, against the expect line, so a check that sees nothing cannot
-- pass.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/rsvp-counts-shortcut.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

-- Today's view, before the shortcut: can_see_event() on every row.
create temp view probe_counts_before with (security_barrier = true) as
select
  event_id,
  count(*) filter (where status = 'going')::int as going_count,
  count(*) filter (where status = 'interested')::int as interested_count
from public.event_rsvps
where (select public.is_member())
  and public.can_see_event(event_id)
group by event_id;
grant select on probe_counts_before to authenticated;

-- Ordinary, admin, follower, group member, RSVP'd only, removed.
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1203-0000-0000-000000000001', 'peer', 'active',  'Probe ordinary', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1203-0000-0000-000000000002', 'peer', 'active',  'Probe admin',    '1980-01-01', 'T1–T6', 'CA', true),
  ('aaaaaaaa-1203-0000-0000-000000000003', 'peer', 'active',  'Probe follower', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1203-0000-0000-000000000004', 'peer', 'active',  'Probe grouped',  '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1203-0000-0000-000000000005', 'peer', 'active',  'Probe answered', '1980-01-01', 'T1–T6', 'CA', false),
  ('aaaaaaaa-1203-0000-0000-000000000006', 'peer', 'removed', 'Probe removed',  '1980-01-01', 'T1–T6', 'CA', false);

insert into public.organizations (id, short_code, name, joins_need_approval)
values ('bbbbbbbb-1203-0000-0000-000000000001', 'PRBC', 'Probe Counts Org', false);
insert into public.organization_follows (member_id, organization_id)
values ('aaaaaaaa-1203-0000-0000-000000000003', 'bbbbbbbb-1203-0000-0000-000000000001');

insert into public.chat_threads (id, kind, name, created_by)
values ('cccccccc-1203-0000-0000-000000000001', 'group', 'Probe audience', 'aaaaaaaa-1203-0000-0000-000000000004');
insert into public.chat_thread_members (thread_id, member_id)
values ('cccccccc-1203-0000-0000-000000000001', 'aaaaaaaa-1203-0000-0000-000000000004');

-- 'public' is stored as 'club' since 20261029110000, but the constraint still
-- allows it, so it is kept here past the trigger.
alter table public.events disable trigger event_audience_is_never_public;
insert into public.events (id, title, start_time, organization_id, audience) values
  ('dddddddd-1203-0000-0000-000000000001', 'Probe public',    now() + interval '3 days', 'bbbbbbbb-1203-0000-0000-000000000001', 'public'),
  ('dddddddd-1203-0000-0000-000000000002', 'Probe club',      now() + interval '3 days', 'bbbbbbbb-1203-0000-0000-000000000001', 'club'),
  ('dddddddd-1203-0000-0000-000000000003', 'Probe followers', now() + interval '3 days', 'bbbbbbbb-1203-0000-0000-000000000001', 'followers'),
  ('dddddddd-1203-0000-0000-000000000004', 'Probe groups',    now() + interval '3 days', 'bbbbbbbb-1203-0000-0000-000000000001', 'groups');
alter table public.events enable trigger event_audience_is_never_public;
insert into public.event_audience_groups (event_id, thread_id)
values ('dddddddd-1203-0000-0000-000000000004', 'cccccccc-1203-0000-0000-000000000001');

-- Nobody who sees followers or groups through the audience has said yes to
-- it, so each sighting below comes from one rule only.
insert into public.event_rsvps (event_id, member_id, status) values
  ('dddddddd-1203-0000-0000-000000000001', 'aaaaaaaa-1203-0000-0000-000000000001', 'going'),
  ('dddddddd-1203-0000-0000-000000000001', 'aaaaaaaa-1203-0000-0000-000000000003', 'interested'),
  ('dddddddd-1203-0000-0000-000000000002', 'aaaaaaaa-1203-0000-0000-000000000004', 'going'),
  ('dddddddd-1203-0000-0000-000000000003', 'aaaaaaaa-1203-0000-0000-000000000002', 'going'),
  ('dddddddd-1203-0000-0000-000000000003', 'aaaaaaaa-1203-0000-0000-000000000005', 'interested'),
  ('dddddddd-1203-0000-0000-000000000004', 'aaaaaaaa-1203-0000-0000-000000000002', 'going'),
  ('dddddddd-1203-0000-0000-000000000004', 'aaaaaaaa-1203-0000-0000-000000000005', 'interested');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- As `who`: rows that differ between the two views, rows in each, and the
-- probe's events as "audience going/interested", from the view under test.
create function pg_temp.compare(who uuid)
returns table (differ bigint, rows_now bigint, rows_before bigint, probe_events text)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  set local role authenticated;
  return query
    select
      (select count(*) from public.event_rsvp_counts n
         full join probe_counts_before b using (event_id)
        where n is null or b is null
           or (n.going_count, n.interested_count) is distinct from (b.going_count, b.interested_count)),
      (select count(*) from public.event_rsvp_counts),
      (select count(*) from probe_counts_before),
      (select coalesce(string_agg(e.audience || ' ' || c.going_count || '/' || c.interested_count, ', ' order by e.audience), 'none')
         from public.event_rsvp_counts c
         join public.events e on e.id = c.event_id
        where e.id::text like 'dddddddd-1203-%');
  reset role;
end $$;

create function pg_temp.check_person(label text, who uuid, expected text) returns void
language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.compare(who);
  raise notice '% got: differ %, rows % (before %), probe events: %',
    label, r.differ, r.rows_now, r.rows_before, r.probe_events;
  perform pg_temp.check_true(r.differ = 0 and r.rows_now = r.rows_before,
    label || ': same rows as before');
  perform pg_temp.check_true(r.probe_events = expected,
    label || ': probe events are ' || expected);
end $$;

\echo ''
\echo '== 0. the view keeps its barrier and its grants =='
\echo 'expect: PASS x3'
select pg_temp.check_true(
  (select 'security_barrier=true' = any (reloptions) from pg_class where oid = 'public.event_rsvp_counts'::regclass),
  'security_barrier is on');
select pg_temp.check_true(has_table_privilege('authenticated', 'public.event_rsvp_counts', 'select'),
  'members may select');
select pg_temp.check_true(not has_table_privilege('authenticated', 'public.event_rsvp_counts', 'insert'),
  'members may not insert');

\echo ''
\echo '== 1. an ordinary member: public and club only =='
\echo 'expect: differ 0; probe events: club 1/0, public 1/1'
select pg_temp.check_person('ordinary', 'aaaaaaaa-1203-0000-0000-000000000001', 'club 1/0, public 1/1');

\echo ''
\echo '== 2. an administrator: all four =='
\echo 'expect: differ 0; probe events: club 1/0, followers 1/1, groups 1/1, public 1/1'
select pg_temp.check_person('admin', 'aaaaaaaa-1203-0000-0000-000000000002', 'club 1/0, followers 1/1, groups 1/1, public 1/1');

\echo ''
\echo '== 3. a follower sees the follower-only event, not the groups one =='
\echo 'expect: differ 0; probe events: club 1/0, followers 1/1, public 1/1'
select pg_temp.check_person('follower', 'aaaaaaaa-1203-0000-0000-000000000003', 'club 1/0, followers 1/1, public 1/1');

\echo ''
\echo '== 4. a non-follower in the audience group sees the groups event, not the followers one =='
\echo 'expect: differ 0; probe events: club 1/0, groups 1/1, public 1/1'
select pg_temp.check_person('grouped', 'aaaaaaaa-1203-0000-0000-000000000004', 'club 1/0, groups 1/1, public 1/1');

\echo ''
\echo '== 5. a member who sees followers and groups events only because they said yes =='
\echo 'expect: differ 0; probe events: club 1/0, followers 1/1, groups 1/1, public 1/1'
select pg_temp.check_person('answered', 'aaaaaaaa-1203-0000-0000-000000000005', 'club 1/0, followers 1/1, groups 1/1, public 1/1');

\echo ''
\echo '== 6. non-members: a removed member, and an account with no member row =='
\echo 'expect: differ 0, rows 0 (before 0); probe events: none (twice)'
select pg_temp.check_person('removed', 'aaaaaaaa-1203-0000-0000-000000000006', 'none');
select pg_temp.check_person('no member row', 'aaaaaaaa-1203-0000-0000-000000000099', 'none');
select pg_temp.check_true((select rows_now = 0 from pg_temp.compare('aaaaaaaa-1203-0000-0000-000000000099')),
  'no member row: no counts at all');

\echo ''
\echo 'PASS: event_rsvp_counts unchanged for everybody'
rollback;

-- ============================================================================
-- Opening a topic writes only when something changes (20261104213000)
-- ============================================================================
-- Reopening a topic read this far, with no notification waiting, writes
-- nothing at all: no row version, no insert, update or delete in the read
-- rows, the notifications or the device rows. A waiting like or reaction
-- notification is still cleared by reopening; a newer post still moves the
-- position; a first visit still makes the row; a new device still adds its
-- rows. A paused or removed member, or a closed room, is still refused, and
-- the grants are unchanged.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/topic-read-writes-only-on-change.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('a0000000-1104-0002-0000-000000000001', 'peer', 'active',    'Ana', '19991104101', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-1104-0002-0000-000000000002', 'peer', 'active',    'Thd', '19991104102', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-1104-0002-0000-000000000003', 'peer', 'suspended', 'Sus', '19991104103', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-1104-0002-0000-000000000004', 'peer', 'removed',   'Rem', '19991104104', '1980-01-01', 'T1–T6', 'CA');
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-1104b-open',   'Probe 1104b open',   'For the probe.', 'Life', 9943, now()),
  ('probe-1104b-closed', 'Probe 1104b closed', 'For the probe.', 'Life', 9944, null);
insert into public.chat_topics (id, room_id, title, author_id) values
  ('11040002-0000-0000-0000-000000000001', 'probe-1104b-open',   'Thd asks', 'a0000000-1104-0002-0000-000000000002'),
  ('11040002-0000-0000-0000-000000000002', 'probe-1104b-closed', 'Closed',   'a0000000-1104-0002-0000-000000000002');
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
  ('11040002-0000-0000-0001-000000000001', '11040002-0000-0000-0000-000000000001', 'a0000000-1104-0002-0000-000000000002', 'First',  now() - interval '30 minutes'),
  ('11040002-0000-0000-0001-000000000002', '11040002-0000-0000-0000-000000000001', 'a0000000-1104-0002-0000-000000000002', 'Second', now() - interval '20 minutes'),
  ('11040002-0000-0000-0001-000000000003', '11040002-0000-0000-0000-000000000001', 'a0000000-1104-0002-0000-000000000002', 'Third',  now() - interval '10 minutes'),
  ('11040002-0000-0000-0001-000000000004', '11040002-0000-0000-0000-000000000002', 'a0000000-1104-0002-0000-000000000002', 'Closed', now() - interval '10 minutes');
delete from public.notifications where member_id = 'a0000000-1104-0002-0000-000000000001';

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- Rows inserted, updated or deleted so far in this transaction, in the three
-- tables a topic open can touch.
create function pg_temp.writes() returns bigint language sql as $$
  select coalesce(sum(n_tup_ins + n_tup_upd + n_tup_del), 0)::bigint
    from pg_stat_xact_user_tables
   where relid in ('public.chat_topic_reads'::regclass, 'public.notifications'::regclass,
                   'public.chat_post_view_devices'::regclass);
$$;

create function pg_temp.ana_row(out at tid, out read_at timestamptz) language sql as $$
  select ctid, last_read_at from public.chat_topic_reads
   where topic_id = '11040002-0000-0000-0000-000000000001' and member_id = 'a0000000-1104-0002-0000-000000000001';
$$;

create function pg_temp.open(member uuid, topic uuid, post uuid, device text default 'desktop') returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if device is null then
    perform public.chat_mark_topic_read_through(topic, post);
  else
    perform public.chat_mark_topic_read_through(topic, post, device);
  end if;
  reset role;
end $$;

create function pg_temp.ana_waiting() returns integer language sql as $$
  select count(*)::integer from public.notifications
   where member_id = 'a0000000-1104-0002-0000-000000000001'
     and topic_id = '11040002-0000-0000-0000-000000000001' and read_at is null;
$$;

do $$
declare
  ana constant uuid := 'a0000000-1104-0002-0000-000000000001';
  t constant uuid := '11040002-0000-0000-0000-000000000001';
  p1 constant uuid := '11040002-0000-0000-0001-000000000001';
  p2 constant uuid := '11040002-0000-0000-0001-000000000002';
  p3 constant uuid := '11040002-0000-0000-0001-000000000003';
  before record; after record; w bigint;
begin
  perform pg_temp.open(ana, t, p2);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.read_at = now() - interval '20 minutes',
    'a first visit makes the read row');
  perform pg_temp.check_true((select count(*) from public.chat_post_view_devices
     where member_id = ana and device = 'desktop') = 2, 'and its two device rows');

  -- Reopened, as the app does it, with nothing to clear.
  before := after; w := pg_temp.writes();
  perform pg_temp.open(ana, t, p2);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at and pg_temp.writes() = w,
    'reopening at the same post writes nothing at all (device version)');

  w := pg_temp.writes();
  perform pg_temp.open(ana, t, p2, null);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at and pg_temp.writes() = w,
    'reopening at the same post writes nothing at all (older version)');

  w := pg_temp.writes();
  perform pg_temp.open(ana, t, p1);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at and after.read_at = before.read_at and pg_temp.writes() = w,
    'an older post writes nothing');

  -- Somebody liked, then reacted: reopening clears each, without moving.
  insert into public.notifications (member_id, kind, tag, topic_id, post_id, actor_id)
  values (ana, 'like', 'probe-1104-like', t, p1, 'a0000000-1104-0002-0000-000000000002');
  perform pg_temp.check_true(pg_temp.ana_waiting() = 1, 'a like notification waits');
  perform pg_temp.open(ana, t, p2);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(pg_temp.ana_waiting() = 0 and after.read_at = before.read_at,
    'reopening clears the like notification, the position unmoved');
  insert into public.notifications (member_id, kind, tag, topic_id, post_id, actor_id)
  values (ana, 'reaction', 'probe-1104-reaction', t, p2, 'a0000000-1104-0002-0000-000000000002');
  perform pg_temp.open(ana, t, p1, null);
  perform pg_temp.check_true(pg_temp.ana_waiting() = 0,
    'reopening at an older post clears a reaction notification');

  -- Cleared, so the next reopen is quiet again.
  before := pg_temp.ana_row(); w := pg_temp.writes();
  perform pg_temp.open(ana, t, p2);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at and pg_temp.writes() = w,
    'and once cleared, reopening writes nothing again');

  -- Another device at the same place adds only its own device rows.
  w := pg_temp.writes();
  perform pg_temp.open(ana, t, p2, 'mobile');
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.at = before.at
    and (select count(*) from public.chat_post_view_devices where member_id = ana and device = 'mobile') = 2
    and pg_temp.writes() = w + 2,
    'a new device adds its two device rows and touches nothing else');

  perform pg_temp.open(ana, t, p3);
  after := pg_temp.ana_row();
  perform pg_temp.check_true(after.read_at = now() - interval '10 minutes' and after.at <> before.at,
    'a newer post moves the position');

  -- Refusals, as before.
  begin
    perform pg_temp.open('a0000000-1104-0002-0000-000000000003', t, p2);
    raise exception 'FAIL: a paused member marked a topic read';
  exception when sqlstate 'P0002' then raise notice 'PASS: a paused member is refused';
  end;
  begin
    perform pg_temp.open('a0000000-1104-0002-0000-000000000004', t, p2);
    raise exception 'FAIL: a removed member marked a topic read';
  exception when sqlstate 'P0002' then raise notice 'PASS: a removed member is refused';
  end;
  begin
    perform pg_temp.open(ana, '11040002-0000-0000-0000-000000000002', '11040002-0000-0000-0001-000000000004');
    raise exception 'FAIL: a closed room''s topic was marked read';
  exception when sqlstate 'P0002' then raise notice 'PASS: a closed room''s topic is refused';
  end;
  begin
    perform pg_temp.open(ana, t, '11040002-0000-0000-0001-000000000004');
    raise exception 'FAIL: a post from another topic was accepted';
  exception when sqlstate 'P0002' then raise notice 'PASS: a post from another topic is refused';
  end;
  begin
    perform pg_temp.open(ana, t, p2, 'tablet');
    raise exception 'FAIL: an unknown device was accepted';
  exception when sqlstate '22023' then raise notice 'PASS: an unknown device is refused';
  end;
  perform pg_temp.check_true(not exists (select 1 from public.chat_topic_reads
     where member_id in ('a0000000-1104-0002-0000-000000000003', 'a0000000-1104-0002-0000-000000000004')),
    'neither paused nor removed member has a read row');

  -- Same return and grants.
  perform pg_temp.check_true(
    (select bool_and(p.prorettype = 'void'::regtype
                     and has_function_privilege('authenticated', p.oid, 'execute')
                     and not has_function_privilege('anon', p.oid, 'execute'))
       from pg_proc p where p.proname = 'chat_mark_topic_read_through'
        and p.pronamespace = 'public'::regnamespace)
    and (select count(*) from pg_proc p where p.proname = 'chat_mark_topic_read_through'
          and p.pronamespace = 'public'::regnamespace) = 2,
    'both versions still return nothing, members may call them, signed-out visitors may not');
end $$;

rollback;

-- ============================================================================
-- Chat reads check membership once a query (20261029180000)
-- ============================================================================
-- Reading many rows of a chat table calls my_thread_ids() or
-- my_readable_room_ids() once per rule, not once a row, and never the old
-- per-row helpers. Posts take two: their rule reads topics through the topics
-- rule. Counted with the transaction's own function statistics.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-reads-run-once.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;
set local track_functions = 'all';

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('aaaaaaaa-2918-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990029180', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-2918-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990029181', '1980-01-01', 'T1–T6', 'CA');

-- Twenty conversations of two, ten messages each; a room with twenty topics.
insert into public.chat_threads (id, kind, name)
select ('29180000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'group', 'Probe ' || i
  from generate_series(1, 20) i;
insert into public.chat_thread_members (thread_id, member_id)
select t.id, m.id from public.chat_threads t, public.members m
 where t.name like 'Probe %' and m.phone in ('19990029180', '19990029181');
insert into public.chat_messages (thread_id, author_id, body)
select t.id, 'bbbbbbbb-2918-0000-0000-00000000000b', 'Probe ' || g
  from public.chat_threads t, generate_series(1, 10) g where t.name like 'Probe %';
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-2918', 'Probe 2918', 'For the probe.', 'Life', 9928, now());
insert into public.chat_topics (id, room_id, title, author_id)
select ('29180000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'probe-2918', 'Topic ' || i,
       'bbbbbbbb-2918-0000-0000-00000000000b'
  from generate_series(1, 20) i;
insert into public.chat_posts (topic_id, author_id, body)
select id, author_id, 'Post' from public.chat_topics where room_id = 'probe-2918';

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- Calls this transaction has made to a function so far.
create function pg_temp.calls(fn regprocedure) returns bigint language sql as $$
  select coalesce(pg_stat_get_xact_function_calls(fn), 0);
$$;

-- Reads `sql` as Ana; says how many rows, and how many calls each helper took.
create function pg_temp.read_as_ana(sql text, out seen bigint, out threads bigint, out rooms bigint, out old bigint)
language plpgsql as $$
declare t0 bigint; r0 bigint; o0 bigint;
begin
  t0 := pg_temp.calls('public.my_thread_ids()');
  r0 := pg_temp.calls('public.my_readable_room_ids()');
  o0 := pg_temp.calls('public.is_thread_member(uuid)') + pg_temp.calls('public.chat_room_is_readable(text)');
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-2918-0000-0000-00000000000a","role":"authenticated"}', true);
  set local role authenticated;
  execute format('select count(*) from (%s) r', sql) into seen;
  reset role;
  threads := pg_temp.calls('public.my_thread_ids()') - t0;
  rooms := pg_temp.calls('public.my_readable_room_ids()') - r0;
  old := pg_temp.calls('public.is_thread_member(uuid)') + pg_temp.calls('public.chat_room_is_readable(text)') - o0;
end $$;

create function pg_temp.check_once(sql text, min_rows bigint, helper text, calls bigint) returns void language plpgsql as $$
declare r record;
begin
  r := pg_temp.read_as_ana(sql);
  perform pg_temp.check_true(
    r.seen >= min_rows and r.old = 0
      and (case helper when 'threads' then r.threads else r.rooms end) = calls,
    format('%s: %s rows, %s and %s helper calls, %s old', sql, r.seen, r.threads, r.rooms, r.old));
end $$;

select pg_temp.check_once('select 1 from public.chat_thread_members', 40, 'threads', 1);
select pg_temp.check_once('select 1 from public.chat_threads', 20, 'threads', 1);
select pg_temp.check_once('select 1 from public.chat_messages', 200, 'threads', 1);
select pg_temp.check_once('select 1 from public.chat_topics', 20, 'rooms', 1);
select pg_temp.check_once('select 1 from public.chat_posts', 20, 'rooms', 2);

rollback;

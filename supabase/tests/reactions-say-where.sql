-- ============================================================================
-- A reaction says which conversation or topic it is in (20261105040000)
-- ============================================================================
-- A reaction made as a signed-in member carries its message's conversation
-- or its post's topic, through every change of emoji, and cannot be pointed
-- elsewhere. Rows from before the migration are filled by it: the undo is run
-- here, rows are made the old way, and the migration is run again. Realtime
-- takes a subscription filtered on the new columns. chat_threads is out of
-- supabase_realtime and the tables the app listens to are still in. Members
-- still cannot write reactions directly.
--
-- Run from the repository root, so the script can read the undo and the
-- migration beside it:
--
--   docker run --rm -i --network host -v "$PWD/supabase:/s:ro" -e PGPASSWORD=postgres \
--     postgres:17-alpine psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f /s/tests/reactions-say-where.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('aaaaaaaa-1105-0400-0000-00000000000a', 'peer', 'active', 'Ana', '19991105401', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-1105-0400-0000-00000000000b', 'peer', 'active', 'Bo',  '19991105402', '1981-01-01', 'T1–T6', 'CA');

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-1105-where', 'Probe where', 'For the probe.', 'Life', 9405, now());
insert into public.chat_topics (id, room_id, title, author_id) values
  ('11050400-0000-0000-0000-000000000001', 'probe-1105-where', 'Bo asks', 'bbbbbbbb-1105-0400-0000-00000000000b'),
  ('11050400-0000-0000-0000-000000000002', 'probe-1105-where', 'Other',   'bbbbbbbb-1105-0400-0000-00000000000b');
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('11050400-0000-0000-0001-000000000001', '11050400-0000-0000-0000-000000000001', 'bbbbbbbb-1105-0400-0000-00000000000b', 'First'),
  ('11050400-0000-0000-0001-000000000002', '11050400-0000-0000-0000-000000000001', 'bbbbbbbb-1105-0400-0000-00000000000b', 'Second');

insert into public.chat_threads (id, kind, name, created_by) values
  ('11050400-0000-0000-0002-000000000001', 'group', 'Ana and Bo', 'aaaaaaaa-1105-0400-0000-00000000000a'),
  ('11050400-0000-0000-0002-000000000002', 'group', 'Elsewhere',  'aaaaaaaa-1105-0400-0000-00000000000a');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11050400-0000-0000-0002-000000000001', 'aaaaaaaa-1105-0400-0000-00000000000a'),
  ('11050400-0000-0000-0002-000000000001', 'bbbbbbbb-1105-0400-0000-00000000000b'),
  ('11050400-0000-0000-0002-000000000002', 'aaaaaaaa-1105-0400-0000-00000000000a');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('11050400-0000-0000-0003-000000000001', '11050400-0000-0000-0002-000000000001', 'bbbbbbbb-1105-0400-0000-00000000000b', 'Hello'),
  ('11050400-0000-0000-0003-000000000002', '11050400-0000-0000-0002-000000000001', 'bbbbbbbb-1105-0400-0000-00000000000b', 'Again');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.refused(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then raise notice 'PASS: refused (%) %', sqlstate, statement; return; end if;
    raise;
  end;
  raise exception 'FAIL: accepted %', statement;
end $$;
-- Something Ana does, as Ana.
create function pg_temp.as_ana(statement text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', 'aaaaaaaa-1105-0400-0000-00000000000a', 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute statement;
  reset role;
end $$;
grant execute on function pg_temp.check_true(boolean, text) to authenticated;
grant execute on function pg_temp.refused(text, text) to authenticated;

create function pg_temp.message_where(target uuid) returns uuid language sql as $$
  select thread_id from public.chat_message_reactions
   where target_id = target and member_id = 'aaaaaaaa-1105-0400-0000-00000000000a';
$$;
create function pg_temp.post_where(target uuid) returns uuid language sql as $$
  select topic_id from public.chat_post_reactions
   where target_id = target and member_id = 'aaaaaaaa-1105-0400-0000-00000000000a';
$$;

\echo '== 1. a reaction made as a member says where it is =='
select pg_temp.as_ana($q$select public.chat_set_reaction('message', '11050400-0000-0000-0003-000000000001', '👍')$q$);
select pg_temp.check_true(pg_temp.message_where('11050400-0000-0000-0003-000000000001')
  = '11050400-0000-0000-0002-000000000001', 'a reaction to a message carries its conversation');
select pg_temp.as_ana($q$select public.chat_set_reaction('post', '11050400-0000-0000-0001-000000000001', '🎉')$q$);
select pg_temp.check_true(pg_temp.post_where('11050400-0000-0000-0001-000000000001')
  = '11050400-0000-0000-0000-000000000001', 'a reaction to a post carries its topic');

\echo '== 2. through a change of emoji, and taken back =='
select pg_temp.as_ana($q$select public.chat_set_reaction('message', '11050400-0000-0000-0003-000000000001', '❤️')$q$);
select pg_temp.as_ana($q$select public.chat_set_reaction('post', '11050400-0000-0000-0001-000000000001', null)$q$);
select pg_temp.check_true(
  pg_temp.message_where('11050400-0000-0000-0003-000000000001') = '11050400-0000-0000-0002-000000000001'
  and pg_temp.post_where('11050400-0000-0000-0001-000000000001') = '11050400-0000-0000-0000-000000000001',
  'still where they are after an update');

\echo '== 3. it cannot be pointed elsewhere, even by the superuser =='
update public.chat_message_reactions set thread_id = '11050400-0000-0000-0002-000000000002'
 where target_id = '11050400-0000-0000-0003-000000000001';
update public.chat_post_reactions set topic_id = '11050400-0000-0000-0000-000000000002'
 where target_id = '11050400-0000-0000-0001-000000000001';
select pg_temp.check_true(
  pg_temp.message_where('11050400-0000-0000-0003-000000000001') = '11050400-0000-0000-0002-000000000001'
  and pg_temp.post_where('11050400-0000-0000-0001-000000000001') = '11050400-0000-0000-0000-000000000001',
  'a written thread_id or topic_id is put back');

\echo '== 4. refused: a member writing a reaction directly =='
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', 'aaaaaaaa-1105-0400-0000-00000000000a', 'role', 'authenticated')::text, true);
savepoint direct_message;
select pg_temp.refused($q$insert into public.chat_message_reactions (target_id, member_id, emoji, thread_id)
  values ('11050400-0000-0000-0003-000000000002', 'aaaaaaaa-1105-0400-0000-00000000000a', '👍',
          '11050400-0000-0000-0002-000000000002')$q$, '42501');
rollback to savepoint direct_message;
savepoint direct_update;
select pg_temp.refused($q$update public.chat_post_reactions set topic_id = '11050400-0000-0000-0000-000000000002'$q$, '42501');
rollback to savepoint direct_update;
reset role;

\echo '== 5. Realtime takes the filters, and the publication =='
select pg_temp.check_true(not exists (
  select 1 from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_threads'),
  'chat_threads is out of supabase_realtime');
select pg_temp.check_true((
  select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and tablename in ('chat_messages', 'chat_posts', 'chat_topics', 'chat_rooms', 'notifications',
                       'chat_thread_members', 'chat_post_reactions', 'chat_message_reactions')) = 8,
  'the eight tables the app listens to are still in');
insert into realtime.subscription (subscription_id, entity, filters, claims) values
  (gen_random_uuid(), 'public.chat_message_reactions',
   array[('thread_id', 'eq', '11050400-0000-0000-0002-000000000001', false)::realtime.user_defined_filter],
   json_build_object('role', 'authenticated', 'sub', 'aaaaaaaa-1105-0400-0000-00000000000a')::jsonb),
  (gen_random_uuid(), 'public.chat_post_reactions',
   array[('topic_id', 'eq', '11050400-0000-0000-0000-000000000001', false)::realtime.user_defined_filter],
   json_build_object('role', 'authenticated', 'sub', 'aaaaaaaa-1105-0400-0000-00000000000a')::jsonb);
select pg_temp.check_true(true, 'Realtime accepts thread_id=eq. and topic_id=eq. subscriptions');
-- A column the table does not have is refused, so the two above were checked.
savepoint no_such_column;
select pg_temp.refused($q$insert into realtime.subscription (subscription_id, entity, filters, claims) values
  (gen_random_uuid(), 'public.chat_message_reactions',
   array[('topic_id', 'eq', '11050400-0000-0000-0000-000000000001', false)::realtime.user_defined_filter],
   '{"role": "authenticated"}'::jsonb)$q$, 'P0001');
rollback to -- A column the table does not have is refused, so the two above were checked.
savepoint no_such_column;

\echo '== 6. rows from before are filled by the migration =='
\ir ../undo/20261105040000.sql
select pg_temp.check_true(not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'chat_message_reactions' and column_name = 'thread_id'),
  'the undo takes the column away');
select pg_temp.check_true(exists (
  select 1 from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_threads'),
  'the undo puts chat_threads back');
insert into public.chat_message_reactions (target_id, member_id, emoji) values
  ('11050400-0000-0000-0003-000000000002', 'aaaaaaaa-1105-0400-0000-00000000000a', '😂');
insert into public.chat_post_reactions (target_id, member_id, emoji) values
  ('11050400-0000-0000-0001-000000000002', 'aaaaaaaa-1105-0400-0000-00000000000a', '💪');
create temp table notified_before on commit drop as select count(*) as n from public.notifications;
\ir ../migrations/20261105040000_reactions_say_where_they_are.sql
select pg_temp.check_true(
  pg_temp.message_where('11050400-0000-0000-0003-000000000002') = '11050400-0000-0000-0002-000000000001'
  and pg_temp.message_where('11050400-0000-0000-0003-000000000001') = '11050400-0000-0000-0002-000000000001'
  and pg_temp.post_where('11050400-0000-0000-0001-000000000002') = '11050400-0000-0000-0000-000000000001',
  'every earlier reaction now says where it is');
select pg_temp.check_true((
  select bool_and(attnotnull) from pg_attribute
   where (attrelid, attname) in (('public.chat_message_reactions'::regclass, 'thread_id'),
                                 ('public.chat_post_reactions'::regclass, 'topic_id'))),
  'and both columns are required');
select pg_temp.check_true((select count(*) from public.notifications) = (select n from notified_before),
  'filling them sent nobody a notification');

\echo '== done: every check above says PASS =='
rollback;

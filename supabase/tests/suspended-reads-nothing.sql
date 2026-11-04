-- ============================================================================
-- A paused member reads nothing (20261103210000)
-- ============================================================================
-- An active member and a suspended one share an open room, a conversation, a
-- photograph and the seed's events. The active one reads them; the suspended
-- one reads none of it, only their own members row and who invited them, and
-- can still leave a room. Reinstated, they read it all again.
--
-- One transaction, rolled back. With psql as in the other probes:
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres \
--     -f - < supabase/tests/suspended-reads-nothing.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('a0000000-1102-0000-0000-000000000001', 'peer', 'active',    'Act', '19991102001', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-1102-0000-0000-000000000002', 'peer', 'suspended', 'Sus', '19991102002', '1980-01-01', 'T1–T6', 'CA');
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-1102-open', 'Probe 1102 open', 'For the probe.', 'Life', 9911, now());
insert into public.chat_room_members (room_id, member_id) values
  ('probe-1102-open', 'a0000000-1102-0000-0000-000000000002');
insert into public.chat_topics (id, room_id, title, author_id)
values ('11020000-0000-0000-0000-000000000001', 'probe-1102-open', 'Act asks', 'a0000000-1102-0000-0000-000000000001');
insert into public.chat_posts (id, topic_id, author_id, body)
values ('11020000-0000-0000-0000-000000000011', '11020000-0000-0000-0000-000000000001', 'a0000000-1102-0000-0000-000000000001', 'Act opens');
insert into public.chat_threads (id, kind, name) values ('11020000-0000-0000-0000-000000000021', 'group', 'Group');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11020000-0000-0000-0000-000000000021', 'a0000000-1102-0000-0000-000000000001'),
  ('11020000-0000-0000-0000-000000000021', 'a0000000-1102-0000-0000-000000000002');
insert into public.chat_messages (id, thread_id, author_id, body)
values ('11020000-0000-0000-0000-000000000031', '11020000-0000-0000-0000-000000000021', 'a0000000-1102-0000-0000-000000000001', 'Act in the group');
insert into public.notifications (member_id, kind, tag, actor_id, thread_id, message_id) values
  ('a0000000-1102-0000-0000-000000000001', 'group', 'thread:probe', 'a0000000-1102-0000-0000-000000000002', '11020000-0000-0000-0000-000000000021', '11020000-0000-0000-0000-000000000031'),
  ('a0000000-1102-0000-0000-000000000002', 'group', 'thread:probe', 'a0000000-1102-0000-0000-000000000001', '11020000-0000-0000-0000-000000000021', '11020000-0000-0000-0000-000000000031');
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'a0000000-1102-0000-0000-000000000001/face.jpg', 'a0000000-1102-0000-0000-000000000001');

-- What one person reads, in one row.
create function pg_temp.reads() returns table (
  is_member boolean, own_row bigint, rooms bigint, topics bigint, posts bigint, threads bigint,
  messages bigint, events bigint, authors bigint, notifications bigint, photos bigint,
  bell bigint, unseen integer, badge integer)
language sql as $$
  select public.is_member(),
         (select count(*) from public.members where id = auth.uid()),
         (select count(*) from public.chat_rooms where id = 'probe-1102-open'),
         (select count(*) from public.chat_topics where room_id = 'probe-1102-open'),
         (select count(*) from public.chat_posts where topic_id = '11020000-0000-0000-0000-000000000001'),
         (select count(*) from public.chat_threads where id = '11020000-0000-0000-0000-000000000021'),
         (select count(*) from public.chat_messages where thread_id = '11020000-0000-0000-0000-000000000021'),
         (select count(*) from public.events),
         (select count(*) from public.chat_authors where id = 'a0000000-1102-0000-0000-000000000001'),
         (select count(*) from public.notifications where member_id = auth.uid()),
         (select count(*) from storage.objects where bucket_id = 'photos' and name like 'a0000000-1102-0000-0000-000000000001/%'),
         (select count(*) from public.my_notifications(null, 100)),
         public.my_unseen_notification_count(),
         public.my_unseen_notification_kinds();
$$;
grant execute on function pg_temp.reads() to authenticated;

\echo '== 1. the active member reads the club =='
\echo '   expect: t | 1 | 1 | 1 | 1 | 1 | 1 | events > 0 | 1 | 1 | 1 | 1 | 1 | 1'
set local request.jwt.claims = '{"sub":"a0000000-1102-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select * from pg_temp.reads();

\echo ''
\echo '== 2. the suspended member reads nothing but their own row =='
\echo '   expect: f | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 (the bell, its count'
\echo '   and the icon badge too)'
set local role postgres;
set local request.jwt.claims = '{"sub":"a0000000-1102-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select * from pg_temp.reads();

\echo ''
\echo '== 3. ...and the paused screen still learns who invited them =='
\echo '   expect: no error (a row, empty here: the probe member has no inviter).'
select public.my_invited_by() is null as no_inviter;

\echo ''
\echo '== 4. ...and they can still leave a room =='
\echo '   expect: DELETE 1'
delete from public.chat_room_members where room_id = 'probe-1102-open' and member_id = 'a0000000-1102-0000-0000-000000000002';

\echo ''
\echo '== 5. reinstated, they read it all again =='
\echo '   expect: t | 1 | 1 | 1 | 1 | 1 | 1 | events > 0 | 1 | 1 | 1 | 1 | 1 | 1'
set local role postgres;
update public.members set status = 'active' where id = 'a0000000-1102-0000-0000-000000000002';
set local role authenticated;
select * from pg_temp.reads();

rollback;

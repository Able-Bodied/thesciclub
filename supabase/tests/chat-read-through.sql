-- Read boundaries and authorization, rolled back. Local database only.
-- Run:
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/chat-read-through.sql
-- Each refusal has its own savepoint; expect 6 errors and all assertions true (including receipt publication and roster privacy).
\set ON_ERROR_STOP off
\pset pager off
begin;
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
('aaaaaaaa-8888-0000-0000-000000000001', 'peer', 'active', 'Reader', '19990008001', '1980-01-01', 'T1–T6', 'CA'),
('bbbbbbbb-8888-0000-0000-000000000002', 'peer', 'active', 'Other', '19990008002', '1980-01-01', 'T1–T6', 'CA');
insert into public.chat_threads (id, kind, name) values
('aaaaaaaa-8888-1111-0000-000000000001','group','Read probe'),
('bbbbbbbb-8888-1111-0000-000000000002','group','Other probe');
insert into public.chat_thread_members (thread_id, member_id) values
('aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001'),
('bbbbbbbb-8888-1111-0000-000000000002','bbbbbbbb-8888-0000-0000-000000000002');
insert into public.chat_messages (id, thread_id, author_id, body, created_at) values
('aaaaaaaa-8888-2222-0000-000000000001','aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','Delivered','2026-01-01T00:00:01Z'),
('aaaaaaaa-8888-2222-0000-000000000002','aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','Arrived during read','2026-01-01T00:00:02Z'),
('bbbbbbbb-8888-2222-0000-000000000003','bbbbbbbb-8888-1111-0000-000000000002','bbbbbbbb-8888-0000-0000-000000000002','Other conversation','2026-01-01T00:00:03Z');
update public.chat_rooms set opened_at = now() where id = 'bowel';
insert into public.chat_topics (id,room_id,title,author_id) values
('aaaaaaaa-8888-3333-0000-000000000001','bowel','Read probe','aaaaaaaa-8888-0000-0000-000000000001'),
('bbbbbbbb-8888-3333-0000-000000000002','bladder','Closed probe','bbbbbbbb-8888-0000-0000-000000000002');
insert into public.chat_posts (id,topic_id,author_id,body,created_at) values
('aaaaaaaa-8888-4444-0000-000000000001','aaaaaaaa-8888-3333-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','Delivered','2026-01-01T00:00:01Z'),
('aaaaaaaa-8888-4444-0000-000000000002','aaaaaaaa-8888-3333-0000-000000000001','aaaaaaaa-8888-0000-0000-000000000001','Arrived during read','2026-01-01T00:00:02Z'),
('bbbbbbbb-8888-4444-0000-000000000003','bbbbbbbb-8888-3333-0000-000000000002','bbbbbbbb-8888-0000-0000-000000000002','Closed topic','2026-01-01T00:00:03Z');

\echo '== 1. signed-in member marks only delivered rows (expect t | t) =='
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select public.chat_mark_thread_read_through('aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-2222-0000-000000000001');
select public.chat_mark_topic_read_through('aaaaaaaa-8888-3333-0000-000000000001','aaaaaaaa-8888-4444-0000-000000000001');
select last_read_at = '2026-01-01T00:00:01Z' as delivered_only from public.chat_thread_members
where thread_id = 'aaaaaaaa-8888-1111-0000-000000000001';
select last_read_at = '2026-01-01T00:00:01Z' as delivered_only from public.chat_topic_reads
where topic_id = 'aaaaaaaa-8888-3333-0000-000000000001';

\echo '== 2. newer reads advance; stale reads cannot move backwards (expect t | t) =='
select public.chat_mark_thread_read_through('aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-2222-0000-000000000002');
select public.chat_mark_thread_read_through('aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-2222-0000-000000000001');
select public.chat_mark_topic_read_through('aaaaaaaa-8888-3333-0000-000000000001','aaaaaaaa-8888-4444-0000-000000000002');
select public.chat_mark_topic_read_through('aaaaaaaa-8888-3333-0000-000000000001','aaaaaaaa-8888-4444-0000-000000000001');
select last_read_at = '2026-01-01T00:00:02Z' as no_regression from public.chat_thread_members
where thread_id = 'aaaaaaaa-8888-1111-0000-000000000001';
select last_read_at = '2026-01-01T00:00:02Z' as no_regression from public.chat_topic_reads
where topic_id = 'aaaaaaaa-8888-3333-0000-000000000001';

\echo '== 3. rows from another conversation/topic refused (expect 2 ERRORs) =='
savepoint wrong_message;
select public.chat_mark_thread_read_through('aaaaaaaa-8888-1111-0000-000000000001','bbbbbbbb-8888-2222-0000-000000000003');
rollback to savepoint wrong_message;
savepoint wrong_post;
select public.chat_mark_topic_read_through('aaaaaaaa-8888-3333-0000-000000000001','bbbbbbbb-8888-4444-0000-000000000003');
rollback to savepoint wrong_post;

\echo '== 4. unreadable scopes refused (expect 2 ERRORs) =='
savepoint other_thread;
select public.chat_mark_thread_read_through('bbbbbbbb-8888-1111-0000-000000000002','bbbbbbbb-8888-2222-0000-000000000003');
rollback to savepoint other_thread;
savepoint closed_topic;
select public.chat_mark_topic_read_through('bbbbbbbb-8888-3333-0000-000000000002','bbbbbbbb-8888-4444-0000-000000000003');
rollback to savepoint closed_topic;

\echo '== 4b. receipts are published, but outsiders cannot read the roster (expect t | t) =='
select exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_thread_members') as receipts_are_live;
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
select count(*) = 0 as outsider_reads_nothing from public.chat_thread_members
where thread_id = 'aaaaaaaa-8888-1111-0000-000000000001';

\echo '== 5. anon cannot call either function (expect 2 permission ERRORs) =='
reset role;
set local role anon;
savepoint anon_thread;
select public.chat_mark_thread_read_through('aaaaaaaa-8888-1111-0000-000000000001','aaaaaaaa-8888-2222-0000-000000000001');
rollback to savepoint anon_thread;
savepoint anon_topic;
select public.chat_mark_topic_read_through('aaaaaaaa-8888-3333-0000-000000000001','aaaaaaaa-8888-4444-0000-000000000001');
rollback to savepoint anon_topic;
rollback;

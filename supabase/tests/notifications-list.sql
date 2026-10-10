-- The notifications list (20261010000000).
-- Run locally only. Signed-in roles, each refusal in a savepoint; all rolled back.
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/notifications-list.sql
--
-- Rows are written by the triggers through push_notify_send, which records
-- before it looks for the push service's address, so this works on a stack
-- with pushing switched off.
\set ON_ERROR_STOP off
\pset pager off
begin;
insert into public.members (id,type,status,display_name,phone,birth_date,level_range,state,is_admin) values
('aaaaaaaa-9292-0000-0000-000000000001','mentor','active','Notify admin','19990009301','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-9292-0000-0000-000000000002','peer','active','Notify starter','19990009302','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9292-0000-0000-000000000003','peer','active','Notify replier','19990009303','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9292-0000-0000-000000000004','peer','active','Notify other','19990009304','1980-01-01','T1–T6','CA',false);
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-open', 'Probe open room', 'For the notifications probe.', 'General', 9001, now()),
       ('probe-shut', 'Probe closed room', 'For the notifications probe.', 'General', 9002, null);
insert into public.chat_threads (id, kind, name, created_by)
values ('aaaaaaaa-9292-0000-0000-0000000000a1', 'group', 'Probe group', 'aaaaaaaa-9292-0000-0000-000000000002');
insert into public.chat_thread_members (thread_id, member_id) values
('aaaaaaaa-9292-0000-0000-0000000000a1', 'aaaaaaaa-9292-0000-0000-000000000002'),
('aaaaaaaa-9292-0000-0000-0000000000a1', 'aaaaaaaa-9292-0000-0000-000000000003'),
('aaaaaaaa-9292-0000-0000-0000000000a1', 'aaaaaaaa-9292-0000-0000-000000000004');
set local role authenticated;

\echo '== 1. a reply reaches the starter, folded while unread: expect authenticated, t | t | t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000002","role":"authenticated"}';
select current_user;
select public.chat_create_topic('probe-open', 'Probe question?', 'Probe question?', '{}', true) as topic \gset
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000003","role":"authenticated"}';
insert into public.chat_posts (topic_id, author_id, body) values (:'topic', auth.uid(), 'First answer');
insert into public.chat_posts (topic_id, author_id, body) values (:'topic', auth.uid(), 'Second answer') returning id as second \gset
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000002","role":"authenticated"}';
select count(*) = 1 as one_row from public.my_notifications() where kind = 'reply';
select n.count = 2 and n.actor_name = 'Notify replier' and n.place = 'Probe question?'
       and n.excerpt = 'Second answer' as folded_with_words
  from public.my_notifications() n where n.kind = 'reply';
select n.url = '/chat/rooms/probe-open/topics/' || :'topic' || '?post=' || :'second' as opens_the_post
  from public.my_notifications() n where n.kind = 'reply';

\echo '== 2. nobody hears of their own words, and a participant hears as one: expect t | t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000003","role":"authenticated"}';
select count(*) = 0 as replier_not_told from public.my_notifications() where kind in ('reply', 'reply_participant');
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000002","role":"authenticated"}';
insert into public.chat_posts (topic_id, author_id, body) values (:'topic', auth.uid(), 'Thanks');
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000003","role":"authenticated"}';
select count(*) = 1 as participant_told from public.my_notifications() where kind = 'reply_participant';

\echo '== 3. a message reaches the others in the group, not the sender: expect t | t | t =='
insert into public.chat_messages (thread_id, author_id, body)
values ('aaaaaaaa-9292-0000-0000-0000000000a1', auth.uid(), 'Hello group') returning id as msg \gset
select count(*) = 0 as sender_not_told from public.my_notifications() where kind = 'group';
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000004","role":"authenticated"}';
select n.place = 'Probe group' and n.excerpt = 'Hello group'
       and n.url = '/chat/t/aaaaaaaa-9292-0000-0000-0000000000a1?message=' || :'msg' as told_with_message
  from public.my_notifications() n where n.kind = 'group';
select public.my_unseen_notification_count() = 1 as bell_counts;

\echo '== 4. seen, read, and reading the conversation reads it: expect t | t | t =='
select public.notifications_mark_seen();
select public.my_unseen_notification_count() = 0 as bell_cleared;
select public.chat_mark_thread_read_through('aaaaaaaa-9292-0000-0000-0000000000a1', :'msg');
select bool_and(n.read) as read_with_conversation from public.my_notifications() n where n.kind = 'group';
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000002","role":"authenticated"}';
select public.notifications_mark_read(null);
select bool_and(n.read) as all_read from public.my_notifications() n;

\echo '== 5. a muted conversation is not listed, and leaving hides what was: expect t | t =='
insert into public.chat_thread_mutes (thread_id, member_id) values ('aaaaaaaa-9292-0000-0000-0000000000a1', auth.uid());
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000003","role":"authenticated"}';
insert into public.chat_messages (thread_id, author_id, body) values ('aaaaaaaa-9292-0000-0000-0000000000a1', auth.uid(), 'Again');
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000002","role":"authenticated"}';
-- Only the earlier one, already read: nothing new arrives through a mute.
select count(*) = 0 as muted_not_listed from public.my_notifications() where kind = 'group' and not read;
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000004","role":"authenticated"}';
delete from public.chat_thread_members where thread_id = 'aaaaaaaa-9292-0000-0000-0000000000a1' and member_id = auth.uid();
select count(*) = 0 as left_not_listed from public.my_notifications() where kind = 'group';

\echo '== 6. nobody reads or writes another member''s rows: expect t | t, then three ERRORs =='
select count(*) = 0 as others_rows_unreadable from public.notifications
 where member_id = 'aaaaaaaa-9292-0000-0000-000000000002';
select count(*) = 0 as list_is_own from public.my_notifications() n where n.kind = 'reply';
savepoint forge;
insert into public.notifications (member_id, kind, tag) values (auth.uid(), 'report', 'forged');
rollback to forge;
savepoint tamper;
update public.notifications set read_at = now() where member_id = 'aaaaaaaa-9292-0000-0000-000000000002';
rollback to tamper;
savepoint record_directly;
select public.notifications_record('post', jsonb_build_object('id', :'second'));
rollback to record_directly;

\echo '== 7. a closed room is listed to an administrator only: expect t | t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9292-0000-0000-000000000001","role":"authenticated"}';
select public.chat_create_topic('probe-shut', 'Seeding a room', 'Before it opens.') as shut \gset
-- Written as the superuser: the room is closed, so no member could post.
reset role;
insert into public.chat_posts (topic_id, author_id, body) values (:'shut', 'aaaaaaaa-9292-0000-0000-000000000003', 'Early answer');
set local role authenticated;
select count(*) = 1 as admin_told from public.my_notifications() where kind = 'reply';
reset role;
select count(*) = 0 as closed_room_nobody_else from public.notifications n
  join public.members m on m.id = n.member_id and not m.is_admin
 where n.topic_id = :'shut';

\echo '== 8. thirty days, then gone: expect t =='
update public.notifications set created_at = now() - interval '31 days' where topic_id = :'topic';
select public.notifications_forget();
select not exists (select 1 from public.notifications where topic_id = :'topic') as forgotten;
rollback;

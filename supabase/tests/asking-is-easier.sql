-- General, questions, and moving a topic (20261010010000).
-- Run locally only. Signed-in roles, each refusal in a savepoint; all rolled back.
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/asking-is-easier.sql
\set ON_ERROR_STOP off
\pset pager off
begin;
insert into public.members (id,type,status,display_name,phone,birth_date,level_range,state,is_admin) values
('aaaaaaaa-9393-0000-0000-000000000001','mentor','active','Ask admin','19990009401','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-9393-0000-0000-000000000002','peer','active','Ask asker','19990009402','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9393-0000-0000-000000000003','peer','active','Ask other','19990009403','1980-01-01','T1–T6','CA',false);
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-kit', 'Probe kit room', 'For the asking probe.', 'Kit', 9101, now()),
       ('probe-closed', 'Probe closed room', 'For the asking probe.', 'Kit', 9102, null);
set local role authenticated;

\echo '== 1. General is there, open, first: expect authenticated, t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9393-0000-0000-000000000002","role":"authenticated"}';
select current_user;
select category = 'General' and opened_at is not null and sort_order = 0 as general_open
  from public.chat_rooms where id = 'general';

\echo '== 2. a question is marked, an ordinary topic is not, the old call still works: expect t | t =='
select public.chat_create_topic('general', 'Which cushion?', 'Which cushion?', '{}', true) as question \gset
select public.chat_create_topic(room => 'general', title => 'My new chair', body => 'Arrived today.') as plain \gset
select is_question as marked from public.chat_topics where id = :'question';
select not is_question as unmarked from public.chat_topics where id = :'plain';

\echo '== 3. the asker moves theirs to an open room, and links find it: expect t | t =='
select public.chat_move_topic(:'question', 'probe-kit');
select room_id = 'probe-kit' as moved from public.chat_topics where id = :'question';
select public.chat_topic_room(:'question') = 'probe-kit' as found_where_it_is;

\echo '== 4. refusals: expect four ERRORs, then t =='
savepoint into_closed;
select public.chat_move_topic(:'question', 'probe-closed');
rollback to into_closed;
savepoint nowhere;
select public.chat_move_topic(:'question', 'no-such-room');
rollback to nowhere;
set local request.jwt.claims='{"sub":"aaaaaaaa-9393-0000-0000-000000000003","role":"authenticated"}';
savepoint not_theirs;
select public.chat_move_topic(:'question', 'general');
rollback to not_theirs;
savepoint direct_update;
update public.chat_topics set room_id = 'general' where id = :'question';
rollback to direct_update;
select room_id = 'probe-kit' as unmoved_by_others from public.chat_topics where id = :'question';

\echo '== 5. an administrator files into a closed room, which then hides it from members: expect t | t | t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9393-0000-0000-000000000001","role":"authenticated"}';
select public.chat_move_topic(:'plain', 'probe-closed');
select room_id = 'probe-closed' as admin_moved from public.chat_topics where id = :'plain';
set local request.jwt.claims='{"sub":"aaaaaaaa-9393-0000-0000-000000000002","role":"authenticated"}';
select public.chat_topic_room(:'plain') is null as closed_room_not_told;
select count(*) = 0 as closed_room_unreadable from public.chat_topics where id = :'plain';

\echo '== 6. a member starts a room in General: expect t =='
select public.chat_create_room('Probe general room', 'A room about nothing in particular.', 'General',
  'First topic', 'First post') is not null as general_room_started;
rollback;

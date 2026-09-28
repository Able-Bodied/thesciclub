-- ============================================================================
-- Who is owed a notification, and what it may say.
-- ============================================================================
-- `push_owed` is the whole of "who": a mistake in it is a stranger's message
-- on somebody's lock screen. Steps 1–10 exercise it and are run as the
-- superuser on purpose — it is a definer function called with the service
-- role, so RLS is not what decides its answer; its own joins are. Steps 11–14
-- are the mute tables' policies and the function's grant, and those switch to
-- a signed-in role and print current_user, because as postgres every policy is
-- inert.
--
-- Step 4 (a reply never carries its words) and step 1 (a direct message
-- reaches the other member and nobody else) are the ones that matter.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/push-notify.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-5555-0000-0000-00000000000a', 'peer', 'active',    'Author',    '19990000060', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-5555-0000-0000-00000000000b', 'peer', 'active',    'Bo',        '19990000061', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-5555-0000-0000-00000000000c', 'peer', 'suspended', 'Paused',    '19990000062', '1982-01-01', 'C5–C8', 'CA', false),
  ('dddddddd-5555-0000-0000-00000000000d', 'peer', 'active',    'Outsider',  '19990000063', '1983-01-01', 'C5–C8', 'CA', false),
  ('eeeeeeee-5555-0000-0000-00000000000e', 'peer', 'active',    'Grouped',   '19990000064', '1984-01-01', 'C5–C8', 'CA', false);

-- A device each, the shape push_subscribe writes.
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/' || substr(id::text, 1, 8), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999000006%';

insert into public.chat_threads (id, kind, direct_key) values
  ('11111111-5555-0000-0000-000000000001', 'direct', 'probe-direct');
insert into public.chat_threads (id, kind, name) values
  ('11111111-5555-0000-0000-000000000002', 'group', 'Probe group');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11111111-5555-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-00000000000a'),
  ('11111111-5555-0000-0000-000000000001', 'bbbbbbbb-5555-0000-0000-00000000000b'),
  ('11111111-5555-0000-0000-000000000002', 'aaaaaaaa-5555-0000-0000-00000000000a'),
  ('11111111-5555-0000-0000-000000000002', 'bbbbbbbb-5555-0000-0000-00000000000b'),
  ('11111111-5555-0000-0000-000000000002', 'cccccccc-5555-0000-0000-00000000000c'),
  ('11111111-5555-0000-0000-000000000002', 'eeeeeeee-5555-0000-0000-00000000000e');

insert into public.chat_messages (id, thread_id, author_id, body) values
  ('22222222-5555-0000-0000-000000000001', '11111111-5555-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-00000000000a', 'See you Friday'),
  ('22222222-5555-0000-0000-000000000002', '11111111-5555-0000-0000-000000000002', 'aaaaaaaa-5555-0000-0000-00000000000a', 'Who is driving?');

-- A room of its own, open, and a topic Bo started.
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-room', 'Probe room', 'For the probe.', 'Life', 999, now());
insert into public.chat_topics (id, room_id, title, author_id) values
  ('33333333-5555-0000-0000-000000000001', 'probe-room', 'Bo''s question', 'bbbbbbbb-5555-0000-0000-00000000000b');
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('44444444-5555-0000-0000-000000000000', '33333333-5555-0000-0000-000000000001', 'bbbbbbbb-5555-0000-0000-00000000000b', 'The question itself'),
  ('44444444-5555-0000-0000-000000000001', '33333333-5555-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-00000000000a', 'A private answer about a private thing');

\echo ''
\echo '== 1. a direct message reaches the other member and nobody else (expect Bo only, kind direct, the words) =='
select (select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint) as to_whom,
       kind, actor_name, body, url
  from public.push_owed(:'secret', 'message', '{"id":"22222222-5555-0000-0000-000000000001"}') o;

\echo ''
\echo '== 2. a group message reaches everybody else in it who is not paused (expect Bo and Grouped, not Author, not Paused, not Outsider) =='
select (select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint) as to_whom,
       kind, actor_name, body
  from public.push_owed(:'secret', 'message', '{"id":"22222222-5555-0000-0000-000000000002"}') o
 order by 1;

\echo ''
\echo '== 3. muting the group stops it for that member only (expect Bo only) =='
insert into public.chat_thread_mutes (thread_id, member_id)
values ('11111111-5555-0000-0000-000000000002', 'eeeeeeee-5555-0000-0000-00000000000e');
select (select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint) as to_whom
  from public.push_owed(:'secret', 'message', '{"id":"22222222-5555-0000-0000-000000000002"}') o;

\echo ''
\echo '== 4. THE ONE THAT MATTERS: a reply reaches the starter, with a name and NO words (expect Bo, reply, Author, body null) =='
select (select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint) as to_whom,
       kind, actor_name, body is null as no_words, url
  from public.push_owed(:'secret', 'post', '{"id":"44444444-5555-0000-0000-000000000001"}') o;

\echo ''
\echo '== 5. the starter''s own post never notifies the starter (expect Author as reply_participant, never Bo) =='
\echo '   Asked after the fact, so Author''s later reply makes Author a participant;'
\echo '   at the moment a topic is born there is nobody else to tell.'
select (select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint) as to_whom, kind
  from public.push_owed(:'secret', 'post', '{"id":"44444444-5555-0000-0000-000000000000"}') o;

\echo ''
\echo '== 6. muting the topic stops it (expect 0), and unmuting brings it back (expect 1) =='
insert into public.chat_topic_mutes (topic_id, member_id)
values ('33333333-5555-0000-0000-000000000001', 'bbbbbbbb-5555-0000-0000-00000000000b');
select count(*) as owed_muted from public.push_owed(:'secret', 'post', '{"id":"44444444-5555-0000-0000-000000000001"}');
delete from public.chat_topic_mutes where member_id = 'bbbbbbbb-5555-0000-0000-00000000000b';
select count(*) as owed_unmuted from public.push_owed(:'secret', 'post', '{"id":"44444444-5555-0000-0000-000000000001"}');

\echo ''
\echo '== 7. muting the room stops it too (expect 0) =='
insert into public.chat_room_mutes (room_id, member_id)
values ('probe-room', 'bbbbbbbb-5555-0000-0000-00000000000b');
select count(*) as owed_room_muted from public.push_owed(:'secret', 'post', '{"id":"44444444-5555-0000-0000-000000000001"}');
delete from public.chat_room_mutes where member_id = 'bbbbbbbb-5555-0000-0000-00000000000b';

\echo ''
\echo '== 8. a closed room notifies a starter who can no longer read it (expect 0) =='
update public.chat_rooms set opened_at = null where id = 'probe-room';
select count(*) as owed_closed from public.push_owed(:'secret', 'post', '{"id":"44444444-5555-0000-0000-000000000001"}');
update public.chat_rooms set opened_at = now() where id = 'probe-room';

\echo ''
\echo '== 9. a message already taken back notifies nobody (expect 0) =='
update public.chat_messages set removed_at = now(), body = '' where id = '22222222-5555-0000-0000-000000000001';
select count(*) as owed_removed from public.push_owed(:'secret', 'message', '{"id":"22222222-5555-0000-0000-000000000001"}');

\echo ''
\echo '== 10. the wrong secret is refused (expect ERROR x2) =='
savepoint wrong_secret;
select count(*) from public.push_owed('guess', 'message', '{"id":"22222222-5555-0000-0000-000000000002"}');
rollback to savepoint wrong_secret;
savepoint no_secret;
select count(*) from public.push_owed(null, 'message', '{"id":"22222222-5555-0000-0000-000000000002"}');
rollback to savepoint no_secret;

-- ---------------------------------------------------------------- as members
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-5555-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 11. a member cannot ask who is owed (expect ERROR, permission denied for function) =='
select current_user;
savepoint member_owed;
select count(*) from public.push_owed(:'secret', 'message', '{"id":"22222222-5555-0000-0000-000000000002"}');
rollback to savepoint member_owed;

\echo ''
\echo '== 12. nobody sees another member''s mutes (expect 0 — Grouped muted the group Author is in) =='
select count(*) as visible_to_author from public.chat_thread_mutes;

\echo ''
\echo '== 13. a member mutes their own conversation (expect INSERT 0 1), and cannot mute one they are not in (expect ERROR) =='
insert into public.chat_thread_mutes (thread_id, member_id)
values ('11111111-5555-0000-0000-000000000001', 'aaaaaaaa-5555-0000-0000-00000000000a');
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-5555-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
savepoint outsider_mute;
insert into public.chat_thread_mutes (thread_id, member_id)
values ('11111111-5555-0000-0000-000000000001', 'dddddddd-5555-0000-0000-00000000000d');
rollback to savepoint outsider_mute;

\echo ''
\echo '== 14. nor in somebody else''s name (expect ERROR) =='
savepoint forge_mute;
insert into public.chat_room_mutes (room_id, member_id)
values ('probe-room', 'bbbbbbbb-5555-0000-0000-00000000000b');
rollback to savepoint forge_mute;

\echo ''
\echo '== 15. leaving a group takes its mute with it (expect 1, then 0) =='
set local role postgres;
select count(*) as before_leaving from public.chat_thread_mutes where member_id = 'eeeeeeee-5555-0000-0000-00000000000e';
delete from public.chat_thread_members
 where thread_id = '11111111-5555-0000-0000-000000000002' and member_id = 'eeeeeeee-5555-0000-0000-00000000000e';
select count(*) as after_leaving from public.chat_thread_mutes where member_id = 'eeeeeeee-5555-0000-0000-00000000000e';

rollback;

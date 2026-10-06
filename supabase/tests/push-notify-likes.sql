-- ============================================================================
-- A like notifies the post's author (20261003010000).
-- ============================================================================
-- Steps 1–8 exercise `push_owed` as the superuser on purpose, as
-- push-notify.sql does: it is a definer function the service role calls, so
-- its own joins decide the answer, not RLS. The likes are written as the
-- superuser too, which is why step 3 can write one the policy would refuse.
-- Step 9 checks the trigger queues the request; step 10 switches to a
-- signed-in role and prints current_user.
--
-- Step 1 (the author is told who liked it and which post, quoted, and nobody
-- else is) and step 6 (every mute and the switch silence it) matter most.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/push-notify-likes.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-7777-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990000080', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-7777-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990000081', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-7777-0000-0000-00000000000c', 'peer', 'active', 'Cy',  '19990000082', '1982-01-01', 'C5–C8', 'CA', false);

insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/' || substr(id::text, 1, 8), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999000008%';

-- Whose device a row is for, by name.
\set whom '(select display_name from public.members m join public.push_subscriptions s on s.member_id = m.id where s.endpoint = o.endpoint)'

-- Cy's topic, with Cy's opening post a second before Bo's reply, so "the
-- opening post" is not a tie on now().
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-likes', 'Probe likes', 'For the probe.', 'Life', 996, now());
insert into public.chat_topics (id, room_id, title, author_id)
values ('33333333-7777-0000-0000-000000000001', 'probe-likes', 'Cy asks about mornings', 'cccccccc-7777-0000-0000-00000000000c');
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
  ('44444444-7777-0000-0000-000000000001', '33333333-7777-0000-0000-000000000001', 'cccccccc-7777-0000-0000-00000000000c', 'Morning or evening routine?', now() - interval '1 second'),
  ('44444444-7777-0000-0000-000000000002', '33333333-7777-0000-0000-000000000001', 'bbbbbbbb-7777-0000-0000-00000000000b', 'Evenings, after a warm drink', now());

insert into public.chat_post_likes (post_id, member_id) values
  ('44444444-7777-0000-0000-000000000002', 'aaaaaaaa-7777-0000-0000-00000000000a'),
  ('44444444-7777-0000-0000-000000000001', 'aaaaaaaa-7777-0000-0000-00000000000a');

\echo ''
\echo '== 1. THE ONE THAT MATTERS: Ana likes Bo''s reply; Bo is told who, and which post, and nobody else is =='
\echo '   expect: Bo | like | Ana | Evenings, after a warm drink | post | t | /chat/rooms/probe-likes/topics/…?post=44444444-…-000000000002 | like:44444444-…-000000000002'
select :whom as to_whom, kind, actor_name, body, detail, subject is null as no_subject, url, tag
  from public.push_owed(:'secret', 'like',
    '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}') o;

\echo ''
\echo '== 2. a like on the post that opened the topic says topic (expect Cy | topic) =='
select :whom as to_whom, detail
  from public.push_owed(:'secret', 'like',
    '{"post_id":"44444444-7777-0000-0000-000000000001","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}') o;

\echo ''
\echo '== 3. a like by the author themselves tells nobody (expect 0) =='
\echo '   The policy refuses it; written here as the superuser to show push_owed refuses it too.'
insert into public.chat_post_likes (post_id, member_id)
values ('44444444-7777-0000-0000-000000000002', 'bbbbbbbb-7777-0000-0000-00000000000b');
select count(*) as owed_self from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"bbbbbbbb-7777-0000-0000-00000000000b"}');
delete from public.chat_post_likes where member_id = 'bbbbbbbb-7777-0000-0000-00000000000b';

\echo ''
\echo '== 4. a like undone before the function asks tells nobody (expect 0) =='
insert into public.chat_post_likes (post_id, member_id)
values ('44444444-7777-0000-0000-000000000002', 'cccccccc-7777-0000-0000-00000000000c');
delete from public.chat_post_likes where member_id = 'cccccccc-7777-0000-0000-00000000000c';
select count(*) as owed_undone from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"cccccccc-7777-0000-0000-00000000000c"}');

\echo ''
\echo '== 5. nor does a like on a post taken back (expect 0) =='
savepoint removed;
update public.chat_posts set removed_at = now() where id = '44444444-7777-0000-0000-000000000002';
select count(*) as owed_removed from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');
rollback to savepoint removed;

\echo ''
\echo '== 6. THE OTHER ONE THAT MATTERS: the topic''s mute, the room''s mute and the switch on Me each silence it (expect 0, 0, 0, then 1) =='
insert into public.chat_topic_mutes (topic_id, member_id)
values ('33333333-7777-0000-0000-000000000001', 'bbbbbbbb-7777-0000-0000-00000000000b');
select count(*) as owed_topic_muted from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');
delete from public.chat_topic_mutes;
insert into public.chat_room_mutes (room_id, member_id)
values ('probe-likes', 'bbbbbbbb-7777-0000-0000-00000000000b');
select count(*) as owed_room_muted from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');
delete from public.chat_room_mutes;
insert into public.push_muted_kinds (member_id, kind)
values ('bbbbbbbb-7777-0000-0000-00000000000b', 'like');
select count(*) as owed_switched_off from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');
delete from public.push_muted_kinds;
select count(*) as owed_again from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');

\echo ''
\echo '== 7. a closed room tells nobody who can no longer read it (expect 0) =='
savepoint closed;
update public.chat_rooms set opened_at = null where id = 'probe-likes';
select count(*) as owed_closed from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');
rollback to savepoint closed;

\echo ''
\echo '== 8. nor a paused author (expect 0) =='
savepoint paused;
update public.members set status = 'suspended' where id = 'bbbbbbbb-7777-0000-0000-00000000000b';
select count(*) as owed_paused from public.push_owed(:'secret', 'like',
  '{"post_id":"44444444-7777-0000-0000-000000000002","member_id":"aaaaaaaa-7777-0000-0000-00000000000a"}');
rollback to savepoint paused;

\echo ''
\echo '== 9. a new like queues one request for the function (expect 1, like) =='
\echo '   A fresh stack has no push_notify_url; one is made here, pointing at the'
\echo '   discard port, and the rollback takes it and the request away.'
select count(vault.create_secret('http://127.0.0.1:9/discard', 'push_notify_url')) as url_made
  from (select 1) one
 where not exists (select 1 from vault.decrypted_secrets where name = 'push_notify_url');
select count(*) as before_count from net.http_request_queue \gset
insert into public.chat_post_likes (post_id, member_id)
values ('44444444-7777-0000-0000-000000000002', 'cccccccc-7777-0000-0000-00000000000c');
select count(*) - :before_count as queued,
       max(convert_from(body, 'utf8')::jsonb ->> 'event') as event
  from net.http_request_queue;

\echo ''
\echo '== 10. a member switches likes off for themselves (expect current_user authenticated, INSERT 0 1) =='
set local role authenticated;
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-00000000000b","role":"authenticated"}';
select current_user;
insert into public.push_muted_kinds (member_id, kind) values ('bbbbbbbb-7777-0000-0000-00000000000b', 'like');

rollback;

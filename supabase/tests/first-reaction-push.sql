-- ============================================================================
-- The three gaps found 2026-11-14, closed by 20261114100000
-- ============================================================================
-- 1. Two likes at once: the first pushes, not neither.
-- 2. Liked, unliked and liked again: no second push.
-- 3. Important unmarked and marked again within 2 hours: no new push.
-- Every check raises on failure. Rolls back.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/first-reaction-push.sql
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

create function pg_temp.owed(p_event text, p_key jsonb) returns integer language sql as $$
  select count(*)::integer from public.push_owed(
    (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret'), p_event, p_key);
$$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAIL: %', what; end if;
  raise notice 'ok: %', what;
end $$;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('aaaaaaaa-1410-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990141000', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-1410-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990141001', '1981-01-01', 'C5–C8', 'CA'),
  ('cccccccc-1410-0000-0000-00000000000c', 'peer', 'active', 'Cy',  '19990141002', '1982-01-01', 'C5–C8', 'CA');
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/probe1410' || substr(id::text, 1, 8), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999014100%';

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-1410', 'Probe 1410', 'For the probe.', 'Life', 997, now());
insert into public.chat_topics (id, room_id, title, author_id)
values ('33333333-1410-0000-0000-000000000001', 'probe-1410', 'Ana asks', 'aaaaaaaa-1410-0000-0000-00000000000a');
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('44444444-1410-0000-0000-000000000001', '33333333-1410-0000-0000-000000000001', 'aaaaaaaa-1410-0000-0000-00000000000a', 'Mornings?'),
  ('44444444-1410-0000-0000-000000000002', '33333333-1410-0000-0000-000000000001', 'aaaaaaaa-1410-0000-0000-00000000000a', 'Evenings?');

-- 1. Bo and Cy like Ana's post in the same moment: Bo's claims it.
insert into public.chat_post_likes (post_id, member_id) values
  ('44444444-1410-0000-0000-000000000001', 'bbbbbbbb-1410-0000-0000-00000000000b'),
  ('44444444-1410-0000-0000-000000000001', 'cccccccc-1410-0000-0000-00000000000c');
select pg_temp.check(pg_temp.owed('like', '{"post_id":"44444444-1410-0000-0000-000000000001","member_id":"bbbbbbbb-1410-0000-0000-00000000000b"}') = 1,
  'two likes at once: the first pushes');
select pg_temp.check(pg_temp.owed('like', '{"post_id":"44444444-1410-0000-0000-000000000001","member_id":"cccccccc-1410-0000-0000-00000000000c"}') = 0,
  'two likes at once: the second waits in the bell');

-- 2. Bo's like was a minute ago; Bo unlikes and likes again now: no push.
update public.chat_post_likes set liked_at = now() - interval '1 minute'
 where post_id = '44444444-1410-0000-0000-000000000001' and member_id = 'bbbbbbbb-1410-0000-0000-00000000000b';
update private.first_reaction_push set made_at = now() - interval '1 minute'
 where target_id = '44444444-1410-0000-0000-000000000001';
select pg_temp.check(pg_temp.owed('like', '{"post_id":"44444444-1410-0000-0000-000000000001","member_id":"bbbbbbbb-1410-0000-0000-00000000000b"}') = 1,
  'the first like still pushes a minute on');
delete from public.chat_post_likes
 where post_id = '44444444-1410-0000-0000-000000000001' and member_id = 'bbbbbbbb-1410-0000-0000-00000000000b';
insert into public.chat_post_likes (post_id, member_id)
values ('44444444-1410-0000-0000-000000000001', 'bbbbbbbb-1410-0000-0000-00000000000b');
select pg_temp.check(pg_temp.owed('like', '{"post_id":"44444444-1410-0000-0000-000000000001","member_id":"bbbbbbbb-1410-0000-0000-00000000000b"}') = 0,
  'liked again: no second push');

-- Ana's own like claims nothing; Bo's reaction after it is the first.
insert into public.chat_post_likes (post_id, member_id)
values ('44444444-1410-0000-0000-000000000002', 'aaaaaaaa-1410-0000-0000-00000000000a');
insert into public.chat_post_reactions (target_id, member_id, emoji)
values ('44444444-1410-0000-0000-000000000002', 'bbbbbbbb-1410-0000-0000-00000000000b', '👍');
select pg_temp.check(pg_temp.owed('reaction', '{"target":"post","id":"44444444-1410-0000-0000-000000000002","member_id":"bbbbbbbb-1410-0000-0000-00000000000b"}') = 1,
  'the author''s own like does not take the first push');

-- A message in a group: Bo reacts first, Cy second; Bo clears and reacts again later.
insert into public.chat_threads (id, kind, name, created_by) values
  ('17171717-1410-0000-0000-000000000001', 'group', 'Probe 1410', 'aaaaaaaa-1410-0000-0000-00000000000a');
insert into public.chat_thread_members (thread_id, member_id) values
  ('17171717-1410-0000-0000-000000000001', 'aaaaaaaa-1410-0000-0000-00000000000a'),
  ('17171717-1410-0000-0000-000000000001', 'bbbbbbbb-1410-0000-0000-00000000000b'),
  ('17171717-1410-0000-0000-000000000001', 'cccccccc-1410-0000-0000-00000000000c');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('18181818-1410-0000-0000-000000000001', '17171717-1410-0000-0000-000000000001', 'aaaaaaaa-1410-0000-0000-00000000000a', 'Read this');
insert into public.chat_message_reactions (target_id, member_id, emoji, thread_id) values
  ('18181818-1410-0000-0000-000000000001', 'bbbbbbbb-1410-0000-0000-00000000000b', '❤️', '17171717-1410-0000-0000-000000000001'),
  ('18181818-1410-0000-0000-000000000001', 'cccccccc-1410-0000-0000-00000000000c', '👍', '17171717-1410-0000-0000-000000000001');
select pg_temp.check(pg_temp.owed('reaction', '{"target":"message","id":"18181818-1410-0000-0000-000000000001","member_id":"bbbbbbbb-1410-0000-0000-00000000000b"}') = 1,
  'message: the first reaction pushes');
select pg_temp.check(pg_temp.owed('reaction', '{"target":"message","id":"18181818-1410-0000-0000-000000000001","member_id":"cccccccc-1410-0000-0000-00000000000c"}') = 0,
  'message: the second waits in the bell');
update private.first_reaction_push set made_at = now() - interval '1 minute'
 where target_id = '18181818-1410-0000-0000-000000000001';
update private.reaction_made set made_at = now() - interval '1 minute'
 where target_id = '18181818-1410-0000-0000-000000000001' and member_id = 'bbbbbbbb-1410-0000-0000-00000000000b';
update public.chat_message_reactions set emoji = null
 where target_id = '18181818-1410-0000-0000-000000000001' and member_id = 'bbbbbbbb-1410-0000-0000-00000000000b';
update public.chat_message_reactions set emoji = '🔥'
 where target_id = '18181818-1410-0000-0000-000000000001' and member_id = 'bbbbbbbb-1410-0000-0000-00000000000b';
select pg_temp.check(pg_temp.owed('reaction', '{"target":"message","id":"18181818-1410-0000-0000-000000000001","member_id":"bbbbbbbb-1410-0000-0000-00000000000b"}') = 0,
  'message: reacted again later, no second push');

-- 3. Ana started the group: she marks her message Important, unmarks, marks again.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1410-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
select public.chat_mark_important('18181818-1410-0000-0000-000000000001', true);
select pg_temp.check((select count(distinct batch) = 1 from private.important_pushes
  where message_id = '18181818-1410-0000-0000-000000000001'), 'marking pushes once');
update private.important_pushes set batch = batch - interval '1 hour'
 where message_id = '18181818-1410-0000-0000-000000000001';
select public.chat_mark_important('18181818-1410-0000-0000-000000000001', false);
select public.chat_mark_important('18181818-1410-0000-0000-000000000001', true);
select pg_temp.check(not exists (select 1 from private.important_pushes
  where message_id = '18181818-1410-0000-0000-000000000001' and batch > now() - interval '1 minute')
  and exists (select 1 from private.important_pushes
  where message_id = '18181818-1410-0000-0000-000000000001'), 'marked again within 2 hours: no new push');
select pg_temp.check((select unmarked_at is null from public.chat_important_messages
  where message_id = '18181818-1410-0000-0000-000000000001'), 'marked again within 2 hours: Important again');
select pg_temp.check((select count(*) = 2 from public.notifications
  where tag = 'important:18181818-1410-0000-0000-000000000001' and read_at is null),
  'marked again within 2 hours: back in Bo''s and Cy''s bell');
update private.important_pushes set batch = batch - interval '2 hours'
 where message_id = '18181818-1410-0000-0000-000000000001';
select public.chat_mark_important('18181818-1410-0000-0000-000000000001', false);
select public.chat_mark_important('18181818-1410-0000-0000-000000000001', true);
select pg_temp.check((select count(*) > 0 from private.important_pushes
  where message_id = '18181818-1410-0000-0000-000000000001' and batch > now() - interval '1 minute'),
  'marked again after 2 hours: pushes again');

\echo 'ALL PASSED'
rollback;

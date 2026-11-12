-- ============================================================================
-- Speed limits on writing and asking, and the upload check
-- ============================================================================
-- 20261112020000: a member sends at most 30 messages and 20 posts a minute;
-- notices and other members are not counted. 20261112030000: one address asks
-- for an invite at most 3 times a day, even though asking again only
-- refreshes the open request. 20261112010000: every upload to a club bucket
-- is sent to upload-guard, once switched on.
--
-- The writes are made as postgres with a member's claims, so auth.uid() is
-- theirs while the policies (not under test here) stand aside.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/speed-limits.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

delete from vault.secrets where name = 'upload_guard_url';

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-1112-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990111200', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-1112-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990111201', '1981-01-01', 'C5–C8', 'CA');
insert into public.chat_threads (id, kind, direct_key) values
  ('11111111-1112-0000-0000-000000000001', 'direct',
   'aaaaaaaa-1112-0000-0000-00000000000a:bbbbbbbb-1112-0000-0000-00000000000b');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11111111-1112-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a'),
  ('11111111-1112-0000-0000-000000000001', 'bbbbbbbb-1112-0000-0000-00000000000b');
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-speed', 'Probe speed', 'For the probe.', 'Life', 9112, now());
insert into public.chat_topics (id, room_id, title, author_id)
values ('11120000-0000-0000-0000-000000000001', 'probe-speed', 'Ana asks', 'aaaaaaaa-1112-0000-0000-00000000000a');

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1112-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 1. a notice is not counted (expect INSERT 0 5) =='
insert into public.chat_messages (thread_id, author_id, body, notice)
select '11111111-1112-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a', 'Added Bo', 'added'
  from generate_series(1, 5);

\echo ''
\echo '== 2. 30 messages in a minute go, the 31st does not (expect INSERT 0 30, then ERROR: {"code" : "P0001", ... "That is a lot of messages ...) =='
insert into public.chat_messages (thread_id, author_id, body)
select '11111111-1112-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a', 'hi ' || n
  from generate_series(1, 30) n;
savepoint thirty_first;
insert into public.chat_messages (thread_id, author_id, body)
values ('11111111-1112-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a', 'one more');
rollback to savepoint thirty_first;

\echo ''
\echo '== 3. the other member is not held back by it (expect INSERT 0 1) =='
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1112-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
insert into public.chat_messages (thread_id, author_id, body)
values ('11111111-1112-0000-0000-000000000001', 'bbbbbbbb-1112-0000-0000-00000000000b', 'slow down');

\echo ''
\echo '== 4. 20 posts in a minute go, the 21st does not (expect INSERT 0 20, then ERROR: ... "That is a lot of posts ...) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1112-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
insert into public.chat_posts (topic_id, author_id, body)
select '11120000-0000-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a', 'post ' || n
  from generate_series(1, 20) n;
savepoint twenty_first;
insert into public.chat_posts (topic_id, author_id, body)
values ('11120000-0000-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a', 'one more');
rollback to savepoint twenty_first;

\echo ''
\echo '== 5. the server writing for nobody is not limited (expect INSERT 0 1) =='
select set_config('request.jwt.claims', '', true) is not null as ok;
insert into public.chat_messages (thread_id, author_id, body)
values ('11111111-1112-0000-0000-000000000001', 'aaaaaaaa-1112-0000-0000-00000000000a', 'from the server');

\echo ''
\echo '== 6. one address asks 3 times, not a 4th, though the same request is refreshed (expect three empty rows, then ERROR: ... "Too many requests today ...) =='
update public.organizations set removed_at = null where is_the_club;
insert into public.organization_representatives (organization_id, member_id)
select o.id, 'aaaaaaaa-1112-0000-0000-00000000000a' from public.organizations o where o.is_the_club
on conflict do nothing;
select public.request_club_invite('Pat', 'pat-1112@example.com', null);
select public.request_club_invite('Pat', 'pat-1112@example.com', null);
select public.request_club_invite('Pat', 'pat-1112@example.com', 'again');
savepoint fourth_ask;
select public.request_club_invite('Pat', 'pat-1112@example.com', 'and again');
rollback to savepoint fourth_ask;

\echo ''
\echo '== 7. an upload to a club bucket goes to upload-guard once switched on (expect 0, then 1) =='
insert into storage.objects (bucket_id, name, metadata)
values ('chat', 'threads/probe-1112/a.jpg', '{"mimetype":"image/jpeg"}');
select count(*) as sent_while_off from net.http_request_queue
 where convert_from(body, 'utf8') like '%probe-1112%';
select vault.create_secret('http://127.0.0.1:9/upload-guard', 'upload_guard_url', 'probe') is not null as on;
insert into storage.objects (bucket_id, name, metadata)
values ('photos', 'probe-1112/b.webp', '{"mimetype":"image/webp"}');
select count(*) as sent_once_on from net.http_request_queue
 where convert_from(body, 'utf8') like '%probe-1112%';

rollback;

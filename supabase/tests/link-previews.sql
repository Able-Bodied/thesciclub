-- ============================================================================
-- Who can write a link's preview, and when it goes
-- ============================================================================
-- 20261006010000: the link-preview function writes a preview onto a message
-- or a post through link_preview_save, with the vault's secret. Nobody else
-- can write one, an edit or a removal clears it, a fetch that finishes after
-- an edit writes nothing, and a preview that is not one is refused.
--
-- Run as real signed-in members, not as the superuser: postgres is BYPASSRLS.
-- The superuser writes the rows and plays the function (the service role
-- cannot be switched to here with the vault secret readable, so the function's
-- two calls are made as postgres with the real secret). Every expected
-- refusal sits in its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/link-previews.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- A probe starts with the switch off, even on a local stack used to try it.
-- The rollback restores whatever the developer had set.
delete from vault.secrets where name = 'link_preview_url';

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-8888-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990000080', '1980-01-01', 'C5–C8', 'CA'),
  ('bbbbbbbb-8888-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990000081', '1981-01-01', 'C5–C8', 'CA');

insert into public.chat_threads (id, kind, direct_key) values
  ('11111111-8888-0000-0000-000000000001', 'direct',
   'aaaaaaaa-8888-0000-0000-00000000000a:bbbbbbbb-8888-0000-0000-00000000000b');
insert into public.chat_thread_members (thread_id, member_id) values
  ('11111111-8888-0000-0000-000000000001', 'aaaaaaaa-8888-0000-0000-00000000000a'),
  ('11111111-8888-0000-0000-000000000001', 'bbbbbbbb-8888-0000-0000-00000000000b');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('a1111111-8888-0000-0000-000000000001', '11111111-8888-0000-0000-000000000001',
   'aaaaaaaa-8888-0000-0000-00000000000a', 'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ');

select s.decrypted_secret as secret
  from vault.decrypted_secrets s where s.name = 'link_preview_secret' \gset

\echo ''
\echo '== 1. the function reads the words with the secret, and not without (expect the words, then ERROR: Not the link preview trigger.) =='
select public.link_preview_source(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001');
savepoint wrong_secret;
select public.link_preview_source('guess', 'chat_messages', 'a1111111-8888-0000-0000-000000000001');
rollback to savepoint wrong_secret;

\echo ''
\echo '== 2. it saves a preview, and only the known keys (expect t, then the title and no "extra") =='
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001',
  'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  jsonb_build_object('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title', 'A song',
    'description', null, 'siteName', 'YouTube',
    'imagePath', repeat('a', 64) || '.jpg', 'youtubeId', 'dQw4w9WgXcQ', 'extra', 'smuggled'));
select link_preview ->> 'title' as title, link_preview ? 'extra' as has_extra
  from public.chat_messages where id = 'a1111111-8888-0000-0000-000000000001';

\echo ''
\echo '== 3. and refuses what is not a preview (expect ERROR: Not a preview. x3) =='
savepoint bad_path;
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001',
  'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  jsonb_build_object('url', 'https://x.example/', 'imagePath', '../photos/someone.webp'));
rollback to savepoint bad_path;
savepoint bad_url;
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001',
  'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  jsonb_build_object('url', 'javascript:alert(1)', 'title', 'x'));
rollback to savepoint bad_url;
savepoint bad_video;
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001',
  'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  jsonb_build_object('url', 'https://x.example/', 'youtubeId', '"><script>'));
rollback to savepoint bad_video;

select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-8888-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 4. the reader reads it with the message (expect A song | dQw4w9WgXcQ) =='
select link_preview ->> 'title' as title, link_preview ->> 'youtubeId' as video
  from public.chat_messages where id = 'a1111111-8888-0000-0000-000000000001';

\echo ''
\echo '== 5. nobody writes one themselves (expect ERROR: permission denied x3) =='
savepoint write_own;
update public.chat_messages set link_preview = '{"url":"https://evil.example/","title":"Your bank"}'
 where id = 'a1111111-8888-0000-0000-000000000001';
rollback to savepoint write_own;
savepoint insert_own;
insert into public.chat_messages (thread_id, author_id, body, link_preview)
values ('11111111-8888-0000-0000-000000000001', 'bbbbbbbb-8888-0000-0000-00000000000b',
        'https://bank.example', '{"url":"https://bank.example","title":"Log in"}');
rollback to savepoint insert_own;
savepoint call_save;
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001', '', '{}');
rollback to savepoint call_save;

reset role;

\echo ''
\echo '== 6. an edit clears it (expect t: no preview) =='
update public.chat_messages set body = 'Changed my mind', edited_at = now()
 where id = 'a1111111-8888-0000-0000-000000000001';
select link_preview is null as cleared from public.chat_messages where id = 'a1111111-8888-0000-0000-000000000001';

\echo ''
\echo '== 7. a fetch of the old words that finishes now writes nothing (expect f, then t) =='
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001',
  'Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  jsonb_build_object('url', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'title', 'A song'));
select link_preview is null as still_cleared from public.chat_messages where id = 'a1111111-8888-0000-0000-000000000001';

\echo ''
\echo '== 8. a message taken back loses its preview, and its words are not handed out (expect t, then a null) =='
update public.chat_messages set body = 'https://reeve.org' where id = 'a1111111-8888-0000-0000-000000000001';
select public.link_preview_save(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001',
  'https://reeve.org', jsonb_build_object('url', 'https://reeve.org/', 'title', 'Reeve')) as saved;
update public.chat_messages set body = '', removed_at = now() where id = 'a1111111-8888-0000-0000-000000000001';
select link_preview is null as cleared from public.chat_messages where id = 'a1111111-8888-0000-0000-000000000001';
select public.link_preview_source(:'secret', 'chat_messages', 'a1111111-8888-0000-0000-000000000001') as words;

\echo ''
\echo '== 9. with the switch off, a link queues nothing for the previewer (expect 0) =='
\echo '   Counted by the x-preview-secret header: a stack with notifications on queues those too.'
select count(*) as queued_before from net.http_request_queue where headers ? 'x-preview-secret' \gset
insert into public.chat_messages (thread_id, author_id, body) values
  ('11111111-8888-0000-0000-000000000001', 'aaaaaaaa-8888-0000-0000-00000000000a', 'https://reeve.org again');
select count(*) - :queued_before as queued from net.http_request_queue where headers ? 'x-preview-secret';

\echo ''
\echo '== 10. switched on, a link queues one call and words without a link none (expect 1) =='
select vault.create_secret('http://127.0.0.1:9/link-preview', 'link_preview_url', 'probe') is not null as switched_on;
select count(*) as queued_before from net.http_request_queue where headers ? 'x-preview-secret' \gset
insert into public.chat_messages (thread_id, author_id, body) values
  ('11111111-8888-0000-0000-000000000001', 'aaaaaaaa-8888-0000-0000-00000000000a', 'see www.reeve.org'),
  ('11111111-8888-0000-0000-000000000001', 'aaaaaaaa-8888-0000-0000-00000000000a', 'no link here');
select count(*) - :queued_before as queued from net.http_request_queue where headers ? 'x-preview-secret';

\echo ''
\echo '== 10b. switched on, the backfill asks once about each standing link with no card (expect 2, then 2, then t) =='
\echo '   One message from 10 and one room post; no words without a link, taken-back rows, or cards already saved.'
update public.chat_messages set link_preview = jsonb_build_object('url', 'https://reeve.org/', 'title', 'Already')
 where body = 'https://reeve.org again';
-- Keep a link in the removed rows: otherwise checking removed_at would not
-- be tested, because an empty body would skip them for a different reason.
insert into public.chat_messages (thread_id, author_id, body, removed_at) values
  ('11111111-8888-0000-0000-000000000001', 'aaaaaaaa-8888-0000-0000-00000000000a', 'https://reeve.org/removed', now());
insert into public.chat_topics (id, room_id, author_id, title) values
  ('22222222-8888-0000-0000-000000000001', 'bowel', 'aaaaaaaa-8888-0000-0000-00000000000a', 'Earlier links');
insert into public.chat_posts (id, topic_id, author_id, body, removed_at, link_preview) values
  ('33333333-8888-0000-0000-000000000001', '22222222-8888-0000-0000-000000000001',
   'aaaaaaaa-8888-0000-0000-00000000000a', 'https://reeve.org/earlier', null, null),
  ('33333333-8888-0000-0000-000000000002', '22222222-8888-0000-0000-000000000001',
   'aaaaaaaa-8888-0000-0000-00000000000a', 'https://reeve.org/removed', now(), null),
  ('33333333-8888-0000-0000-000000000003', '22222222-8888-0000-0000-000000000001',
   'aaaaaaaa-8888-0000-0000-00000000000a', 'https://reeve.org/already', null,
   jsonb_build_object('url', 'https://reeve.org/already', 'title', 'Already')),
  ('33333333-8888-0000-0000-000000000004', '22222222-8888-0000-0000-000000000001',
   'aaaaaaaa-8888-0000-0000-00000000000a', 'no link here', null, null);
select count(*) as queued_before, coalesce(max(id), 0) as last_request
  from net.http_request_queue where headers ? 'x-preview-secret' \gset
set local role service_role;
select public.link_preview_backfill() as asked;
reset role;
select count(*) - :queued_before as queued from net.http_request_queue where headers ? 'x-preview-secret';
select count(*) = 2 and count(distinct convert_from(body, 'UTF8')::jsonb ->> 'table') = 2 as both_tables
  from net.http_request_queue where headers ? 'x-preview-secret'
   and id > :last_request;

\echo ''
\echo '== 10b2. once both cards are saved, running it again asks nothing (expect t, t, 0, 0) =='
select id as earlier_message from public.chat_messages where body = 'see www.reeve.org' \gset
set local role service_role;
select public.link_preview_save(:'secret', 'chat_messages', :'earlier_message',
  'see www.reeve.org', jsonb_build_object('url', 'https://www.reeve.org/', 'title', 'Reeve'));
select public.link_preview_save(:'secret', 'chat_posts', '33333333-8888-0000-0000-000000000001',
  'https://reeve.org/earlier', jsonb_build_object('url', 'https://reeve.org/earlier', 'title', 'Reeve'));
reset role;
select count(*) as queued_before from net.http_request_queue where headers ? 'x-preview-secret' \gset
set local role service_role;
select public.link_preview_backfill() as asked;
reset role;
select count(*) - :queued_before as queued from net.http_request_queue where headers ? 'x-preview-secret';

\echo ''
\echo '== 10c. a member cannot run the backfill or queue requests themselves (expect permission denied twice) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-8888-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
savepoint member_backfill;
select public.link_preview_backfill();
rollback to savepoint member_backfill;
savepoint member_request;
select public.link_preview_request('chat_messages', :'earlier_message');
rollback to savepoint member_request;
reset role;

\echo ''
\echo '== 10c2. somebody signed out cannot run it either (expect permission denied) =='
set local role anon;
savepoint anon_backfill;
select public.link_preview_backfill();
rollback to savepoint anon_backfill;
reset role;

\echo ''
\echo '== 10d. switched off, it says so rather than asking nothing (expect ERROR: Link previews are switched off: set link_preview_url first.) =='
delete from vault.secrets where name = 'link_preview_url';
savepoint switched_off;
select public.link_preview_backfill();
rollback to savepoint switched_off;

\echo ''
\echo '== 11. the bucket is private and only an active member reads it (expect f, then the policy) =='
select public from storage.buckets where id = 'link-previews';
select policyname from pg_policies where tablename = 'objects' and policyname = 'an active member reads link pictures';

rollback;

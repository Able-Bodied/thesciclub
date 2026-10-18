-- ============================================================================
-- Can a post name somebody else's photograph, and get it deleted by an
-- administrator's moderation?
-- ============================================================================
-- 20261018020000 (security scan of 2026-10-17, F3 and F4). Before it, steps 3
-- and 4 inserted, and steps 7 and 8 handed the victim's photograph to the
-- administrator's client, which deletes what it is given through the storage
-- API: a member could have anybody's photographs destroyed by posting them
-- and waiting to be moderated. Steps 1, 2 and 6 have to keep working: posting
-- your own photographs, and removing a post deleting its own files.
--
-- Files are put in storage.objects as the superuser (the API is what puts
-- real ones there); the posts are written as members, under RLS and the
-- trigger. Every expected refusal has its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-photographs-are-the-authors.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-1820-0000-0000-00000000000a', 'mentor', 'active', 'Admin',  '19990002001', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-1820-0000-0000-00000000000b', 'peer',   'active', 'Victim', '19990002002', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-1820-0000-0000-00000000000c', 'peer',   'active', 'Poster', '19990002003', '1982-01-01', 'C5–C8', 'CA', false);
update public.chat_rooms set opened_at = now() where id in ('bowel', 'skin');

insert into public.chat_topics (id, room_id, title, author_id)
values ('11111111-1820-0000-0000-00000000000a', 'bowel', 'Rucksacks',
        'bbbbbbbb-1820-0000-0000-00000000000b');

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('chat', 'rooms/bowel/victim.webp',      'bbbbbbbb-1820-0000-0000-00000000000b', '{"size": 1}'),
  ('chat', 'rooms/bowel/poster.webp',      'cccccccc-1820-0000-0000-00000000000c', '{"size": 1}'),
  ('chat', 'rooms/skin/poster-elsewhere.webp', 'cccccccc-1820-0000-0000-00000000000c', '{"size": 1}');

-- ========================================================== as the victim
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1820-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. a member posts their own photograph (expect INSERT 0 1) =='
insert into public.chat_posts (topic_id, author_id, body, attachments)
values ('11111111-1820-0000-0000-00000000000a',
        'bbbbbbbb-1820-0000-0000-00000000000b', 'Mine fits.', array['rooms/bowel/victim.webp']);

reset role;

-- ========================================================== as the poster
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-1820-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 2. another member posts theirs (expect one id) =='
insert into public.chat_posts (topic_id, author_id, body, attachments)
values ('11111111-1820-0000-0000-00000000000a',
        'cccccccc-1820-0000-0000-00000000000c', 'So does mine.', array['rooms/bowel/poster.webp'])
returning id as poster_post \gset
\echo :poster_post

\echo ''
\echo '== 3. but cannot name the victim''s photograph =='
\echo '   expect: ERROR, those photographs have not been uploaded'
savepoint names_victim;
insert into public.chat_posts (topic_id, author_id, body, attachments)
values ('11111111-1820-0000-0000-00000000000a', 'cccccccc-1820-0000-0000-00000000000c',
        'Look', array['rooms/bowel/victim.webp']);
rollback to savepoint names_victim;

\echo ''
\echo '== 4. nor their own photograph from another room =='
\echo '   expect: ERROR, those photographs are not in this room'
savepoint other_room;
insert into public.chat_posts (topic_id, author_id, body, attachments)
values ('11111111-1820-0000-0000-00000000000a', 'cccccccc-1820-0000-0000-00000000000c',
        'Look', array['rooms/skin/poster-elsewhere.webp']);
rollback to savepoint other_room;

\echo ''
\echo '== 5. nor a file that is not there =='
\echo '   expect: ERROR, those photographs have not been uploaded'
savepoint missing;
insert into public.chat_posts (topic_id, author_id, body, attachments)
values ('11111111-1820-0000-0000-00000000000a', 'cccccccc-1820-0000-0000-00000000000c',
        'Look', array['rooms/bowel/nothing.webp']);
rollback to savepoint missing;

reset role;

-- A post written before the trigger, naming the victim's photograph: the
-- row is what the moderation below has to be safe against. No signed-in
-- caller, as a migration writes, so the trigger lets it through.
select set_config('request.jwt.claims', '', true) is not null as ok;
insert into public.chat_posts (id, topic_id, author_id, body, attachments)
values ('22222222-1820-0000-0000-000000000003', '11111111-1820-0000-0000-00000000000a',
        'cccccccc-1820-0000-0000-00000000000c', 'Old', array['rooms/bowel/victim.webp']);

-- ===================================================== as the administrator
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1820-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 6. removing the poster''s own post returns its own file (expect {rooms/bowel/poster.webp}) =='
select public.chat_remove_post(:'poster_post') as delete_these;

\echo ''
\echo '== 7. removing the old post returns nothing: the file is the victim''s (expect {}) =='
select public.chat_remove_post('22222222-1820-0000-0000-000000000003') as delete_these;

\echo ''
\echo '== 8. deleting the topic returns each author''s own files only =='
\echo '   expect: {rooms/bowel/poster.webp,rooms/bowel/victim.webp}, the victim''s from'
\echo '   their own post, never from the old one'
select public.admin_delete_topic('11111111-1820-0000-0000-00000000000a') as delete_these;

\echo ''
\echo '== 9. a spam topic whose only post names the victim''s photograph returns nothing'
\echo '   (expect {}) =='
reset role;
select set_config('request.jwt.claims', '', true) is not null as ok;
insert into public.chat_topics (id, room_id, title, author_id)
values ('11111111-1820-0000-0000-00000000000b', 'bowel', 'Spam',
        'cccccccc-1820-0000-0000-00000000000c');
insert into public.chat_posts (topic_id, author_id, body, attachments)
values ('11111111-1820-0000-0000-00000000000b', 'cccccccc-1820-0000-0000-00000000000c',
        'Spam', array['rooms/bowel/victim.webp']);
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1820-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.admin_delete_topic('11111111-1820-0000-0000-00000000000b') as delete_these;

reset role;

rollback;

-- ============================================================================
-- Editing a post or a message (20260930000000): who may, what is kept, who
-- may read what was kept. Run as signed-in roles, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-edits.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Three steps carry the feature and are marked in place:
--
--   3  — an administrator cannot edit a member's post, and can read every
--        earlier version of it. Both halves matter: the first is what keeps
--        "Edited" the author's word and nobody else's, the second is why the
--        versions are kept at all.
--   4  — a member reads none of chat_edits, their own included. The table has
--        one select policy and it is is_admin(); sabotage it to `true` and
--        this step must go to 1.
--   12 — deleting a topic takes its edits with it, by cascade.
--
-- Step 0 prints current_user because as the superuser every step below turns
-- green while proving nothing — `postgres` is BYPASSRLS. Every expected
-- refusal has its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-8888-0000-0000-000000000001', 'peer',   'active', 'Author A',   '19990008001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-8888-0000-0000-000000000002', 'peer',   'active', 'Other O',    '19990008002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('cccccccc-8888-0000-0000-000000000003', 'peer',   'active', 'Outsider X', '19990008003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('eeeeeeee-8888-0000-0000-000000000005', 'mentor', 'active', 'Admin A',    '19990008005', '1984-01-01', 'C5–C8',  'CA', true, true);

update public.chat_rooms set opened_at = now() where id = 'bowel';
update public.chat_rooms set opened_at = null where id = 'bladder';

-- Nobody joins anything: writing needs no membership since 20260930000000.

-- A topic by Author, born the real way, with a second post carrying a
-- photograph and no words, and a third to be removed.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select public.chat_create_topic('bowel', 'Editing', 'The first draft.') as topic_id \gset
select p.id as post_id from public.chat_posts p where p.topic_id = :'topic_id' \gset
-- A conversation between Author and Other.
select public.chat_open_direct('bbbbbbbb-8888-0000-0000-000000000002') as dm \gset
-- The rest with fixed ids, as the superuser: `id` is not a granted insert
-- column, which is right, and these rows are the situation.
set local role postgres;
-- The opener is dated back a minute: one transaction is one now(), and "the
-- opening post" is the earliest — HANDOFF.md's now() trap.
update public.chat_posts set created_at = now() - interval '1 minute' where id = :'post_id';
insert into public.chat_posts (id, topic_id, author_id, body, attachments) values
  ('44444444-8888-0000-0000-000000000002', :'topic_id', 'aaaaaaaa-8888-0000-0000-000000000001', '', '{rooms/bowel/pic.webp}'),
  ('44444444-8888-0000-0000-000000000003', :'topic_id', 'aaaaaaaa-8888-0000-0000-000000000001', 'To be removed.', '{}');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('55555555-8888-0000-0000-000000000001', :'dm', 'aaaaaaaa-8888-0000-0000-000000000001', 'Mine, first draft.'),
  ('55555555-8888-0000-0000-000000000002', :'dm', 'bbbbbbbb-8888-0000-0000-000000000002', 'Theirs.');
set local role authenticated;

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-8888-... | f'
select current_user, auth.uid()::text as uid, public.is_admin() as admin;

\echo ''
\echo '== 1. the author edits their post, and it says so =='
\echo '   expect: the new words, edited_at set, and 2 replies still counted.'
select public.chat_edit_post(:'post_id', '  The second draft.  ');
select body, edited_at is not null as edited from public.chat_posts where id = :'post_id';
select reply_count from public.chat_topics where id = :'topic_id';

\echo ''
\echo '== 1b. a member cannot write edited_at or reply into chat_edits themselves =='
\echo '   expect: permission denied twice — edited_at is not a granted column'
\echo '   (Postgres names the table), and chat_edits takes no insert from anybody.'
savepoint forge_edited_at;
insert into public.chat_posts (topic_id, author_id, body, edited_at)
values (:'topic_id', 'aaaaaaaa-8888-0000-0000-000000000001', 'Born edited', now());
rollback to savepoint forge_edited_at;
savepoint forge_edit_row;
insert into public.chat_edits (post_id, body) values (:'post_id', 'A made-up earlier version');
rollback to savepoint forge_edit_row;

\echo ''
\echo '== 2. another member cannot edit it =='
\echo '   expect: ERROR, You can only edit your own post.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
savepoint other_edits;
select public.chat_edit_post(:'post_id', 'Not my words to change.');
rollback to savepoint other_edits;

\echo ''
\echo '== 3. THE STEP: an administrator cannot edit it, and can read what it said =='
\echo '   expect: ERROR, You can only edit your own post; then 1 row holding'
\echo '   "The first draft." with Author as edited_by.'
set local request.jwt.claims = '{"sub":"eeeeeeee-8888-0000-0000-000000000005","role":"authenticated"}';
select current_user, public.is_admin() as admin;
savepoint admin_edits;
select public.chat_edit_post(:'post_id', 'An administrator rewriting it.');
rollback to savepoint admin_edits;
select body, edited_by = 'aaaaaaaa-8888-0000-0000-000000000001' as by_the_author
  from public.chat_edits where post_id = :'post_id';

\echo ''
\echo '== 4. THE STEP: a member reads none of chat_edits, their own included =='
\echo '   expect: 0 as Author, 0 as Other, against a table holding 1 row.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select count(*) as author_sees from public.chat_edits;
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
select count(*) as other_sees from public.chat_edits;
set local role postgres;
select count(*) as rows_in_table from public.chat_edits;
set local role authenticated;

\echo ''
\echo '== 5. a removed post cannot be edited =='
\echo '   expect: ERROR, That post has been removed.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select public.chat_remove_post('44444444-8888-0000-0000-000000000003');
savepoint edit_removed;
select public.chat_edit_post('44444444-8888-0000-0000-000000000003', 'Back from the dead.');
rollback to savepoint edit_removed;

\echo ''
\echo '== 6. an unchanged body is refused, so "Edited" is never a lie =='
\echo '   expect: ERROR, Nothing changed. Trimmed first: spaces are not a change.'
savepoint unchanged;
select public.chat_edit_post(:'post_id', '  The second draft.');
rollback to savepoint unchanged;

\echo ''
\echo '== 7. a blank body is refused, unless the post has photographs =='
\echo '   expect: ERROR on the wordy post; then the photograph post takes words'
\echo '   and gives them up again, two versions kept.'
savepoint blank_words;
select public.chat_edit_post(:'post_id', '   ');
rollback to savepoint blank_words;
select public.chat_edit_post('44444444-8888-0000-0000-000000000002', 'Words on a picture.');
select public.chat_edit_post('44444444-8888-0000-0000-000000000002', '');
select body = '' as blank_again, cardinality(attachments) as photographs, edited_at is not null as edited
  from public.chat_posts where id = '44444444-8888-0000-0000-000000000002';
set local role postgres;
select body, cardinality(attachments) as photographs_then
  from public.chat_edits where post_id = '44444444-8888-0000-0000-000000000002' order by replaced_at;
set local role authenticated;

\echo ''
\echo '== 7b. too long is refused =='
\echo '   expect: ERROR, at most 4,000 characters.'
savepoint too_long;
select public.chat_edit_post(:'post_id', repeat('x', 4001));
rollback to savepoint too_long;

\echo ''
\echo '== 8. a post in a closed room cannot be edited, even by its author =='
\echo '   expect: t seeded, from the administrator seeding bladder, then ERROR'
\echo '   This room is closed — the plan says readable *and open*.'
set local request.jwt.claims = '{"sub":"eeeeeeee-8888-0000-0000-000000000005","role":"authenticated"}';
select public.chat_create_topic('bladder', 'Seeded', 'Before the room opens.') as seeded \gset
-- \gset keeps the id and prints nothing; this said "a uuid" until 2026-09-30.
select :'seeded' is not null as seeded;
savepoint closed_edit;
select public.chat_edit_post(
  (select p.id from public.chat_posts p where p.topic_id = :'seeded'), 'Still before it opens.');
rollback to savepoint closed_edit;

\echo ''
\echo '== 9. the author edits their message =='
\echo '   expect: the new words and edited_at set, as Author.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-8888-0000-0000-000000000001","role":"authenticated"}';
select public.chat_edit_message('55555555-8888-0000-0000-000000000001', 'Mine, second draft.');
select body, edited_at is not null as edited
  from public.chat_messages where id = '55555555-8888-0000-0000-000000000001';

\echo ''
\echo '== 10. the other member of the conversation cannot edit it =='
\echo '   expect: ERROR, You can only edit your own message.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
savepoint other_edits_message;
select public.chat_edit_message('55555555-8888-0000-0000-000000000001', 'Not mine.');
rollback to savepoint other_edits_message;

\echo ''
\echo '== 10b. somebody outside the conversation is told there is no such message =='
\echo '   expect: ERROR, There is no such message — not "not yours", which'
\echo '   would confirm it exists.'
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-000000000003","role":"authenticated"}';
savepoint outsider_edits_message;
select public.chat_edit_message('55555555-8888-0000-0000-000000000001', 'From outside.');
rollback to savepoint outsider_edits_message;

\echo ''
\echo '== 11. an administrator cannot edit a message and can read its earlier version =='
\echo '   expect: ERROR (no such message — they are not in it), then 1 row'
\echo '   holding "Mine, first draft.".'
set local request.jwt.claims = '{"sub":"eeeeeeee-8888-0000-0000-000000000005","role":"authenticated"}';
savepoint admin_edits_message;
select public.chat_edit_message('55555555-8888-0000-0000-000000000001', 'Rewritten.');
rollback to savepoint admin_edits_message;
select body from public.chat_edits where message_id = '55555555-8888-0000-0000-000000000001';

\echo ''
\echo '== 11b. a removed message cannot be edited, and an unchanged one is refused =='
\echo '   expect: ERROR twice, as Other on their own message.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-8888-0000-0000-000000000002","role":"authenticated"}';
savepoint unchanged_message;
select public.chat_edit_message('55555555-8888-0000-0000-000000000002', 'Theirs.');
rollback to savepoint unchanged_message;
select public.chat_remove_message('55555555-8888-0000-0000-000000000002');
savepoint edit_removed_message;
select public.chat_edit_message('55555555-8888-0000-0000-000000000002', 'Back again.');
rollback to savepoint edit_removed_message;

\echo ''
\echo '== 12. THE STEP: deleting the topic takes its edits with it =='
\echo '   expect: 3 edits for the topic before, 0 after; the message edit'
\echo '   (1) is untouched.'
set local role postgres;
select count(*) as post_edits_before from public.chat_edits e
  join public.chat_posts p on p.id = e.post_id where p.topic_id = :'topic_id';
set local role authenticated;
set local request.jwt.claims = '{"sub":"eeeeeeee-8888-0000-0000-000000000005","role":"authenticated"}';
select public.admin_delete_topic(:'topic_id') as photographs_to_remove;
set local role postgres;
select count(*) as post_edits_after from public.chat_edits where post_id is not null;
select count(*) as message_edits from public.chat_edits where message_id is not null;

rollback;

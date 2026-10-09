-- ============================================================================
-- Replies to a post, and quotes in a conversation (20260930000000): where a
-- reply_to may point, and what happens to it when the parent goes. Run as
-- signed-in roles, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-replies.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Two steps carry the feature and are marked in place:
--
--   3  — replies to replies retain their specific parent at every depth.
--   5  — removing the parent leaves the reply standing with reply_to null,
--        and it still counts. Nothing says "reply to a removed post".
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
  ('aaaaaaaa-7777-1111-0000-000000000001', 'peer', 'active', 'Starter S', '19990007101', '1980-01-01', 'T1–T6', 'CA', true, false),
  ('bbbbbbbb-7777-1111-0000-000000000002', 'peer', 'active', 'Replier R', '19990007102', '1981-01-01', 'C5–C8', 'CA', true, false),
  ('cccccccc-7777-1111-0000-000000000003', 'peer', 'active', 'Third T',   '19990007103', '1982-01-01', 'L1–S5', 'CA', true, false);

update public.chat_rooms set opened_at = now() where id = 'bowel';

-- Nobody joins anything: writing needs no membership since 20260930000000.

-- Two topics by Starter, so there is another topic to point at wrongly.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-1111-0000-000000000001","role":"authenticated"}';
select public.chat_create_topic('bowel', 'Replies', 'The question.') as topic_id \gset
select public.chat_create_topic('bowel', 'Another topic', 'A different question.') as other_topic \gset
select p.id as opener from public.chat_posts p where p.topic_id = :'topic_id' \gset
select p.id as other_opener from public.chat_posts p where p.topic_id = :'other_topic' \gset

-- A conversation between Starter and Replier, and one between Starter and
-- Third, so a quote can point across.
select public.chat_open_direct('bbbbbbbb-7777-1111-0000-000000000002') as dm \gset
select public.chat_open_direct('cccccccc-7777-1111-0000-000000000003') as dm2 \gset
-- Fixed ids, as the superuser: `id` is not a granted insert column, which is
-- right, and these rows are the situation. The openers are dated back a
-- minute: everything in this file shares one transaction and therefore one
-- now(), and "the opening post" is the earliest — HANDOFF.md's now() trap.
set local role postgres;
update public.chat_posts set created_at = now() - interval '1 minute'
 where id in (:'opener', :'other_opener');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('66666666-7777-1111-0000-000000000001', :'dm',  'aaaaaaaa-7777-1111-0000-000000000001', 'First in the first.'),
  ('66666666-7777-1111-0000-000000000002', :'dm2', 'aaaaaaaa-7777-1111-0000-000000000001', 'First in the second.');
set local role authenticated;

set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-1111-0000-000000000002","role":"authenticated"}';

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member who has joined nothing =='
\echo '   expect: authenticated | bbbbbbbb-7777-1111-... | 0 memberships'
select current_user, auth.uid()::text as uid,
       (select count(*) from public.chat_room_members) as memberships;

\echo ''
\echo '== 1. a reply to a post in the same topic lands =='
\echo '   expect: INSERT, then reply_to = the opener, and 1 reply counted.'
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'An answer under the question.', :'opener')
returning id as reply_id \gset
select reply_to = :'opener' as under_the_opener from public.chat_posts where id = :'reply_id';
select reply_count from public.chat_topics where id = :'topic_id';

\echo ''
\echo '== 2. a reply to a post in another topic is refused =='
\echo '   expect: ERROR, not in this topic. The same sentence for a post that'
\echo '   does not exist, so a guessed id learns nothing.'
savepoint across_topics;
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Pointing elsewhere.', :'other_opener');
rollback to savepoint across_topics;
savepoint nowhere;
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Pointing at nothing.',
   '00000000-0000-0000-0000-000000000000');
rollback to savepoint nowhere;

\echo ''
\echo '== 3. replies can answer specific replies at several levels =='
savepoint nested;
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Two levels down.', :'reply_id')
returning id as nested_id \gset
select reply_to = :'reply_id' as nested_parent from public.chat_posts where id = :'nested_id';
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Three levels down.', :'nested_id')
returning id as deeper_id \gset
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Four levels down.', :'deeper_id')
returning id as deepest_id \gset
select reply_to = :'nested_id' as deeper_parent from public.chat_posts where id = :'deeper_id';
select public.chat_remove_post(:'nested_id');
select reply_to is null as freed_child from public.chat_posts where id = :'deeper_id';
select reply_to = :'deeper_id' as grandchild_stays_nested from public.chat_posts where id = :'deepest_id';
rollback to savepoint nested;

\echo ''
\echo '== 4. a reply to a removed post is refused =='
\echo '   expect: ERROR, has been removed. Set-up: a second post, removed by'
\echo '   its author.'
insert into public.chat_posts (topic_id, author_id, body) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Gone soon.')
returning id as gone_id \gset
select public.chat_remove_post(:'gone_id');
savepoint reply_to_removed;
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'bbbbbbbb-7777-1111-0000-000000000002', 'Answering a gap.', :'gone_id');
rollback to savepoint reply_to_removed;

\echo ''
\echo '== 5. THE STEP: removing the parent leaves the reply standing, reply_to null, still counted =='
\echo '   expect: the reply standing (removed f) with reply_to null, and'
\echo '   reply_count 1 — the opener is not a reply, and the standing reply is.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-1111-0000-000000000001","role":"authenticated"}';
select public.chat_remove_post(:'opener');
select removed_at is not null as removed, reply_to is null as freed
  from public.chat_posts where id = :'reply_id';
select reply_count from public.chat_topics where id = :'topic_id';

\echo ''
\echo '== 5b. and it is now somewhere a reply can go =='
\echo '   expect: INSERT — top-level since its parent went — then reply_count 2.'
set local request.jwt.claims = '{"sub":"cccccccc-7777-1111-0000-000000000003","role":"authenticated"}';
insert into public.chat_posts (topic_id, author_id, body, reply_to) values
  (:'topic_id', 'cccccccc-7777-1111-0000-000000000003', 'Under the freed one.', :'reply_id');
select reply_count from public.chat_topics where id = :'topic_id';

\echo ''
\echo '== 6. a message quotes a message in the same conversation =='
\echo '   expect: INSERT, then reply_to set, as Replier.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-1111-0000-000000000002","role":"authenticated"}';
insert into public.chat_messages (thread_id, author_id, body, reply_to) values
  (:'dm', 'bbbbbbbb-7777-1111-0000-000000000002', 'Quoting yours.', '66666666-7777-1111-0000-000000000001')
returning id as quote_id \gset
select reply_to is not null as quoted from public.chat_messages where id = :'quote_id';

\echo ''
\echo '== 6b. a message may quote a message that itself quotes one =='
\echo '   expect: INSERT. Quotes do not nest on the screen, so there is no'
\echo '   level to keep to.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-1111-0000-000000000001","role":"authenticated"}';
insert into public.chat_messages (thread_id, author_id, body, reply_to) values
  (:'dm', 'aaaaaaaa-7777-1111-0000-000000000001', 'Quoting the quote.', :'quote_id');

\echo ''
\echo '== 7. a quote across conversations is refused =='
\echo '   expect: ERROR, not in this conversation — as Starter, who is in both.'
savepoint across_threads;
insert into public.chat_messages (thread_id, author_id, body, reply_to) values
  (:'dm', 'aaaaaaaa-7777-1111-0000-000000000001', 'From the other one.',
   '66666666-7777-1111-0000-000000000002');
rollback to savepoint across_threads;

\echo ''
\echo '== 7b. a quote of a removed message is refused; an existing quote of it stays =='
\echo '   expect: ERROR, then reply_to still set on the earlier quote — the'
\echo '   screen says "Removed message" in the quote.'
select public.chat_remove_message('66666666-7777-1111-0000-000000000001');
savepoint quote_removed;
insert into public.chat_messages (thread_id, author_id, body, reply_to) values
  (:'dm', 'aaaaaaaa-7777-1111-0000-000000000001', 'Quoting a gap.',
   '66666666-7777-1111-0000-000000000001');
rollback to savepoint quote_removed;
select reply_to is not null as still_quoted from public.chat_messages where id = :'quote_id';

\echo ''
\echo '== 8. a member cannot update reply_to around the trigger =='
\echo '   expect: permission denied for table chat_posts.'
savepoint no_update;
update public.chat_posts set reply_to = null where id = :'reply_id';
rollback to savepoint no_update;

rollback;

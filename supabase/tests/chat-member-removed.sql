-- ============================================================================
-- Removing a member: what goes with them, and what stays without their name
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-member-removed.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- This one is the superuser kind, deliberately, and the note at the top of
-- HANDOFF.md's probe table says why that is allowed: what it exercises is
-- foreign keys, the delete function and the shape of what is left behind, not
-- a policy. `postgres` is BYPASSRLS, so nothing here proves anything about who
-- may read — chat-posts.sql, chat-direct.sql and chat-groups.sql do that, as
-- signed-in members. `admin_delete_member` still asks `is_admin()`, which reads
-- `auth.uid()` from the claims rather than from the role, so the claims are set
-- and the role is left alone.
--
-- The exception is the last step, which switches to a signed-in member: whether
-- the survivor of a conversation can still read it after the other half is gone
-- is a policy question and cannot be asked as the superuser.
--
-- Three steps carry the feature and are marked in place:
--
--   2 — the delete is not blocked. Every chat table points at `members`, and
--       one `on delete restrict` or one `not null` author column anywhere in
--       Chat would mean an administrator could no longer end a membership —
--       which CONTEXT.md calls load-bearing.
--   4 — their words stay, with their name gone. This is the owner's decision
--       of 2026-09-18: a removed member's posts and messages keep their text
--       and render as "Former member". A cascade here would take a room's
--       history with whoever left it, and would renumber a topic under the
--       people still reading it.
--   8 — what they joined and what they read goes. Which rooms somebody joined
--       and which topics they opened is theirs, and a membership that ends has
--       to take it — the rows are cascades for the same reason the policies
--       keep them private.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- The situation, not the thing under test. Written as the superuser.
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('dddddddd-6666-0000-0000-000000000001', 'peer',   'active', 'Departing D', '19990006001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('55555555-6666-0000-0000-000000000002', 'peer',   'active', 'Staying S',   '19990006002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('66666666-6666-0000-0000-000000000003', 'peer',   'active', 'Third T',     '19990006003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('99999999-6666-0000-0000-000000000004', 'mentor', 'active', 'Admin A',     '19990006004', '1983-01-01', 'T1–T6',  'CA', true, true);

-- A room has to be open before anybody can be in it.
update public.chat_rooms set opened_at = now() where id = 'bowel';

-- Everything the departing member touches: a room they joined, a topic they
-- started, a post of theirs under somebody else's topic, a post of their own
-- they took back, a topic they read, a conversation with one member and a
-- group with two.
insert into public.chat_room_members (room_id, member_id) values
  ('bowel', 'dddddddd-6666-0000-0000-000000000001'),
  ('bowel', '55555555-6666-0000-0000-000000000002');

set local request.jwt.claims = '{"sub":"dddddddd-6666-0000-0000-000000000001","role":"authenticated"}';
select public.chat_create_topic('bowel', 'What nobody told me about travelling',
       'Six years in and I still pack twice what I need.') as topic \gset
-- Output off for the set-up calls: a void function still prints a row, and
-- four blank ones above step 0 read like a probe that has already gone wrong.
\o /dev/null
select public.chat_remove_post(
  (select id from public.chat_posts where topic_id = :'topic'::uuid));
\o
-- Removed, then said again: the removed post keeps its place in the numbering
-- and the second one is what the topic reads as.
insert into public.chat_posts (topic_id, author_id, body)
values (:'topic'::uuid, 'dddddddd-6666-0000-0000-000000000001',
        'Six years in and I still pack twice what I need.');

select public.chat_open_direct('55555555-6666-0000-0000-000000000002') as dm \gset
insert into public.chat_messages (thread_id, author_id, body)
values (:'dm'::uuid, 'dddddddd-6666-0000-0000-000000000001', 'Thanks for the offer of a lift.');

select public.chat_create_group('Saturday ride', array[
  '55555555-6666-0000-0000-000000000002'::uuid,
  '66666666-6666-0000-0000-000000000003'::uuid]) as grp \gset
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp'::uuid, 'dddddddd-6666-0000-0000-000000000001', 'Three loaner chairs are confirmed.');

-- The other member answers in both, so there is something left to read.
set local request.jwt.claims = '{"sub":"55555555-6666-0000-0000-000000000002","role":"authenticated"}';
insert into public.chat_posts (topic_id, author_id, body)
values (:'topic'::uuid, '55555555-6666-0000-0000-000000000002', 'That is every trip I have taken.');
insert into public.chat_messages (thread_id, author_id, body)
values (:'dm'::uuid, '55555555-6666-0000-0000-000000000002', 'Any time. I am coming past anyway.');
\o /dev/null
select public.chat_mark_topic_read(:'topic'::uuid);
\o

set local request.jwt.claims = '{"sub":"dddddddd-6666-0000-0000-000000000001","role":"authenticated"}';
\o /dev/null
select public.chat_mark_topic_read(:'topic'::uuid);
select public.chat_mark_thread_read(:'dm'::uuid);
\o

-- And the rest of their record, which the Remove panel promises will go.
insert into public.data_feeds (id, name, feed_url, feed_type)
values ('11111111-6666-0000-0000-0000000000f1', 'Probe feed',
        'https://example.invalid/probe-removal.ics', 'norcalsci-events');
insert into public.events (id, feed_id, external_id, title, start_time, end_time)
values ('22222222-6666-0000-0000-0000000000e1', '11111111-6666-0000-0000-0000000000f1',
        'probe-removal', 'Rolling picnic', now() + interval '9 days', now() + interval '9 days 2 hours');
insert into public.event_rsvps (event_id, member_id, status)
values ('22222222-6666-0000-0000-0000000000e1', 'dddddddd-6666-0000-0000-000000000001', 'going');
insert into public.member_strikes (member_id, issued_by, reason)
values ('dddddddd-6666-0000-0000-000000000001', '99999999-6666-0000-0000-000000000004',
        'Sold supplements in a room');

\set QUIET off
\echo ''
\echo '== 0. the superuser, on purpose — see the header =='
\echo '   expect: postgres. Every RLS policy below is inert; nothing here is'
\echo '   evidence about who may read what.'
select current_user;

\echo ''
\echo '== 1. what they are leaving behind (expect 1 topic, 2 posts, 2 messages,'
\echo '   1 room joined, 1 topic read, 2 threads, 1 rsvp, 1 strike) =='
select
  (select count(*) from public.chat_topics where author_id = 'dddddddd-6666-0000-0000-000000000001') as topics,
  (select count(*) from public.chat_posts  where author_id = 'dddddddd-6666-0000-0000-000000000001') as posts,
  (select count(*) from public.chat_messages where author_id = 'dddddddd-6666-0000-0000-000000000001') as messages,
  (select count(*) from public.chat_room_members where member_id = 'dddddddd-6666-0000-0000-000000000001') as rooms_joined,
  (select count(*) from public.chat_topic_reads where member_id = 'dddddddd-6666-0000-0000-000000000001') as topics_read,
  (select count(*) from public.chat_thread_members where member_id = 'dddddddd-6666-0000-0000-000000000001') as threads_in,
  (select count(*) from public.event_rsvps where member_id = 'dddddddd-6666-0000-0000-000000000001') as rsvps,
  (select count(*) from public.member_strikes where member_id = 'dddddddd-6666-0000-0000-000000000001') as strikes;

\echo ''
\echo '== 2. THE STEP: an administrator can still end the membership =='
\echo '   expect: one blank line from a void function, and no error. A single'
\echo '   restrict or not-null anywhere in Chat would stop it here.'
\echo '   No savepoint: every step below reads the state this leaves, and a'
\echo '   savepoint that rolled it back would leave them nothing to read.'
set local request.jwt.claims = '{"sub":"99999999-6666-0000-0000-000000000004","role":"authenticated"}';
select public.admin_delete_member('dddddddd-6666-0000-0000-000000000001');

\echo ''
\echo '== 3. the member row is gone (expect 0) =='
select count(*) as still_a_member
  from public.members where id = 'dddddddd-6666-0000-0000-000000000001';

\echo ''
\echo '== 4. THE STEP: their words stay, their name does not =='
\echo '   expect: the title and every body intact, the author cleared on the two'
\echo '   posts that were theirs and left alone on the one that was not. The'
\echo '   removed post is still blank and still counted — a topic does not'
\echo '   renumber itself under the people reading it.'
select t.title, t.author_id is null as topic_author_cleared, t.reply_count
  from public.chat_topics t where t.id = :'topic'::uuid;
select p.body, p.author_id is null as author_cleared, p.removed_at is not null as removed
  from public.chat_posts p where p.topic_id = :'topic'::uuid order by p.created_at;

\echo ''
\echo '== 5. and the same in both conversations (expect 3 rows, 2 with a null'
\echo '   author and their text still there) =='
select case when m.thread_id = :'dm'::uuid then 'direct' else 'group' end as thread,
       m.body, m.author_id is null as author_cleared
  from public.chat_messages m order by m.created_at;

\echo ''
\echo '== 6. the snapshot of the post they took back survives them =='
\echo '   expect: the original sentence, removed_by null. It is the record of'
\echo '   what was said, and it outlives whoever said it.'
select b.body, b.removed_by is null as remover_cleared
  from public.chat_removed_bodies b where b.post_id is not null;

\echo ''
\echo '== 7. the conversations themselves stay, minus one person each =='
\echo '   expect: direct with 1 on the roster and its direct_key intact, group'
\echo '   with 2 and created_by null. A thread is not deleted because half of'
\echo '   it left — the other half is still reading it.'
select t.kind, coalesce(t.name, '(direct)') as name,
       -- Asked of the direct thread only. A group has no direct_key and an
       -- unqualified `is not null` would print f beside it, which reads as a
       -- failure of the thing this step is checking.
       case when t.kind = 'direct' then t.direct_key is not null end as direct_key_kept,
       t.created_by is null as creator_cleared,
       (select count(*) from public.chat_thread_members m where m.thread_id = t.id) as roster
  from public.chat_threads t order by t.kind;

\echo ''
\echo '== 8. THE STEP: what they joined and what they read goes with them =='
\echo '   expect: 0, 0, 0 for them and 1, 1, 3 still there for everybody else —'
\echo '   the room, the read, and the two rosters they are no longer on.'
select
  (select count(*) from public.chat_room_members where member_id = 'dddddddd-6666-0000-0000-000000000001') as theirs_rooms,
  (select count(*) from public.chat_topic_reads where member_id = 'dddddddd-6666-0000-0000-000000000001') as theirs_reads,
  (select count(*) from public.chat_thread_members where member_id = 'dddddddd-6666-0000-0000-000000000001') as theirs_threads,
  (select count(*) from public.chat_room_members where room_id = 'bowel') as room_left,
  (select count(*) from public.chat_topic_reads where topic_id = :'topic'::uuid) as reads_left,
  (select count(*) from public.chat_thread_members) as roster_rows_left;

\echo ''
\echo '== 9. the rest of the record goes, which is what /admin now says =='
\echo '   expect: 0 rsvps, 0 strikes. Rejoining on the same number starts them'
\echo '   from nothing.'
select
  (select count(*) from public.event_rsvps where member_id = 'dddddddd-6666-0000-0000-000000000001') as rsvps,
  (select count(*) from public.member_strikes where member_id = 'dddddddd-6666-0000-0000-000000000001') as strikes;

\echo ''
\echo '== 10. no name to put to them (expect 0) =='
\echo '   chat_authors is every member and they are not one any more, so every'
\echo '   screen falls through to "Former member" without being told to.'
select count(*) as named from public.chat_authors
 where id = 'dddddddd-6666-0000-0000-000000000001';

\echo ''
\echo '== 11. the survivor can still read the conversation, as themselves =='
\echo '   expect: authenticated, direct with other_member_id null and the last'
\echo '   message still readable, group still listed. The only step here that is'
\echo '   about a policy, so it is the only one under a real role.'
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-6666-0000-0000-000000000002","role":"authenticated"}';
select current_user;
select kind, coalesce(name, '(direct)') as name,
       -- Only asked of the direct thread: a group never has an other member,
       -- so a plain `other_member_id is null` here would print t on both rows
       -- and say nothing about either.
       case when kind = 'direct' then other_member_id is null end as other_half_gone,
       last_body, member_count
  from public.chat_my_threads() order by kind;

rollback;

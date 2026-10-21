-- ============================================================================
-- Saved topics and posts: only the member who saved them sees them, and only
-- what they can read can be saved. Run as members, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-saves.sql
--
-- 20261020030000. Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-5a5e-0000-0000-000000000001', 'peer', 'active',    'Saver S',  '19990005001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-5a5e-0000-0000-000000000002', 'peer', 'active',    'Writer W', '19990005002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('cccccccc-5a5e-0000-0000-000000000003', 'peer', 'active',    'Nosy N',   '19990005003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('dddddddd-5a5e-0000-0000-000000000004', 'peer', 'suspended', 'Paused P', '19990005004', '1983-01-01', 'L1–S5',  'CA', true, false);

update public.chat_rooms set opened_at = now() where id = 'bowel';
update public.chat_rooms set opened_at = null where id = 'bladder';

insert into public.chat_topics (id, room_id, title, author_id) values
  ('5a000000-0000-0000-0000-00000000000a', 'bowel',   'A cushion that finally worked', 'bbbbbbbb-5a5e-0000-0000-000000000002'),
  ('5a000000-0000-0000-0000-00000000000b', 'bladder', 'Catheters on a long flight',    'bbbbbbbb-5a5e-0000-0000-000000000002');

-- p1, p2: in the open topic. p3: in the closed room. p4: removed.
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('5a000000-0000-0000-0000-0000000000a1', '5a000000-0000-0000-0000-00000000000a', 'bbbbbbbb-5a5e-0000-0000-000000000002', 'Air cells, after four years of foam.'),
  ('5a000000-0000-0000-0000-0000000000a2', '5a000000-0000-0000-0000-00000000000a', 'bbbbbbbb-5a5e-0000-0000-000000000002', 'Pump it to two fingers under the bone.'),
  ('5a000000-0000-0000-0000-0000000000b3', '5a000000-0000-0000-0000-00000000000b', 'bbbbbbbb-5a5e-0000-0000-000000000002', 'Aisle seat, and a bag in the cabin.'),
  ('5a000000-0000-0000-0000-0000000000a4', '5a000000-0000-0000-0000-00000000000a', 'bbbbbbbb-5a5e-0000-0000-000000000002', 'Wrong topic, sorry.');
update public.chat_posts set removed_at = now() where id = '5a000000-0000-0000-0000-0000000000a4';

\set me 'aaaaaaaa-5a5e-0000-0000-000000000001'
\set ta '5a000000-0000-0000-0000-00000000000a'
\set tb '5a000000-0000-0000-0000-00000000000b'
\set p1 '5a000000-0000-0000-0000-0000000000a1'
\set p2 '5a000000-0000-0000-0000-0000000000a2'
\set p3 '5a000000-0000-0000-0000-0000000000b3'
\set p4 '5a000000-0000-0000-0000-0000000000a4'

\set QUIET off
\echo ''
\echo '== 0. a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-5a5e-... | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5a5e-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid, public.is_admin() as admin;

\echo ''
\echo '== 1. saving a topic and a post in it =='
\echo '   expect: INSERT 0 1 twice, then 2 saves.'
insert into public.chat_saves (member_id, topic_id) values (:'me', :'ta');
insert into public.chat_saves (member_id, topic_id, post_id) values (:'me', :'ta', :'p2');
select count(*) as saves from public.chat_saves;

\echo ''
\echo '== 2. saving the topic twice is one row, as the client writes it =='
\echo '   expect: INSERT 0 0 twice (topic, then post), still 2 saves; then'
\echo '   ERROR duplicate key for a plain second topic save.'
insert into public.chat_saves (member_id, topic_id, post_id) values (:'me', :'ta', null)
on conflict (member_id, topic_id, post_id) do nothing;
insert into public.chat_saves (member_id, topic_id, post_id) values (:'me', :'ta', :'p2')
on conflict (member_id, topic_id, post_id) do nothing;
select count(*) as saves from public.chat_saves;
savepoint twice;
insert into public.chat_saves (member_id, topic_id) values (:'me', :'ta');
rollback to savepoint twice;

\echo ''
\echo '== 3. not as somebody else =='
\echo '   expect: ERROR, new row violates row-level security policy.'
savepoint forged;
insert into public.chat_saves (member_id, topic_id) values ('cccccccc-5a5e-0000-0000-000000000003', :'ta');
rollback to savepoint forged;

\echo ''
\echo '== 4. not a closed room''s topic, nor its post =='
\echo '   expect: ERROR row-level security, twice.'
savepoint closed_topic;
insert into public.chat_saves (member_id, topic_id) values (:'me', :'tb');
rollback to savepoint closed_topic;
savepoint closed_post;
insert into public.chat_saves (member_id, topic_id, post_id) values (:'me', :'tb', :'p3');
rollback to savepoint closed_post;

\echo ''
\echo '== 5. not a removed post, nor a post named under the wrong topic =='
\echo '   expect: ERROR row-level security, twice. The second names the open'
\echo '   topic with the closed room''s post, to get past step 4.'
savepoint removed;
insert into public.chat_saves (member_id, topic_id, post_id) values (:'me', :'ta', :'p4');
rollback to savepoint removed;
savepoint mismatched;
insert into public.chat_saves (member_id, topic_id, post_id) values (:'me', :'ta', :'p3');
rollback to savepoint mismatched;

\echo ''
\echo '== 6. saved_at is not the member''s to choose =='
\echo '   expect: ERROR permission denied, twice (insert, then update).'
savepoint dated;
insert into public.chat_saves (member_id, topic_id, post_id, saved_at) values (:'me', :'ta', :'p1', now() - interval '1 year');
rollback to savepoint dated;
savepoint redated;
update public.chat_saves set saved_at = now() - interval '1 year';
rollback to savepoint redated;

\echo ''
\echo '== 7. THE STEP: another member sees none of them, and cannot delete them =='
\echo '   expect: 0 seen, DELETE 0; then, back as Saver, still 2.'
set local role postgres;
set local request.jwt.claims = '{"sub":"cccccccc-5a5e-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;
select count(*) as seen from public.chat_saves;
delete from public.chat_saves;
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5a5e-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select count(*) as saves from public.chat_saves;

\echo ''
\echo '== 8. a paused member may save =='
\echo '   expect: t a_member | f active, then INSERT 0 1.'
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-5a5e-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active;
insert into public.chat_saves (member_id, topic_id) values ('dddddddd-5a5e-0000-0000-000000000004', :'ta');

\echo ''
\echo '== 9. anon reaches nothing =='
\echo '   expect: ERROR permission denied for table chat_saves.'
set local role postgres;
set local role anon;
savepoint anon_reads;
select count(*) from public.chat_saves;
rollback to savepoint anon_reads;

\echo ''
\echo '== 10. taking a save back =='
\echo '   expect: DELETE 1, then 1 left (the topic).'
set local role postgres;
set local request.jwt.claims = '{"sub":"aaaaaaaa-5a5e-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
delete from public.chat_saves where post_id = :'p2';
select count(*) as saves from public.chat_saves;

rollback;

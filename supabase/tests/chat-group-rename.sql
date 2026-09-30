-- ============================================================================
-- Renaming a group and giving it a picture: who can, what it leaves in the
-- conversation, and what that line cannot be made to do. Run as a member,
-- under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-group-rename.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Three steps carry the feature and are marked in place:
--
--   3  — somebody outside the group cannot rename it or change its picture.
--        Both functions are definer, so RLS is off inside them; being in the
--        group is checked there or nowhere.
--   7  — a member cannot write a notice themselves. `notice` is not in the
--        column grant, so "Jan renamed the group" cannot be forged by Bo.
--   10 — a picture has to be the caller's own upload, in the group's folder.
--        Otherwise a member could make somebody else's photograph from a
--        message the group's face, under their own name.
--
-- Step 0 prints current_user because as the superuser every step below turns
-- green while proving nothing — `postgres` is BYPASSRLS. Every expected refusal
-- has its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-7777-0000-0000-000000000001', 'peer',   'active',    'Ada A',      '19990007001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-7777-0000-0000-000000000002', 'peer',   'active',    'Bo B',       '19990007002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('cccccccc-7777-0000-0000-000000000003', 'peer',   'active',    'Onlooker O', '19990007003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('dddddddd-7777-0000-0000-000000000004', 'peer',   'suspended', 'Paused P',   '19990007004', '1983-01-01', 'L1–S5',  'CA', true, false),
  ('99999999-7777-0000-0000-000000000009', 'mentor', 'active',    'Admin A',    '19990007009', '1986-01-01', 'T1–T6',  'CA', true, true);

-- A group Ada made with Bo, one direct thread, and an event's group.
insert into public.chat_threads (id, kind, name, created_by)
values ('11111111-7777-0000-0000-0000000000a1', 'group', 'Saturday ride',
        'aaaaaaaa-7777-0000-0000-000000000001');
insert into public.chat_thread_members (thread_id, member_id)
values ('11111111-7777-0000-0000-0000000000a1', 'aaaaaaaa-7777-0000-0000-000000000001'),
       ('11111111-7777-0000-0000-0000000000a1', 'bbbbbbbb-7777-0000-0000-000000000002'),
       -- Paused P was in it before being suspended.
       ('11111111-7777-0000-0000-0000000000a1', 'dddddddd-7777-0000-0000-000000000004');

insert into public.chat_threads (id, kind, direct_key, created_by)
values ('11111111-7777-0000-0000-0000000000d1', 'direct',
        'aaaaaaaa-7777-0000-0000-000000000001:bbbbbbbb-7777-0000-0000-000000000002',
        'aaaaaaaa-7777-0000-0000-000000000001');
insert into public.chat_thread_members (thread_id, member_id)
values ('11111111-7777-0000-0000-0000000000d1', 'aaaaaaaa-7777-0000-0000-000000000001'),
       ('11111111-7777-0000-0000-0000000000d1', 'bbbbbbbb-7777-0000-0000-000000000002');

insert into public.data_feeds (id, name, feed_url, feed_type)
values ('11111111-7777-0000-0000-0000000000f1', 'Probe feed',
        'https://example.invalid/probe-rename.ics', 'norcalsci-events');
insert into public.events (id, feed_id, external_id, title, start_time, end_time)
values ('22222222-7777-0000-0000-0000000000e1', '11111111-7777-0000-0000-0000000000f1',
        'probe-rename', 'Adaptive swim night', now() + interval '5 days',
        now() + interval '5 days 2 hours');
insert into public.chat_threads (id, kind, name, event_id)
values ('11111111-7777-0000-0000-0000000000e1', 'group', 'Adaptive swim night',
        '22222222-7777-0000-0000-0000000000e1');
insert into public.chat_thread_members (thread_id, member_id)
values ('11111111-7777-0000-0000-0000000000e1', 'aaaaaaaa-7777-0000-0000-000000000001');

-- Three files, as the storage API would have left them: two of Ada's in the
-- group's folder, one of Bo's there, and one of Ada's somewhere else.
insert into storage.objects (bucket_id, name, owner_id)
values
  ('chat', 'threads/11111111-7777-0000-0000-0000000000a1/ada-1.webp', 'aaaaaaaa-7777-0000-0000-000000000001'),
  ('chat', 'threads/11111111-7777-0000-0000-0000000000a1/ada-2.webp', 'aaaaaaaa-7777-0000-0000-000000000001'),
  ('chat', 'threads/11111111-7777-0000-0000-0000000000a1/bo.webp',    'bbbbbbbb-7777-0000-0000-000000000002'),
  ('chat', 'threads/11111111-7777-0000-0000-0000000000d1/ada.webp',   'aaaaaaaa-7777-0000-0000-000000000001');

\set grp '11111111-7777-0000-0000-0000000000a1'
\set pair '11111111-7777-0000-0000-0000000000d1'
\set evgrp '11111111-7777-0000-0000-0000000000e1'

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in ordinary member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-7777-... | f admin'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
select current_user, auth.uid()::text as uid, public.is_admin() as admin;

\echo ''
\echo '== 1. Ada renames her group, and the conversation says so =='
\echo '   expect: Tuesday swimmers (the spaces collapsed), then one line:'
\echo '   renamed | Tuesday swimmers | Ada is its author | no photographs.'
select public.chat_rename_group(:'grp', '  Tuesday    swimmers ');
select name from public.chat_threads where id = :'grp';
select notice, body, author_id = auth.uid() as by_ada, cardinality(attachments) as photographs
  from public.chat_messages where thread_id = :'grp';

\echo ''
\echo '== 2. a name has rules =='
\echo '   expect: four ERRORs. The same name again, nothing, only spaces, and 61'
\echo '   characters.'
savepoint same;
select public.chat_rename_group(:'grp', 'Tuesday swimmers');
rollback to savepoint same;
savepoint empty;
select public.chat_rename_group(:'grp', '');
rollback to savepoint empty;
savepoint blank;
select public.chat_rename_group(:'grp', '    ');
rollback to savepoint blank;
savepoint long;
select public.chat_rename_group(:'grp', repeat('x', 61));
rollback to savepoint long;

\echo ''
\echo '== 3. THE STEP: somebody outside the group cannot touch it =='
\echo '   expect: two ERRORs, "There is no such group." — the same thing the'
\echo '   select policy tells them — and the name unchanged when Ada looks.'
set local request.jwt.claims = '{"sub":"cccccccc-7777-0000-0000-000000000003","role":"authenticated"}';
savepoint outsider_rename;
select public.chat_rename_group(:'grp', 'Taken over');
rollback to savepoint outsider_rename;
savepoint outsider_picture;
select public.chat_set_group_picture(:'grp', null);
rollback to savepoint outsider_picture;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
select name from public.chat_threads where id = :'grp';

\echo ''
\echo '== 4. a pair and an event''s group keep their names =='
\echo '   expect: four ERRORs. A direct conversation has no name or picture; an'
\echo '   event''s group is named after the event (the owner, 2026-09-30).'
savepoint pair_rename;
select public.chat_rename_group(:'pair', 'Us two');
rollback to savepoint pair_rename;
savepoint pair_picture;
select public.chat_set_group_picture(:'pair', 'threads/11111111-7777-0000-0000-0000000000d1/ada.webp');
rollback to savepoint pair_picture;
savepoint event_rename;
select public.chat_rename_group(:'evgrp', 'Swimmers');
rollback to savepoint event_rename;
savepoint event_picture;
select public.chat_set_group_picture(:'evgrp', null);
rollback to savepoint event_picture;

\echo ''
\echo '== 5. a suspended member cannot rename, though they still read =='
\echo '   expect: ERROR, then 1 message readable. Suspension takes writing away.'
set local request.jwt.claims = '{"sub":"dddddddd-7777-0000-0000-000000000004","role":"authenticated"}';
savepoint paused;
select public.chat_rename_group(:'grp', 'Paused renames');
rollback to savepoint paused;
select count(*) as readable from public.chat_messages where thread_id = :'grp';

\echo ''
\echo '== 6. anybody in it can rename it, not only whoever made it =='
\echo '   expect: Saturday swimmers, and two notices now.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-000000000002","role":"authenticated"}';
select public.chat_rename_group(:'grp', 'Saturday swimmers');
select name, (select count(*) from public.chat_messages m where m.thread_id = t.id and m.notice is not null) as notices
  from public.chat_threads t where t.id = :'grp';

\echo ''
\echo '== 7. THE STEP: nobody writes a notice by hand =='
\echo '   expect: ERROR, permission denied for column notice (or table). Bo'
\echo '   forging "Ada renamed the group" is the thing this prevents; even under'
\echo '   his own name he cannot make a line that looks like a change he did'
\echo '   not make.'
savepoint forged;
insert into public.chat_messages (thread_id, author_id, body, notice)
values (:'grp', 'bbbbbbbb-7777-0000-0000-000000000002', 'Rude name', 'renamed');
rollback to savepoint forged;

\echo ''
\echo '== 8. a notice cannot be edited, taken back by its author, or answered =='
\echo '   expect: three ERRORs. It records what happened to the group.'
select id as bo_notice from public.chat_messages
 where thread_id = :'grp' and notice = 'renamed' and author_id = auth.uid() \gset
savepoint edit_notice;
select public.chat_edit_message(:'bo_notice', 'Something else');
rollback to savepoint edit_notice;
savepoint remove_notice;
select public.chat_remove_message(:'bo_notice');
rollback to savepoint remove_notice;
savepoint reply_notice;
insert into public.chat_messages (thread_id, author_id, body, reply_to)
values (:'grp', auth.uid(), 'Why that name?', :'bo_notice');
rollback to savepoint reply_notice;

\echo ''
\echo '== 9. an ordinary message still works, and still answers one =='
\echo '   expect: INSERT 0 1 twice. The rules above are about notices only.'
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', auth.uid(), 'Pool at six?');
insert into public.chat_messages (thread_id, author_id, body, reply_to)
select :'grp', auth.uid(), 'Or seven', id from public.chat_messages
 where thread_id = :'grp' and body = 'Pool at six?';

\echo ''
\echo '== 10. THE STEP: a picture is the caller''s own upload, in this group =='
\echo '   expect: four ERRORs, as Ada: Bo''s file, a file in another thread, a'
\echo '   path that was never uploaded, and one a folder too deep. Then her own'
\echo '   works.'
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
savepoint bos_file;
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000a1/bo.webp');
rollback to savepoint bos_file;
savepoint other_thread;
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000d1/ada.webp');
rollback to savepoint other_thread;
savepoint never_uploaded;
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000a1/nothing.webp');
rollback to savepoint never_uploaded;
savepoint too_deep;
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000a1/x/ada-1.webp');
rollback to savepoint too_deep;

\echo ''
\echo '== 11. Ada sets the picture, and the line carries its path =='
\echo '   expect: the ada-1 path on the thread, then pictured | empty body | the'
\echo '   same one path. Carrying it is what lets a report hand it over.'
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000a1/ada-1.webp');
select photo_path from public.chat_threads where id = :'grp';
select notice, body = '' as no_words, attachments
  from public.chat_messages where thread_id = :'grp' and notice = 'pictured';

\echo ''
\echo '== 12. the same picture again is refused; a new one is fine =='
\echo '   expect: ERROR, then ada-2 on the thread.'
savepoint same_picture;
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000a1/ada-1.webp');
rollback to savepoint same_picture;
select public.chat_set_group_picture(:'grp', 'threads/11111111-7777-0000-0000-0000000000a1/ada-2.webp');
select photo_path from public.chat_threads where id = :'grp';

\echo ''
\echo '== 13. the list carries the picture and says the last thing was a notice =='
\echo '   expect, for Bo: Saturday swimmers | the ada-2 path | pictured | t unread.'
set local request.jwt.claims = '{"sub":"bbbbbbbb-7777-0000-0000-000000000002","role":"authenticated"}';
select name, photo_path, last_notice, unread from public.chat_my_threads() where id = :'grp';

\echo ''
\echo '== 14. the picture is taken away, once =='
\echo '   expect: null photo_path and an unpictured line, then ERROR the second'
\echo '   time — there is nothing left to take away.'
select public.chat_set_group_picture(:'grp', null);
select photo_path is null as no_picture,
       (select count(*) from public.chat_messages m where m.thread_id = t.id and m.notice = 'unpictured') as unpictured
  from public.chat_threads t where t.id = :'grp';
savepoint twice;
select public.chat_set_group_picture(:'grp', null);
rollback to savepoint twice;

\echo ''
\echo '== 15. a reported notice reaches an administrator as a sentence =='
\echo '   expect, as Bo reporting Ada''s picture line: Changed the group''s'
\echo '   picture | the ada-2 path handed over | Saturday swimmers as the place.'
select id as ada_picture from public.chat_messages
 where thread_id = :'grp' and notice = 'pictured'
   and attachments = array['threads/11111111-7777-0000-0000-0000000000a1/ada-2.webp'] \gset
select public.chat_report_message(:'ada_picture', null);
reset role;
select body_snapshot, attachments, place from public.chat_reports where message_id = :'ada_picture';

\echo ''
\echo '== 16. an administrator can still remove a notice they were handed =='
\echo '   expect: t removed. The rule in step 8 is about the author.'
set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-7777-0000-0000-000000000009","role":"authenticated"}';
select public.chat_remove_message(:'ada_picture');
reset role;
select removed_at is not null as removed, removed_by_admin from public.chat_messages where id = :'ada_picture';

\echo ''
\echo '== 17. a rename queues no notification; a message does =='
\echo '   expect: 0 then 1. Nobody''s phone buzzes because a group changed its'
\echo '   name. (Needs push_notify_url in the local vault, which it is.)'
select count(*) as queued_before from net.http_request_queue \gset
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-7777-0000-0000-000000000001","role":"authenticated"}';
select public.chat_rename_group(:'grp', 'Sunday swimmers');
reset role;
select count(*) - :queued_before as queued_by_rename from net.http_request_queue;
set local role authenticated;
insert into public.chat_messages (thread_id, author_id, body)
values (:'grp', 'aaaaaaaa-7777-0000-0000-000000000001', 'Sunday then');
reset role;
select count(*) - :queued_before as queued_after_message from net.http_request_queue;

rollback;

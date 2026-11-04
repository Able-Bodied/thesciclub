-- ============================================================================
-- One badge request gives the same four numbers (20261103230000)
-- ============================================================================
-- my_badge_counts, read as each member, against the four functions it
-- replaces in the app: chat_unread_count, my_unseen_notification_count,
-- my_unseen_notification_count_outside_chat and my_unseen_notification_kinds;
-- and its icon number against notification_badge, which sets the push badge.
-- The people are SPEED-PLAN Step 2's: the fixtures of
-- unread-count-matches-list.sql and unseen-count-matches-list.sql, copied,
-- plus rows that tell the four numbers apart, and today's rules: a block
-- hides both ways (190000), a muted conversation (200000), a paused or
-- removed member reads nothing (210000), an administrator is not hidden from.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/badge-counts-in-one.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

-- ------------------------------------- unread-count-matches-list.sql's people
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('aaaaaaaa-2914-0000-0000-00000000000a', 'peer', 'active',    'Ana', '19990029140', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-2914-0000-0000-00000000000b', 'peer', 'active',    'Bo',  '19990029141', '1980-01-01', 'T1–T6', 'CA'),
  ('cccccccc-2914-0000-0000-00000000000c', 'peer', 'active',    'Cy',  '19990029142', '1980-01-01', 'T1–T6', 'CA'),
  ('dddddddd-2914-0000-0000-00000000000d', 'peer', 'active',    'Mo',  '19990029143', '1980-01-01', 'T1–T6', 'CA'),
  ('eeeeeeee-2914-0000-0000-00000000000e', 'peer', 'active',    'Le',  '19990029144', '1980-01-01', 'T1–T6', 'CA'),
  ('ffffffff-2914-0000-0000-00000000000f', 'peer', 'active',    'Ow',  '19990029145', '1980-01-01', 'T1–T6', 'CA'),
  ('11111111-2914-0000-0000-000000000001', 'peer', 'suspended', 'Su',  '19990029146', '1980-01-01', 'T1–T6', 'CA'),
  ('22222222-2914-0000-0000-000000000002', 'peer', 'active',    'Kit', '19990029147', '1980-01-01', 'T1–T6', 'CA');

-- Threads: d = direct, g = group. Read positions are an hour ago unless said.
insert into public.chat_threads (id, kind, name, direct_key) values
  ('29140000-0000-0000-0000-000000000001', 'direct', null,      'probe-2914:ana:bo'),
  ('29140000-0000-0000-0000-000000000002', 'group',  'Read',    null),
  ('29140000-0000-0000-0000-000000000003', 'group',  'Unread',  null),
  ('29140000-0000-0000-0000-000000000004', 'group',  'Muted',   null),
  ('29140000-0000-0000-0000-000000000005', 'group',  'Left',    null),
  ('29140000-0000-0000-0000-000000000006', 'direct', null,      'probe-2914:le:bo'),
  ('29140000-0000-0000-0000-000000000007', 'group',  'Own',     null),
  ('29140000-0000-0000-0000-000000000008', 'direct', null,      'probe-2914:su:bo'),
  ('29140000-0000-0000-0000-000000000009', 'direct', null,      'probe-2914:kit:bo'),
  ('29140000-0000-0000-0000-000000000010', 'group',  'Bo only', null),
  ('29140000-0000-0000-0000-000000000011', 'group',  'Cy too',  null);

insert into public.chat_thread_members (thread_id, member_id, last_read_at)
select t::uuid, m::uuid, now() - interval '1 hour' from (values
  ('29140000-0000-0000-0000-000000000001', 'aaaaaaaa-2914-0000-0000-00000000000a'),
  ('29140000-0000-0000-0000-000000000001', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000002', 'aaaaaaaa-2914-0000-0000-00000000000a'),
  ('29140000-0000-0000-0000-000000000002', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000003', 'aaaaaaaa-2914-0000-0000-00000000000a'),
  ('29140000-0000-0000-0000-000000000003', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000004', 'dddddddd-2914-0000-0000-00000000000d'),
  ('29140000-0000-0000-0000-000000000004', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000005', 'eeeeeeee-2914-0000-0000-00000000000e'),
  ('29140000-0000-0000-0000-000000000005', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000006', 'eeeeeeee-2914-0000-0000-00000000000e'),
  ('29140000-0000-0000-0000-000000000006', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000007', 'ffffffff-2914-0000-0000-00000000000f'),
  ('29140000-0000-0000-0000-000000000007', 'cccccccc-2914-0000-0000-00000000000c'),
  ('29140000-0000-0000-0000-000000000008', '11111111-2914-0000-0000-000000000001'),
  ('29140000-0000-0000-0000-000000000008', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000009', '22222222-2914-0000-0000-000000000002'),
  ('29140000-0000-0000-0000-000000000009', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000010', '22222222-2914-0000-0000-000000000002'),
  ('29140000-0000-0000-0000-000000000010', 'bbbbbbbb-2914-0000-0000-00000000000b'),
  ('29140000-0000-0000-0000-000000000011', '22222222-2914-0000-0000-000000000002'),
  ('29140000-0000-0000-0000-000000000011', 'cccccccc-2914-0000-0000-00000000000c')
) v(t, m);

insert into public.chat_messages (thread_id, author_id, body, created_at)
select t::uuid, a::uuid, 'Probe', now() - w::interval from (values
  ('29140000-0000-0000-0000-000000000001', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000002', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000003', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000004', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000005', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes'),
  ('29140000-0000-0000-0000-000000000006', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000007', 'cccccccc-2914-0000-0000-00000000000c', '2 hours'),
  ('29140000-0000-0000-0000-000000000007', 'ffffffff-2914-0000-0000-00000000000f', '10 minutes'),
  ('29140000-0000-0000-0000-000000000008', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000009', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  -- No author, so not hidden by the block: only leaving the conversation out does.
  ('29140000-0000-0000-0000-000000000009', null, '9 minutes'),
  ('29140000-0000-0000-0000-000000000010', 'bbbbbbbb-2914-0000-0000-00000000000b', '10 minutes'),
  ('29140000-0000-0000-0000-000000000011', 'cccccccc-2914-0000-0000-00000000000c', '10 minutes')
) v(t, a, w);

-- Ana has read "Read" since Cy wrote; Mo muted "Muted"; Le left "Left"; Kit
-- blocked Bo after both conversations had his words in them.
update public.chat_thread_members set last_read_at = now() - interval '5 minutes'
 where thread_id = '29140000-0000-0000-0000-000000000002' and member_id = 'aaaaaaaa-2914-0000-0000-00000000000a';
insert into public.chat_thread_mutes (thread_id, member_id)
values ('29140000-0000-0000-0000-000000000004', 'dddddddd-2914-0000-0000-00000000000d');
delete from public.chat_thread_members
 where thread_id = '29140000-0000-0000-0000-000000000005' and member_id = 'eeeeeeee-2914-0000-0000-00000000000e';
insert into public.member_blocks (blocker_id, blocked_id)
values ('22222222-2914-0000-0000-000000000002', 'bbbbbbbb-2914-0000-0000-00000000000b');

-- ------------------------------------- unseen-count-matches-list.sql's people
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-2915-0000-0000-00000000000a', 'peer',   'active', 'Ana', '19990029150', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-2915-0000-0000-00000000000b', 'peer',   'active', 'Bo',  '19990029151', '1980-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-2915-0000-0000-00000000000c', 'peer',   'active', 'Cy',  '19990029152', '1980-01-01', 'T1–T6', 'CA', false),
  ('dddddddd-2915-0000-0000-00000000000d', 'mentor', 'active', 'Al',  '19990029153', '1980-01-01', 'T1–T6', 'CA', true),
  ('eeeeeeee-2915-0000-0000-00000000000e', 'peer',   'active', 'Max', '19990029154', '1980-01-01', 'T1–T6', 'CA', false);

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-2915-open',   'Probe 2915 open',   'For the probe.', 'Life', 9291, now()),
  ('probe-2915-closed', 'Probe 2915 closed', 'For the probe.', 'Life', 9292, null);
insert into public.chat_topics (id, room_id, title, author_id) values
  ('29150000-0000-0000-0000-000000000001', 'probe-2915-open',   'Ana asks', 'aaaaaaaa-2915-0000-0000-00000000000a'),
  ('29150000-0000-0000-0000-000000000002', 'probe-2915-closed', 'Bo asks',  'bbbbbbbb-2915-0000-0000-00000000000b');
insert into public.chat_posts (id, topic_id, author_id, body, removed_at) values
  ('29150000-0000-0000-0000-000000000011', '29150000-0000-0000-0000-000000000001', 'bbbbbbbb-2915-0000-0000-00000000000b', 'Standing', null),
  ('29150000-0000-0000-0000-000000000012', '29150000-0000-0000-0000-000000000001', 'aaaaaaaa-2915-0000-0000-00000000000a', 'Removed', now()),
  ('29150000-0000-0000-0000-000000000013', '29150000-0000-0000-0000-000000000002', 'bbbbbbbb-2915-0000-0000-00000000000b', 'Closed', null);

insert into public.member_blocks (blocker_id, blocked_id)
values ('aaaaaaaa-2915-0000-0000-00000000000a', 'cccccccc-2915-0000-0000-00000000000c');

-- Only what is written below.
delete from public.notifications where member_id in (
  'aaaaaaaa-2915-0000-0000-00000000000a', 'dddddddd-2915-0000-0000-00000000000d',
  'eeeeeeee-2915-0000-0000-00000000000e');

insert into public.notifications (member_id, kind, tag, actor_id, topic_id, post_id, created_at, seen_at)
select 'aaaaaaaa-2915-0000-0000-00000000000a', k, 'probe-2915-' || k || '-' || n, a::uuid, t::uuid, p::uuid,
       now() - w::interval, case when s then now() end
  from (values
    -- shown, unseen
    (1, 'reply',             'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '1 minute',  false),
    (2, 'mention',           'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '2 minutes', false),
    -- shown, seen
    (3, 'reply',             'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '3 minutes', true),
    -- not shown: a like on a removed post
    (4, 'like',              'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000012', '4 minutes', false),
    -- not shown: a report to somebody who is not an administrator
    (5, 'report',            null, null, null, '5 minutes', false),
    -- not shown: a closed room
    (6, 'reply_participant', 'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000002', '29150000-0000-0000-0000-000000000013', '6 minutes', false),
    -- not shown: older than 30 days
    (7, 'reply',             'bbbbbbbb-2915-0000-0000-00000000000b', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '31 days',   false),
    -- not shown: from a blocked member
    (8, 'like',              'cccccccc-2915-0000-0000-00000000000c', '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011', '8 minutes', false)
  ) v(n, k, a, t, p, w, s);

-- An administrator's report is shown.
insert into public.notifications (member_id, kind, tag) values
  ('dddddddd-2915-0000-0000-00000000000d', 'report', 'probe-2915-report');

-- Max has 120: the newest 100 hold 60 unseen (1 to 60) and 40 seen; the 20
-- older are unseen but past the 100 the bell counts.
insert into public.notifications (member_id, kind, tag, created_at, seen_at)
select 'eeeeeeee-2915-0000-0000-00000000000e', 'profile_reminder', 'probe-2915-max-' || i,
       now() - make_interval(mins => i), case when i between 61 and 100 then now() end
  from generate_series(1, 120) i;

-- ------------------------------------------------------------------- added
-- Ana (2914): one unseen of each chat kind and one outside chat, so the bell,
-- Me's dot and the icon all differ: bell 3, Me 1, icon 3 kinds.
delete from public.notifications where member_id = 'aaaaaaaa-2914-0000-0000-00000000000a';
insert into public.notifications (member_id, kind, tag, actor_id, thread_id) values
  ('aaaaaaaa-2914-0000-0000-00000000000a', 'direct',           'probe-1403-direct',   'bbbbbbbb-2914-0000-0000-00000000000b', '29140000-0000-0000-0000-000000000001'),
  ('aaaaaaaa-2914-0000-0000-00000000000a', 'reaction',         'probe-1403-reaction', 'cccccccc-2914-0000-0000-00000000000c', '29140000-0000-0000-0000-000000000003'),
  ('aaaaaaaa-2914-0000-0000-00000000000a', 'profile_reminder', 'probe-1403-reminder', null, null);

-- Pat: exactly 100 in 30 days, 60 unseen, and one older than 30 days.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('99999999-1403-0000-0000-000000000009', 'peer', 'active', 'Pat', '19990014039', '1980-01-01', 'T1–T6', 'CA');
delete from public.notifications where member_id = '99999999-1403-0000-0000-000000000009';
insert into public.notifications (member_id, kind, tag, created_at, seen_at)
select '99999999-1403-0000-0000-000000000009', 'profile_reminder', 'probe-1403-pat-' || i,
       now() - make_interval(mins => i), case when i between 61 and 100 then now() end
  from generate_series(1, 100) i;
insert into public.notifications (member_id, kind, tag, created_at)
values ('99999999-1403-0000-0000-000000000009', 'profile_reminder', 'probe-1403-pat-old', now() - interval '31 days');

-- Two ways: Kit blocked Bo, so Kit's words in "Bo only" are hidden from Bo.
-- The trigger no longer notifies him of them; a row from before still hides.
insert into public.chat_messages (thread_id, author_id, body, created_at) values
  ('29140000-0000-0000-0000-000000000010', '22222222-2914-0000-0000-000000000002', 'Probe', now() - interval '8 minutes');
insert into public.notifications (member_id, kind, tag, actor_id, thread_id) values
  ('bbbbbbbb-2914-0000-0000-00000000000b', 'group', 'probe-2315-bo-group', '22222222-2914-0000-0000-000000000002',
   '29140000-0000-0000-0000-000000000010');

-- Ana (2915) blocked Cy: Ana's like is hidden from Cy, the reminder is not.
-- Ana also blocked the administrator Al, whose like from her still shows.
insert into public.member_blocks (blocker_id, blocked_id)
values ('aaaaaaaa-2915-0000-0000-00000000000a', 'dddddddd-2915-0000-0000-00000000000d');
delete from public.notifications where member_id = 'cccccccc-2915-0000-0000-00000000000c';
insert into public.notifications (member_id, kind, tag, actor_id, topic_id, post_id) values
  ('cccccccc-2915-0000-0000-00000000000c', 'like', 'probe-2315-cy-like', 'aaaaaaaa-2915-0000-0000-00000000000a',
   '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011'),
  ('cccccccc-2915-0000-0000-00000000000c', 'profile_reminder', 'probe-2315-cy-reminder', null, null, null),
  ('dddddddd-2915-0000-0000-00000000000d', 'like', 'probe-2315-al-like', 'aaaaaaaa-2915-0000-0000-00000000000a',
   '29150000-0000-0000-0000-000000000001', '29150000-0000-0000-0000-000000000011');

-- Su (suspended) has a reminder too; Rex was removed, with a conversation
-- with something new in it and a reminder. Neither reads anything.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state) values
  ('33333333-2315-0000-0000-000000000003', 'peer', 'removed', 'Rex', '19990023153', '1980-01-01', 'T1–T6', 'CA');
insert into public.chat_threads (id, kind, name, direct_key) values
  ('23150000-0000-0000-0000-000000000012', 'direct', null, 'probe-2315:rex:bo');
insert into public.chat_thread_members (thread_id, member_id, last_read_at) values
  ('23150000-0000-0000-0000-000000000012', '33333333-2315-0000-0000-000000000003', now() - interval '1 hour'),
  ('23150000-0000-0000-0000-000000000012', 'bbbbbbbb-2914-0000-0000-00000000000b', now() - interval '1 hour');
insert into public.chat_messages (thread_id, author_id, body, created_at) values
  ('23150000-0000-0000-0000-000000000012', 'bbbbbbbb-2914-0000-0000-00000000000b', 'Probe', now() - interval '10 minutes');
insert into public.notifications (member_id, kind, tag) values
  ('11111111-2914-0000-0000-000000000001', 'profile_reminder', 'probe-2315-su-reminder'),
  ('33333333-2315-0000-0000-000000000003', 'profile_reminder', 'probe-2315-rex-reminder');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;

-- As `member`: the new call, and the four old ones; then the push's number.
create function pg_temp.compare(member uuid)
returns table (new_counts text, old_counts text, push_badge integer)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
  set local role authenticated;
  return query
    select (select format('%s/%s/%s/%s', b.chat_unread, b.unseen, b.unseen_outside_chat, b.icon_kinds)
              from public.my_badge_counts() b),
           format('%s/%s/%s/%s', public.chat_unread_count(), public.my_unseen_notification_count(),
                  public.my_unseen_notification_count_outside_chat(), public.my_unseen_notification_kinds()),
           null::integer;
  reset role;
end $$;

-- `expected` is chat/bell/Me/icon.
create function pg_temp.check_member(member uuid, expected text, label text) returns void
language plpgsql as $$
declare
  r record;
  push integer;
begin
  select * into r from pg_temp.compare(member);
  push := coalesce(public.notification_badge(member), 0);
  raise notice '% got: new %, old %, push badge %', label, r.new_counts, r.old_counts, push;
  perform pg_temp.check_true(r.new_counts = r.old_counts, label || ': same as the four functions');
  perform pg_temp.check_true(r.new_counts = expected, label || ': ' || expected);
  perform pg_temp.check_true(split_part(r.new_counts, '/', 4)::integer = push,
    label || ': icon equals the push badge');
end $$;

\echo ''
\echo '== numbers are chat unread / bell / Me (outside chat) / icon kinds =='
\echo 'The fixture''s messages notify through the triggers, so the unread people have bells too.'
\echo 'expect (unread people): Ana 2914 2/3/1/3, Mo 0/1/0/1, Le 1/1/0/1, Ow 0/1/0/1, Su 0/0/0/0, Rex 0/0/0/0, Kit 1/2/0/1, Bo 1/1/0/1'
select pg_temp.check_member('aaaaaaaa-2914-0000-0000-00000000000a', '2/3/1/3', 'Ana 2914, ordinary, one of each chat kind');
select pg_temp.check_member('dddddddd-2914-0000-0000-00000000000d', '0/1/0/1', 'Mo, a muted conversation: no Chat dot, still the bell');
select pg_temp.check_member('eeeeeeee-2914-0000-0000-00000000000e', '1/1/0/1', 'Le, left a group');
select pg_temp.check_member('ffffffff-2914-0000-0000-00000000000f', '0/1/0/1', 'Ow, only their own words');
select pg_temp.check_member('11111111-2914-0000-0000-000000000001', '0/0/0/0', 'Su, suspended: reads nothing');
select pg_temp.check_member('33333333-2315-0000-0000-000000000003', '0/0/0/0', 'Rex, removed: reads nothing');
select pg_temp.check_member('22222222-2914-0000-0000-000000000002', '1/2/0/1', 'Kit, blocked Bo');
select pg_temp.check_member('bbbbbbbb-2914-0000-0000-00000000000b', '1/1/0/1', 'Bo, blocked by Kit: Kit''s words and their message hidden');

\echo ''
\echo 'expect (unseen people): Ana 2915 0/2/2/2, Cy 0/1/1/1, Al 0/2/2/2, Max 0/60/60/1, Pat 0/60/60/1'
select pg_temp.check_member('aaaaaaaa-2915-0000-0000-00000000000a', '0/2/2/2',
  'Ana 2915: a reply and a mention; not a removed post, a report, a closed room, 31 days, a blocked member');
select pg_temp.check_member('cccccccc-2915-0000-0000-00000000000c', '0/1/1/1', 'Cy, blocked by Ana: her like hidden, the reminder shown');
select pg_temp.check_member('dddddddd-2915-0000-0000-00000000000d', '0/2/2/2', 'Al, an administrator: a report, and a like from Ana who blocked him');
select pg_temp.check_member('eeeeeeee-2915-0000-0000-00000000000e', '0/60/60/1', 'Max, 120: only the newest 100 count');
select pg_temp.check_member('99999999-1403-0000-0000-000000000009', '0/60/60/1', 'Pat, exactly 100, one older');

\echo ''
\echo '== signed out =='
\echo 'expect: PASS refused'
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  set local role anon;
  begin
    perform * from public.my_badge_counts();
    raise exception 'FAIL: a signed-out visitor was answered';
  exception when insufficient_privilege then
    raise notice 'PASS: a signed-out visitor is refused';
  end;
  reset role;
end $$;

\echo ''
\echo 'PASS: my_badge_counts'
rollback;

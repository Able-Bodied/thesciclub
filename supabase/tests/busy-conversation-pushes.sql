-- ============================================================================
-- A busy conversation pushes once every two minutes (20261105110000)
-- ============================================================================
-- Who gets a push for a conversation message, and when; the bell is checked
-- alongside, as it must not change. Time is moved by backdating pushed_at
-- and last_read_at, so it runs in seconds. As postgres (push_owed is a
-- definer function for the service role); the reads as signed-in members.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f - < supabase/tests/busy-conversation-pushes.sql
--
-- Rolls back. Every check prints t; expect no ERROR.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

-- A request is queued only with push_notify_url set (rolled back).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'push_notify_url') then
    perform vault.create_secret('http://127.0.0.1:9/', 'push_notify_url');
  end if;
end;
$$;
select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('a0000000-6666-0000-0000-00000000000a', 'peer', 'active',    'Author',  '19990066001', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-00000000000b', 'peer', 'active',    'Watcher', '19990066002', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-00000000000c', 'peer', 'active',    'Away',    '19990066003', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-00000000000d', 'peer', 'active',    'Muted',   '19990066004', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-00000000000e', 'peer', 'active',    'Blocker', '19990066005', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-00000000000f', 'peer', 'active',    'Blocked', '19990066006', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-000000000010', 'peer', 'suspended', 'Paused',  '19990066007', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-000000000011', 'peer', 'active',    'NoPhone', '19990066008', '1980-01-01', 'T1–T6', 'CA'),
  ('a0000000-6666-0000-0000-000000000012', 'peer', 'active',    'Friend',  '19990066009', '1980-01-01', 'T1–T6', 'CA');

-- A device each, but NoPhone.
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/busy-' || display_name, id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '199900660%' and display_name <> 'NoPhone';

insert into public.chat_threads (id, kind, name) values
  ('b0000000-6666-0000-0000-000000000001', 'group', 'Busy group');
insert into public.chat_threads (id, kind, direct_key) values
  ('b0000000-6666-0000-0000-000000000002', 'direct', 'busy-direct');
insert into public.chat_thread_members (thread_id, member_id)
select 'b0000000-6666-0000-0000-000000000001', id from public.members
 where phone like '199900660%' and display_name <> 'Friend';
insert into public.chat_thread_members (thread_id, member_id) values
  ('b0000000-6666-0000-0000-000000000002', 'a0000000-6666-0000-0000-00000000000a'),
  ('b0000000-6666-0000-0000-000000000002', 'a0000000-6666-0000-0000-000000000012');
insert into public.chat_thread_mutes (thread_id, member_id) values
  ('b0000000-6666-0000-0000-000000000001', 'a0000000-6666-0000-0000-00000000000d');
-- Blocker blocked Author; Author blocked Blocked.
insert into public.member_blocks (blocker_id, blocked_id) values
  ('a0000000-6666-0000-0000-00000000000e', 'a0000000-6666-0000-0000-00000000000a'),
  ('a0000000-6666-0000-0000-00000000000a', 'a0000000-6666-0000-0000-00000000000f');
-- Watcher has the group open: read up to something said 5 s ago.
update public.chat_thread_members set last_read_at = clock_timestamp() - interval '5 seconds'
 where thread_id = 'b0000000-6666-0000-0000-000000000001'
   and member_id = 'a0000000-6666-0000-0000-00000000000b';

-- Author says something; returns whether a request was queued and who
-- push_owed then names, with detail (the unread count when over one).
create function pg_temp.say(thread uuid, words text)
returns table (queued bigint, pushed text)
language plpgsql as $$
declare
  before_count bigint := (select count(*) from net.http_request_queue);
  mid uuid;
begin
  insert into public.chat_messages (thread_id, author_id, body)
  values (thread, 'a0000000-6666-0000-0000-00000000000a', words)
  returning id into mid;
  return query
    select (select count(*) from net.http_request_queue) - before_count,
           (select coalesce(string_agg(m.display_name || coalesce('(' || o.detail || ')', ''), ' '
                                       order by m.display_name), '-')
              from public.push_owed(
                     (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret'),
                     'message', jsonb_build_object('id', mid)) o
              join public.push_subscriptions s on s.endpoint = o.endpoint
              join public.members m on m.id = s.member_id);
end;
$$;

-- The bell for the group and the direct conversation: unread rows, counted.
create function pg_temp.bell()
returns text
language sql as $$
  select coalesce(string_agg(m.display_name || '=' || n.count, ' ' order by m.display_name), '-')
    from public.notifications n join public.members m on m.id = n.member_id
   where n.thread_id in ('b0000000-6666-0000-0000-000000000001', 'b0000000-6666-0000-0000-000000000002')
     and n.read_at is null;
$$;

-- Moves a member's clock: their last push, and their read position, back.
-- Without the read trigger, which would read their row: time passing is not
-- a read.
create function pg_temp.later(who text, push_ago interval, read_ago interval)
returns void
language plpgsql as $$
begin
  update public.notifications n set pushed_at = n.pushed_at - push_ago
    from public.members m
   where m.id = n.member_id and m.display_name = who and n.read_at is null and n.pushed_at is not null;
  alter table public.chat_thread_members disable trigger chat_thread_members_read_notifications;
  update public.chat_thread_members tm set last_read_at = tm.last_read_at - read_ago
    from public.members m
   where m.id = tm.member_id and m.display_name = who and tm.last_read_at > '-infinity';
  alter table public.chat_thread_members enable trigger chat_thread_members_read_notifications;
end;
$$;

\echo ''
\echo '== 1. first message: Away and NoPhone owed; only Away has a device; Watcher (open), Muted, Blocker, Blocked, Paused nothing =='
\echo '   expect: 1 | Away | t (bell NoPhone=1 Away=1 Watcher=1)'
select s.queued, s.pushed, pg_temp.bell() = 'Away=1 NoPhone=1 Watcher=1' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'One') s;

\echo ''
\echo '== 2. a second message straight after: nobody owed, so no request at all =='
\echo '   expect: 0 | - | t'
select s.queued, s.pushed, pg_temp.bell() = 'Away=2 NoPhone=2 Watcher=2' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Two') s;

\echo ''
\echo '== 3. Watcher reads it, as the open screen does (expect t: their row is read) =='
select set_config('request.jwt.claims',
  '{"sub":"a0000000-6666-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.chat_mark_thread_read_through('b0000000-6666-0000-0000-000000000001',
  (select id from public.chat_messages where body = 'Two' and thread_id = 'b0000000-6666-0000-0000-000000000001'));
reset role;
select pg_temp.bell() = 'Away=2 NoPhone=2' as watcher_read;

\echo ''
\echo '== 4. a third message: Watcher still in it (read 0 s ago), Away within 2 minutes (expect 0 | - | t) =='
select s.queued, s.pushed, pg_temp.bell() = 'Away=3 NoPhone=3 Watcher=1' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Three') s;

\echo ''
\echo '== 5. 2 minutes on for Away and NoPhone, 31 s since Watcher read: Away says 4 new, Watcher 2 =='
\echo '   expect: 1 | Away(4) Watcher(2) | t  (the Watcher row began while it was open, unpushed)'
select pg_temp.later('Away', interval '121 seconds', interval '31 seconds');
select pg_temp.later('NoPhone', interval '121 seconds', interval '31 seconds');
select pg_temp.later('Watcher', interval '0', interval '31 seconds');
select s.queued, s.pushed, pg_temp.bell() = 'Away=4 NoPhone=4 Watcher=2' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Four') s;

\echo ''
\echo '== 6. 1:59 later is not yet 2 minutes (expect 0 | - | t) =='
select pg_temp.later('Away', interval '119 seconds', interval '0');
select pg_temp.later('Watcher', interval '119 seconds', interval '0');
select s.queued, s.pushed, pg_temp.bell() = 'Away=5 NoPhone=5 Watcher=3' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Five') s;

\echo ''
\echo '== 7. Away reads: the next message after 30 s pushes at once, as one message (reset) =='
\echo '   expect: 1 | Away | t'
select set_config('request.jwt.claims',
  '{"sub":"a0000000-6666-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.chat_mark_thread_read_through('b0000000-6666-0000-0000-000000000001',
  (select id from public.chat_messages where body = 'Five' and thread_id = 'b0000000-6666-0000-0000-000000000001'));
reset role;
select pg_temp.later('Away', interval '0', interval '31 seconds');
select s.queued, s.pushed, pg_temp.bell() = 'Away=1 NoPhone=6 Watcher=4' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Six') s;

\echo ''
\echo '== 8. reading within 30 s counts as being in it: no push, the bell still counts (expect 0 | - | t) =='
select set_config('request.jwt.claims',
  '{"sub":"a0000000-6666-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.chat_mark_thread_read_through('b0000000-6666-0000-0000-000000000001',
  (select id from public.chat_messages where body = 'Six' and thread_id = 'b0000000-6666-0000-0000-000000000001'));
reset role;
select s.queued, s.pushed, pg_temp.bell() = 'Away=1 NoPhone=7 Watcher=5' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Seven') s;

\echo ''
\echo '== 9. only NoPhone due (no device): no request (expect 0 | - ) =='
select pg_temp.later('NoPhone', interval '121 seconds', interval '0');
select s.queued, s.pushed
  from pg_temp.say('b0000000-6666-0000-0000-000000000001', 'Eight') s;
select pushed_message = (select id from public.chat_messages where body = 'Eight') as nophone_marked
  from public.notifications where member_id = 'a0000000-6666-0000-0000-000000000011' and read_at is null;

\echo ''
\echo '== 10. a direct message: first pushes, the next waits, 2 minutes on says 3 =='
\echo '   expect: 1 | Friend, then 0 | -, then 1 | Friend(3)'
select s.queued, s.pushed from pg_temp.say('b0000000-6666-0000-0000-000000000002', 'Hi') s;
select s.queued, s.pushed from pg_temp.say('b0000000-6666-0000-0000-000000000002', 'You there?') s;
select pg_temp.later('Friend', interval '121 seconds', interval '0');
select s.queued, s.pushed, pg_temp.bell() like '%Friend=3%' as bell_as_today
  from pg_temp.say('b0000000-6666-0000-0000-000000000002', 'Call me') s;

\echo ''
\echo '== 11. an old push_owed call for an earlier message, after a later one pushed: nothing twice (expect 0) =='
select count(*) as stale_owed
  from public.push_owed(:'secret', 'message',
         jsonb_build_object('id', (select id from public.chat_messages where body = 'Hi')));

\echo ''
\echo '== 12. a message taken back before push_owed asks: nothing (expect 0) =='
select pg_temp.later('Friend', interval '121 seconds', interval '0');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('c0000000-6666-0000-0000-000000000001', 'b0000000-6666-0000-0000-000000000002',
   'a0000000-6666-0000-0000-00000000000a', 'Oops');
update public.chat_messages set removed_at = now(), body = '' where id = 'c0000000-6666-0000-0000-000000000001';
select count(*) as owed_removed
  from public.push_owed(:'secret', 'message', '{"id":"c0000000-6666-0000-0000-000000000001"}');

\echo ''
\echo '== 13. every other kind still goes through the list: a group add records and queues (expect t | 1) =='
select count(*) as queued_before from net.http_request_queue \gset
-- As Author (auth.uid()), the way the add-to-group function inserts.
select set_config('request.jwt.claims',
  '{"sub":"a0000000-6666-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
insert into public.chat_thread_members (thread_id, member_id)
values ('b0000000-6666-0000-0000-000000000001', 'a0000000-6666-0000-0000-000000000012');
select exists (
  select 1 from public.notifications
   where member_id = 'a0000000-6666-0000-0000-000000000012' and kind = 'group_add'
) as group_add_recorded,
  (select count(*) from net.http_request_queue) - :queued_before as queued;

\echo ''
\echo '== 14. muted, blocked either way and paused never had a row or a push (expect t) =='
select not exists (
  select 1 from public.notifications n join public.members m on m.id = n.member_id
   where m.display_name in ('Muted', 'Blocker', 'Blocked', 'Paused')
     and n.thread_id = 'b0000000-6666-0000-0000-000000000001'
) as none_for_them;

rollback;

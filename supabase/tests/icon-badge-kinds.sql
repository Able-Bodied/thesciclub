-- ============================================================================
-- The app icon counts kinds of notification, until the bell is opened
-- (20261028010000)
-- ============================================================================
-- The number is read as Ana, signed in (my_unseen_notification_kinds), and
-- from push_owed as the service role would get it. What happens to her is
-- written by the superuser (messages, replies) or by the members themselves
-- (reactions); the triggers record it either way.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/icon-badge-kinds.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-2811-0000-0000-00000000000a', 'peer',   'active', 'Ana', '19990028110', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-2811-0000-0000-00000000000b', 'peer',   'active', 'Bo',  '19990028111', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-2811-0000-0000-00000000000c', 'peer',   'active', 'Cy',  '19990028112', '1982-01-01', 'T1–T6', 'CA', false),
  ('dddddddd-2811-0000-0000-00000000000d', 'mentor', 'active', 'Al',  '19990028113', '1983-01-01', 'T1–T6', 'CA', true);

insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/' || substr(id::text, 1, 8), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999002811%';

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-badge', 'Probe badge', 'For the probe.', 'Life', 9282, now());
insert into public.chat_topics (id, room_id, title, author_id)
values ('28110000-0000-0000-0000-000000000001', 'probe-badge', 'Ana asks', 'aaaaaaaa-2811-0000-0000-00000000000a');
insert into public.chat_posts (id, topic_id, author_id, body)
values ('28110000-0000-0000-0000-000000000011', '28110000-0000-0000-0000-000000000001', 'aaaaaaaa-2811-0000-0000-00000000000a', 'Morning or evening?');

insert into public.chat_threads (id, kind, name, created_by)
values ('28110000-0000-0000-0000-000000000020', 'group', 'Probe group', 'aaaaaaaa-2811-0000-0000-00000000000a');
insert into public.chat_thread_members (thread_id, member_id) values
  ('28110000-0000-0000-0000-000000000020', 'aaaaaaaa-2811-0000-0000-00000000000a'),
  ('28110000-0000-0000-0000-000000000020', 'bbbbbbbb-2811-0000-0000-00000000000b'),
  ('28110000-0000-0000-0000-000000000020', 'cccccccc-2811-0000-0000-00000000000c');
insert into public.chat_messages (id, thread_id, author_id, body)
values ('28110000-0000-0000-0000-000000000021', '28110000-0000-0000-0000-000000000020', 'aaaaaaaa-2811-0000-0000-00000000000a', 'Hello');

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.refused(statement text, expected text) returns void language plpgsql as $$
begin
  begin execute statement;
  exception when others then
    if sqlstate = expected then raise notice 'PASS: refused (%) %', sqlstate, statement; return; end if;
    raise;
  end;
  raise exception 'FAIL: accepted %', statement;
end $$;
create function pg_temp.as_member(member uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', member, 'role', 'authenticated')::text, true);
$$;
-- The number on Ana's icon, read as Ana.
create function pg_temp.ana_icon() returns integer language plpgsql as $$
declare n integer;
begin
  perform pg_temp.as_member('aaaaaaaa-2811-0000-0000-00000000000a');
  set local role authenticated;
  n := public.my_unseen_notification_kinds();
  reset role;
  return n;
end $$;
-- What a push to Ana carries.
create function pg_temp.ana_push_badge(secret text, event text, key jsonb) returns integer language sql as $$
  select max(o.badge) from public.push_owed(secret, event, key) o
   where o.endpoint = 'https://web.push.apple.com/aaaaaaaa';
$$;
grant execute on function pg_temp.check_true(boolean, text) to authenticated;
grant execute on function pg_temp.refused(text, text) to authenticated, anon;
grant execute on function pg_temp.as_member(uuid) to authenticated;

\echo '== 0. nothing yet =='
select pg_temp.check_true(pg_temp.ana_icon() = 0, 'icon empty');

\echo '== 1. kinds, not items: two messages are 1; replies from two members make 2 =='
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('28110000-0000-0000-0000-000000000022', '28110000-0000-0000-0000-000000000020', 'bbbbbbbb-2811-0000-0000-00000000000b', 'One'),
  ('28110000-0000-0000-0000-000000000023', '28110000-0000-0000-0000-000000000020', 'bbbbbbbb-2811-0000-0000-00000000000b', 'Two');
select pg_temp.check_true(pg_temp.ana_icon() = 1, 'two messages: 1');
insert into public.chat_posts (topic_id, author_id, body) values
  ('28110000-0000-0000-0000-000000000001', 'bbbbbbbb-2811-0000-0000-00000000000b', 'Evening'),
  ('28110000-0000-0000-0000-000000000001', 'cccccccc-2811-0000-0000-00000000000c', 'Morning');
select pg_temp.check_true(pg_temp.ana_icon() = 2, 'messages and two replies: 2');

\echo '== 2. a like and a reaction are a kind each; a second reaction is not =='
insert into public.chat_post_likes (post_id, member_id)
values ('28110000-0000-0000-0000-000000000011', 'bbbbbbbb-2811-0000-0000-00000000000b');
select pg_temp.check_true(pg_temp.ana_icon() = 3, 'and a like: 3');
set local role authenticated;
select pg_temp.as_member('bbbbbbbb-2811-0000-0000-00000000000b');
select public.chat_set_reaction('post', '28110000-0000-0000-0000-000000000011', '👍');
select pg_temp.as_member('cccccccc-2811-0000-0000-00000000000c');
select public.chat_set_reaction('message', '28110000-0000-0000-0000-000000000021', '❤️');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 4, 'and two reactions: 4');

\echo '== 3. every push carries the same number =='
select pg_temp.check_true(pg_temp.ana_push_badge(:'secret', 'message', '{"id":"28110000-0000-0000-0000-000000000023"}') = 4,
  'a message push says 4');
select pg_temp.check_true(pg_temp.ana_push_badge(:'secret', 'like',
  '{"post_id":"28110000-0000-0000-0000-000000000011","member_id":"bbbbbbbb-2811-0000-0000-00000000000b"}') = 4,
  'a like push says 4');
select pg_temp.check_true(pg_temp.ana_push_badge(:'secret', 'reaction',
  '{"target":"message","id":"28110000-0000-0000-0000-000000000021","member_id":"cccccccc-2811-0000-0000-00000000000c"}') = 4,
  'a reaction push says 4');

\echo '== 4. reading the conversation in Chat leaves it =='
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2811-0000-0000-00000000000a');
select public.chat_mark_thread_read_through('28110000-0000-0000-0000-000000000020', '28110000-0000-0000-0000-000000000023');
select pg_temp.check_true((select bool_and(n.read and not n.seen) from public.my_notifications() n
                            where n.kind in ('group', 'reaction') and n.url like '/chat/t/%'),
  'its rows are read, and not seen');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 4, 'still 4');

\echo '== 5. a kind switched off on Me does not count =='
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2811-0000-0000-00000000000a');
insert into public.push_muted_kinds (member_id, kind) values (auth.uid(), 'like');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 3, 'likes off: 3');
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2811-0000-0000-00000000000a');
insert into public.push_muted_kinds (member_id, kind) values (auth.uid(), 'reaction');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 2, 'reactions off too: 2');
select pg_temp.check_true(pg_temp.ana_push_badge(:'secret', 'message', '{"id":"28110000-0000-0000-0000-000000000023"}') = 2,
  'and a push says 2');
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2811-0000-0000-00000000000a');
delete from public.push_muted_kinds where member_id = auth.uid();
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 4, 'back on: 4');

\echo '== 6. opening the bell clears it =='
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2811-0000-0000-00000000000a');
select public.notifications_mark_seen();
select pg_temp.check_true(public.my_unseen_notification_count() = 0, 'the bell is clear');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 0, 'and so is the icon');
select pg_temp.check_true(pg_temp.ana_push_badge(:'secret', 'message', '{"id":"28110000-0000-0000-0000-000000000023"}') = 0,
  'a push now says 0');

\echo '== 7. nothing the bell would not show: a blocked member, a closed room =='
set local role authenticated;
select pg_temp.as_member('cccccccc-2811-0000-0000-00000000000c');
select public.chat_set_reaction('post', '28110000-0000-0000-0000-000000000011', '🎉');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 1, 'a new reaction: 1');
savepoint blocked;
insert into public.member_blocks (blocker_id, blocked_id)
values ('aaaaaaaa-2811-0000-0000-00000000000a', 'cccccccc-2811-0000-0000-00000000000c');
select pg_temp.check_true(pg_temp.ana_icon() = 0, 'from a member she blocked: 0');
rollback to savepoint blocked;
savepoint closed;
update public.chat_rooms set opened_at = null where id = 'probe-badge';
select pg_temp.check_true(pg_temp.ana_icon() = 0, 'in a room she cannot read: 0');
rollback to savepoint closed;
select pg_temp.check_true(pg_temp.ana_icon() = 1, 'otherwise 1');

\echo '== 8. reports and the weekly count are one kind, behind one switch, for administrators =='
insert into public.notifications (member_id, kind, tag, detail) values
  ('dddddddd-2811-0000-0000-00000000000d', 'report', 'report:probe', null),
  ('dddddddd-2811-0000-0000-00000000000d', 'blocks_weekly', 'blocks:probe', '2'),
  ('aaaaaaaa-2811-0000-0000-00000000000a', 'report', 'report:probe', null);
set local role authenticated;
select pg_temp.as_member('dddddddd-2811-0000-0000-00000000000d');
select pg_temp.check_true(public.my_unseen_notification_kinds() = 1, 'an administrator: 1');
insert into public.push_muted_kinds (member_id, kind) values (auth.uid(), 'report');
select pg_temp.check_true(public.my_unseen_notification_kinds() = 0, 'New reports off: 0');
reset role;
select pg_temp.check_true(pg_temp.ana_icon() = 1, 'a report row is no number for a member who is not one');

\echo '== 9. refused: anybody else''s number =='
set local role authenticated;
select pg_temp.as_member('bbbbbbbb-2811-0000-0000-00000000000b');
select pg_temp.refused($q$select public.notification_badge('aaaaaaaa-2811-0000-0000-00000000000a')$q$, '42501');
reset role;
set local role anon;
select pg_temp.refused($q$select public.my_unseen_notification_kinds()$q$, '42501');
reset role;

\echo '== done: every check above says PASS =='
rollback;

-- ============================================================================
-- A notification clears where it is opened (20261028900000)
-- ============================================================================
-- The owner, 2026-10-28: "clear only 1 of 2". Opening one conversation, one
-- topic, one row in the bell or one pressed push clears what is about that
-- thing alone; only the bell's list clears everything. Read as Ana, signed
-- in, through my_unseen_notification_kinds (the icon) and
-- my_unseen_notification_count (the bell). What happens to her is written
-- by the superuser; the triggers record it as for anybody.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/a-notification-clears-where-it-is-opened.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-2890-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990028900', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-2890-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990028901', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-2890-0000-0000-00000000000c', 'peer', 'active', 'Cy',  '19990028902', '1982-01-01', 'T1–T6', 'CA', false);

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-clears', 'Probe clears', 'For the probe.', 'Life', 9289, now());
insert into public.chat_topics (id, room_id, title, author_id)
values ('28900000-0000-0000-0000-000000000001', 'probe-clears', 'Ana asks', 'aaaaaaaa-2890-0000-0000-00000000000a');
insert into public.chat_posts (id, topic_id, author_id, body, created_at)
values ('28900000-0000-0000-0000-000000000011', '28900000-0000-0000-0000-000000000001', 'aaaaaaaa-2890-0000-0000-00000000000a', 'Morning or evening?', now() - interval '1 minute');

-- Two conversations: one with Bo, one with Cy.
insert into public.chat_threads (id, kind, name, created_by) values
  ('28900000-0000-0000-0000-000000000021', 'group', 'With Bo', 'aaaaaaaa-2890-0000-0000-00000000000a'),
  ('28900000-0000-0000-0000-000000000022', 'group', 'With Cy', 'aaaaaaaa-2890-0000-0000-00000000000a');
insert into public.chat_thread_members (thread_id, member_id) values
  ('28900000-0000-0000-0000-000000000021', 'aaaaaaaa-2890-0000-0000-00000000000a'),
  ('28900000-0000-0000-0000-000000000021', 'bbbbbbbb-2890-0000-0000-00000000000b'),
  ('28900000-0000-0000-0000-000000000022', 'aaaaaaaa-2890-0000-0000-00000000000a'),
  ('28900000-0000-0000-0000-000000000022', 'cccccccc-2890-0000-0000-00000000000c');

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
-- Ana's icon, read as Ana.
create function pg_temp.icon() returns integer language plpgsql as $$
declare n integer;
begin
  perform pg_temp.as_member('aaaaaaaa-2890-0000-0000-00000000000a');
  set local role authenticated;
  n := public.my_unseen_notification_kinds();
  reset role;
  return n;
end $$;
-- Something Ana does, as Ana.
create function pg_temp.as_ana(statement text) returns void language plpgsql as $$
begin
  perform pg_temp.as_member('aaaaaaaa-2890-0000-0000-00000000000a');
  set local role authenticated;
  execute statement;
  reset role;
end $$;
grant execute on function pg_temp.check_true(boolean, text) to authenticated;
grant execute on function pg_temp.refused(text, text) to authenticated, anon;
grant execute on function pg_temp.as_member(uuid) to authenticated;

\echo '== 1. a message and a reply are 2: open the chat, 1; open the post, 0 =='
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('28900000-0000-0000-0000-000000000031', '28900000-0000-0000-0000-000000000021', 'bbbbbbbb-2890-0000-0000-00000000000b', 'Hello Ana');
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('28900000-0000-0000-0000-000000000012', '28900000-0000-0000-0000-000000000001', 'bbbbbbbb-2890-0000-0000-00000000000b', 'Evening');
select pg_temp.check_true(pg_temp.icon() = 2, 'a message and a reply: 2');
select pg_temp.as_ana($q$select public.chat_mark_thread_read_through('28900000-0000-0000-0000-000000000021', '28900000-0000-0000-0000-000000000031')$q$);
select pg_temp.check_true(pg_temp.icon() = 1, 'the chat opened: 1');
select pg_temp.as_ana($q$select public.chat_mark_topic_read_through('28900000-0000-0000-0000-000000000001', '28900000-0000-0000-0000-000000000012')$q$);
select pg_temp.check_true(pg_temp.icon() = 0, 'the post opened: 0');

\echo '== 2. two chats: opening one leaves Messages counting until the other is opened =='
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('28900000-0000-0000-0000-000000000032', '28900000-0000-0000-0000-000000000021', 'bbbbbbbb-2890-0000-0000-00000000000b', 'Again'),
  ('28900000-0000-0000-0000-000000000033', '28900000-0000-0000-0000-000000000022', 'cccccccc-2890-0000-0000-00000000000c', 'Hi from Cy');
select pg_temp.check_true(pg_temp.icon() = 1, 'two chats with messages: 1');
select pg_temp.as_ana($q$select public.chat_mark_thread_read_through('28900000-0000-0000-0000-000000000021', '28900000-0000-0000-0000-000000000032')$q$);
select pg_temp.check_true(pg_temp.icon() = 1, 'one opened: still 1');
select pg_temp.check_true((select count(*) = 1 from public.notifications
                            where member_id = 'aaaaaaaa-2890-0000-0000-00000000000a' and seen_at is null),
  'only Cy''s conversation is unseen');
select pg_temp.as_ana($q$select public.chat_mark_thread_read_through('28900000-0000-0000-0000-000000000022', '28900000-0000-0000-0000-000000000033')$q$);
select pg_temp.check_true(pg_temp.icon() = 0, 'the other opened: 0');

\echo '== 3. a post''s like and reaction clear with its topic; a message''s reaction with its chat =='
insert into public.chat_post_likes (post_id, member_id)
values ('28900000-0000-0000-0000-000000000011', 'bbbbbbbb-2890-0000-0000-00000000000b');
insert into public.chat_post_reactions (target_id, member_id, emoji)
values ('28900000-0000-0000-0000-000000000011', 'cccccccc-2890-0000-0000-00000000000c', '👍');
select pg_temp.check_true(pg_temp.icon() = 2, 'a like and a reaction: 2');
select pg_temp.as_ana($q$select public.chat_mark_topic_read_through('28900000-0000-0000-0000-000000000001', '28900000-0000-0000-0000-000000000012')$q$);
select pg_temp.check_true(pg_temp.icon() = 0, 'the topic opened: 0');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('28900000-0000-0000-0000-000000000034', '28900000-0000-0000-0000-000000000022', 'aaaaaaaa-2890-0000-0000-00000000000a', 'Thanks Cy');
insert into public.chat_message_reactions (target_id, member_id, emoji)
values ('28900000-0000-0000-0000-000000000034', 'cccccccc-2890-0000-0000-00000000000c', '❤️');
select pg_temp.check_true(pg_temp.icon() = 1, 'a reaction to her message: 1');
-- Cy writes after, so there is something new to read up to.
insert into public.chat_messages (id, thread_id, author_id, body, created_at) values
  ('28900000-0000-0000-0000-000000000035', '28900000-0000-0000-0000-000000000022', 'cccccccc-2890-0000-0000-00000000000c', 'Welcome', clock_timestamp() + interval '1 second');
select pg_temp.as_ana($q$select public.chat_mark_thread_read_through('28900000-0000-0000-0000-000000000022', '28900000-0000-0000-0000-000000000035')$q$);
select pg_temp.check_true(pg_temp.icon() = 0, 'the chat opened: 0, reaction and all');

\echo '== 4. a row pressed in the bell clears that one =='
insert into public.notifications (id, member_id, kind, tag, detail) values
  ('28900000-0000-0000-0000-0000000000e1', 'aaaaaaaa-2890-0000-0000-00000000000a', 'event_reminder', 'event:probe', '10:00am'),
  ('28900000-0000-0000-0000-0000000000e2', 'aaaaaaaa-2890-0000-0000-00000000000a', 'profile_reminder', 'profile:details', 'details');
select pg_temp.check_true(pg_temp.icon() = 2, 'an event reminder and a profile reminder: 2');
select pg_temp.as_ana($q$select public.notifications_mark_read('28900000-0000-0000-0000-0000000000e1')$q$);
select pg_temp.check_true(pg_temp.icon() = 1, 'the event''s row pressed: 1');

\echo '== 5. a pressed push clears what its tag names, and only the caller''s =='
insert into public.notifications (member_id, kind, tag, detail) values
  ('bbbbbbbb-2890-0000-0000-00000000000b', 'profile_reminder', 'profile:details', 'details'),
  ('aaaaaaaa-2890-0000-0000-00000000000a', 'invite_joined', 'joined:probe', null);
select pg_temp.check_true(pg_temp.icon() = 2, 'a reminder and an invite: 2');
set local role authenticated;
select pg_temp.as_member('bbbbbbbb-2890-0000-0000-00000000000b');
select public.notifications_mark_read_by_tag('profile:details');
reset role;
select pg_temp.check_true(pg_temp.icon() = 2, 'Bo pressing his own leaves Ana''s: 2');
select pg_temp.check_true((select seen_at is not null and read_at is not null from public.notifications
                            where member_id = 'bbbbbbbb-2890-0000-0000-00000000000b'), 'and clears his');
select pg_temp.as_ana($q$select public.notifications_mark_read_by_tag('profile:details')$q$);
select pg_temp.check_true(pg_temp.icon() = 1, 'Ana presses the reminder: 1');
-- Added to a group by Bo: its push is the conversation's, thread:<id>.
insert into public.notifications (member_id, kind, tag, thread_id, actor_id) values
  ('aaaaaaaa-2890-0000-0000-00000000000a', 'group_add', 'group_add:28900000-0000-0000-0000-000000000021',
   '28900000-0000-0000-0000-000000000021', 'bbbbbbbb-2890-0000-0000-00000000000b');
select pg_temp.check_true(pg_temp.icon() = 2, 'added to a group: 2');
select pg_temp.as_ana($q$select public.notifications_mark_read_by_tag('thread:28900000-0000-0000-0000-000000000021')$q$);
select pg_temp.check_true(pg_temp.icon() = 1, 'its push pressed: 1');

\echo '== 6. the bell''s list clears the rest =='
select pg_temp.as_ana($q$select public.notifications_mark_seen()$q$);
select pg_temp.check_true(pg_temp.icon() = 0, 'the list opened: 0');

\echo '== 7. refused: signed out =='
set local role anon;
select pg_temp.refused($q$select public.notifications_mark_read_by_tag('joined:probe')$q$, '42501');
reset role;

\echo '== done: every check above says PASS =='
rollback;

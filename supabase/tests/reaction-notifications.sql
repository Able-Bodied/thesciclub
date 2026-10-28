-- ============================================================================
-- A reaction notifies the author (20261028000000)
-- ============================================================================
-- Reactions are made as signed-in members through chat_set_reaction, so the
-- trigger records what a member's own action would. push_owed is the service
-- role's, asked as the superuser, as push-notify-likes.sql does. Fixtures
-- that no member could write (a closed room, a block) are the superuser's.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/reaction-notifications.sql
--
-- Every check prints PASS or stops the script with FAIL. Rolls back. Do not
-- point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-2810-0000-0000-00000000000a', 'peer', 'active', 'Ana', '19990028100', '1980-01-01', 'T1–T6', 'CA', false),
  ('bbbbbbbb-2810-0000-0000-00000000000b', 'peer', 'active', 'Bo',  '19990028101', '1981-01-01', 'T1–T6', 'CA', false),
  ('cccccccc-2810-0000-0000-00000000000c', 'peer', 'active', 'Cy',  '19990028102', '1982-01-01', 'T1–T6', 'CA', false),
  ('dddddddd-2810-0000-0000-00000000000d', 'peer', 'active', 'Di',  '19990028103', '1983-01-01', 'T1–T6', 'CA', false),
  ('eeeeeeee-2810-0000-0000-00000000000e', 'peer', 'active', 'Ed',  '19990028104', '1984-01-01', 'T1–T6', 'CA', false);

insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/' || substr(id::text, 1, 8), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999002810%';

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-react', 'Probe reactions', 'For the probe.', 'Life', 9281, now());
-- Ana's topic (her opening post), and Cy's topic with Ana's reply in it.
insert into public.chat_topics (id, room_id, title, author_id) values
  ('28100000-0000-0000-0000-000000000001', 'probe-react', 'Ana asks about cushions', 'aaaaaaaa-2810-0000-0000-00000000000a'),
  ('28100000-0000-0000-0000-000000000002', 'probe-react', 'Cy asks about ramps', 'cccccccc-2810-0000-0000-00000000000c');
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
  ('28100000-0000-0000-0000-000000000011', '28100000-0000-0000-0000-000000000001', 'aaaaaaaa-2810-0000-0000-00000000000a', 'Which **cushion** works?', now() - interval '2 seconds'),
  ('28100000-0000-0000-0000-000000000012', '28100000-0000-0000-0000-000000000002', 'cccccccc-2810-0000-0000-00000000000c', 'Ramps at home?', now() - interval '1 second'),
  ('28100000-0000-0000-0000-000000000013', '28100000-0000-0000-0000-000000000002', 'aaaaaaaa-2810-0000-0000-00000000000a', 'A folding one', now());

insert into public.chat_threads (id, kind, name, created_by)
values ('28100000-0000-0000-0000-000000000020', 'group', 'Probe group', 'aaaaaaaa-2810-0000-0000-00000000000a');
insert into public.chat_thread_members (thread_id, member_id)
select '28100000-0000-0000-0000-000000000020', id from public.members where phone like '1999002810%';
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('28100000-0000-0000-0000-000000000021', '28100000-0000-0000-0000-000000000020', 'aaaaaaaa-2810-0000-0000-00000000000a', 'See you *Friday*');
-- The message itself notified the others; only reactions are counted below.
delete from public.notifications where member_id in (select id from public.members where phone like '1999002810%');

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
-- push_owed's rows for one reaction, as the service role would get them.
create function pg_temp.owed(secret text, target text, id uuid, member uuid)
returns table (to_whom text, detail text, body text, url text, tag text) language sql as $$
  select (select m.display_name from public.members m join public.push_subscriptions s on s.member_id = m.id
           where s.endpoint = o.endpoint),
         o.detail, o.body, o.url, o.tag
    from public.push_owed(secret, 'reaction',
      jsonb_build_object('target', target, 'id', id, 'member_id', member)) o;
$$;
grant execute on function pg_temp.check_true(boolean, text) to authenticated;
grant execute on function pg_temp.refused(text, text) to authenticated;
grant execute on function pg_temp.as_member(uuid) to authenticated;

set local role authenticated;

\echo '== 1. Bo reacts to Ana''s message: she is told who, with what, and where it opens =='
select pg_temp.as_member('bbbbbbbb-2810-0000-0000-00000000000b');
select pg_temp.check_true(current_user = 'authenticated', 'signed in, under RLS');
select public.chat_set_reaction('message', '28100000-0000-0000-0000-000000000021', '👍');
select pg_temp.check_true(not exists (select 1 from public.my_notifications() where kind = 'reaction'),
  'the reactor is not told');
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.check_true((
  select count(*) = 1 and bool_and(n.actor_name = 'Bo' and n.detail = 'message:👍'
         and n.excerpt = 'See you *Friday*' and n.place = 'Probe group'
         and n.url = '/chat/t/28100000-0000-0000-0000-000000000020?message=28100000-0000-0000-0000-000000000021')
    from public.my_notifications() n where n.kind = 'reaction'), 'Ana''s list says Bo reacted 👍 to her message');
reset role;
select pg_temp.check_true((
  select count(*) = 1 and bool_and(o.to_whom = 'Ana' and o.detail = 'message:👍' and o.body = 'See you *Friday*'
         and o.tag = 'reaction:28100000-0000-0000-0000-000000000021'
         and o.url = '/chat/t/28100000-0000-0000-0000-000000000020?message=28100000-0000-0000-0000-000000000021')
    from pg_temp.owed(:'secret', 'message', '28100000-0000-0000-0000-000000000021', 'bbbbbbbb-2810-0000-0000-00000000000b') o),
  'the push goes to Ana alone, opening the message');
set local role authenticated;

\echo '== 2. a post says topic for the opening post, post otherwise =='
select pg_temp.as_member('bbbbbbbb-2810-0000-0000-00000000000b');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000011', '❤️');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000013', '🎉');
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.check_true((
  select n.detail = 'post:❤️' and n.place = 'Ana asks about cushions' and n.excerpt = 'Which **cushion** works?'
         and n.url = '/chat/rooms/probe-react/topics/28100000-0000-0000-0000-000000000001?post=28100000-0000-0000-0000-000000000011'
    from public.my_notifications() n where n.kind = 'reaction' and n.detail like 'post:❤️'), 'the list opens the post');
reset role;
select pg_temp.check_true((
  select o.to_whom = 'Ana' and o.detail = 'topic:❤️' and o.tag = 'reaction:28100000-0000-0000-0000-000000000011'
    from pg_temp.owed(:'secret', 'post', '28100000-0000-0000-0000-000000000011', 'bbbbbbbb-2810-0000-0000-00000000000b') o),
  'the push says topic for her opening post');
select pg_temp.check_true((
  select o.to_whom = 'Ana' and o.detail = 'post:🎉'
    from pg_temp.owed(:'secret', 'post', '28100000-0000-0000-0000-000000000013', 'bbbbbbbb-2810-0000-0000-00000000000b') o),
  'and post for her reply in Cy''s topic');
set local role authenticated;

\echo '== 3. nobody is told of their own reaction =='
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select public.chat_set_reaction('message', '28100000-0000-0000-0000-000000000021', '💪');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000011', '💪');
select pg_temp.check_true(not exists (select 1 from public.my_notifications() where kind = 'reaction'
                            and actor_id = auth.uid()), 'no row for Ana''s own reactions');
reset role;
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'message',
  '28100000-0000-0000-0000-000000000021', 'aaaaaaaa-2810-0000-0000-00000000000a')), 'no push for her own');
set local role authenticated;

\echo '== 4. another emoji sends nothing new; cleared, nothing is owed; given again, it folds =='
select pg_temp.as_member('bbbbbbbb-2810-0000-0000-00000000000b');
select public.chat_set_reaction('message', '28100000-0000-0000-0000-000000000021', '😂');
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.check_true((select n.count = 1 and n.detail = 'message:👍' from public.my_notifications() n
                            where n.kind = 'reaction' and n.detail like 'message:%'), 'a changed emoji is no second notification');
select pg_temp.as_member('bbbbbbbb-2810-0000-0000-00000000000b');
select public.chat_set_reaction('message', '28100000-0000-0000-0000-000000000021', null);
reset role;
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'message',
  '28100000-0000-0000-0000-000000000021', 'bbbbbbbb-2810-0000-0000-00000000000b')), 'undone before the push: nothing owed');
set local role authenticated;
select pg_temp.as_member('bbbbbbbb-2810-0000-0000-00000000000b');
select public.chat_set_reaction('message', '28100000-0000-0000-0000-000000000021', '🙏');
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.check_true((select n.count = 2 and n.detail = 'message:🙏' from public.my_notifications() n
                            where n.kind = 'reaction' and n.detail like 'message:%'), 'given again, it folds into the row');

\echo '== 5. not between a blocked pair, either way =='
reset role;
insert into public.member_blocks (blocker_id, blocked_id) values
  ('aaaaaaaa-2810-0000-0000-00000000000a', 'dddddddd-2810-0000-0000-00000000000d'),
  ('eeeeeeee-2810-0000-0000-00000000000e', 'aaaaaaaa-2810-0000-0000-00000000000a');
set local role authenticated;
select pg_temp.as_member('dddddddd-2810-0000-0000-00000000000d');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000013', '👍');
select pg_temp.as_member('eeeeeeee-2810-0000-0000-00000000000e');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000013', '👍');
reset role;
select pg_temp.check_true(not exists (select 1 from public.notifications where member_id = 'aaaaaaaa-2810-0000-0000-00000000000a'
                          and actor_id in ('dddddddd-2810-0000-0000-00000000000d', 'eeeeeeee-2810-0000-0000-00000000000e')),
  'no row from a member Ana blocked, nor from one who blocked her');
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'post',
  '28100000-0000-0000-0000-000000000013', 'dddddddd-2810-0000-0000-00000000000d')), 'no push from the member she blocked');
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'post',
  '28100000-0000-0000-0000-000000000013', 'eeeeeeee-2810-0000-0000-00000000000e')), 'no push from the member who blocked her');

\echo '== 6. not to an author who can no longer read it =='
savepoint unreadable;
update public.chat_rooms set opened_at = null where id = 'probe-react';
-- A closed room refuses members' reactions, so the superuser writes Cy's.
insert into public.chat_post_reactions (target_id, member_id, emoji)
values ('28100000-0000-0000-0000-000000000011', 'cccccccc-2810-0000-0000-00000000000c', '😮');
select pg_temp.check_true(not exists (select 1 from public.notifications where actor_id = 'cccccccc-2810-0000-0000-00000000000c'),
  'a closed room records nothing for a member');
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'post',
  '28100000-0000-0000-0000-000000000011', 'cccccccc-2810-0000-0000-00000000000c')), 'and pushes nothing');
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.check_true(not exists (select 1 from public.my_notifications() where kind = 'reaction' and detail like 'post:%'),
  'the list hides what is in a room she cannot read');
reset role;
delete from public.chat_thread_members where member_id = 'aaaaaaaa-2810-0000-0000-00000000000a';
set local role authenticated;
select pg_temp.as_member('cccccccc-2810-0000-0000-00000000000c');
select public.chat_set_reaction('message', '28100000-0000-0000-0000-000000000021', '😢');
reset role;
select pg_temp.check_true(not exists (select 1 from public.notifications where actor_id = 'cccccccc-2810-0000-0000-00000000000c'),
  'nothing recorded for a conversation she left');
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'message',
  '28100000-0000-0000-0000-000000000021', 'cccccccc-2810-0000-0000-00000000000c')), 'nor pushed');
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.check_true(not exists (select 1 from public.my_notifications() where kind = 'reaction' and detail like 'message:%'),
  'and the earlier one is no longer listed');
rollback to savepoint unreadable;

\echo '== 7. the switch on Me stops the push, and the list keeps it =='
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
insert into public.push_muted_kinds (member_id, kind) values (auth.uid(), 'reaction');
select pg_temp.as_member('cccccccc-2810-0000-0000-00000000000c');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000011', '🎉');
reset role;
select pg_temp.check_true((select count(*) = 0 from pg_temp.owed(:'secret', 'post',
  '28100000-0000-0000-0000-000000000011', 'cccccccc-2810-0000-0000-00000000000c')), 'switched off: no push');
select pg_temp.check_true((select n.count = 2 and n.actor_id = 'cccccccc-2810-0000-0000-00000000000c' from public.notifications n
                            where n.tag = 'reaction:28100000-0000-0000-0000-000000000011'), 'still listed, folded');

\echo '== 8. refused: writing a notification, or muting a kind that does not exist =='
set local role authenticated;
select pg_temp.as_member('aaaaaaaa-2810-0000-0000-00000000000a');
select pg_temp.refused($q$insert into public.notifications (member_id, kind, tag) values (auth.uid(), 'reaction', 'forged')$q$, '42501');
select pg_temp.refused($q$insert into public.push_muted_kinds (member_id, kind) values (auth.uid(), 'reactions')$q$, '23514');
select pg_temp.refused($q$select public.notifications_record('reaction', '{}'::jsonb)$q$, '42501');

\echo '== 9. a reaction queues one request for push-notify, event reaction =='
reset role;
select count(vault.create_secret('http://127.0.0.1:9/discard', 'push_notify_url')) as url_made
  from (select 1) one
 where not exists (select 1 from vault.decrypted_secrets where name = 'push_notify_url');
select count(*) as before_count from net.http_request_queue \gset
set local role authenticated;
select pg_temp.as_member('cccccccc-2810-0000-0000-00000000000c');
select public.chat_set_reaction('post', '28100000-0000-0000-0000-000000000013', '👍');
reset role;
select pg_temp.check_true((
  select count(*) - :before_count = 1
         and max(convert_from(body, 'utf8')::jsonb ->> 'event') = 'reaction'
         and max(convert_from(body, 'utf8')::jsonb -> 'key' ->> 'target') = 'post'
    from net.http_request_queue), 'one request, for a reaction to a post');

\echo '== done: every check above says PASS =='
rollback;

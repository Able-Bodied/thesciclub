-- ============================================================================
-- A member blocks another (20261022050000 to 20261022080000)
-- ============================================================================
-- Ada blocks Bo. Cy is in the club with both; Ivy is an administrator.
--
--   1. the blocked-pair rules: not yourself, nobody who is not there, twice is
--      once, and the helpers a member must not call are not granted
--   2. Bo cannot read the block, nor find it through a helper
--   3. a direct message is refused both ways, with the neutral sentence, and
--      neither can open a conversation or put the other in a group
--   4. what Bo wrote, liked and reacted is hidden from Ada, shared rooms and
--      groups included; Ada's still reaches Bo; Peers hides both ways
--   5. nothing Bo does notifies Ada, in the list or on a lock screen
--   6. one report per block, naming both, with no words, notifying nobody
--   7. administrators are unaffected: reports, earlier versions, removals
--   8. Block from a message's ••• is the profile's: the same id, row and report
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/member-blocks.sql
--
-- One transaction, rolled back. Each step is a block that raises if it fails
-- and prints PASS if it holds; each expected refusal is its own sub-block
-- (a savepoint). Read every PASS against the step's expect line.
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
('b10c0000-0000-0000-0000-00000000000a','peer','active','Ada Block','19990210001','1980-01-01','T1–T6','CA',true,false),
('b10c0000-0000-0000-0000-00000000000b','peer','active','Bo Block','19990210002','1980-01-01','T1–T6','CA',true,false),
('b10c0000-0000-0000-0000-00000000000c','peer','active','Cy Block','19990210003','1980-01-01','T1–T6','CA',true,false),
('b10c0000-0000-0000-0000-00000000000d','peer','active','Ivy Block','19990210004','1980-01-01','T1–T6','CA',true,true);
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/b10c' || right(id::text, 1), id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where phone like '1999021000%';

update public.chat_rooms set opened_at = now() where id = 'bowel';
-- Ada's topic, with a reply from Bo (before the block) and one from Cy.
insert into public.chat_topics (id, room_id, title, author_id) values
('b10c0000-0000-0000-0000-0000000000a1','bowel','Ada asks','b10c0000-0000-0000-0000-00000000000a'),
('b10c0000-0000-0000-0000-0000000000b1','bowel','Bo asks','b10c0000-0000-0000-0000-00000000000b');
insert into public.chat_posts (id, topic_id, author_id, body) values
('b10c0000-0000-0000-0000-0000000000a2','b10c0000-0000-0000-0000-0000000000a1','b10c0000-0000-0000-0000-00000000000a','Ada''s opener'),
('b10c0000-0000-0000-0000-0000000000a3','b10c0000-0000-0000-0000-0000000000a1','b10c0000-0000-0000-0000-00000000000a','Ada''s second'),
('b10c0000-0000-0000-0000-0000000000b2','b10c0000-0000-0000-0000-0000000000b1','b10c0000-0000-0000-0000-00000000000b','Bo''s opener');
-- Bo's reply in Ada's topic notifies her now, before the block.
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
('b10c0000-0000-0000-0000-0000000000b3','b10c0000-0000-0000-0000-0000000000a1','b10c0000-0000-0000-0000-00000000000b','Bo replies to Ada', clock_timestamp());

set local role authenticated;

-- Before the block: a direct conversation, and a group Cy made with all three.
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.chat_open_direct('b10c0000-0000-0000-0000-00000000000b') as dm \gset
insert into public.chat_messages (thread_id, author_id, body) values (:'dm', auth.uid(), 'Ada to Bo');
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
insert into public.chat_messages (thread_id, author_id, body) values (:'dm', auth.uid(), 'Bo to Ada');
insert into public.chat_post_likes (post_id, member_id) values ('b10c0000-0000-0000-0000-0000000000a2', auth.uid());
select public.chat_set_reaction('post', 'b10c0000-0000-0000-0000-0000000000a2', '👍');
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
select public.chat_create_group('Three of us', array['b10c0000-0000-0000-0000-00000000000a'::uuid, 'b10c0000-0000-0000-0000-00000000000b'::uuid]) as grp \gset
select public.chat_create_group('Ada and Cy', array['b10c0000-0000-0000-0000-00000000000a'::uuid]) is not null as two;

\echo ''
\echo '== 0. a signed-in member, not the superuser =='
\echo '   expect: authenticated | b10c...000a | f'
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select current_user, auth.uid(), public.is_admin() as admin;

\echo ''
\echo '== 1. the blocked-pair rules =='
\echo '   expect: PASS 1 (yourself and nobody refused, twice is one row, helpers not granted)'
do $$
begin
  begin
    perform public.block_member(auth.uid());
    raise exception 'blocked herself';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.block_member('b10c0000-0000-0000-0000-0000000000ff');
    raise exception 'blocked nobody';
  exception when no_data_found then null;
  end;
  perform public.block_member('b10c0000-0000-0000-0000-00000000000b');
  perform public.block_member('b10c0000-0000-0000-0000-00000000000b');
  assert (select count(*) from public.member_blocks) = 1, 'not one row for Ada';
  assert public.my_blocked_member_ids() = array['b10c0000-0000-0000-0000-00000000000b'::uuid], 'Ada''s list is wrong';
  begin
    perform public.members_blocked(auth.uid(), 'b10c0000-0000-0000-0000-00000000000b');
    raise exception 'a member may call members_blocked';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.member_blocks (blocker_id, blocked_id)
    values (auth.uid(), 'b10c0000-0000-0000-0000-00000000000c');
    raise exception 'a member wrote a block row directly';
  exception when insufficient_privilege then null;
  end;
  assert not has_function_privilege('anon', 'public.block_member(uuid)', 'execute'), 'anon may block';
  assert not has_function_privilege('anon', 'public.unblock_member(uuid)', 'execute'), 'anon may unblock';
  assert not has_function_privilege('anon', 'public.my_blocked_member_ids()', 'execute'), 'anon may list blocks';
  assert not has_table_privilege('anon', 'public.member_blocks', 'select'), 'anon may read blocks';
  raise notice 'PASS 1: not yourself, not nobody, twice is once, the helpers are not a member''s';
end;
$$;

\echo ''
\echo '== 2. Bo cannot learn he was blocked =='
\echo '   expect: PASS 2 (no rows, an empty list, no report, nothing new notified)'
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
do $$
begin
  assert (select count(*) from public.member_blocks) = 0, 'Bo read a block row';
  assert public.my_blocked_member_ids() = '{}', 'Bo''s list is not empty';
  assert (select count(*) from public.chat_reports) = 0, 'Bo read the block report';
  -- Ada's message and Cy's group, from before the block, and nothing since.
  assert (select string_agg(kind, ',' order by kind) from public.my_notifications(null, 100)) = 'direct,group_add',
    'Bo was notified of something new';
  raise notice 'PASS 2: no row, no list, no report and no notification for Bo';
end;
$$;

\echo ''
\echo '== 3. no direct messages either way, and no adding the other to a group =='
\echo '   expect: PASS 3a, 3b (each message refusal says "You can''t message this'
\echo '   member."), 3c (Cy still messages Ada and puts both in groups)'
do $$
declare
  said text;
begin
  -- Bo, into the conversation he already has.
  begin
    insert into public.chat_messages (thread_id, author_id, body)
    values ((select t.id from public.chat_threads t where t.kind = 'direct'
              and t.direct_key like '%b10c0000-0000-0000-0000-00000000000b%'
              and t.direct_key like '%b10c0000-0000-0000-0000-00000000000a%'),
            auth.uid(), 'Bo again');
    raise exception 'Bo messaged Ada';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'You can''t message this member.', format('Bo was told %s', said);
  end;
  begin
    perform public.chat_open_direct('b10c0000-0000-0000-0000-00000000000a');
    raise exception 'Bo opened the conversation';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'You can''t message this member.', format('Bo was told %s', said);
  end;
  begin
    perform public.chat_create_group('Bo and Ada', array['b10c0000-0000-0000-0000-00000000000a'::uuid]);
    raise exception 'Bo put Ada in a group';
  exception when no_data_found then null;
  end;
  raise notice 'PASS 3a: Bo cannot message Ada, open the conversation, or put her in a group';
end;
$$;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
do $$
declare
  said text;
begin
  begin
    insert into public.chat_messages (thread_id, author_id, body)
    values ((select t.id from public.chat_threads t where t.kind = 'direct'
              and t.direct_key like '%b10c0000-0000-0000-0000-00000000000b%'
              and t.direct_key like '%b10c0000-0000-0000-0000-00000000000a%'),
            auth.uid(), 'Ada again');
    raise exception 'Ada messaged Bo';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'You can''t message this member.', format('Ada was told %s', said);
  end;
  begin
    perform public.chat_open_direct('b10c0000-0000-0000-0000-00000000000b');
    raise exception 'Ada opened the conversation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.chat_create_group('Ada and Bo', array['b10c0000-0000-0000-0000-00000000000b'::uuid]);
    raise exception 'Ada put Bo in a group';
  exception when no_data_found then null;
  end;
  begin
    perform public.chat_add_to_group(
      (select t.id from public.chat_threads t where t.name = 'Ada and Cy'),
      'b10c0000-0000-0000-0000-00000000000b');
    raise exception 'Ada added Bo to a group';
  exception when no_data_found then null;
  end;
  raise notice 'PASS 3b: Ada cannot message Bo, open the conversation, or put him in a group';
end;
$$;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
declare
  cy_dm uuid;
begin
  cy_dm := public.chat_open_direct('b10c0000-0000-0000-0000-00000000000a');
  insert into public.chat_messages (thread_id, author_id, body) values (cy_dm, auth.uid(), 'Cy to Ada');
  perform public.chat_create_group('Cy, Ada and Bo',
    array['b10c0000-0000-0000-0000-00000000000a'::uuid, 'b10c0000-0000-0000-0000-00000000000b'::uuid]);
  perform public.chat_add_to_group(
    (select t.id from public.chat_threads t where t.name = 'Ada and Cy'),
    'b10c0000-0000-0000-0000-00000000000b');
  raise notice 'PASS 3c: Cy still messages Ada and puts both in a group';
end;
$$;

-- After the block, Bo and Cy write in the shared group, reply in Ada's topic
-- and like her second post.
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
insert into public.chat_messages (thread_id, author_id, body) values (:'grp', auth.uid(), 'Bo in the group') returning id as bo_msg \gset
insert into public.chat_posts (topic_id, author_id, body) values
('b10c0000-0000-0000-0000-0000000000a1', auth.uid(), 'Bo replies again');
insert into public.chat_post_likes (post_id, member_id) values ('b10c0000-0000-0000-0000-0000000000a3', auth.uid());
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
insert into public.chat_messages (thread_id, author_id, body) values (:'grp', auth.uid(), 'Cy in the group') returning id as cy_msg \gset
insert into public.chat_posts (topic_id, author_id, body) values
('b10c0000-0000-0000-0000-0000000000a1', auth.uid(), 'Cy replies');
insert into public.chat_post_likes (post_id, member_id) values ('b10c0000-0000-0000-0000-0000000000a3', auth.uid());

\echo ''
\echo '== 4. what Bo wrote is hidden from Ada; hers still reaches Bo; Peers both ways =='
\echo '   expect: PASS 4a (Ada), PASS 4b (Bo), PASS 4c (Cy sees everything)'
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
do $$
begin
  assert not exists (select 1 from public.chat_topics where id = 'b10c0000-0000-0000-0000-0000000000b1'), 'Ada sees Bo''s topic';
  assert not exists (select 1 from public.chat_topics_for('bowel') where id = 'b10c0000-0000-0000-0000-0000000000b1'), 'Bo''s topic is in Ada''s room list';
  assert not exists (select 1 from public.chat_topics_for('bowel')
                      where 'b10c0000-0000-0000-0000-00000000000b' = any(participant_ids)), 'Bo''s face is on Ada''s room list';
  assert (select string_agg(body, ' | ' order by created_at) from public.chat_posts
           where topic_id = 'b10c0000-0000-0000-0000-0000000000a1') = 'Ada''s opener | Ada''s second | Cy replies',
    'Ada sees a reply of Bo''s';
  assert not exists (select 1 from public.chat_posts where author_id = 'b10c0000-0000-0000-0000-00000000000b'), 'Ada reads a post of Bo''s';
  assert not exists (select 1 from public.chat_post_likes where member_id = 'b10c0000-0000-0000-0000-00000000000b'), 'Ada sees Bo''s like';
  assert exists (select 1 from public.chat_post_likes where member_id = 'b10c0000-0000-0000-0000-00000000000c'), 'Ada lost Cy''s like';
  assert not exists (select 1 from public.chat_post_reactions where member_id = 'b10c0000-0000-0000-0000-00000000000b'), 'Ada sees Bo''s reaction';
  assert not exists (select 1 from public.chat_messages where author_id = 'b10c0000-0000-0000-0000-00000000000b'), 'Ada reads a message of Bo''s';
  assert exists (select 1 from public.chat_messages where body = 'Cy in the group'), 'Ada lost Cy''s group message';
  assert not exists (select 1 from public.chat_my_threads() where kind = 'direct'
                      and other_member_id = 'b10c0000-0000-0000-0000-00000000000b'), 'the conversation with Bo is in Ada''s list';
  assert (select last_body from public.chat_my_threads() where name = 'Three of us') = 'Cy in the group', 'the group shows Bo''s words';
  assert not exists (select 1 from public.browse_members where id = 'b10c0000-0000-0000-0000-00000000000b'), 'Bo is in Ada''s Peers';
  assert not (select has_profile from public.chat_authors where id = 'b10c0000-0000-0000-0000-00000000000b'), 'Bo has a profile for Ada';
  assert exists (select 1 from public.browse_members where id = 'b10c0000-0000-0000-0000-00000000000c'), 'Cy left Ada''s Peers';
  raise notice 'PASS 4a: Bo''s topic, replies, likes, reactions, messages, conversation and profile are hidden from Ada';
end;
$$;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
do $$
begin
  assert exists (select 1 from public.chat_posts where body = 'Ada''s opener'), 'Bo lost Ada''s post';
  assert exists (select 1 from public.chat_messages where body = 'Ada to Bo'), 'Bo lost Ada''s message';
  assert exists (select 1 from public.chat_my_threads() where kind = 'direct'
                  and other_member_id = 'b10c0000-0000-0000-0000-00000000000a'), 'the conversation left Bo''s list';
  assert not exists (select 1 from public.browse_members where id = 'b10c0000-0000-0000-0000-00000000000a'), 'Ada is in Bo''s Peers';
  assert not (select has_profile from public.chat_authors where id = 'b10c0000-0000-0000-0000-00000000000a'), 'Ada has a profile for Bo';
  raise notice 'PASS 4b: Ada''s words still reach Bo; she is gone from his Peers';
end;
$$;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
begin
  assert (select count(*) from public.chat_posts where topic_id = 'b10c0000-0000-0000-0000-0000000000a1') = 5, 'Cy lost a reply';
  assert exists (select 1 from public.chat_messages where body = 'Bo in the group'), 'Cy lost Bo''s group message';
  assert (select count(*) from public.browse_members
           where id in ('b10c0000-0000-0000-0000-00000000000a', 'b10c0000-0000-0000-0000-00000000000b')) = 2, 'Cy lost one of them';
  raise notice 'PASS 4c: Cy sees both, as before';
end;
$$;

\echo ''
\echo '== 5. nothing Bo does notifies Ada =='
\echo '   expect: PASS 5a (her list has Cy, not Bo), PASS 5b (rows: only the'
\echo '   two from before the block are Bo''s), PASS 5c (lock screen and badge)'
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
do $$
begin
  assert not exists (select 1 from public.my_notifications(null, 100)
                      where actor_id = 'b10c0000-0000-0000-0000-00000000000b'), 'Ada''s list shows Bo';
  assert exists (select 1 from public.my_notifications(null, 100)
                  where actor_id = 'b10c0000-0000-0000-0000-00000000000c' and kind = 'reply'), 'Ada lost Cy''s reply';
  assert exists (select 1 from public.my_notifications(null, 100)
                  where actor_id = 'b10c0000-0000-0000-0000-00000000000c' and kind = 'group'), 'Ada lost Cy''s group message';
  raise notice 'PASS 5a: Ada''s list has Cy and not Bo';
end;
$$;
reset role;
do $$
declare
  grp uuid := (select id from public.chat_threads where name = 'Three of us');
begin
  -- Bo's like from before the block is still a row (the list hides it).
  assert (select actor_id from public.notifications
           where member_id = 'b10c0000-0000-0000-0000-00000000000a'
             and tag = 'like:b10c0000-0000-0000-0000-0000000000a2') = 'b10c0000-0000-0000-0000-00000000000b',
    'the like from before the block is missing (control)';
  -- Bo's reply before the block and Cy's after: two. Bo's after would be three.
  assert (select count from public.notifications
           where member_id = 'b10c0000-0000-0000-0000-00000000000a'
             and tag = 'topic:b10c0000-0000-0000-0000-0000000000a1') = 2, 'Bo''s reply after the block was counted';
  -- Cy's group message only. Bo's too would be two.
  assert (select count from public.notifications
           where member_id = 'b10c0000-0000-0000-0000-00000000000a'
             and tag = 'thread:' || grp) = 1, 'Bo''s group message was counted';
  -- Cy's like only.
  assert (select count || ':' || actor_id from public.notifications
           where member_id = 'b10c0000-0000-0000-0000-00000000000a'
             and tag = 'like:b10c0000-0000-0000-0000-0000000000a3') = '1:b10c0000-0000-0000-0000-00000000000c',
    'Bo''s like after the block was recorded';
  raise notice 'PASS 5b: no row for Ada from anything Bo did after the block';
end;
$$;
do $$
declare
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret');
  ada text := 'https://web.push.apple.com/b10ca';
  grp uuid := (select id from public.chat_threads where name = 'Three of us');
begin
  assert not exists (select 1 from public.push_owed(secret, 'message',
    jsonb_build_object('id', (select id from public.chat_messages where body = 'Bo in the group'))) o
    where o.endpoint = ada), 'Bo''s group message reaches Ada''s lock screen';
  assert exists (select 1 from public.push_owed(secret, 'message',
    jsonb_build_object('id', (select id from public.chat_messages where body = 'Cy in the group'))) o
    where o.endpoint = ada), 'Cy''s group message does not reach Ada (control)';
  assert not exists (select 1 from public.push_owed(secret, 'post',
    jsonb_build_object('id', (select id from public.chat_posts where body = 'Bo replies again'))) o where o.endpoint = ada), 'Bo''s reply reaches Ada''s lock screen';
  assert exists (select 1 from public.push_owed(secret, 'post',
    jsonb_build_object('id', (select id from public.chat_posts where body = 'Cy replies'))) o where o.endpoint = ada), 'Cy''s reply does not reach Ada (control)';
  assert not exists (select 1 from public.push_owed(secret, 'like',
    '{"post_id":"b10c0000-0000-0000-0000-0000000000a3","member_id":"b10c0000-0000-0000-0000-00000000000b"}') o
    where o.endpoint = ada), 'Bo''s like reaches Ada''s lock screen';
  assert exists (select 1 from public.push_owed(secret, 'like',
    '{"post_id":"b10c0000-0000-0000-0000-0000000000a3","member_id":"b10c0000-0000-0000-0000-00000000000c"}') o
    where o.endpoint = ada), 'Cy''s like does not reach Ada (control)';
  assert not exists (select 1 from public.push_owed(secret, 'group_add',
    jsonb_build_object('thread_id', (select id from public.chat_threads where name = 'Cy, Ada and Bo'),
                       'member_id', 'b10c0000-0000-0000-0000-00000000000a',
                       'by', 'b10c0000-0000-0000-0000-00000000000b')) o
    where o.endpoint = ada), 'being added by Bo reaches Ada''s lock screen';
  -- The badge: everything read but the group, then only Bo's words unread.
  update public.chat_thread_members set last_read_at = clock_timestamp()
   where member_id = 'b10c0000-0000-0000-0000-00000000000a';
  update public.chat_thread_members set last_read_at = now() - interval '1 hour'
   where member_id = 'b10c0000-0000-0000-0000-00000000000a' and thread_id = grp;
  assert public.push_unread_count('b10c0000-0000-0000-0000-00000000000a') = 1, 'the badge is not 1 with Cy''s words unread (control)';
  delete from public.chat_messages where body = 'Cy in the group';
  assert public.push_unread_count('b10c0000-0000-0000-0000-00000000000a') = 0, 'Bo''s message raised Ada''s badge';
  raise notice 'PASS 5c: no lock screen and no badge from Bo; Cy''s still arrive';
end;
$$;

\echo ''
\echo '== 6. one report, naming both, with no words, notifying nobody =='
\echo '   expect: PASS 6a (block | member | Ada Block | Bo Block | ""), PASS 6b'
\echo '   (no notification or push to Ivy or Ada; Unblock shows Bo again), PASS 6c'
\echo '   (pressing Block twice filed one; blocking again after Unblock, a second)'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ivy;
do $$
declare
  r record;
begin
  assert (select count(*) from public.admin_chat_reports() where kind = 'block') = 1, 'not one block report';
  select * into r from public.admin_chat_reports() where kind = 'block';
  assert r.context_kind = 'member' and r.reporter_name = 'Ada Block' and r.reported_author_name = 'Bo Block'
     and r.body_snapshot = '' and r.post_id is null and r.message_id is null and r.attachments = '{}',
    format('the report was %s', row_to_json(r));
  assert not exists (select 1 from public.my_notifications(null, 100) where kind = 'report'), 'Ivy was notified of a block';
  raise notice 'PASS 6a: % | % | % | % | "%"', r.kind, r.context_kind, r.reporter_name, r.reported_author_name, r.body_snapshot;
end;
$$;
reset role;
do $$
declare
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret');
begin
  assert not exists (select 1 from public.push_owed(secret, 'report',
    jsonb_build_object('id', (select id from public.chat_reports where kind = 'block')))), 'a block was pushed';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
do $$
begin
  assert not exists (select 1 from public.my_notifications(null, 100) where kind = 'report'), 'Ada was told of her own report';
  perform public.unblock_member('b10c0000-0000-0000-0000-00000000000b');
  assert (select count(*) from public.member_blocks) = 0, 'Unblock left a row';
  assert exists (select 1 from public.browse_members where id = 'b10c0000-0000-0000-0000-00000000000b'), 'Bo is still hidden after Unblock';
  assert exists (select 1 from public.chat_posts where author_id = 'b10c0000-0000-0000-0000-00000000000b'), 'Bo''s posts are still hidden after Unblock';
  raise notice 'PASS 6b: nobody notified; Unblock shows Bo again';
end;
$$;
reset role;
do $$
begin
  assert (select count(*) from public.chat_reports where kind = 'block') = 1, 'Unblock took the report away, or Block twice filed two';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.block_member('b10c0000-0000-0000-0000-00000000000b');
reset role;
do $$
begin
  assert (select count(*) from public.chat_reports where kind = 'block') = 2, 'blocking again did not file a second report';
  raise notice 'PASS 6c: one report per block, kept after Unblock';
end;
$$;

\echo ''
\echo '== 7. administrators are unaffected =='
\echo '   expect: PASS 7 (Ivy, who blocked Bo too, still lists, reads earlier'
\echo '   versions of, and removes his post; Bo cannot block administrators'' tools away)'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.chat_edit_post('b10c0000-0000-0000-0000-0000000000b2', 'Bo''s opener, edited');
select public.block_member('b10c0000-0000-0000-0000-00000000000d');
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
select public.chat_report_post('b10c0000-0000-0000-0000-0000000000b2', 'Cy reports Bo');
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ivy;
do $$
begin
  -- Bo blocked Ivy: what he writes still reaches her.
  assert exists (select 1 from public.chat_posts where id = 'b10c0000-0000-0000-0000-0000000000b2'), 'Bo''s block hid him from an administrator';
  perform public.block_member('b10c0000-0000-0000-0000-00000000000b');
  assert not exists (select 1 from public.chat_posts where id = 'b10c0000-0000-0000-0000-0000000000b2'), 'Ivy''s own block hid nothing (control)';
  assert exists (select 1 from public.admin_chat_reports()
                  where post_id = 'b10c0000-0000-0000-0000-0000000000b2'), 'Ivy lost the report on Bo''s post';
  assert (select count(*) from public.admin_chat_reports() where kind = 'block') = 4, 'not four block reports';
  assert exists (select 1 from public.chat_edits where post_id = 'b10c0000-0000-0000-0000-0000000000b2'), 'Ivy lost the earlier version';
  perform public.chat_remove_post('b10c0000-0000-0000-0000-0000000000b2');
  assert (select already_removed from public.admin_chat_reports()
           where post_id = 'b10c0000-0000-0000-0000-0000000000b2') , 'the removal did not take';
  raise notice 'PASS 7: reports, earlier versions and removal work for an administrator in a block either way';
end;
$$;

\echo ''
\echo '== 8. Block from a message is the profile''s Block =='
\echo '   expect: PASS 8 (the author id a message gives is the profile''s id; the'
\echo '   same row and the same wordless report, nothing of the message in it)'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
insert into public.chat_messages (thread_id, author_id, body) values (:'grp', auth.uid(), 'Cy in the group');
select set_config('request.jwt.claims','{"sub":"b10c0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
do $$
declare
  author uuid;
begin
  -- What the message's ••• passes, read as Ada reads it.
  select m.author_id into strict author from public.chat_messages m where m.body = 'Cy in the group';
  assert author = (select b.id from public.browse_members b where b.display_name = 'Cy Block'),
    'a message names its author differently from the profile';
  perform public.block_member(author);
  assert exists (select 1 from public.member_blocks
                  where blocker_id = auth.uid() and blocked_id = 'b10c0000-0000-0000-0000-00000000000c'),
    'no block row';
  assert not exists (select 1 from public.chat_messages where body = 'Cy in the group'), 'Cy''s message still shows';
  assert not exists (select 1 from public.browse_members where id = author), 'Cy still in Ada''s Peers';
end;
$$;
reset role;
do $$
declare
  r record;
begin
  select * into strict r from public.chat_reports
   where kind = 'block' and reporter_id = 'b10c0000-0000-0000-0000-00000000000a'
     and reported_author_id = 'b10c0000-0000-0000-0000-00000000000c';
  assert r.context_kind = 'member' and r.post_id is null and r.message_id is null
     and r.body_snapshot = '' and r.place = 'Blocked',
    'a block from a message carried the message, unlike a profile''s';
  raise notice 'PASS 8: a message''s Block is block_member on the profile''s id, with the same wordless report';
end;
$$;

rollback;
\echo ''
\echo '== rolled back =='

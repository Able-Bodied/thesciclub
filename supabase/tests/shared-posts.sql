-- ============================================================================
-- A post shared into a conversation (20261025010000)
-- ============================================================================
-- Ada writes in an open room; Bo shares her posts to Cy and into a group
-- with Cy and Eve. Dee is in neither conversation. Ivy is an administrator,
-- who can read a closed room.
--
--   1. a share lands, and its reader gets the card: room, title, author, the
--      start of the words and the first photograph, which storage signs
--   2. somebody not in the conversation can neither share into it nor read
--      a card from it
--   3. a closed room: a member cannot share from it; an administrator's
--      share of it shows a member nothing, and the post stays unreadable
--   4. a removed post, a deleted topic and a removed message: no card, the
--      message stays, and the post cannot be shared again
--   5. the rest of a message still works: reactions, notifications (no
--      words of the post), editing down to no words, and a report that says
--      a post was shared; the post cannot be swapped afterwards
--   6. blocks, both ways: the author or the topic's starter blocked by the
--      reader or blocking them shows nothing and cannot be shared; a blocked
--      pair's direct conversation takes no share
--   7. the helpers: the card is a member's, the check nobody's
--
-- Run it against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/shared-posts.sql
--
-- One transaction, rolled back. Each step is a block that raises if it fails
-- and prints PASS if it holds; each expected refusal is its own sub-block
-- (a savepoint). Read every PASS against the step's expect line.
-- ============================================================================
\set ON_ERROR_STOP off
\pset pager off
begin;

select decrypted_secret as secret from vault.decrypted_secrets where name = 'push_notify_secret' \gset
select set_config('probe.secret', :'secret', true) is not null as kept;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
('5a4e0000-0000-0000-0000-00000000000a','peer','active','Ada Share','19990250001','1980-01-01','T1–T6','CA',true,false),
('5a4e0000-0000-0000-0000-00000000000b','peer','active','Bo Share','19990250002','1980-01-01','T1–T6','CA',true,false),
('5a4e0000-0000-0000-0000-00000000000c','peer','active','Cy Share','19990250003','1980-01-01','T1–T6','CA',true,false),
('5a4e0000-0000-0000-0000-00000000000d','peer','active','Dee Share','19990250004','1980-01-01','T1–T6','CA',true,false),
('5a4e0000-0000-0000-0000-00000000000e','peer','active','Eve Share','19990250005','1980-01-01','T1–T6','CA',true,false),
('5a4e0000-0000-0000-0000-00000000000f','peer','active','Ivy Share','19990250006','1980-01-01','T1–T6','CA',true,true);
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
values ('https://web.push.apple.com/5a4e-cy', '5a4e0000-0000-0000-0000-00000000000c',
        'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        'tBHItJI5svbpez7KI4CCXg');

insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
('probe-share-open', 'Probe share open', 'For the probe.', 'Life', 990, now()),
('probe-share-closed', 'Probe share closed', 'For the probe.', 'Life', 991, null);

-- Written as the superuser, so the photograph needs no upload.
insert into public.chat_topics (id, room_id, title, author_id) values
('5a4e0000-0000-0000-0000-0000000000a1','probe-share-open','Ada asks about cushions','5a4e0000-0000-0000-0000-00000000000a'),
('5a4e0000-0000-0000-0000-0000000000f1','probe-share-closed','Ivy seeds a room','5a4e0000-0000-0000-0000-00000000000f'),
('5a4e0000-0000-0000-0000-0000000000a5','probe-share-open','Ada asks again','5a4e0000-0000-0000-0000-00000000000a'),
('5a4e0000-0000-0000-0000-0000000000d1','probe-share-open','Dee asks','5a4e0000-0000-0000-0000-00000000000d');
insert into public.chat_posts (id, topic_id, author_id, body, attachments, created_at) values
('5a4e0000-0000-0000-0000-0000000000a2','5a4e0000-0000-0000-0000-0000000000a1','5a4e0000-0000-0000-0000-00000000000a',
 'Which **cushion** do you use?', '{rooms/probe-share-open/ada-1.jpg,rooms/probe-share-open/ada-2.jpg}', now() - interval '3 minutes'),
('5a4e0000-0000-0000-0000-0000000000b2','5a4e0000-0000-0000-0000-0000000000a1','5a4e0000-0000-0000-0000-00000000000b',
 'Bo''s reply under Ada''s topic', '{}', now() - interval '2 minutes'),
('5a4e0000-0000-0000-0000-0000000000a3','5a4e0000-0000-0000-0000-0000000000a1','5a4e0000-0000-0000-0000-00000000000a',
 'Ada''s later word', '{}', now() - interval '1 minute'),
('5a4e0000-0000-0000-0000-0000000000f2','5a4e0000-0000-0000-0000-0000000000f1','5a4e0000-0000-0000-0000-00000000000f',
 'Not open yet', '{rooms/probe-share-closed/ivy.jpg}', now()),
('5a4e0000-0000-0000-0000-0000000000a6','5a4e0000-0000-0000-0000-0000000000a5','5a4e0000-0000-0000-0000-00000000000a',
 'A topic that will be deleted', '{}', now()),
('5a4e0000-0000-0000-0000-0000000000d2','5a4e0000-0000-0000-0000-0000000000d1','5a4e0000-0000-0000-0000-00000000000d',
 'Dee''s opener', '{}', now());

set local role authenticated;

-- Bo's conversations: one with Cy, a group with Cy and Eve. Ivy's group with Cy.
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.chat_open_direct('5a4e0000-0000-0000-0000-00000000000c') as dm \gset
select public.chat_create_group('Share probe', array['5a4e0000-0000-0000-0000-00000000000c'::uuid, '5a4e0000-0000-0000-0000-00000000000e'::uuid]) as grp \gset
select set_config('probe.dm', :'dm', true) is not null as kept, set_config('probe.grp', :'grp', true) is not null as kept;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
select public.chat_create_group('Ivy and Cy', array['5a4e0000-0000-0000-0000-00000000000c'::uuid]) as ivy_grp \gset
select set_config('probe.ivy_grp', :'ivy_grp', true) is not null as kept;

\echo ''
\echo '== 0. a signed-in member, not the superuser =='
\echo '   expect: authenticated | 5a4e...000b | f'
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select current_user, auth.uid(), public.is_admin() as admin;

-- Bo shares: Ada's opener to Cy with no words, his own reply into the group
-- with a line, Ada's later word to Cy, the topic that will go, and the
-- opener again into the group, which he will take back.
insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
values (:'dm', auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a2') returning id as m_opener \gset
insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
values (:'grp', auth.uid(), 'Look at this', '5a4e0000-0000-0000-0000-0000000000b2') returning id as m_reply \gset
insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
values (:'dm', auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a3') returning id as m_later \gset
insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
values (:'dm', auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a6') returning id as m_gone \gset
insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
values (:'grp', auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a2') returning id as m_taken \gset
select set_config('probe.m_opener', :'m_opener', true) is not null as kept,
       set_config('probe.m_reply', :'m_reply', true) is not null as kept,
       set_config('probe.m_later', :'m_later', true) is not null as kept,
       set_config('probe.m_gone', :'m_gone', true) is not null as kept,
       set_config('probe.m_taken', :'m_taken', true) is not null as kept;

\echo ''
\echo '== 1. the reader gets the card =='
\echo '   expect: PASS 1 (Cy: room, title, opening, Ada, the words, the first photograph, signable)'
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
declare
  card record;
begin
  select * into card from public.chat_shared_posts(array[current_setting('probe.m_opener')::uuid]);
  assert found, 'Cy has no card for Ada''s opener';
  assert card.post_id = '5a4e0000-0000-0000-0000-0000000000a2', 'the wrong post';
  assert card.topic_id = '5a4e0000-0000-0000-0000-0000000000a1', 'the wrong topic';
  assert card.room_id = 'probe-share-open' and card.room_name = 'Probe share open', 'the wrong room';
  assert card.topic_title = 'Ada asks about cushions', 'the wrong title';
  assert card.opening, 'the opener is not the opening post';
  assert card.author_id = '5a4e0000-0000-0000-0000-00000000000a', 'the wrong author';
  assert card.body = 'Which **cushion** do you use?', format('the words: %s', card.body);
  assert card.photo_path = 'rooms/probe-share-open/ada-1.jpg', 'not the first photograph';
  assert public.chat_file_is_readable(card.photo_path), 'storage would not sign it for Cy';
  select * into card from public.chat_shared_posts(array[current_setting('probe.m_reply')::uuid]);
  assert found and not card.opening and card.topic_title = 'Ada asks about cushions', 'the reply''s card is wrong';
  assert card.photo_path is null, 'a photograph on a post with none';
  raise notice 'PASS 1: Cy reads the cards, and storage signs the photograph';
end;
$$;

\echo ''
\echo '== 2. not in the conversation =='
\echo '   expect: PASS 2 (Dee refused into both; no message, no card)'
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000d","role":"authenticated"}', true) is not null as dee;
do $$
declare
  said text;
begin
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a2');
    raise exception 'Dee shared into Bo and Cy''s conversation';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said like '%row-level security%', format('Dee was told %s', said);
  end;
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.grp')::uuid, auth.uid(), 'hi', '5a4e0000-0000-0000-0000-0000000000a2');
    raise exception 'Dee shared into the group';
  exception when insufficient_privilege then null;
  end;
  -- As somebody else, the policy's other half.
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, '5a4e0000-0000-0000-0000-00000000000b', '', '5a4e0000-0000-0000-0000-0000000000a2');
    raise exception 'Dee shared as Bo';
  exception when insufficient_privilege then null;
  end;
  assert not exists (select 1 from public.chat_messages where id = current_setting('probe.m_opener')::uuid), 'Dee reads the message';
  assert not exists (select 1 from public.chat_shared_posts(array[
    current_setting('probe.m_opener')::uuid, current_setting('probe.m_reply')::uuid])), 'Dee reads a card';
  raise notice 'PASS 2: Dee cannot share in, and reads no card';
end;
$$;

\echo ''
\echo '== 3. a closed room =='
\echo '   expect: PASS 3 (Bo refused "That post can''t be shared.", nobody''s post too;'
\echo '   Ivy shares it; Cy gets no card, no post, no photograph)'
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
do $$
declare
  said text;
begin
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000f2');
    raise exception 'Bo shared from a closed room';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'That post can''t be shared.', format('Bo was told %s', said);
  end;
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000ff');
    raise exception 'Bo shared a post that is not there';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 3a: Bo cannot share what he cannot read';
end;
$$;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
values (:'ivy_grp', auth.uid(), 'Before it opens', '5a4e0000-0000-0000-0000-0000000000f2') returning id as m_closed \gset
select set_config('probe.m_closed', :'m_closed', true) is not null as kept;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
begin
  assert exists (select 1 from public.chat_messages where id = current_setting('probe.m_closed')::uuid and body = 'Before it opens'),
    'Cy lost Ivy''s words';
  assert not exists (select 1 from public.chat_shared_posts(array[current_setting('probe.m_closed')::uuid])), 'Cy has a card from a closed room';
  assert not exists (select 1 from public.chat_posts where id = '5a4e0000-0000-0000-0000-0000000000f2'), 'Cy reads the closed room''s post';
  assert not exists (select 1 from public.chat_topics where id = '5a4e0000-0000-0000-0000-0000000000f1'), 'Cy reads the closed room''s topic';
  assert not public.chat_file_is_readable('rooms/probe-share-closed/ivy.jpg'), 'storage would sign the closed room''s photograph';
  raise notice 'PASS 3b: Ivy''s share widened nothing for Cy';
end;
$$;

\echo ''
\echo '== 4. removed, deleted, taken back =='
\echo '   expect: PASS 4 (no cards for the three; the messages stay; no sharing again)'
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.chat_remove_post('5a4e0000-0000-0000-0000-0000000000a3');
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
select public.admin_delete_topic('5a4e0000-0000-0000-0000-0000000000a5');
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.chat_remove_message(:'m_taken');
do $$
begin
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a3');
    raise exception 'Bo shared a removed post';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a6');
    raise exception 'Bo shared a deleted post';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 4a: a removed or deleted post cannot be shared';
end;
$$;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
begin
  assert (select count(*) from public.chat_messages where id in (
            current_setting('probe.m_later')::uuid, current_setting('probe.m_gone')::uuid, current_setting('probe.m_taken')::uuid)) = 3,
    'a message went with its post';
  assert not exists (select 1 from public.chat_shared_posts(array[
    current_setting('probe.m_later')::uuid, current_setting('probe.m_gone')::uuid, current_setting('probe.m_taken')::uuid])),
    'a card for a removed post, a deleted topic or a removed message';
  assert exists (select 1 from public.chat_shared_posts(array[current_setting('probe.m_opener')::uuid])), 'the standing card went too';
  raise notice 'PASS 4b: no card for any of the three, and the messages stay';
end;
$$;

\echo ''
\echo '== 5. reactions, notifications, editing and reports still work =='
\echo '   expect: PASS 5a (Cy reacts; one notification, no words; a lock screen gets'
\echo '   no words either), PASS 5b (Bo edits to a line and back to none; cannot'
\echo '   swap the post), PASS 5c (the reports say a post was shared)'
do $$
begin
  perform public.chat_set_reaction('message', current_setting('probe.m_opener')::uuid, '👍');
  assert exists (select 1 from public.chat_message_reactions where target_id = current_setting('probe.m_opener')::uuid), 'no reaction';
  perform public.chat_mark_thread_read(current_setting('probe.dm')::uuid);
  assert exists (select 1 from public.my_notifications(null, 100) n
                  where n.kind = 'direct' and n.excerpt is null), 'no notification for the share, or one quoting something';
  assert not exists (select 1 from public.my_notifications(null, 100) n where n.excerpt like '%cushion%'),
    'a notification quotes the post';
  raise notice 'PASS 5a: Cy reacts, and is notified without the post''s words';
end;
$$;
set local role postgres;
do $$
declare
  owed record;
begin
  select * into owed from public.push_owed(current_setting('probe.secret'), 'message',
    jsonb_build_object('id', current_setting('probe.m_opener')));
  assert found, 'no push owed to Cy';
  assert owed.body = '' and owed.photo_count = 0, format('the push carries %s', owed.body);
  raise notice 'PASS 5a: the lock screen gets no words of the post (compose.ts says "Shared a post.")';
end;
$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
do $$
begin
  perform public.chat_edit_message(current_setting('probe.m_opener')::uuid, 'Thought of you');
  perform public.chat_edit_message(current_setting('probe.m_opener')::uuid, '');
  assert (select body from public.chat_messages where id = current_setting('probe.m_opener')::uuid) = '', 'the edit did not land';
  assert (select shared_post_id from public.chat_messages where id = current_setting('probe.m_opener')::uuid)
           = '5a4e0000-0000-0000-0000-0000000000a2', 'the edit lost the post';
  begin
    update public.chat_messages set shared_post_id = '5a4e0000-0000-0000-0000-0000000000b2'
     where id = current_setting('probe.m_opener')::uuid;
    raise exception 'Bo swapped the shared post';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 5b: Bo edits to a line and back to none, and cannot swap the post';
end;
$$;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
select public.chat_report_message(:'m_opener', null);
select public.chat_report_message(:'m_reply', 'Probe');
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ivy;
do $$
begin
  assert (select body_snapshot from public.admin_chat_reports() where message_id = current_setting('probe.m_opener')::uuid)
           = '(Shared a post)', 'the report of a share with no words';
  assert (select body_snapshot from public.admin_chat_reports() where message_id = current_setting('probe.m_reply')::uuid)
           = E'Look at this\n\n(Shared a post)', 'the report of a share with a line';
  raise notice 'PASS 5c: the reports keep the words and say a post was shared';
end;
$$;

\echo ''
\echo '== 6. blocks, both ways =='
\echo '   expect: PASS 6a (Eve, blocked by the topic''s starter: no card, no share),'
\echo '   PASS 6b (Cy, who blocks Ada: no card for her post or a reply in her'
\echo '   topic, no share), PASS 6c (a blocked pair''s conversation takes no share)'
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ada;
select public.block_member('5a4e0000-0000-0000-0000-00000000000e');
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000e","role":"authenticated"}', true) is not null as eve;
do $$
declare
  said text;
begin
  -- Bo's words stay hers to read; the card under them does not.
  assert exists (select 1 from public.chat_messages where id = current_setting('probe.m_reply')::uuid and body = 'Look at this'),
    'Eve lost Bo''s words';
  assert not exists (select 1 from public.chat_shared_posts(array[current_setting('probe.m_reply')::uuid])),
    'Eve has a card from the topic of somebody who blocked her';
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.grp')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a2');
    raise exception 'Eve shared the post of somebody who blocked her';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'That post can''t be shared.', format('Eve was told %s', said);
  end;
  raise notice 'PASS 6a: blocked by the author, Eve gets no card and cannot share';
end;
$$;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
begin
  assert exists (select 1 from public.chat_shared_posts(array[current_setting('probe.m_reply')::uuid])), 'Cy lost a card before blocking';
end;
$$;
select public.block_member('5a4e0000-0000-0000-0000-00000000000a');
do $$
begin
  assert not exists (select 1 from public.chat_shared_posts(array[
    current_setting('probe.m_opener')::uuid, current_setting('probe.m_reply')::uuid])), 'Cy has a card by or under Ada';
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.ivy_grp')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000a2');
    raise exception 'Cy shared the post of somebody she blocked';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS 6b: blocking the author, Cy gets no card and cannot share';
end;
$$;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000b","role":"authenticated"}', true) is not null as bo;
select public.block_member('5a4e0000-0000-0000-0000-00000000000c');
do $$
declare
  said text;
begin
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), '', '5a4e0000-0000-0000-0000-0000000000d2');
    raise exception 'Bo shared to Cy, whom he blocked';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'You can''t message this member.', format('Bo was told %s', said);
  end;
  raise notice 'PASS 6c: Bo cannot share into his conversation with Cy';
end;
$$;
select set_config('request.jwt.claims','{"sub":"5a4e0000-0000-0000-0000-00000000000c","role":"authenticated"}', true) is not null as cy;
do $$
declare
  said text;
begin
  begin
    insert into public.chat_messages (thread_id, author_id, body, shared_post_id)
    values (current_setting('probe.dm')::uuid, auth.uid(), 'Back', '5a4e0000-0000-0000-0000-0000000000d2');
    raise exception 'Cy shared to Bo, who blocked her';
  exception when insufficient_privilege then
    get stacked diagnostics said = message_text;
    assert said = 'You can''t message this member.', format('Cy was told %s', said);
  end;
  raise notice 'PASS 6c: nor Cy into hers with Bo';
end;
$$;

\echo ''
\echo '== 7. the helpers =='
\echo '   expect: PASS 7 (the card for members only; the check for nobody)'
do $$
begin
  begin
    perform public.chat_can_see_shared_post('5a4e0000-0000-0000-0000-0000000000b2');
    raise exception 'a member may call chat_can_see_shared_post';
  exception when insufficient_privilege then null;
  end;
  assert has_function_privilege('authenticated', 'public.chat_shared_posts(uuid[])', 'execute'), 'members cannot read cards';
  assert not has_function_privilege('anon', 'public.chat_shared_posts(uuid[])', 'execute'), 'anon may read cards';
  assert not has_function_privilege('anon', 'public.chat_can_see_shared_post(uuid)', 'execute'), 'anon may call the check';
  assert not has_function_privilege('authenticated', 'public.chat_check_shared_post()', 'execute'), 'members may call the trigger';
  raise notice 'PASS 7: the card is a member''s, the check nobody''s';
end;
$$;

rollback;

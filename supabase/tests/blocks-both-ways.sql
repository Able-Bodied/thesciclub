-- ============================================================================
-- A block hides both ways (20261104203000): what each person reads, before
-- and after
-- ============================================================================
-- Blk blocks Bkd and the administrator Adm. For each person (Ord, Blk, Bkd, the administrator Adm, Thd
-- in the same rooms and groups, the suspended Sus, a signed-out visitor and
-- the seed's members) every row they read in the chat tables, views and
-- functions is recorded, and what eight writes would notify them of. After
-- the migration the only differences allowed are Blk's content leaving Bkd,
-- the expected list at the end, nothing more and nothing less; Adm, an
-- administrator, is still not hidden from.
--
-- On a THROWAWAY stack only (the fixture is committed between runs):
--
--   psql ... -v phase=before  -f - < supabase/tests/blocks-both-ways.sql
--   (apply 20261104203000)
--   psql ... -v phase=after   -f - < supabase/tests/blocks-both-ways.sql
--   (to prove the undo: apply supabase/undo/20261104203000.sql, then
--   phase=undone, which expects no difference at all)
--   psql ... -v phase=cleanup -f - < supabase/tests/blocks-both-ways.sql
--
-- with psql as in the other probes:
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off

select :'phase' = 'before' as is_before, :'phase' in ('after', 'undone') as is_after,
       :'phase' = 'cleanup' as is_cleanup \gset

\if :is_before
begin;
create schema probe_bbw;
create table probe_bbw.people (who uuid, label text);
create table probe_bbw.snap (phase text, who text, what text, k text, r text,
                             primary key (phase, who, what, k));

-- ------------------------------------------------------------------ people --
insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, is_admin, show_in_browse) values
  ('b2a00000-1103-0000-0000-000000000001', 'peer',   'active',    'Ord', 'bbw.ord', '19991103001', '1980-01-01', 'T1–T6', 'CA', false, true),
  ('b2a00000-1103-0000-0000-000000000002', 'peer',   'active',    'Blk', 'bbw.blk', '19991103002', '1980-01-01', 'T1–T6', 'CA', false, true),
  ('b2a00000-1103-0000-0000-000000000003', 'peer',   'active',    'Bkd', 'bbw.bkd', '19991103003', '1980-01-01', 'T1–T6', 'CA', false, true),
  ('b2a00000-1103-0000-0000-000000000004', 'mentor', 'active',    'Adm', 'bbw.adm', '19991103004', '1980-01-01', 'T1–T6', 'CA', true,  true),
  ('b2a00000-1103-0000-0000-000000000005', 'peer',   'active',    'Thd', 'bbw.thd', '19991103005', '1980-01-01', 'T1–T6', 'CA', false, true),
  ('b2a00000-1103-0000-0000-000000000006', 'peer',   'suspended', 'Sus', 'bbw.sus', '19991103006', '1980-01-01', 'T1–T6', 'CA', false, true);
insert into public.push_subscriptions (endpoint, member_id, p256dh, auth)
select 'https://web.push.apple.com/bbw-' || display_name, id,
       'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
       'tBHItJI5svbpez7KI4CCXg'
  from public.members where id::text like 'b2a00000-1103-%';

-- ------------------------------------------------------------------- rooms --
-- T1 is Blk's, T2 Thd's, T3 Bkd's; T4, in the closed room, Blk's.
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at) values
  ('probe-1103-open',   'Probe 1103 open',   'For the probe.', 'Life', 9931, now()),
  ('probe-1103-closed', 'Probe 1103 closed', 'For the probe.', 'Life', 9932, null);
insert into public.chat_topics (id, room_id, title, author_id) values
  ('11030000-0000-0000-0000-0000000000a1', 'probe-1103-open',   'Blk asks', 'b2a00000-1103-0000-0000-000000000002'),
  ('11030000-0000-0000-0000-0000000000a2', 'probe-1103-open',   'Thd asks', 'b2a00000-1103-0000-0000-000000000005'),
  ('11030000-0000-0000-0000-0000000000a3', 'probe-1103-open',   'Bkd asks', 'b2a00000-1103-0000-0000-000000000003'),
  ('11030000-0000-0000-0000-0000000000a4', 'probe-1103-closed', 'Blk, closed', 'b2a00000-1103-0000-0000-000000000002');
-- One at a time, so each is newer than the last.
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b1', '11030000-0000-0000-0000-0000000000a1', 'b2a00000-1103-0000-0000-000000000002', 'P1 Blk opens');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b2', '11030000-0000-0000-0000-0000000000a1', 'b2a00000-1103-0000-0000-000000000005', 'P2 Thd in T1');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b3', '11030000-0000-0000-0000-0000000000a1', 'b2a00000-1103-0000-0000-000000000003', 'P3 Bkd in T1');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000bb', '11030000-0000-0000-0000-0000000000a1', 'b2a00000-1103-0000-0000-000000000005', 'P11 Thd in T1 again');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b4', '11030000-0000-0000-0000-0000000000a2', 'b2a00000-1103-0000-0000-000000000005', 'P4 Thd opens');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b5', '11030000-0000-0000-0000-0000000000a2', 'b2a00000-1103-0000-0000-000000000002', 'P5 Blk in T2');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b6', '11030000-0000-0000-0000-0000000000a2', 'b2a00000-1103-0000-0000-000000000003', 'P6 Bkd in T2');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b7', '11030000-0000-0000-0000-0000000000a2', 'b2a00000-1103-0000-0000-000000000001', 'P7 Ord in T2');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b8', '11030000-0000-0000-0000-0000000000a3', 'b2a00000-1103-0000-0000-000000000003', 'P8 Bkd opens');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000b9', '11030000-0000-0000-0000-0000000000a3', 'b2a00000-1103-0000-0000-000000000002', 'P9 Blk in T3');
insert into public.chat_posts (id, topic_id, author_id, body) values ('11030000-0000-0000-0000-0000000000ba', '11030000-0000-0000-0000-0000000000a4', 'b2a00000-1103-0000-0000-000000000002', 'P10 Blk, closed');
insert into public.chat_post_likes (post_id, member_id) values
  ('11030000-0000-0000-0000-0000000000b4', 'b2a00000-1103-0000-0000-000000000002'),
  ('11030000-0000-0000-0000-0000000000b4', 'b2a00000-1103-0000-0000-000000000003'),
  ('11030000-0000-0000-0000-0000000000b5', 'b2a00000-1103-0000-0000-000000000005'),
  ('11030000-0000-0000-0000-0000000000b1', 'b2a00000-1103-0000-0000-000000000001'),
  ('11030000-0000-0000-0000-0000000000b6', 'b2a00000-1103-0000-0000-000000000002');
insert into public.chat_post_reactions (target_id, member_id, emoji) values
  ('11030000-0000-0000-0000-0000000000b4', 'b2a00000-1103-0000-0000-000000000002', '👍'),
  ('11030000-0000-0000-0000-0000000000b1', 'b2a00000-1103-0000-0000-000000000005', '❤️'),
  ('11030000-0000-0000-0000-0000000000b6', 'b2a00000-1103-0000-0000-000000000002', '👍');

-- ----------------------------------------------------------- conversations --
-- G a group, E an event's chat, D Blk and Bkd's direct conversation.
insert into public.chat_threads (id, kind, name, direct_key, event_id) values
  ('11030000-0000-0000-0000-0000000000d1', 'group',  'BBW group', null, null),
  ('11030000-0000-0000-0000-0000000000d2', 'group',  'BBW event', null, (select id from public.events order by id limit 1)),
  ('11030000-0000-0000-0000-0000000000d3', 'direct', null, 'probe-1103:blk:bkd', null);
insert into public.chat_thread_members (thread_id, member_id)
select '11030000-0000-0000-0000-0000000000d1'::uuid, ('b2a00000-1103-0000-0000-00000000000' || i)::uuid
  from unnest(array[1, 2, 3, 4, 5, 6]) i
union all
select '11030000-0000-0000-0000-0000000000d2', ('b2a00000-1103-0000-0000-00000000000' || i)::uuid
  from unnest(array[2, 3, 5]) i
union all
select '11030000-0000-0000-0000-0000000000d3', ('b2a00000-1103-0000-0000-00000000000' || i)::uuid
  from unnest(array[2, 3]) i;
insert into public.chat_messages (id, thread_id, author_id, body, created_at) values
  ('11030000-0000-0000-0000-0000000000c1', '11030000-0000-0000-0000-0000000000d1', 'b2a00000-1103-0000-0000-000000000002', 'M1 Blk in G', now() - interval '10 minutes'),
  ('11030000-0000-0000-0000-0000000000c2', '11030000-0000-0000-0000-0000000000d1', 'b2a00000-1103-0000-0000-000000000003', 'M2 Bkd in G', now() - interval '9 minutes'),
  ('11030000-0000-0000-0000-0000000000c3', '11030000-0000-0000-0000-0000000000d1', 'b2a00000-1103-0000-0000-000000000005', 'M3 Thd in G', now() - interval '8 minutes'),
  ('11030000-0000-0000-0000-0000000000c4', '11030000-0000-0000-0000-0000000000d1', 'b2a00000-1103-0000-0000-000000000002', 'M4 Blk in G, last', now() - interval '5 minutes'),
  ('11030000-0000-0000-0000-0000000000c6', '11030000-0000-0000-0000-0000000000d2', 'b2a00000-1103-0000-0000-000000000005', 'M6 Thd in E', now() - interval '10 minutes'),
  ('11030000-0000-0000-0000-0000000000c5', '11030000-0000-0000-0000-0000000000d2', 'b2a00000-1103-0000-0000-000000000002', 'M5 Blk in E, last', now() - interval '9 minutes'),
  ('11030000-0000-0000-0000-0000000000c8', '11030000-0000-0000-0000-0000000000d3', 'b2a00000-1103-0000-0000-000000000003', 'M8 Bkd to Blk', now() - interval '10 minutes'),
  ('11030000-0000-0000-0000-0000000000c7', '11030000-0000-0000-0000-0000000000d3', 'b2a00000-1103-0000-0000-000000000002', 'M7 Blk to Bkd, last', now() - interval '9 minutes');
-- Shared posts are checked as their sharer.
set local request.jwt.claims = '{"sub":"b2a00000-1103-0000-0000-000000000005","role":"authenticated"}';
insert into public.chat_messages (id, thread_id, author_id, body, shared_post_id, created_at) values
  ('11030000-0000-0000-0000-0000000000c9', '11030000-0000-0000-0000-0000000000d1', 'b2a00000-1103-0000-0000-000000000005', 'M9 Thd shares P1', '11030000-0000-0000-0000-0000000000b1', now() - interval '7 minutes');
set local request.jwt.claims = '{"sub":"b2a00000-1103-0000-0000-000000000002","role":"authenticated"}';
insert into public.chat_messages (id, thread_id, author_id, body, shared_post_id, created_at) values
  ('11030000-0000-0000-0000-0000000000ca', '11030000-0000-0000-0000-0000000000d1', 'b2a00000-1103-0000-0000-000000000002', 'M10 Blk shares P4', '11030000-0000-0000-0000-0000000000b4', now() - interval '6 minutes');
reset request.jwt.claims;
insert into public.chat_message_reactions (target_id, member_id, emoji) values
  ('11030000-0000-0000-0000-0000000000c3', 'b2a00000-1103-0000-0000-000000000002', '👍'),
  ('11030000-0000-0000-0000-0000000000c1', 'b2a00000-1103-0000-0000-000000000005', '❤️'),
  ('11030000-0000-0000-0000-0000000000c2', 'b2a00000-1103-0000-0000-000000000002', '😂');

-- Then Blk blocks Bkd, and the administrator Adm, which hides nothing from Adm.
insert into public.member_blocks (blocker_id, blocked_id) values
  ('b2a00000-1103-0000-0000-000000000002', 'b2a00000-1103-0000-0000-000000000003'),
  ('b2a00000-1103-0000-0000-000000000002', 'b2a00000-1103-0000-0000-000000000004');

insert into probe_bbw.people (who, label)
select id, display_name from public.members
 where id::text like 'b2a00000-1103-%' or coalesce(phone, '') not like '1999%'
union all select null, 'signed out';
commit;
\endif

\if :is_cleanup
begin;
delete from public.notifications where member_id::text like 'b2a00000-1103-%';
delete from public.chat_threads where id::text like '11030000-%';
delete from public.chat_rooms where id like 'probe-1103-%';
delete from public.members where id::text like 'b2a00000-1103-%';
drop schema probe_bbw cascade;
commit;
\echo 'cleaned up'
\endif

\if :is_cleanup
\else
-- ------------------------------------------------------------------ record --
-- Read by the people themselves, so no table behind it.
create function pg_temp.label(id uuid) returns text language sql immutable as $$
  select coalesce((select l from (values
    ('b2a00000-1103-0000-0000-000000000001'::uuid, 'Ord'), ('b2a00000-1103-0000-0000-000000000002', 'Blk'),
    ('b2a00000-1103-0000-0000-000000000003', 'Bkd'), ('b2a00000-1103-0000-0000-000000000004', 'Adm'),
    ('b2a00000-1103-0000-0000-000000000005', 'Thd'), ('b2a00000-1103-0000-0000-000000000006', 'Sus')
  ) v(i, l) where i = id), id::text)
$$;
grant execute on function pg_temp.label(uuid) to authenticated, anon;

create function pg_temp.record(phase text) returns void language plpgsql as $$
declare
  p record;
  q record;
  topics uuid[] := array(select id from public.chat_topics where id::text like '11030000-%');
  msgs uuid[] := array(select id from public.chat_messages where id::text like '11030000-%');
  secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret');
  acc text[] := '{}';
  rows text[];
  a record;
  t0 timestamptz;
  new_id uuid;
begin
  -- What each person reads, as them.
  for p in select who, label from probe_bbw.people loop
    for q in select * from (values
      ('chat_topics',            'select t.id::text, t::text from public.chat_topics t'),
      ('chat_posts',             'select t.id::text, t::text from public.chat_posts t'),
      ('chat_post_likes',        'select t.post_id || '' '' || pg_temp.label(t.member_id), t::text from public.chat_post_likes t'),
      ('chat_post_reactions',    'select t.target_id || '' '' || pg_temp.label(t.member_id), t::text from public.chat_post_reactions t'),
      ('chat_messages',          'select t.id::text, t::text from public.chat_messages t'),
      ('chat_message_reactions', 'select t.target_id || '' '' || pg_temp.label(t.member_id), t::text from public.chat_message_reactions t'),
      ('chat_threads',           'select t.id::text, t::text from public.chat_threads t'),
      ('chat_thread_members',    'select t.thread_id || '' '' || pg_temp.label(t.member_id), t::text from public.chat_thread_members t'),
      ('chat_rooms',             'select t.id, t::text from public.chat_rooms t'),
      ('chat_room_stats',        'select t.room_id, t::text from public.chat_room_stats t'),
      ('chat_authors',           'select t.id::text, t::text from public.chat_authors t'),
      ('browse_members',         'select t.id::text, t::text from public.browse_members t'),
      ('member_blocks',          'select t.blocker_id || '' '' || t.blocked_id, t::text from public.member_blocks t'),
      ('notifications',          'select t.id::text, t::text from public.notifications t'),
      ('chat_my_threads()',      'select t.id::text, t::text from public.chat_my_threads() t'),
      ('chat_unread_count()',    'select ''value'', public.chat_unread_count()::text'),
      ('chat_topics_for(open)',  'select t.id::text, t::text from public.chat_topics_for(''probe-1103-open'') t'),
      ('chat_topics_for(closed)', 'select t.id::text, t::text from public.chat_topics_for(''probe-1103-closed'') t'),
      ('chat_topic_opening_posts()', format('select t.topic_id::text, t::text from public.chat_topic_opening_posts(%L::uuid[]) t', topics)),
      ('chat_shared_posts()',    format('select t.message_id::text, t::text from public.chat_shared_posts(%L::uuid[]) t', msgs)),
      ('my_notifications()',     'select t.kind || '' '' || coalesce(pg_temp.label(t.actor_id), ''-'') || '' '' || coalesce(t.url, ''''), t::text from public.my_notifications(null, 100) t'),
      ('my_unseen_notification_count()', 'select ''value'', public.my_unseen_notification_count()::text'),
      ('my_unseen_notification_count_outside_chat()', 'select ''value'', public.my_unseen_notification_count_outside_chat()::text'),
      ('my_blocked_member_ids()', 'select ''value'', public.my_blocked_member_ids()::text')
    ) v(what, sql) loop
      begin
        perform set_config('request.jwt.claims',
          case when p.who is null then json_build_object('role', 'anon')
               else json_build_object('sub', p.who, 'role', 'authenticated') end::text, true);
        if p.who is null then set local role anon; else set local role authenticated; end if;
        execute format('select coalesce(array_agg(k || E''\t'' || coalesce(r, ''null'')), ''{}'') from (%s) x(k, r)', q.sql)
          into rows;
        reset role;
        insert into probe_bbw.snap
        select phase, coalesce(p.who::text, 'signed out'), q.what, split_part(x, E'\t', 1), substr(x, strpos(x, E'\t') + 1)
          from unnest(rows) x;
      exception when others then
        reset role;
        insert into probe_bbw.snap values (phase, coalesce(p.who::text, 'signed out'), q.what, 'refused', sqlstate);
      end;
    end loop;
    -- Definer functions the server and other functions call for a member.
    if p.who is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', p.who, 'role', 'authenticated')::text, true);
      insert into probe_bbw.snap values
        (phase, p.who::text, 'notification_badge()', 'value', public.notification_badge(p.who)::text),
        (phase, p.who::text, 'push_unread_count()', 'value', public.push_unread_count(p.who)::text);
      insert into probe_bbw.snap
      select phase, p.who::text, 'chat_can_see_shared_post()', x.id::text, public.chat_can_see_shared_post(x.id)::text
        from public.chat_posts x where x.id::text like '11030000-%';
    end if;
  end loop;

  -- What writing after the block would tell each person: notifications,
  -- mentions and lock screens. Each write is undone.
  for a in select * from (values
    ('a1 Blk writes in G',      'b2a00000-1103-0000-0000-000000000002', 'message', 'insert into public.chat_messages (thread_id, author_id, body) values (''11030000-0000-0000-0000-0000000000d1'', auth.uid(), ''Blk again'') returning id'),
    ('a2 Blk replies in T2',    'b2a00000-1103-0000-0000-000000000002', 'post',    'insert into public.chat_posts (topic_id, author_id, body) values (''11030000-0000-0000-0000-0000000000a2'', auth.uid(), ''Blk again in T2'') returning id'),
    ('a3 Thd replies in T1',    'b2a00000-1103-0000-0000-000000000005', 'post',    'insert into public.chat_posts (topic_id, author_id, body) values (''11030000-0000-0000-0000-0000000000a1'', auth.uid(), ''Thd again in T1'') returning id'),
    ('a4 Blk likes P8',         'b2a00000-1103-0000-0000-000000000002', 'like',    'insert into public.chat_post_likes (post_id, member_id) values (''11030000-0000-0000-0000-0000000000b8'', auth.uid()) returning post_id'),
    ('a5 Thd names Bkd in T1',  'b2a00000-1103-0000-0000-000000000005', 'mention', 'insert into public.chat_posts (topic_id, author_id, body) values (''11030000-0000-0000-0000-0000000000a1'', auth.uid(), ''Hi @bbw.bkd and @bbw.ord'') returning id'),
    ('a6 Blk names Bkd in T2',  'b2a00000-1103-0000-0000-000000000002', 'mention', 'insert into public.chat_posts (topic_id, author_id, body) values (''11030000-0000-0000-0000-0000000000a2'', auth.uid(), ''Hi @bbw.bkd and @bbw.thd'') returning id'),
    ('a7 Blk reacts to M2',     'b2a00000-1103-0000-0000-000000000002', 'reaction', 'select ''11030000-0000-0000-0000-0000000000c2''::uuid from public.chat_set_reaction(''message'', ''11030000-0000-0000-0000-0000000000c2'', ''❤️'')'),
    ('a8 Bkd writes in G',      'b2a00000-1103-0000-0000-000000000003', 'message', 'insert into public.chat_messages (thread_id, author_id, body) values (''11030000-0000-0000-0000-0000000000d1'', auth.uid(), ''Bkd again'') returning id')
  ) v(name, actor, event, sql) loop
    begin
      t0 := clock_timestamp();
      perform set_config('request.jwt.claims', json_build_object('sub', a.actor, 'role', 'authenticated')::text, true);
      execute a.sql into new_id;
      acc := acc || array(
        select concat_ws(E'\t', n.member_id, a.name, 'notification ' || n.tag,
                         n.kind || ' by ' || coalesce(pg_temp.label(n.actor_id), '-') || ' x' || n.count)
          from public.notifications n
         where n.created_at >= t0 and n.member_id::text like 'b2a00000-1103-%');
      acc := acc || array(
        select concat_ws(E'\t', x.member_id, a.name, 'mention', 'named')
          from public.chat_post_mentions x where x.post_id = new_id);
      acc := acc || array(
        select concat_ws(E'\t', s.member_id, a.name, 'push ' || o.kind || ' ' || o.tag,
                         concat_ws(' | ', o.actor_name, o.body, o.url, o.badge))
          from public.push_owed(secret, a.event,
                 case a.event
                   when 'like' then jsonb_build_object('post_id', new_id, 'member_id', a.actor)
                   when 'reaction' then jsonb_build_object('target', 'message', 'id', new_id, 'member_id', a.actor)
                   when 'mention' then jsonb_build_object('id', new_id, 'at',
                     (select max(created_at) from public.chat_post_mentions where post_id = new_id))
                   else jsonb_build_object('id', new_id) end) o
          join public.push_subscriptions s on s.endpoint = o.endpoint
         where s.member_id::text like 'b2a00000-1103-%');
      -- The new row's id is different each run.
      acc := array(select replace(x, new_id::text, 'NEW') from unnest(acc) x);
      raise exception 'undo' using errcode = 'P0U01';
    exception when sqlstate 'P0U01' then null;
    end;
  end loop;
  reset request.jwt.claims;
  insert into probe_bbw.snap
  select phase, f[1], f[2], f[3], string_agg(f[4], ' / ' order by f[4])
    from (select string_to_array(x, E'\t') f from unnest(acc) x) y
   group by f[1], f[2], f[3];
end $$;

delete from probe_bbw.snap where phase = :'phase';
select pg_temp.record(:'phase');
\endif

\if :is_before
select count(*) || ' readings for ' || count(distinct who) || ' people' as recorded,
       count(*) filter (where k = 'refused') as refusals
  from probe_bbw.snap where phase = 'before';
\endif

\if :is_after
-- ---------------------------------------------------------------- compare --
create temp table actual as
select coalesce(b.who, a.who) as who, coalesce(b.what, a.what) as what, coalesce(b.k, a.k) as k,
       case when a.k is null then 'gone' when b.k is null then 'new' else 'changed' end as change,
       b.r as before, a.r as after
  from (select * from probe_bbw.snap where phase = 'before') b
  full join (select * from probe_bbw.snap where phase = :'phase') a using (who, what, k)
 where b.r is distinct from a.r;

-- Everything that changes, all for Bkd: Blk's content leaving.
create temp table expected (what text, k text, change text);
select :'phase' = 'after' as expect_changes \gset
\if :expect_changes
insert into expected values
  -- Blk's topic T1, whole, and Blk's replies elsewhere.
  ('chat_topics', '11030000-0000-0000-0000-0000000000a1', 'gone'),
  ('chat_posts', '11030000-0000-0000-0000-0000000000b1', 'gone'),
  ('chat_posts', '11030000-0000-0000-0000-0000000000b2', 'gone'),
  ('chat_posts', '11030000-0000-0000-0000-0000000000b3', 'gone'),
  ('chat_posts', '11030000-0000-0000-0000-0000000000bb', 'gone'),
  ('chat_posts', '11030000-0000-0000-0000-0000000000b5', 'gone'),
  ('chat_posts', '11030000-0000-0000-0000-0000000000b9', 'gone'),
  -- Blk's likes and reactions, and those on posts that went.
  ('chat_post_likes', '11030000-0000-0000-0000-0000000000b4 Blk', 'gone'),
  ('chat_post_likes', '11030000-0000-0000-0000-0000000000b6 Blk', 'gone'),
  ('chat_post_likes', '11030000-0000-0000-0000-0000000000b5 Thd', 'gone'),
  ('chat_post_likes', '11030000-0000-0000-0000-0000000000b1 Ord', 'gone'),
  ('chat_post_reactions', '11030000-0000-0000-0000-0000000000b4 Blk', 'gone'),
  ('chat_post_reactions', '11030000-0000-0000-0000-0000000000b6 Blk', 'gone'),
  ('chat_post_reactions', '11030000-0000-0000-0000-0000000000b1 Thd', 'gone'),
  -- Blk's messages in the group, the event chat and the direct conversation.
  ('chat_messages', '11030000-0000-0000-0000-0000000000c1', 'gone'),
  ('chat_messages', '11030000-0000-0000-0000-0000000000c4', 'gone'),
  ('chat_messages', '11030000-0000-0000-0000-0000000000c5', 'gone'),
  ('chat_messages', '11030000-0000-0000-0000-0000000000c7', 'gone'),
  ('chat_messages', '11030000-0000-0000-0000-0000000000ca', 'gone'),
  ('chat_message_reactions', '11030000-0000-0000-0000-0000000000c3 Blk', 'gone'),
  ('chat_message_reactions', '11030000-0000-0000-0000-0000000000c2 Blk', 'gone'),
  ('chat_message_reactions', '11030000-0000-0000-0000-0000000000c1 Thd', 'gone'),
  -- The list: last words and unread without Blk's; D stays, only Bkd's in it.
  ('chat_my_threads()', '11030000-0000-0000-0000-0000000000d1', 'changed'),
  ('chat_my_threads()', '11030000-0000-0000-0000-0000000000d2', 'changed'),
  ('chat_my_threads()', '11030000-0000-0000-0000-0000000000d3', 'changed'),
  ('chat_unread_count()', 'value', 'changed'),
  ('push_unread_count()', 'value', 'changed'),
  -- The room list: T1 goes, Blk's face leaves T2 and T3.
  ('chat_topics_for(open)', '11030000-0000-0000-0000-0000000000a1', 'gone'),
  ('chat_topics_for(open)', '11030000-0000-0000-0000-0000000000a2', 'changed'),
  ('chat_topics_for(open)', '11030000-0000-0000-0000-0000000000a3', 'changed'),
  ('chat_topic_opening_posts()', '11030000-0000-0000-0000-0000000000a1', 'gone'),
  ('chat_shared_posts()', '11030000-0000-0000-0000-0000000000ca', 'gone'),
  -- The bell: Blk's, and Thd's in Blk's topic.
  ('my_notifications()', 'group Blk /chat/t/11030000-0000-0000-0000-0000000000d1?message=11030000-0000-0000-0000-0000000000ca', 'gone'),
  ('my_notifications()', 'group Blk /chat/t/11030000-0000-0000-0000-0000000000d2?message=11030000-0000-0000-0000-0000000000c5', 'gone'),
  ('my_notifications()', 'direct Blk /chat/t/11030000-0000-0000-0000-0000000000d3?message=11030000-0000-0000-0000-0000000000c7', 'gone'),
  ('my_notifications()', 'reply Blk /chat/rooms/probe-1103-open/topics/11030000-0000-0000-0000-0000000000a3?post=11030000-0000-0000-0000-0000000000b9', 'gone'),
  ('my_notifications()', 'reply_participant Thd /chat/rooms/probe-1103-open/topics/11030000-0000-0000-0000-0000000000a1?post=11030000-0000-0000-0000-0000000000bb', 'gone'),
  ('my_notifications()', 'like Blk /chat/rooms/probe-1103-open/topics/11030000-0000-0000-0000-0000000000a2?post=11030000-0000-0000-0000-0000000000b6', 'gone'),
  ('my_notifications()', 'reaction Blk /chat/rooms/probe-1103-open/topics/11030000-0000-0000-0000-0000000000a2?post=11030000-0000-0000-0000-0000000000b6', 'gone'),
  ('my_notifications()', 'reaction Blk /chat/t/11030000-0000-0000-0000-0000000000d1?message=11030000-0000-0000-0000-0000000000c2', 'gone'),
  ('my_unseen_notification_count()', 'value', 'changed'),
  ('my_unseen_notification_count_outside_chat()', 'value', 'changed'),
  ('notification_badge()', 'value', 'changed'),
  -- Writing after the block: nothing of Blk's, nor in Blk's topic, reaches Bkd.
  -- (NEW: the new row's id; a4's is P8's.)
  ('a1 Blk writes in G', 'notification thread:11030000-0000-0000-0000-0000000000d1', 'gone'),
  ('a1 Blk writes in G', 'push group thread:11030000-0000-0000-0000-0000000000d1', 'gone'),
  ('a2 Blk replies in T2', 'notification topic:11030000-0000-0000-0000-0000000000a2', 'gone'),
  ('a2 Blk replies in T2', 'push reply_participant topic:11030000-0000-0000-0000-0000000000a2', 'gone'),
  ('a3 Thd replies in T1', 'notification topic:11030000-0000-0000-0000-0000000000a1', 'gone'),
  ('a3 Thd replies in T1', 'push reply_participant topic:11030000-0000-0000-0000-0000000000a1', 'gone'),
  ('a4 Blk likes P8', 'notification like:NEW', 'gone'),
  ('a4 Blk likes P8', 'push like like:NEW', 'gone'),
  ('a5 Thd names Bkd in T1', 'mention', 'gone'),
  ('a5 Thd names Bkd in T1', 'notification mention:NEW', 'gone'),
  ('a5 Thd names Bkd in T1', 'push mention mention:NEW', 'gone'),
  -- Named by Blk: never a mention, and now not a reply either.
  ('a6 Blk names Bkd in T2', 'notification topic:11030000-0000-0000-0000-0000000000a2', 'gone');
\endif

\echo 'Differences, for whom (expect: Bkd only, and exactly the expected list):'
select pg_temp.label(nullif(who, 'signed out')::uuid) as who, what, k, change, before, after
  from actual order by 1, 2, 3;

do $$
declare
  extra integer;
  missing integer;
begin
  select count(*) into extra from actual x
   where x.who <> 'b2a00000-1103-0000-0000-000000000003'
      or not exists (select 1 from expected e where e.what = x.what and e.k = x.k and e.change = x.change);
  select count(*) into missing from expected e
   where not exists (select 1 from actual x where x.who = 'b2a00000-1103-0000-0000-000000000003'
                       and x.what = e.what and x.k = e.k and x.change = e.change);
  if extra > 0 or missing > 0 then
    raise exception 'FAIL: % unexpected differences, % expected ones missing', extra, missing;
  end if;
  raise notice 'PASS: % differences, all Blk''s content leaving Bkd, none for anybody else', (select count(*) from actual);
end $$;
\endif

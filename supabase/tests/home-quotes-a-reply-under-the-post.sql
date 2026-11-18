-- ============================================================================
-- A reply made under the post itself is quoted on Home (20261118210000)
-- ============================================================================
-- The owner, 2026-11-18: a Home card said "2 replies" and quoted none. Both
-- were made with Reply on the opening post, which files them under it, and
-- the ranking only quoted posts filed under nothing.
--
-- One step, the one that matters: for a post whose only replies are one under
-- the post itself and one under that reply, the reader's Home quotes the
-- first and not the second.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/home-quotes-a-reply-under-the-post.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-1121-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'posts@probe.example'),
  ('bbbbbbbb-1121-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'replies@probe.example'),
  ('cccccccc-1121-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reads@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin) values
  ('aaaaaaaa-1121-0000-0000-00000000000a', 'peer', 'active', 'Posts', '19990001211', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-1121-0000-0000-00000000000b', 'peer', 'active', 'Replies', '19990001212', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('cccccccc-1121-0000-0000-00000000000c', 'peer', 'active', 'Reads', '19990001213', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at, show_in_home) values
  ('probe-1121', 'Probe 1121', 'For the probe.', 'Life', 9961, now(), true);
insert into public.chat_topics (id, room_id, title, author_id) values
  ('11210000-0000-0000-0000-000000000001', 'probe-1121', 'A post', 'aaaaaaaa-1121-0000-0000-00000000000a');
insert into public.chat_posts (id, topic_id, author_id, body, created_at, reply_to) values
  ('11210000-0000-0000-0001-000000000001', '11210000-0000-0000-0000-000000000001',
   'aaaaaaaa-1121-0000-0000-00000000000a', 'The post', now() - interval '3 minutes', null),
  -- With Reply on the post itself.
  ('11210000-0000-0000-0001-000000000002', '11210000-0000-0000-0000-000000000001',
   'bbbbbbbb-1121-0000-0000-00000000000b', 'Under the post', now() - interval '2 minutes',
   '11210000-0000-0000-0001-000000000001'),
  -- A reply to that reply: a side-conversation.
  ('11210000-0000-0000-0001-000000000003', '11210000-0000-0000-0000-000000000001',
   'aaaaaaaa-1121-0000-0000-00000000000a', 'Under the reply', now() - interval '1 minute',
   '11210000-0000-0000-0001-000000000002');

\echo ''
\echo '== 1. THE ONE THAT MATTERS: the reader''s Home (expect on_home t; quoted: Under the post; the side-conversation f) =='
select private.act_as('cccccccc-1121-0000-0000-00000000000c') is not null as ok;
set local role authenticated;
select count(*) > 0 as on_home,
       (select string_agg(p.body, ',' order by p.created_at)
          from public.home_topics_ranked(100) h
          cross join lateral jsonb_array_elements(h.previews) x
          join public.chat_posts p on p.id = (x ->> 'id')::uuid
         where h.topic_id = '11210000-0000-0000-0000-000000000001') as quoted,
       coalesce((select bool_or((x ->> 'id') = '11210000-0000-0000-0001-000000000003')
          from public.home_topics_ranked(100) h
          cross join lateral jsonb_array_elements(h.previews) x
         where h.topic_id = '11210000-0000-0000-0000-000000000001'), false) as side_conversation
  from public.home_topics_ranked(100) h
 where h.topic_id = '11210000-0000-0000-0000-000000000001';
reset role;

rollback;

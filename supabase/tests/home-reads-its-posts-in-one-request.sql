-- ============================================================================
-- Home reads its posts in one request (20261118260000)
-- ============================================================================
-- home_feed answers with the posts and everything their cards are drawn from.
-- It reads as the member, so it must show exactly what the two requests it
-- replaces showed, and nothing they would not.
--
-- Steps 1 and 2 are the ones that matter: nothing from a closed room or from
-- somebody the reader blocked, and no removed reply quoted, whichever Show or
-- Sort is asked for.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/home-reads-its-posts-in-one-request.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-1126-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader1126@probe.example'),
  ('bbbbbbbb-1126-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fellow1126@probe.example'),
  ('dddddddd-1126-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blocked1126@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin) values
  ('aaaaaaaa-1126-0000-0000-00000000000a', 'peer', 'active', 'Reader', '19990001261', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-1126-0000-0000-00000000000b', 'peer', 'active', 'Fellow', '19990001262', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('dddddddd-1126-0000-0000-00000000000d', 'peer', 'active', 'Blocked', '19990001264', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.member_blocks (blocker_id, blocked_id) values
  ('aaaaaaaa-1126-0000-0000-00000000000a', 'dddddddd-1126-0000-0000-00000000000d');
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at, show_in_home) values
  ('probe-1126-open',   'Probe 1126 open',   'For the probe.', 'Life', 9961, now(), true),
  ('probe-1126-closed', 'Probe 1126 closed', 'For the probe.', 'Life', 9962, null, true);

insert into public.chat_topics (id, room_id, title, author_id, created_at, last_post_at) values
  ('11260000-0000-0000-0000-000000000001', 'probe-1126-open', 'Mine', 'aaaaaaaa-1126-0000-0000-00000000000a', now() - interval '5 hours', now() - interval '5 hours'),
  ('11260000-0000-0000-0000-000000000002', 'probe-1126-open', 'Fellow, replied to', 'bbbbbbbb-1126-0000-0000-00000000000b', now() - interval '4 hours', now() - interval '4 hours'),
  ('11260000-0000-0000-0000-000000000003', 'probe-1126-open', 'Blocked', 'dddddddd-1126-0000-0000-00000000000d', now() - interval '2 hours', now() - interval '2 hours'),
  ('11260000-0000-0000-0000-000000000004', 'probe-1126-closed', 'Closed, mine', 'aaaaaaaa-1126-0000-0000-00000000000a', now() - interval '3 hours', now() - interval '3 hours');
insert into public.chat_posts (id, topic_id, author_id, body, created_at)
select ('11260000-0000-0000-0001-00000000000' || n)::uuid, t.id, t.author_id, 'Opening', t.created_at
  from public.chat_topics t
  join generate_series(1, 4) n on t.id = ('11260000-0000-0000-0000-00000000000' || n)::uuid;
-- Under Fellow's post: a removed reply, one from Blocked, then Reader's, made
-- with Reply on the opening post. Only Reader's may be quoted.
insert into public.chat_posts (id, topic_id, author_id, body, created_at, removed_at) values
  ('11260000-0000-0000-0002-000000000001', '11260000-0000-0000-0000-000000000002',
   'bbbbbbbb-1126-0000-0000-00000000000b', 'Removed reply', now() - interval '3 hours', now());
insert into public.chat_posts (id, topic_id, author_id, body, created_at) values
  ('11260000-0000-0000-0002-000000000002', '11260000-0000-0000-0000-000000000002',
   'dddddddd-1126-0000-0000-00000000000d', 'Blocked reply', now() - interval '2 hours');
insert into public.chat_posts (id, topic_id, author_id, body, created_at, reply_to) values
  ('11260000-0000-0000-0002-000000000003', '11260000-0000-0000-0000-000000000002',
   'aaaaaaaa-1126-0000-0000-00000000000a', 'Standing reply', now() - interval '1 hour',
   '11260000-0000-0000-0001-000000000002');

\echo ''
\echo '== 1. THE ONE THAT MATTERS: the default feed, for Reader (expect titles: Fellow, replied to / Mine in some order; closed_or_blocked 0; same_as_ranking t) =='
select private.act_as('aaaaaaaa-1126-0000-0000-00000000000a');
set local role authenticated;
with feed as (
  select card from jsonb_array_elements(public.home_feed('all', 'ranking', 100)) card
)
select
  (select string_agg(card ->> 'title', ' / ' order by card ->> 'title')
     from feed where card ->> 'room_id' like 'probe-1126-%') as titles,
  (select count(*) from feed
    where card ->> 'title' in ('Blocked', 'Closed, mine') and card ->> 'room_id' like 'probe-1126-%') as closed_or_blocked,
  (select array_agg((card ->> 'id')::uuid order by (card ->> 'ord')::int) from feed)
    = (select array_agg(r.topic_id order by r.ord)
         from public.home_topics_ranked(100) with ordinality as r(topic_id, rank, previews, ord)) as same_as_ranking;

\echo ''
\echo '== 2. THE ONE THAT MATTERS: what Fellow''s card quotes, by the ranking and by a chosen order (expect Standing reply, twice; opening Opening; authors Fellow and Reader) =='
with ranked as (
  select card from jsonb_array_elements(public.home_feed('all', 'ranking', 100)) card
   where card ->> 'id' = '11260000-0000-0000-0000-000000000002'
), chosen as (
  select card from jsonb_array_elements(public.home_feed('all', 'newest', 100)) card
   where card ->> 'id' = '11260000-0000-0000-0000-000000000002'
)
select
  (select string_agg(r ->> 'body', ' / ') from ranked, jsonb_array_elements(card -> 'replies') r) as ranked_quotes,
  (select string_agg(r ->> 'body', ' / ') from chosen, jsonb_array_elements(card -> 'replies') r) as chosen_quotes,
  (select card -> 'opening' -> 0 ->> 'body' from ranked) as opening,
  (select card -> 'author' ->> 'display_name' from ranked) as author,
  (select card -> 'replies' -> 0 -> 'author' ->> 'display_name' from ranked) as reply_author;

\echo ''
\echo '== 3. a chosen Show lists its own posts, in the order home_topics_shown gives (expect mine: Mine; same_order t) =='
select
  (select string_agg(card ->> 'title', ' / ')
     from jsonb_array_elements(public.home_feed('mine', 'newest', 100)) card
    where card ->> 'room_id' like 'probe-1126-%') as mine,
  (select array_agg((card ->> 'id')::uuid order by (card ->> 'ord')::int)
     from jsonb_array_elements(public.home_feed('all', 'replies', 100)) card)
    = (select array_agg(s.topic_id order by s.ord)
         from public.home_topics_shown('all', 'replies', 100) s) as same_order;
reset role;

\echo ''
\echo '== 4. nobody signed out can ask (expect f) =='
select has_function_privilege('anon', 'public.home_feed(text, text, integer)', 'execute') as anon_may;

rollback;

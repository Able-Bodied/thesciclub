-- ============================================================================
-- Home shows my posts, my replies or my organizations', in a chosen order
-- (20261118230000)
-- ============================================================================
-- The owner, 2026-11-18: Show has everything, my posts, my replies and from my
-- organizations, and the list can be sorted.
--
-- Steps 1 and 3 are the ones that matter: each choice lists exactly its own
-- posts, and nothing from a closed room or from somebody the reader blocked,
-- whatever is asked for.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/home-shows-mine-and-my-organizations.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-1123-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader@probe.example'),
  ('bbbbbbbb-1123-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fellow@probe.example'),
  ('cccccccc-1123-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stranger@probe.example'),
  ('dddddddd-1123-0000-0000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'blocked@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin) values
  ('aaaaaaaa-1123-0000-0000-00000000000a', 'peer', 'active', 'Reader', '19990001231', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-1123-0000-0000-00000000000b', 'peer', 'active', 'Fellow', '19990001232', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('cccccccc-1123-0000-0000-00000000000c', 'peer', 'active', 'Stranger', '19990001233', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('dddddddd-1123-0000-0000-00000000000d', 'peer', 'active', 'Blocked', '19990001234', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.organizations (id, short_code, name, city) values
  ('eeeeeeee-1123-0000-0000-00000000000e', 'PRHS', 'Probe Home Shows Org', 'Sacramento');
-- Reader, Fellow and Blocked belong to it; Stranger does not.
insert into public.organization_follows (member_id, organization_id) values
  ('aaaaaaaa-1123-0000-0000-00000000000a', 'eeeeeeee-1123-0000-0000-00000000000e'),
  ('bbbbbbbb-1123-0000-0000-00000000000b', 'eeeeeeee-1123-0000-0000-00000000000e'),
  ('dddddddd-1123-0000-0000-00000000000d', 'eeeeeeee-1123-0000-0000-00000000000e')
on conflict do nothing;
insert into public.member_blocks (blocker_id, blocked_id) values
  ('aaaaaaaa-1123-0000-0000-00000000000a', 'dddddddd-1123-0000-0000-00000000000d');
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at, show_in_home) values
  ('probe-1123-open',   'Probe 1123 open',   'For the probe.', 'Life', 9971, now(), true),
  ('probe-1123-closed', 'Probe 1123 closed', 'For the probe.', 'Life', 9972, null, true);

insert into public.chat_topics (id, room_id, title, author_id, created_at, last_post_at) values
  ('11230000-0000-0000-0000-000000000001', 'probe-1123-open', 'Mine', 'aaaaaaaa-1123-0000-0000-00000000000a', now() - interval '5 hours', now() - interval '5 hours'),
  ('11230000-0000-0000-0000-000000000002', 'probe-1123-open', 'Fellow, older, replied to', 'bbbbbbbb-1123-0000-0000-00000000000b', now() - interval '4 hours', now() - interval '4 hours'),
  ('11230000-0000-0000-0000-000000000003', 'probe-1123-open', 'Stranger, newest', 'cccccccc-1123-0000-0000-00000000000c', now() - interval '1 hour', now() - interval '1 hour'),
  ('11230000-0000-0000-0000-000000000004', 'probe-1123-open', 'Blocked', 'dddddddd-1123-0000-0000-00000000000d', now() - interval '2 hours', now() - interval '2 hours'),
  ('11230000-0000-0000-0000-000000000005', 'probe-1123-closed', 'Closed, mine', 'aaaaaaaa-1123-0000-0000-00000000000a', now() - interval '3 hours', now() - interval '3 hours');
insert into public.chat_posts (id, topic_id, author_id, body, created_at)
select ('11230000-0000-0000-0001-00000000000' || n)::uuid, t.id, t.author_id, 'Opening', t.created_at
  from public.chat_topics t
  join generate_series(1, 5) n on t.id = ('11230000-0000-0000-0000-00000000000' || n)::uuid;
-- Reader replies under Fellow's post, just now: it is now the last active.
insert into public.chat_posts (id, topic_id, author_id, body) values
  ('11230000-0000-0000-0002-000000000001', '11230000-0000-0000-0000-000000000002',
   'aaaaaaaa-1123-0000-0000-00000000000a', 'A reply');

create temporary table probe_titles as
  select id, title from public.chat_topics where room_id like 'probe-1123-%';
grant select on probe_titles to authenticated;

\echo ''
\echo '== 1. THE ONE THAT MATTERS: each choice of Show, for Reader (expect mine: Mine | replied: Fellow, older, replied to | orgs: Fellow, older, replied to) =='
select private.act_as('aaaaaaaa-1123-0000-0000-00000000000a') is not null as ok;
set local role authenticated;
select
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('mine', 'replies', 100) s join probe_titles p on p.id = s.topic_id) as mine,
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('replied', 'replies', 100) s join probe_titles p on p.id = s.topic_id) as replied,
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('orgs', 'replies', 100) s join probe_titles p on p.id = s.topic_id) as orgs;

\echo ''
\echo '== 2. the two orders, among the probe''s own posts (expect replies: Fellow… / Stranger… / Mine; newest: Stranger… / Fellow… / Mine) =='
select
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('all', 'replies', 100) s join probe_titles p on p.id = s.topic_id) as by_latest_reply,
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('all', 'newest', 100) s join probe_titles p on p.id = s.topic_id) as by_newest_post;

\echo ''
\echo '== 3. THE ONE THAT MATTERS: never a closed room or a blocked member, whatever is asked (expect 0, and 3 of the probe''s posts under everything) =='
select
  (select count(*) from public.home_topics_shown('all', 'ranking', 100) s join probe_titles p on p.id = s.topic_id
    where p.title in ('Blocked', 'Closed, mine'))
  + (select count(*) from public.home_topics_shown('mine', 'newest', 100) s join probe_titles p on p.id = s.topic_id
    where p.title = 'Closed, mine')
  + (select count(*) from public.home_topics_shown('orgs', 'ranking', 100) s join probe_titles p on p.id = s.topic_id
    where p.title = 'Blocked') as hidden_ones_listed,
  (select count(*) from public.home_topics_shown('all', 'ranking', 100) s join probe_titles p on p.id = s.topic_id) as probe_posts_under_everything;
reset role;

-- For the four orders of 20261118240000. Mine: seen by three, upvoted by one.
-- Stranger's: upvoted by two (who have so seen it). Fellow's has the one reply.
insert into public.chat_topic_reads (topic_id, member_id, last_read_at) values
  ('11230000-0000-0000-0000-000000000001', 'bbbbbbbb-1123-0000-0000-00000000000b', now()),
  ('11230000-0000-0000-0000-000000000001', 'cccccccc-1123-0000-0000-00000000000c', now()),
  ('11230000-0000-0000-0000-000000000001', 'dddddddd-1123-0000-0000-00000000000d', now());
insert into public.chat_post_likes (post_id, member_id) values
  ('11230000-0000-0000-0001-000000000001', 'bbbbbbbb-1123-0000-0000-00000000000b'),
  ('11230000-0000-0000-0001-000000000003', 'aaaaaaaa-1123-0000-0000-00000000000a'),
  ('11230000-0000-0000-0001-000000000003', 'bbbbbbbb-1123-0000-0000-00000000000b');

\echo ''
\echo '== 4. the four orders of 20261118240000 (expect views: Mine / Stranger… / Fellow…; most replies: Fellow… / Stranger… / Mine; upvotes: Stranger… / Mine / Fellow…; engaged: Stranger… / Fellow… / Mine) =='
select private.act_as('aaaaaaaa-1123-0000-0000-00000000000a') is not null as ok;
set local role authenticated;
select
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('all', 'views', 100) s join probe_titles p on p.id = s.topic_id) as by_views,
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('all', 'most_replies', 100) s join probe_titles p on p.id = s.topic_id) as by_most_replies;
select
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('all', 'upvotes', 100) s join probe_titles p on p.id = s.topic_id) as by_upvotes,
  (select string_agg(p.title, ' / ' order by s.ord) from public.home_topics_shown('all', 'engaged', 100) s join probe_titles p on p.id = s.topic_id) as by_engaged;
reset role;

rollback;

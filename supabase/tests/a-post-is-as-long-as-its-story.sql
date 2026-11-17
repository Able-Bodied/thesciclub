-- ============================================================================
-- A post in a room can be 100,000 characters (20261117140000)
-- ============================================================================
-- The owner, 2026-11-17: the first post of a room for life stories stopped at
-- 4,000 characters.
--
-- Steps 1 and 3 are the ones that matter: a long first post is taken, written
-- the way a member writes it, and a report on it keeps every word (the
-- report's copy had the same 4,000 and would have refused the report).
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/a-post-is-as-long-as-its-story.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-c0c5-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'teller@probe.example'),
  ('bbbbbbbb-c0c5-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'reader@probe.example');
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, city, is_admin)
values
  ('aaaaaaaa-c0c5-0000-0000-00000000000a', 'peer', 'active', 'Teller', '19990000c51', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false),
  ('bbbbbbbb-c0c5-0000-0000-00000000000b', 'peer', 'active', 'Reader', '19990000c52', '1980-01-01', 'T1–T6', 'CA', 'Sacramento', false);
insert into public.chat_rooms (id, name, description, category, sort_order, opened_at)
values ('probe-life-stories', 'Probe life stories', 'For the probe.', 'Life', 995, now());

create temporary table probe_out (step text primary key, result text);

\echo ''
\echo '== 1. THE ONE THAT MATTERS: a member starts a topic with 20,000 characters (expect 19999: the last space is trimmed) =='
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-c0c5-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select public.chat_create_topic('probe-life-stories', 'My story', repeat('Twenty years of pushing. ', 800)) is not null as made;
reset role;
select char_length(p.body) as first_post
  from public.chat_posts p join public.chat_topics t on t.id = p.topic_id
 where t.room_id = 'probe-life-stories';

\echo ''
\echo '== 2. a reply of 100,000 is taken, the member writing it; one more character is refused (expect 100000; refused) =='
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-c0c5-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
insert into public.chat_posts (topic_id, author_id, body)
select t.id, 'bbbbbbbb-c0c5-0000-0000-00000000000b', repeat('x', 100000)
  from public.chat_topics t where t.room_id = 'probe-life-stories';
reset role;
select max(char_length(p.body)) as longest
  from public.chat_posts p join public.chat_topics t on t.id = p.topic_id
 where t.room_id = 'probe-life-stories';
do $$
begin
  insert into public.chat_posts (topic_id, author_id, body)
  select t.id, 'bbbbbbbb-c0c5-0000-0000-00000000000b', repeat('x', 100001)
    from public.chat_topics t where t.room_id = 'probe-life-stories';
  insert into probe_out values ('one more', 'TAKEN');
exception when check_violation then
  insert into probe_out values ('one more', 'refused');
end $$;
select result as one_more from probe_out where step = 'one more';

\echo ''
\echo '== 3. THE ONE THAT MATTERS: the reader reports the long first post, and the report keeps all of it (expect 19999) =='
set local role authenticated;
select public.chat_report_post(p.id, 'Probe') is not null as asked
  from public.chat_posts p where p.author_id = 'aaaaaaaa-c0c5-0000-0000-00000000000a';
reset role;
select char_length(r.body_snapshot) as kept
  from public.chat_reports r where r.reporter_id = 'bbbbbbbb-c0c5-0000-0000-00000000000b';

\echo ''
\echo '== 4. a message in a conversation keeps its 4,000 (expect t) =='
select pg_get_constraintdef(c.oid) like '%char_length(body) <= 4000%' as messages_as_before
  from pg_constraint c where c.conname = 'chat_messages_check';

rollback;

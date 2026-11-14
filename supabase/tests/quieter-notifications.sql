-- ============================================================================
-- Quieter notifications: Only mentions is private, Pause is bounded, and a
-- mention still pushes in a conversation set to Only mentions
-- ============================================================================
-- 20261113150000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/quieter-notifications.sql
--
-- Rolls back. Do not point it at the live project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state) values
  ('aaaaaaaa-1315-0000-0000-00000000000a', 'peer', 'active', 'Ana', 'ana1315', '19990115100', '1980-01-01', 'C5–C8', 'CA'),
  ('aaaaaaaa-1315-0000-0000-00000000000b', 'peer', 'active', 'Bo',  'bo1315',  '19990115101', '1981-01-01', 'C5–C8', 'CA');

insert into public.chat_threads (id, kind, name, created_by) values
  ('17171717-1315-0000-0000-000000000001', 'group', 'Probe crew', 'aaaaaaaa-1315-0000-0000-00000000000a');
insert into public.chat_thread_members (thread_id, member_id) values
  ('17171717-1315-0000-0000-000000000001', 'aaaaaaaa-1315-0000-0000-00000000000a'),
  ('17171717-1315-0000-0000-000000000001', 'aaaaaaaa-1315-0000-0000-00000000000b');

-- As Ana.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1315-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. Ana sets the crew to Only mentions, for herself only (expect a row; then ERROR on Bo''s behalf) =='
insert into public.chat_thread_mention_only (thread_id, member_id)
values ('17171717-1315-0000-0000-000000000001', 'aaaaaaaa-1315-0000-0000-00000000000a') returning member_id;
insert into public.chat_thread_mention_only (thread_id, member_id)
values ('17171717-1315-0000-0000-000000000001', 'aaaaaaaa-1315-0000-0000-00000000000b');

\echo ''
\echo '== 2. a pause is at most a week and a day (expect ERROR: A pause can last up to a week.; then a time; then null) =='
select public.set_push_pause(now() + interval '30 days');
select public.set_push_pause(now() + interval '1 hour') is not null as paused;
select public.set_push_pause(null);
reset role;

-- As Bo, who cannot see Ana's choice.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1315-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 3. Bo does not see that Ana chose Only mentions (expect 0) =='
select count(*) from public.chat_thread_mention_only;
reset role;

\echo ''
\echo '== 4. Bo writes twice; only the one naming @ana1315 is marked to push to her (expect f, t) =='
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('18181818-1315-0000-0000-000000000001', '17171717-1315-0000-0000-000000000001',
   'aaaaaaaa-1315-0000-0000-00000000000b', 'Lunch anyone?');
select public.notifications_record('message', '{"id":"18181818-1315-0000-0000-000000000001"}');
select pushed_message is not null as pushed from public.notifications
 where member_id = 'aaaaaaaa-1315-0000-0000-00000000000a' and tag = 'thread:17171717-1315-0000-0000-000000000001';
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('18181818-1315-0000-0000-000000000002', '17171717-1315-0000-0000-000000000001',
   'aaaaaaaa-1315-0000-0000-00000000000b', 'Hey @ana1315, are you in?');
select public.notifications_record('message', '{"id":"18181818-1315-0000-0000-000000000002"}');
select pushed_message = '18181818-1315-0000-0000-000000000002' as pushed from public.notifications
 where member_id = 'aaaaaaaa-1315-0000-0000-00000000000a' and tag = 'thread:17171717-1315-0000-0000-000000000001';

rollback;

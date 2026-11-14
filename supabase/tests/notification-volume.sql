-- ============================================================================
-- How much the club notifies you: who may set it, and what each level lets through
-- ============================================================================
-- 20261114060000.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/notification-volume.sql
--
-- Rolls back. Do not point it at the live project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state) values
  ('aaaaaaaa-1418-0000-0000-00000000000a', 'peer', 'active', 'Ada', 'ada1418', '19990114180', '1980-01-01', 'C5–C8', 'CA'),
  ('aaaaaaaa-1418-0000-0000-00000000000b', 'peer', 'active', 'Bo',  'bo1418',  '19990114181', '1981-01-01', 'C5–C8', 'CA'),
  ('aaaaaaaa-1418-0000-0000-00000000000c', 'peer', 'active', 'Cy',  'cy1418',  '19990114182', '1982-01-01', 'C5–C8', 'CA');
insert into public.chat_threads (id, kind, name, created_by) values
  ('dddddddd-1418-0000-0000-000000000001', 'group', 'Probe group', 'aaaaaaaa-1418-0000-0000-00000000000c');
insert into public.chat_thread_members (thread_id, member_id) values
  ('dddddddd-1418-0000-0000-000000000001', 'aaaaaaaa-1418-0000-0000-00000000000a'),
  ('dddddddd-1418-0000-0000-000000000001', 'aaaaaaaa-1418-0000-0000-00000000000b'),
  ('dddddddd-1418-0000-0000-000000000001', 'aaaaaaaa-1418-0000-0000-00000000000c');
insert into public.chat_messages (id, thread_id, author_id, body) values
  ('eeeeeeee-1418-0000-0000-000000000001', 'dddddddd-1418-0000-0000-000000000001', 'aaaaaaaa-1418-0000-0000-00000000000c', 'Lunch at noon'),
  ('eeeeeeee-1418-0000-0000-000000000002', 'dddddddd-1418-0000-0000-000000000001', 'aaaaaaaa-1418-0000-0000-00000000000c', 'Coming, @bo1418?');

set local role anon;
\echo ''
\echo '== 1. signed out, nothing to set (expect ERROR permission denied) =='
select public.set_push_level('needs');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1418-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 2. Ada starts at everything, chooses balanced, and nonsense is refused (expect everything | balanced, then ERROR Choose) =='
select public.my_push_level() as before, public.set_push_level('balanced') as after;
select public.set_push_level('loud');
reset role;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1418-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
\echo ''
\echo '== 3. Bo chooses only what needs him (expect needs) =='
select public.set_push_level('needs');
reset role;

\echo ''
\echo '== 4. what gets through (expect: Cy everything t t t t | Ada balanced f t t t | Bo needs f f t t, and Bo named t) =='
select m.display_name,
       private.push_level_allows(m.id, 'like', 'like', '{}') as a_like,
       private.push_level_allows(m.id, 'group', 'message', '{"id":"eeeeeeee-1418-0000-0000-000000000001"}') as group_message,
       private.push_level_allows(m.id, 'direct', 'message', '{}') as direct_message,
       private.push_level_allows(m.id, 'important', 'important', '{}') as important,
       private.push_level_allows(m.id, 'group', 'message', '{"id":"eeeeeeee-1418-0000-0000-000000000002"}') as named
  from public.members m
 where m.id in ('aaaaaaaa-1418-0000-0000-00000000000a', 'aaaaaaaa-1418-0000-0000-00000000000b',
                'aaaaaaaa-1418-0000-0000-00000000000c')
 order by m.display_name;

\echo ''
\echo '== 5. nobody reads another''s level (expect ERROR permission denied) =='
set local role authenticated;
select * from private.push_levels;
reset role;

rollback;

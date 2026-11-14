-- ============================================================================
-- Important messages in group chats: who may mark, who is told, who may read
-- ============================================================================
-- 20261113140000: whoever started a group, or an administrator in it, marks a
-- message Important; everyone else in the group but the author is told and
-- asked to acknowledge; nobody outside the group sees any of it.
--
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/tests/important-messages.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin) values
  ('aaaaaaaa-1314-0000-0000-00000000000c', 'peer', 'active', 'Cy (started it)', '19990114100', '1980-01-01', 'C5–C8', 'CA', false),
  ('aaaaaaaa-1314-0000-0000-00000000000b', 'peer', 'active', 'Bo (wrote it)',   '19990114101', '1981-01-01', 'C5–C8', 'CA', false),
  ('aaaaaaaa-1314-0000-0000-00000000000d', 'peer', 'active', 'Di (in it)',      '19990114102', '1982-01-01', 'C5–C8', 'CA', false),
  ('aaaaaaaa-1314-0000-0000-00000000000e', 'peer', 'active', 'Ed (admin)',      '19990114103', '1983-01-01', 'C5–C8', 'CA', true),
  ('aaaaaaaa-1314-0000-0000-00000000000f', 'peer', 'active', 'Fy (outside)',    '19990114104', '1984-01-01', 'C5–C8', 'CA', false);

insert into public.chat_threads (id, kind, name, created_by) values
  ('15151515-1314-0000-0000-000000000001', 'group', 'Probe board', 'aaaaaaaa-1314-0000-0000-00000000000c');

insert into public.chat_thread_members (thread_id, member_id) values
  ('15151515-1314-0000-0000-000000000001', 'aaaaaaaa-1314-0000-0000-00000000000c'),
  ('15151515-1314-0000-0000-000000000001', 'aaaaaaaa-1314-0000-0000-00000000000b'),
  ('15151515-1314-0000-0000-000000000001', 'aaaaaaaa-1314-0000-0000-00000000000d'),
  ('15151515-1314-0000-0000-000000000001', 'aaaaaaaa-1314-0000-0000-00000000000e');

insert into public.chat_messages (id, thread_id, author_id, body) values
  ('16161616-1314-0000-0000-000000000001', '15151515-1314-0000-0000-000000000001',
   'aaaaaaaa-1314-0000-0000-00000000000b', 'Vote by Friday'),
  ('16161616-1314-0000-0000-000000000002', '15151515-1314-0000-0000-000000000001',
   'aaaaaaaa-1314-0000-0000-00000000000d', 'Bring the forms');

-- As Di, in the group but neither its starter nor an administrator.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1314-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 1. a member of the group cannot mark (expect ERROR: Only whoever started this group ...) =='
select public.chat_mark_important('16161616-1314-0000-0000-000000000001', true);

-- As Fy, outside it.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1314-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 2. nor can somebody outside it (expect ERROR: Only whoever started this group ...) =='
select public.chat_mark_important('16161616-1314-0000-0000-000000000001', true);

-- As Cy, who started it.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1314-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 3. Cy marks Bo''s message: Di and Ed are told, not Cy or Bo (expect 2, then Di and Ed) =='
select public.chat_mark_important('16161616-1314-0000-0000-000000000001', true);
select count(*) from public.notifications
 where kind = 'important' and tag = 'important:16161616-1314-0000-0000-000000000001';
select m.display_name from public.notifications n join public.members m on m.id = n.member_id
 where n.kind = 'important' and n.tag = 'important:16161616-1314-0000-0000-000000000001'
 order by 1;

\echo ''
\echo '== 4. a reminder so soon is refused (expect ERROR: A reminder went out less than 2 hours ago.) =='
select public.chat_remind_important('16161616-1314-0000-0000-000000000001');

-- As Ed, an administrator in the group.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1314-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 5. Ed, an administrator, may mark too (expect no error), and acknowledges Bo''s (expect 1, t) =='
select public.chat_mark_important('16161616-1314-0000-0000-000000000002', true);
select public.chat_acknowledge_important('16161616-1314-0000-0000-000000000001');
select count(*) from public.chat_important_acks
 where message_id = '16161616-1314-0000-0000-000000000001';
select read_at is not null as read from public.notifications
 where member_id = 'aaaaaaaa-1314-0000-0000-00000000000e'
   and tag = 'important:16161616-1314-0000-0000-000000000001';

-- As Fy, outside the group, reading as the app does.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1314-0000-0000-00000000000f","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 6. Fy cannot acknowledge (expect ERROR: That message is not Important in a group you are in.) =='
select public.chat_acknowledge_important('16161616-1314-0000-0000-000000000001');

\echo ''
\echo '== 7. ...nor see that it is Important, or who acknowledged (expect 0, 0, f, 0) =='
set local role authenticated;
select count(*) from public.chat_important_messages;
select count(*) from public.chat_important_acks;
select (public.chat_thread_important('15151515-1314-0000-0000-000000000001') -> 'can_mark')::boolean;
select count(*) from public.chat_important_people('16161616-1314-0000-0000-000000000001');
reset role;

-- As Di, in the group.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1314-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;

\echo ''
\echo '== 8. Di sees Bo''s waiting at the top of her bell, and 1 of 2 acknowledged (expect 1, then 2 rows, Ed acknowledged) =='
set local role authenticated;
select count(*) from public.chat_my_important() where message_id = '16161616-1314-0000-0000-000000000001';
select display_name, acknowledged_at is not null as acknowledged
  from public.chat_important_people('16161616-1314-0000-0000-000000000001');
reset role;

rollback;

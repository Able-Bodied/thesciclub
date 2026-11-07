-- ============================================================================
-- A group says who was added (20261106010000)
-- ============================================================================
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/group-says-who-was-added.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
  ('aaaaaaaa-add0-0000-0000-000000000001', 'peer', 'active', 'Ada A',  '19990add001', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-add0-0000-0000-000000000002', 'peer', 'active', 'Bo B',   '19990add002', '1981-01-01', 'C5–C8', 'CA', true),
  ('cccccccc-add0-0000-0000-000000000003', 'peer', 'active', 'Cass C', '19990add003', '1982-01-01', 'C5–C8', 'CA', true),
  ('dddddddd-add0-0000-0000-000000000004', 'peer', 'active', 'Dee D',  '19990add004', '1983-01-01', 'C5–C8', 'CA', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-add0-0000-0000-000000000001","role":"authenticated"}';

select public.chat_create_group('Probe ride', array['bbbbbbbb-add0-0000-0000-000000000002'::uuid]) as grp \gset

\echo ''
\echo '== 1. starting a group writes no line (expect 0) =='
select count(*) from public.chat_messages where thread_id = :'grp';

\echo ''
\echo '== 2. adding Cass writes one line (expect 1 | added | Added Cass C to the group | t | t) =='
select public.chat_add_to_group(:'grp', 'cccccccc-add0-0000-0000-000000000003');
select count(*), max(notice), max(body),
       bool_and(author_id = 'aaaaaaaa-add0-0000-0000-000000000001'),
       bool_and(subject_id = 'cccccccc-add0-0000-0000-000000000003')
  from public.chat_messages where thread_id = :'grp';

\echo ''
\echo '== 3. adding Cass again writes nothing more (expect 1) =='
select public.chat_add_to_group(:'grp', 'cccccccc-add0-0000-0000-000000000003');
select count(*) from public.chat_messages where thread_id = :'grp';

\echo ''
\echo '== 4. a member cannot write one (expect ERROR permission denied) =='
savepoint forged;
insert into public.chat_messages (thread_id, author_id, body, subject_id)
values (:'grp', 'aaaaaaaa-add0-0000-0000-000000000001', 'Added Dee D to the group',
        'dddddddd-add0-0000-0000-000000000004');
rollback to savepoint forged;

\echo ''
\echo '== 5. Cass, now in, reads the line (expect 1) =='
set local request.jwt.claims = '{"sub":"cccccccc-add0-0000-0000-000000000003","role":"authenticated"}';
select count(*) from public.chat_messages where thread_id = :'grp' and notice = 'added';

\echo ''
\echo '== 6. Cass deletes their account: the name goes (expect 1 | t | Added a deleted member to the group) =='
reset role;
delete from public.members where id = 'cccccccc-add0-0000-0000-000000000003';
select count(*), bool_and(subject_id is null), max(body)
  from public.chat_messages where thread_id = :'grp' and notice = 'added';

rollback;

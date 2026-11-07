-- ============================================================================
-- Connecting several members, or into a group (20261106020000)
-- ============================================================================
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/connecting-several.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
  ('aaaaaaaa-c5c5-0000-0000-000000000001', 'peer', 'active', 'Ada Admin',  '19990c5c001', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-c5c5-0000-0000-000000000002', 'peer', 'active', 'Bo B',       '19990c5c002', '1981-01-01', 'C5–C8', 'CA', true),
  ('cccccccc-c5c5-0000-0000-000000000003', 'peer', 'active', 'Cass C',     '19990c5c003', '1982-01-01', 'C5–C8', 'CA', true),
  ('dddddddd-c5c5-0000-0000-000000000004', 'peer', 'active', 'Dee D',      '19990c5c004', '1983-01-01', 'C5–C8', 'CA', true),
  ('eeeeeeee-c5c5-0000-0000-000000000005', 'peer', 'active', 'Eli E',      '19990c5c005', '1984-01-01', 'C5–C8', 'CA', true),
  ('ffffffff-c5c5-0000-0000-000000000006', 'peer', 'active', 'Fay F',      '19990c5c006', '1985-01-01', 'C5–C8', 'CA', true),
  ('99999999-c5c5-0000-0000-000000000007', 'peer', 'active', 'Gus Plain',  '19990c5c007', '1986-01-01', 'C5–C8', 'CA', true);

insert into public.organizations (id, short_code, name, city, state)
values ('11111111-c5c5-0000-0000-000000000001', 'PRCS', 'Probe Connect', 'Oakland', 'CA');
insert into public.organization_representatives (organization_id, member_id)
values ('11111111-c5c5-0000-0000-000000000001', 'aaaaaaaa-c5c5-0000-0000-000000000001');

-- Fay blocks Cass.
insert into public.member_blocks (blocker_id, blocked_id)
values ('ffffffff-c5c5-0000-0000-000000000006', 'cccccccc-c5c5-0000-0000-000000000003');

set local role authenticated;

\echo ''
\echo '== 1. a member who is not an org admin or partner (expect ERROR Only an org admin) =='
set local request.jwt.claims = '{"sub":"99999999-c5c5-0000-0000-000000000007","role":"authenticated"}';
savepoint s1;
select public.connect_members(array['bbbbbbbb-c5c5-0000-0000-000000000002', 'cccccccc-c5c5-0000-0000-000000000003']::uuid[], 'Meet');
rollback to savepoint s1;

set local request.jwt.claims = '{"sub":"aaaaaaaa-c5c5-0000-0000-000000000001","role":"authenticated"}';

\echo ''
\echo '== 2. three into a new group named Probe crew (expect Probe crew | 3 | f | 3 pairs | 1 | introduced) =='
select public.connect_members(
  array['bbbbbbbb-c5c5-0000-0000-000000000002', 'cccccccc-c5c5-0000-0000-000000000003',
        'dddddddd-c5c5-0000-0000-000000000004']::uuid[],
  'You all ride on Saturdays.', false, null, '  Probe crew ') as crew \gset
reset role;
select t.name,
       (select count(*) from public.chat_thread_members m where m.thread_id = t.id) as roster,
       exists (select 1 from public.chat_thread_members m
                where m.thread_id = t.id and m.member_id = 'aaaaaaaa-c5c5-0000-0000-000000000001') as admin_in,
       (select count(*) from public.introductions i where i.thread_id = t.id) || ' pairs' as pairs,
       (select count(*) from public.connections c where c.thread_id = t.id) as connections,
       (select string_agg(notice, ',') from public.chat_messages where thread_id = t.id) as lines
  from public.chat_threads t where t.id = :'crew';
set local role authenticated;

\echo ''
\echo '== 3. four, no name, I join (expect Bo, Cass, Dee & 1 more | 5) =='
select public.connect_members(
  array['bbbbbbbb-c5c5-0000-0000-000000000002', 'cccccccc-c5c5-0000-0000-000000000003',
        'dddddddd-c5c5-0000-0000-000000000004', '99999999-c5c5-0000-0000-000000000007']::uuid[],
  'Four of you.', true) as four \gset
select t.name, (select count(*) from public.chat_thread_members m where m.thread_id = t.id)
  from public.chat_threads t where t.id = :'four';

\echo ''
\echo '== 4. one person into a new group (expect ERROR at least two) =='
savepoint s4;
select public.connect_members(array['bbbbbbbb-c5c5-0000-0000-000000000002']::uuid[], 'Alone');
rollback to savepoint s4;

\echo ''
\echo '== 5. Eli into the crew, which I started and am not in (expect 4 | 3 new pairs | added,introduced) =='
\echo '   the last two lines, in time order'
select public.connect_members(array['eeeeeeee-c5c5-0000-0000-000000000005']::uuid[],
  'Eli rides too.', false, :'crew');
reset role;
select (select count(*) from public.chat_thread_members m where m.thread_id = :'crew') as roster,
       (select count(*) from public.introductions i
          join public.connections c on c.id = i.connection_id
         where c.thread_id = :'crew' and c.into_existing) || ' new pairs' as pairs,
       (select string_agg(notice, ',' order by created_at) from (
          select notice, created_at from public.chat_messages
           where thread_id = :'crew' order by created_at desc limit 2) l) as lines;
set local role authenticated;

\echo ''
\echo '== 6. I still cannot read the crew (expect 0) =='
select count(*) from public.chat_messages where thread_id = :'crew';

\echo ''
\echo '== 7. a group I neither started nor am in (expect ERROR There is no such group) =='
set local request.jwt.claims = '{"sub":"bbbbbbbb-c5c5-0000-0000-000000000002","role":"authenticated"}';
select public.chat_create_group('Not yours', array['cccccccc-c5c5-0000-0000-000000000003'::uuid]) as other \gset
set local request.jwt.claims = '{"sub":"aaaaaaaa-c5c5-0000-0000-000000000001","role":"authenticated"}';
savepoint s7;
select public.connect_members(array['dddddddd-c5c5-0000-0000-000000000004']::uuid[], 'Hi', false, :'other');
rollback to savepoint s7;

\echo ''
\echo '== 8. Fay into the crew, where Cass is, whom Fay blocks (expect ERROR cannot be connected) =='
savepoint s8;
select public.connect_members(array['ffffffff-c5c5-0000-0000-000000000006']::uuid[], 'Hi', false, :'crew');
rollback to savepoint s8;

\echo ''
\echo '== 9. everyone chosen is in the crew already (expect ERROR in that group already) =='
savepoint s9;
select public.connect_members(array['bbbbbbbb-c5c5-0000-0000-000000000002']::uuid[], 'Hi', false, :'crew');
rollback to savepoint s9;

\echo ''
\echo '== 10. Bo and Cass again, just the two (expect ERROR connected already) =='
savepoint s10;
select public.connect_members(array['bbbbbbbb-c5c5-0000-0000-000000000002', 'cccccccc-c5c5-0000-0000-000000000003']::uuid[], 'Again');
rollback to savepoint s10;

\echo ''
\echo '== 11. my groups (expect Probe crew 4 f t, and the four 5 t t) =='
select name, members, i_am_in, started from public.my_connection_groups() order by name;

\echo ''
\echo '== 12. my connections (expect: the four 4 Bo B t; crew f 3 Bo B f; crew t 1 Eli E f) =='
select into_group, group_name, jsonb_array_length(people) as people, people -> 0 ->> 'name' as first,
       thread_id is not null as can_open
  from public.my_connections() order by group_name, into_group;

\echo ''
\echo '== 13. Gus cannot list anything (expect 0 | 0) =='
set local request.jwt.claims = '{"sub":"99999999-c5c5-0000-0000-000000000007","role":"authenticated"}';
select (select count(*) from public.my_connection_groups()), (select count(*) from public.my_connections());

\echo ''
\echo '== 14. signed out (expect ERROR permission denied, three times) =='
set local role anon;
savepoint s14a;
select public.connect_members(array['bbbbbbbb-c5c5-0000-0000-000000000002', 'eeeeeeee-c5c5-0000-0000-000000000005']::uuid[], 'x');
rollback to savepoint s14a;
savepoint s14b;
select * from public.my_connection_groups();
rollback to savepoint s14b;
savepoint s14c;
select * from public.connections;
rollback to savepoint s14c;

\echo ''
\echo '== 15. a long note, 3,000 characters, is fine; 4,001 is not (expect a uuid, then ERROR 4,000 characters or fewer) =='
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-c5c5-0000-0000-000000000001","role":"authenticated"}';
select public.connect_members(array['eeeeeeee-c5c5-0000-0000-000000000005', 'ffffffff-c5c5-0000-0000-000000000006']::uuid[],
  repeat('a', 3000)) is not null as made;
savepoint s15;
select public.connect_members(array['dddddddd-c5c5-0000-0000-000000000004', 'eeeeeeee-c5c5-0000-0000-000000000005']::uuid[],
  repeat('a', 4001));
rollback to savepoint s15;

rollback;

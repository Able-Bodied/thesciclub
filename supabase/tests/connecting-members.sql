-- ============================================================================
-- Connecting two members at once, and an organization's numbers. Run as
-- members, under RLS.
-- ============================================================================
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/connecting-members.sql
--
-- 20261031110000. Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse, is_admin)
values
  ('aaaaaaaa-c0c0-0000-0000-000000000001', 'peer', 'active', 'Orla Admin',  '19990008001', '1980-01-01', 'T1–T6',  'CA', true, false),
  ('bbbbbbbb-c0c0-0000-0000-000000000002', 'peer', 'active', 'Ana Member',  '19990008002', '1981-01-01', 'C5–C8',  'CA', true, false),
  ('cccccccc-c0c0-0000-0000-000000000003', 'peer', 'active', 'Bo Member',   '19990008003', '1982-01-01', 'T7–T12', 'CA', true, false),
  ('dddddddd-c0c0-0000-0000-000000000004', 'peer', 'active', 'Plain Peer',  '19990008004', '1983-01-01', 'L1–S5',  'CA', true, false),
  ('eeeeeeee-c0c0-0000-0000-000000000005', 'peer', 'active', 'Cy Blocked',  '19990008005', '1984-01-01', 'T1–T6',  'CA', true, false),
  ('ffffffff-c0c0-0000-0000-000000000006', 'peer', 'active', 'Dee Member',  '19990008006', '1985-01-01', 'T1–T6',  'CA', true, false);

insert into public.organizations (id, name, short_code, can_invite)
values ('0c000000-0000-0000-0000-00000000000a', 'Probe Org', 'PRB', false),
       ('0c000000-0000-0000-0000-00000000000b', 'Other Org', 'PRO', false);
insert into public.organization_representatives (organization_id, member_id)
values ('0c000000-0000-0000-0000-00000000000a', 'aaaaaaaa-c0c0-0000-0000-000000000001');
insert into public.organization_members (organization_id, member_id, joined_via)
values ('0c000000-0000-0000-0000-00000000000a', 'bbbbbbbb-c0c0-0000-0000-000000000002', 'code'),
       ('0c000000-0000-0000-0000-00000000000a', 'cccccccc-c0c0-0000-0000-000000000003', 'check_in')
on conflict do nothing;
insert into public.member_blocks (blocker_id, blocked_id)
values ('bbbbbbbb-c0c0-0000-0000-000000000002', 'eeeeeeee-c0c0-0000-0000-000000000005');

\set orla 'aaaaaaaa-c0c0-0000-0000-000000000001'
\set ana 'bbbbbbbb-c0c0-0000-0000-000000000002'
\set bo 'cccccccc-c0c0-0000-0000-000000000003'
\set plain 'dddddddd-c0c0-0000-0000-000000000004'
\set cy 'eeeeeeee-c0c0-0000-0000-000000000005'
\set dee 'ffffffff-c0c0-0000-0000-000000000006'
\set org '0c000000-0000-0000-0000-00000000000a'
\set other '0c000000-0000-0000-0000-00000000000b'

\set QUIET off
\echo ''
\echo '== 0. an org admin, signed in, not a partner or a club administrator =='
\echo '   expect: authenticated | f admin | f partner | t can connect'
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-c0c0-0000-0000-000000000001","role":"authenticated"}';
select current_user, public.is_admin() as admin, public.i_am_partner() as partner, public.i_can_connect() as can_connect;

\echo ''
\echo '== 1. THE STEP: connecting opens the group at once, with nobody asked =='
\echo '   expect: one uuid; then opened | 0 answers | the note as an introduced line;'
\echo '   Ana and Bo in it and Orla not; nothing left waiting for an answer.'
select public.make_introduction(:'ana', :'bo', 'You both race handcycles.', false) is not null as made;
select i.status, i.yeses, i.thread_id is null as orla_cannot_open_it
  from public.my_introductions() i;
set local role postgres;
select (select count(*) from public.chat_thread_members tm
         join public.introductions i on i.thread_id = tm.thread_id
        where i.introduced_by = :'orla') as in_the_group,
       (select count(*) from public.chat_thread_members tm
         join public.introductions i on i.thread_id = tm.thread_id
        where i.introduced_by = :'orla' and tm.member_id = :'orla') as orla_in_it,
       (select m.notice || ': ' || m.body from public.chat_messages m
         join public.introductions i on i.thread_id = m.thread_id
        where i.introduced_by = :'orla') as first_line,
       (select count(*) from public.notifications n
         where n.kind = 'introduction' and n.detail = 'asked' and n.member_id in (:'ana', :'bo')) as asked;

\echo ''
\echo '== 2. each of the two is told they were added, by the connector =='
\echo '   expect: 2 rows of group_add, actor Orla Admin.'
select n.kind, a.display_name as by
  from public.notifications n left join public.members a on a.id = n.actor_id
 where n.member_id in (:'ana', :'bo') and n.kind = 'group_add';

\echo ''
\echo '== 3. the connector can choose to be in it =='
\echo '   expect: t, then 3 in the group, Orla among them.'
set local role authenticated;
select public.make_introduction(:'ana', :'dee', 'Same rehab, same year.', true) is not null as made;
set local role postgres;
select count(*) as in_the_group, bool_or(tm.member_id = :'orla') as orla_in_it
  from public.chat_thread_members tm
  join public.introductions i on i.thread_id = tm.thread_id
 where i.second_id = :'dee';

\echo ''
\echo '== 4. refusals =='
\echo '   expect: ERROR, in order: already connected; a blocked pair cannot be'
\echo '   connected; two different members; two other members; a note is needed.'
set local role authenticated;
savepoint again;
select public.make_introduction(:'bo', :'ana', 'Again.', false);
rollback to savepoint again;
savepoint blocked;
select public.make_introduction(:'ana', :'cy', 'Blocked.', false);
rollback to savepoint blocked;
savepoint same;
select public.make_introduction(:'ana', :'ana', 'Same.', false);
rollback to savepoint same;
savepoint self;
select public.make_introduction(:'orla', :'ana', 'Me.', false);
rollback to savepoint self;
savepoint empty;
select public.make_introduction(:'bo', :'dee', '   ', false);
rollback to savepoint empty;

\echo ''
\echo '== 5. the org admin reads their organization, not another =='
\echo '   expect: 3 members (Orla joins as its admin) | 1 by code | 1 by check-in;'
\echo '   then 0 rows for the other organization.'
select members, by_code, by_check_in from public.my_organization_stats(:'org', 30);
select count(*) as rows_for_another from public.my_organization_stats(:'other', 30);

\echo ''
\echo '== 6. THE STEP: a plain member can do none of it =='
\echo '   expect: f can connect; ERROR only an org admin or trusted partner; 0 stats rows.'
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-c0c0-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select public.i_can_connect() as can_connect;
savepoint plain_connects;
select public.make_introduction(:'bo', :'dee', 'Not allowed.', false);
rollback to savepoint plain_connects;
select count(*) as rows from public.my_organization_stats(:'org', 30);

\echo ''
\echo '== 7. nobody signed in reaches any of it =='
\echo '   expect: ERROR permission denied, twice.'
set local role postgres;
set local role anon;
savepoint anon_connect;
select public.i_can_connect();
rollback to savepoint anon_connect;
savepoint anon_stats;
select * from public.my_organization_stats(:'org', 30);
rollback to savepoint anon_stats;

rollback;

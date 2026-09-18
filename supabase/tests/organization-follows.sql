-- ============================================================================
-- Can a member follow an organization, and can anybody see that they have?
-- ============================================================================
-- The second question is the load-bearing one. Who a member follows is a
-- statement about them that they did not make to the room, and the select
-- policy is the only thing keeping it private — there is no view to hide
-- behind and no follower count that would need one.
--
-- Run as real signed-in roles, not as the superuser: postgres is BYPASSRLS, so
-- every policy here would be inert and the file would pass while proving
-- nothing. Every expected refusal sits in its own savepoint, or the first one
-- aborts the transaction and the rest print "current transaction is aborted",
-- which in a long log is indistinguishable from passing.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/organization-follows.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('aaaaaaaa-3333-0000-0000-00000000000a', 'peer',   'active',    'Follower',  '19990000040', '1980-01-01', 'T1–T6', 'CA'),
  ('bbbbbbbb-3333-0000-0000-00000000000b', 'mentor', 'active',    'A Mentor',  '19990000041', '1981-01-01', 'T1–T6', 'CA'),
  ('cccccccc-3333-0000-0000-00000000000c', 'peer',   'active',    'Nosy',      '19990000042', '1982-01-01', 'C5–C8', 'CA'),
  ('dddddddd-3333-0000-0000-00000000000d', 'peer',   'suspended', 'Paused',    '19990000043', '1983-01-01', 'C5–C8', 'CA');

-- Two real organizations, taken by name so this does not depend on ids.
\set org1 '(select id from public.organizations order by name limit 1)'
\set org2 '(select id from public.organizations order by name offset 1 limit 1)'

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-3333-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are a signed-in member, not the superuser (expect authenticated) =='
select current_user, auth.uid()::text as uid;

\echo ''
\echo '== 1. a peer can follow (expect INSERT 0 1) =='
insert into public.organization_follows (member_id, organization_id)
values ('aaaaaaaa-3333-0000-0000-00000000000a', :org1);

\echo ''
\echo '== 2. following twice is the same row, not a second one (expect 1) =='
\echo '   The compound primary key is what makes this idempotent, so the button'
\echo '   does not have to know whether it is inserting or updating.'
savepoint again;
insert into public.organization_follows (member_id, organization_id)
values ('aaaaaaaa-3333-0000-0000-00000000000a', :org1)
on conflict do nothing;
select count(*) as mine from public.organization_follows;
release savepoint again;

\echo ''
\echo '== 3. they can follow a second one (expect INSERT 0 1, then 2) =='
insert into public.organization_follows (member_id, organization_id)
values ('aaaaaaaa-3333-0000-0000-00000000000a', :org2);
select count(*) as mine from public.organization_follows;

\echo ''
\echo '== 4. they cannot follow in somebody else''s name (expect ERROR) =='
\echo '   The whole of the write policy: member_id = auth.uid(). Without this a'
\echo '   member could put follows on another member''s account.'
savepoint forge;
insert into public.organization_follows (member_id, organization_id)
values ('cccccccc-3333-0000-0000-00000000000c', :org1);
rollback to savepoint forge;

\echo ''
\echo '== 5. a mentor can follow too (expect INSERT 0 1) =='
\echo '   "Peers and mentors" is every member; nothing here keys on type.'
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-3333-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
insert into public.organization_follows (member_id, organization_id)
values ('bbbbbbbb-3333-0000-0000-00000000000b', :org1);

\echo ''
\echo '== 6. THE ONE THAT MATTERS: nobody sees anybody else''s (expect 1, not 3) =='
\echo '   The mentor has one follow of their own and there are three rows in the'
\echo '   table. An unfiltered select must return only theirs. There is no view'
\echo '   and no follower count, so this policy is the whole protection.'
select count(*) as visible_to_the_mentor from public.organization_follows;

\echo ''
\echo '== 7. and a third member sees none at all (expect 0) =='
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-3333-0000-0000-00000000000c","role":"authenticated"}', true) is not null as ok;
select count(*) as visible_to_a_stranger from public.organization_follows;

\echo ''
\echo '== 8. ...and cannot delete what they cannot see (expect DELETE 0) =='
\echo '   Silent rather than an error, which is what a delete policy does: the'
\echo '   rows are simply not theirs to match.'
savepoint steal;
delete from public.organization_follows;
rollback to savepoint steal;

\echo ''
\echo '== 9. a paused member cannot follow (expect ERROR) =='
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-3333-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
savepoint paused_follow;
insert into public.organization_follows (member_id, organization_id)
values ('dddddddd-3333-0000-0000-00000000000d', :org1);
rollback to savepoint paused_follow;

\echo ''
\echo '== 10. ...but can unfollow (expect DELETE 1) =='
\echo '   The same split event_rsvps makes: somebody whose membership is paused'
\echo '   should still be able to take themselves off a list.'
set local role postgres;
insert into public.organization_follows (member_id, organization_id)
values ('dddddddd-3333-0000-0000-00000000000d', :org1);
set local role authenticated;
delete from public.organization_follows where member_id = 'dddddddd-3333-0000-0000-00000000000d';

\echo ''
\echo '== 11. a signed-out visitor cannot even read the table (expect ERROR) =='
\echo '   Stronger than an empty result, and it is the grant rather than the'
\echo '   policy answering: select is granted to authenticated only. Both halves'
\echo '   get their own savepoint — this step had neither at first, the refusal'
\echo '   aborted the transaction, and step 12 printed "current transaction is'
\echo '   aborted" which in a long log reads exactly like a pass.'
select set_config('request.jwt.claims', '{"role":"anon"}', true) is not null as ok;
set local role anon;
savepoint anon_read;
select count(*) as visible_to_anon from public.organization_follows;
rollback to savepoint anon_read;

\echo ''
\echo '== 11b. nor write to it (expect ERROR) =='
savepoint anon_write;
insert into public.organization_follows (member_id, organization_id)
values ('aaaaaaaa-3333-0000-0000-00000000000a', :org2);
rollback to savepoint anon_write;

\echo ''
\echo '== 12. removing a member takes their follows with them (expect 2, then 0) =='
\echo '   `on delete cascade`, and it is one more thing inside the cascade that'
\echo '   /admin''s Remove panel warns about.'
set local role postgres;
select count(*) as before_removal from public.organization_follows
 where member_id = 'aaaaaaaa-3333-0000-0000-00000000000a';
delete from public.members where id = 'aaaaaaaa-3333-0000-0000-00000000000a';
select count(*) as after_removal from public.organization_follows
 where member_id = 'aaaaaaaa-3333-0000-0000-00000000000a';

rollback;

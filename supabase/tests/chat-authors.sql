-- ============================================================================
-- chat_authors: can a member put a name to a post? Run as a member, under RLS.
-- ============================================================================
-- The view exists because browse_members cannot do this job. browse_members
-- hides members who are not `show_in_browse` and members who are not active,
-- which is right for a deck of people to meet and wrong for the byline on
-- something they wrote: through browse_members, forty posts by somebody who
-- later took themselves off the directory render as nobody.
--
-- So chat_authors deliberately carries rows browse_members deliberately hides,
-- and the whole of its safety is one `where public.is_member()`. That is a
-- single clause standing between a view of every member in the club and
-- anybody holding a session. It gets run rather than read.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-authors.sql
--
-- It rolls back and is safe to re-run. Do not point it at the hosted project.
--
-- Steps 4, 5 and 6 are the load-bearing ones: a session that verified a phone
-- number but was never invited, a signed-out visitor, and a removed member all
-- get nothing. Step 0 prints current_user because as the superuser every one of
-- those three turns green while proving nothing — `postgres` is BYPASSRLS and
-- the view's where clause is the only check there is.
--
-- The control against a step passing for the wrong reason is steps 2 and 3:
-- the same viewer, the same view, one hidden member and one browsable one, and
-- the difference between them shows up only in has_profile. A view that had
-- quietly inherited browse_members' filter would lose step 2's row; one with no
-- filter at all would give both rows has_profile = true.
-- ============================================================================

\set ON_ERROR_STOP off
\set QUIET on
\pset pager off

begin;

-- ------------------------------------------------------------------- set-up
-- Written as the superuser, before the role switch. These rows are the
-- situation, not the thing under test.
insert into public.members
  (id, type, status, display_name, phone, birth_date, level_range, state, show_in_browse)
values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'peer',   'active',    'Viewer A',    '19990001001', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'peer',   'active',    'Hidden H',    '19990001002', '1981-01-01', 'C5–C8', 'CA', false),
  ('cccccccc-1111-0000-0000-000000000003', 'mentor', 'active',    'Browsable B', '19990001003', '1982-01-01', 'T7–T12','CA', true),
  ('dddddddd-1111-0000-0000-000000000004', 'peer',   'suspended', 'Suspended S', '19990001004', '1983-01-01', 'C5–C8', 'CA', true),
  ('eeeeeeee-1111-0000-0000-000000000005', 'peer',   'removed',   'Removed R',   '19990001005', '1984-01-01', 'L1–S5', 'CA', true);

-- ---------------------------------------------------------- become Viewer A
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1111-0000-0000-000000000001","role":"authenticated"}';

\set QUIET off
\echo ''
\echo '== 0. we are a signed-in member, not the superuser =='
\echo '   expect: authenticated | aaaaaaaa-1111-0000-0000-000000000001 | t | t | f'
select
  current_user,
  auth.uid()::text        as uid,
  public.is_member()      as a_member,
  public.is_active_member() as active,
  public.is_admin()       as admin;

\echo ''
\echo '== 1. all five fixtures are there as authors, whatever their standing =='
\echo '   expect five rows: Browsable B, Hidden H, Removed R, Suspended S, Viewer A'
select display_name, has_profile
  from public.chat_authors
 where id::text like '%-1111-0000-0000-%'
 order by display_name;

\echo ''
\echo '== 2. the hidden member has a name here and none in the deck =='
\echo '   THE STEP THAT MATTERS. expect: Hidden H | f, then no rows at all.'
select display_name, has_profile from public.chat_authors
 where id = 'bbbbbbbb-1111-0000-0000-000000000002';
select display_name from public.browse_members
 where id = 'bbbbbbbb-1111-0000-0000-000000000002';

\echo ''
\echo '== 3. the browsable member is in both, and has_profile says so =='
\echo '   expect: Browsable B | t, then Browsable B'
select display_name, has_profile from public.chat_authors
 where id = 'cccccccc-1111-0000-0000-000000000003';
select display_name from public.browse_members
 where id = 'cccccccc-1111-0000-0000-000000000003';

\echo ''
\echo '== 3b. a suspended or removed member is an author and not a profile =='
\echo '   expect: Removed R | f and Suspended S | f'
select display_name, has_profile from public.chat_authors
 where id in ('dddddddd-1111-0000-0000-000000000004', 'eeeeeeee-1111-0000-0000-000000000005')
 order by display_name;

\echo ''
\echo '== 3c. the view carries a byline and not a profile =='
\echo '   expect: ERROR, column "bio" does not exist. City, birth_date and'
\echo '   interests are absent for the same reason.'
savepoint no_profile;
select bio from public.chat_authors limit 1;
rollback to savepoint no_profile;

\echo ''
\echo '== 4. a verified session that was never invited sees nobody =='
\echo '   expect: 0. This uuid has no members row — it is somebody who got'
\echo '   through phone verification and no further.'
savepoint uninvited;
set local role postgres;
set local request.jwt.claims = '{"sub":"ffffffff-1111-0000-0000-00000000000f","role":"authenticated"}';
set local role authenticated;
select current_user, public.is_member() as a_member, count(*) as authors_visible
  from public.chat_authors;
rollback to savepoint uninvited;

\echo ''
\echo '== 5. a signed-out visitor is refused outright =='
\echo '   expect: ERROR, permission denied for view chat_authors'
savepoint anon;
set local role postgres;
set local request.jwt.claims = '';
set local role anon;
select count(*) from public.chat_authors;
rollback to savepoint anon;

\echo ''
\echo '== 6. a removed member is out of the club and reads nothing =='
\echo '   expect: f | f | 0'
savepoint removed;
set local role postgres;
set local request.jwt.claims = '{"sub":"eeeeeeee-1111-0000-0000-000000000005","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       count(*) as authors_visible
  from public.chat_authors;
rollback to savepoint removed;

\echo ''
\echo '== 7. a suspended member still reads, and still cannot write =='
\echo '   expect: t | f | 5. The read gate and the write gate differ by exactly'
\echo '   this case, and it is the only place the difference shows.'
savepoint suspended;
set local role postgres;
set local request.jwt.claims = '{"sub":"dddddddd-1111-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;
select public.is_member() as a_member, public.is_active_member() as active,
       count(*) as authors_visible
  from public.chat_authors
 where id::text like '%-1111-0000-0000-%';
rollback to savepoint suspended;

set local role postgres;
rollback;

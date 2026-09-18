-- ============================================================================
-- Who may clear a photograph — and why this file cannot answer the whole of it
-- ============================================================================
-- /admin's Remove panel promises a removed member's record goes with them. Until
-- 20260918000000 their photograph did not: `photos` is a public bucket, so it
-- stayed retrievable at a URL derived from their id. Found on the live bucket,
-- 2.8MB belonging to an account removed weeks earlier, still answering 200.
--
-- ---------------------------------------------------------------------------
-- READ THIS BEFORE ADDING A DELETE STEP
-- ---------------------------------------------------------------------------
-- **Storage deletes cannot be tested from SQL at all.** Supabase installs a
-- trigger, `storage.protect_delete()`, that refuses every direct delete from
-- `storage.objects` with "Direct deletion from storage tables is not allowed.
-- Use the Storage API instead." It fires before RLS is consulted, so a delete
-- by an administrator, by a member, by a stranger and by nobody all produce the
-- same error — and a file full of them looks exactly like a file full of
-- policies working.
--
-- The first draft of this file had four such steps and every one of them
-- "passed". They proved nothing whatsoever.
--
-- So the delete side is verified through the Storage API, against a running
-- local stack, with real JWTs — run `pnpm check-photo-policy`. What is
-- left here is what SQL *can* settle: that the policies exist, are scoped to
-- the right roles, and that the insert side was not loosened on the way.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/photo-cleanup.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values
  ('aaaaaaaa-5555-0000-0000-00000000000a', 'peer', 'active', 'The Admin', '19990000060', '1980-01-01', 'T1–T6', 'CA', true),
  ('bbbbbbbb-5555-0000-0000-00000000000b', 'peer', 'active', 'A Member',  '19990000061', '1981-01-01', 'T1–T6', 'CA', false);

\echo ''
\echo '== 1. the delete policies, and the roles they apply to =='
\echo '   expect: "members can delete their own photo" {public}'
\echo '           "an administrator can delete any photo" {authenticated}'
\echo ''
\echo '   The role matters. is_admin() is executable by authenticated only, so a'
\echo '   policy left open to every role turns an anonymous delete attempt into'
\echo '   "permission denied for function is_admin" — denied either way, but the'
\echo '   error names an internal function and gives away what the policy tests.'
select policyname, roles::text, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and cmd = 'DELETE'
 order by policyname;

\echo ''
\echo '== 2. the administrator policy is delete-only (expect 1 row, DELETE) =='
\echo '   Nothing in the club needs one member''s photograph replaced by another,'
\echo '   and an insert policy would be a way to put a picture on a profile its'
\echo '   owner did not choose.'
select cmd, count(*) as policies
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname = 'an administrator can delete any photo'
 group by cmd;

\echo ''
\echo '== 3. the three member policies were not loosened (expect own-folder checks) =='
select policyname, cmd
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'members can%'
 order by cmd;

-- Everything below is a real RLS exercise, because inserts have no protective
-- trigger in the way.
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-5555-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 4. an administrator cannot PUT a photograph on somebody else (expect ERROR) =='
savepoint admin_writes;
insert into storage.objects (bucket_id, name)
values ('photos', 'bbbbbbbb-5555-0000-0000-00000000000b/planted.webp');
rollback to savepoint admin_writes;

\echo ''
\echo '== 5. ...and can still write their own (expect INSERT 0 1) =='
savepoint admin_own;
insert into storage.objects (bucket_id, name)
values ('photos', 'aaaaaaaa-5555-0000-0000-00000000000a/profile.webp');
rollback to savepoint admin_own;

\echo ''
\echo '== 6. a member cannot write into another member''s folder (expect ERROR) =='
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-5555-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
savepoint member_writes;
insert into storage.objects (bucket_id, name)
values ('photos', 'aaaaaaaa-5555-0000-0000-00000000000a/planted.webp');
rollback to savepoint member_writes;

rollback;

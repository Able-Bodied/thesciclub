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
-- Steps 1b and 7 are the chat bucket's (20260930030000): its three policies
-- name `authenticated`, and a signed-out visitor is refused without being
-- told the name of a function. `pnpm check-chat-photo-policy` is that
-- bucket's delete side, as check-photo-policy is this one's.
--
-- Steps 1 to 3 read the catalogue and are the superuser's, on purpose; steps
-- 4 to 7 are under a real role, and say which.
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

-- A chat photograph for step 7 to be refused, written as the superuser. With
-- no row in the bucket no policy expression is ever evaluated, and a refusal
-- that never had anything to refuse proves nothing.
insert into storage.objects (bucket_id, name, owner_id)
values ('chat', 'rooms/bowel/probe-photo-cleanup.webp', 'bbbbbbbb-5555-0000-0000-00000000000b');

\echo ''
\echo '== 0. the catalogue steps are the superuser''s (expect postgres) =='
select current_user;

\echo ''
\echo '== 1. the delete policies, and the roles they apply to =='
\echo '   expect three, in this order:'
\echo '           "an administrator can delete any photo" {authenticated}'
\echo '           "members can delete their own photo" {public}'
\echo '           "the uploader or an administrator deletes a chat photograph" {authenticated}'
\echo '   The member policy stays {public}: it calls auth.uid() and'
\echo '   storage.foldername(), which anon may execute, so it names nothing.'
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
\echo '== 1b. every policy on the chat bucket names authenticated =='
\echo '   expect three rows — DELETE, INSERT, SELECT — each {authenticated}.'
\echo '   Every one calls a function only authenticated may execute. Read by'
\echo '   the bucket its expression names rather than by policy name, so a'
\echo '   fourth chat policy written without a role shows up here too.'
select cmd, roles::text, policyname
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and coalesce(qual, with_check) like '%bucket_id = ''chat''::text%'
 order by cmd;

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

\echo ''
\echo '== 7. a signed-out visitor is refused by the chat bucket, and told nothing =='
\echo '   expect: anon | 0 chat files, with no error; then ERROR: new row'
\echo '   violates row-level security policy. Before 20260930030000 both said'
\echo '   "permission denied for function chat_file_is_…", naming what the'
\echo '   policy tests.'
set local role postgres;
select set_config('request.jwt.claims', '', true) is not null as ok;
set local role anon;
savepoint anon_reads;
select current_user, count(*) as chat_files_anon_sees
  from storage.objects where bucket_id = 'chat';
rollback to savepoint anon_reads;
savepoint anon_writes;
insert into storage.objects (bucket_id, name)
values ('chat', 'rooms/bowel/planted-by-nobody.webp');
rollback to savepoint anon_writes;

set local role postgres;
rollback;

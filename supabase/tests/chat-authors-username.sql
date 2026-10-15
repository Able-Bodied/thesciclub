-- ============================================================================
-- chat_authors carries @username (20261012010000)
-- ============================================================================
-- Conversation lists and the group member list read their people from
-- chat_authors. This proves, as signed-in roles:
--
--   1. a member reads another member's username through the view
--   2. the columns that were there are still there, in place
--   3. a signed-out visitor reads nothing (it is gated on is_member())
--   4. nothing is written through it (20261003020000 took that away)
--
-- Run against a local stack (never the hosted project):
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/chat-authors-username.sql
--
-- One transaction, rolled back. Every `expect` line below is what the output
-- must say; read the log against them.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '<null>'

begin;

insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at) values
  ('aaaaaaaa-1014-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader@probe.test', now()),
  ('aaaaaaaa-1014-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'named@probe.test',  now());

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state) values
  ('aaaaaaaa-1014-0000-0000-000000000001', 'peer', 'active', 'Reader', 'probe.reader', null, '1980-01-01', 'T1–T6', 'CA'),
  ('aaaaaaaa-1014-0000-0000-000000000002', 'peer', 'active', 'Named',  'probe.named',  null, '1980-01-01', 'T1–T6', 'CA');

-- As the reader.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-1014-0000-0000-000000000001","role":"authenticated"}', true);

\echo '1. expect: probe.named'
select username from public.chat_authors where id = 'aaaaaaaa-1014-0000-0000-000000000002';

\echo '2. expect: id,display_name,photo_path,photo_alt,avatar_color,level_range,exact_level,is_admin,has_profile,username,injury_type,condition_name'
\echo '   (the last two appended by 20261015000000)'
select string_agg(attname, ',' order by attnum) as columns
  from pg_attribute
 where attrelid = 'public.chat_authors'::regclass and attnum > 0 and not attisdropped;

\echo '3. expect: a refusal for the write (permission denied for view chat_authors)'
savepoint w;
update public.chat_authors set display_name = 'hijacked' where id = 'aaaaaaaa-1014-0000-0000-000000000002';
rollback to w;

-- As nobody.
reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

\echo '4. expect: a refusal (permission denied for view chat_authors) — a visitor reads nothing'
savepoint a;
select username from public.chat_authors;
rollback to a;

rollback;

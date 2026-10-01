-- ============================================================================
-- Who can read which photograph, now that the photos bucket is private
-- ============================================================================
-- 20261001000000 (HOME-PLAN.md step 6, part 2). A signed URL is granted only
-- when the select policy would let the caller read the row, so the policy is
-- the whole of who sees a face. Five files, six readers, and what each reads:
--
--   member    a member's photograph                  b…/profile.webp
--   logo      an organization's logo                 organizations/…
--   claimable the seeded profile C may claim         seed/probe-claimable.webp
--   other     a seeded profile nobody here may claim seed/probe-not-mine.webp
--   own       C's own upload, before C is a member   c…/profile.webp
--
-- Step 1 (a signed-out visitor reads nothing, and is told nothing) and step 5
-- (somebody mid-signup reads the logo, the face on their claim card and their
-- own upload, and not a member's photograph) are the ones that matter.
--
-- Every step is under a real role with its claims, and prints current_user.
-- The files are rows written as the superuser; there is nothing in storage
-- behind them, which a select policy never looks at. `pnpm check-photo-policy`
-- asks storage itself for signed URLs as these kinds of reader.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/photos-bucket-reads.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values
  ('bbbbbbbb-7777-0000-0000-00000000000b', 'peer', 'active',    'A Member',     '19990000071', '1981-01-01', 'T1–T6', 'CA'),
  ('dddddddd-7777-0000-0000-00000000000d', 'peer', 'suspended', 'Paused',       '19990000072', '1982-01-01', 'T1–T6', 'CA'),
  ('eeeeeeee-7777-0000-0000-00000000000e', 'peer', 'removed',   'Removed',      '19990000073', '1983-01-01', 'T1–T6', 'CA');

-- Two seeded profiles, each with a photograph. An organization invites C's
-- number and says it is the first of them.
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, photo_path, is_seed)
values
  ('a1a1a1a1-7777-0000-0000-0000000000a1', 'peer', 'active', 'Claimable Seed', '19990000074', '1984-01-01', 'T1–T6', 'CA', 'seed/probe-claimable.webp', true),
  ('a2a2a2a2-7777-0000-0000-0000000000a2', 'peer', 'active', 'Another Seed',   '19990000075', '1985-01-01', 'T1–T6', 'CA', 'seed/probe-not-mine.webp',  true);

insert into public.invites (phone_raw, invited_by_organization_id, seed_member_id)
select '9990000076', id, 'a1a1a1a1-7777-0000-0000-0000000000a1'
  from public.organizations where short_code = 'NCS';

insert into storage.objects (bucket_id, name, owner_id)
values
  ('photos', 'bbbbbbbb-7777-0000-0000-00000000000b/profile.webp', 'bbbbbbbb-7777-0000-0000-00000000000b'),
  ('photos', 'organizations/probe-logo.png', null),
  ('photos', 'seed/probe-claimable.webp', null),
  ('photos', 'seed/probe-not-mine.webp', null),
  ('photos', 'cccccccc-7777-0000-0000-00000000000c/profile.webp', 'cccccccc-7777-0000-0000-00000000000c');

-- Read as each caller: which of the five files they reach, by the names
-- above, in path order. security_invoker, or the view reads as its owner —
-- the superuser, who bypasses every policy — and every step says all five.
create temporary view probe_reads with (security_invoker = true) as
select string_agg(
         case
           when name like 'bbbbbbbb-7777%' then 'member'
           when name like 'organizations/probe%' then 'logo'
           when name = 'seed/probe-claimable.webp' then 'claimable'
           when name = 'seed/probe-not-mine.webp' then 'other'
           when name like 'cccccccc-7777%' then 'own'
         end, ', ' order by name) as reads
  from storage.objects
 where bucket_id = 'photos'
   and (name like '%-7777-%' or name like 'organizations/probe%' or name like 'seed/probe-%');
grant select on probe_reads to anon, authenticated;

\echo ''
\echo '== 0. the bucket is private, with one select policy for authenticated =='
\echo '   expect: f | then one row, {authenticated}, "a signed-in account reads the photographs it may see"'
select public from storage.buckets where id = 'photos';
select roles::text, policyname
  from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
   and qual like '%bucket_id = ''photos''::text%';

\echo ''
\echo '== 1. a signed-out visitor reads nothing, and no error names a function =='
\echo '   expect: anon | (empty)'
set local role anon;
select current_user, coalesce((select reads from probe_reads), '') as reads;
set local role postgres;

\echo ''
\echo '== 2. a member reads all five =='
\echo '   expect: authenticated | member, own, logo, claimable, other'
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-7777-0000-0000-00000000000b","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user, (select reads from probe_reads) as reads;
set local role postgres;

\echo ''
\echo '== 3. a suspended member still reads them: is_member() is the read gate =='
\echo '   expect: authenticated | member, own, logo, claimable, other'
select set_config('request.jwt.claims',
  '{"sub":"dddddddd-7777-0000-0000-00000000000d","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user, (select reads from probe_reads) as reads;
set local role postgres;

\echo ''
\echo '== 4. a removed member reads the logo only =='
\echo '   expect: authenticated | logo'
select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-7777-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;
set local role authenticated;
select current_user, (select reads from probe_reads) as reads;
set local role postgres;

\echo ''
\echo '== 5. somebody mid-signup, whose invite claims a seeded profile =='
\echo '   expect: authenticated | own, logo, claimable'
\echo '   Not "member", not "other": the claim card''s face, the logos on the'
\echo '   turned-away screen and their own upload, and nothing else.'
select set_config('request.jwt.claims',
  '{"sub":"cccccccc-7777-0000-0000-00000000000c","role":"authenticated","phone":"19990000076"}', true) is not null as ok;
set local role authenticated;
select current_user, (select reads from probe_reads) as reads;
set local role postgres;

\echo ''
\echo '== 6. signed in, on no invite: the logo only =='
\echo '   expect: authenticated | logo'
select set_config('request.jwt.claims',
  '{"sub":"ffffffff-7777-0000-0000-00000000000f","role":"authenticated","phone":"19990000077"}', true) is not null as ok;
set local role authenticated;
select current_user, (select reads from probe_reads) as reads;
set local role postgres;

\echo ''
\echo '== 7. anon cannot call the claim check behind the policy (expect ERROR: permission denied) =='
set local role anon;
savepoint anon_calls;
select public.photo_is_my_claimable('seed/probe-claimable.webp');
rollback to savepoint anon_calls;
set local role postgres;

rollback;

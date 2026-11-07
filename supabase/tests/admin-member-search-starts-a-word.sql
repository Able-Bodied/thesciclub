-- ============================================================================
-- Admin's member search starts a word (20261106080000)
-- ============================================================================
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres \
--     < supabase/tests/admin-member-search-starts-a-word.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin, username)
values
  ('aaaaaaaa-5ea0-0000-0000-00000000000a', 'peer', 'active', 'Probe Admin',   '15105550110', '1980-01-01', 'C5–C8', 'CA', true,  null),
  ('bbbbbbbb-5ea0-0000-0000-00000000000b', 'peer', 'active', 'Ran',           '15105550111', '1981-01-01', 'C5–C8', 'CA', false, null),
  ('cccccccc-5ea0-0000-0000-00000000000c', 'peer', 'active', 'Pranav Parakh', '15105550112', '1982-01-01', 'C5–C8', 'CA', false, 'pranav.parakh'),
  ('dddddddd-5ea0-0000-0000-00000000000d', 'peer', 'active', 'Grant Fox',     '15105550113', '1983-01-01', 'C5–C8', 'CA', false, null);

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-5ea0-0000-0000-00000000000a","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 1. "ran" (expect Ran only) =='
select display_name from public.admin_member_search('ran') where id::text like '%5ea0%' order by display_name;

\echo ''
\echo '== 2. "parakh", "pranav.par", "@pranav" (expect Pranav Parakh, three times) =='
select display_name from public.admin_member_search('parakh') where id::text like '%5ea0%';
select display_name from public.admin_member_search('pranav.par') where id::text like '%5ea0%';
select display_name from public.admin_member_search('@pranav') where id::text like '%5ea0%';

\echo ''
\echo '== 3. "fox gr" in any order (expect Grant Fox); "ant" (expect none of the three) =='
select display_name from public.admin_member_search('fox gr') where id::text like '%5ea0%';
select count(*) as ant from public.admin_member_search('ant') where id::text like '%5ea0%' and display_name <> 'Probe Admin';

\echo ''
\echo '== 4. a phone number''s last digits still match anywhere (expect Pranav Parakh) =='
select display_name from public.admin_member_search('0112') where id::text like '%5ea0%';
select display_name from public.admin_member_search('(510) 555-0112') where id::text like '%5ea0%';

\echo ''
\echo '== 5. odd characters are literal, not an error (expect 0, 0, 0) =='
select count(*) from public.admin_member_search('%') where id::text like '%5ea0%';
select count(*) from public.admin_member_search('(ran') where id::text like '%5ea0%';
select count(*) from public.admin_member_search('r.n') where id::text like '%5ea0%';

reset role;
rollback;

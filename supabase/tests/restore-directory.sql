-- ============================================================================
-- Does restoring the directory put back what it should, and leave alone what
-- it must?
-- ============================================================================
-- `admin_restore_directory()` writes to `members`, which is where real people
-- live, so the interesting assertions are the ones about what it does not
-- touch. Run as a signed-in administrator, the way the app calls it.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/restore-directory.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state, is_admin)
values ('aaaaaaaa-1111-1111-1111-111111111111', 'peer', 'active', 'The Admin',
        '19990000020', '1980-01-01', 'T1–T6', 'CA', true);

\echo ''
\echo '== the directory before anything happens (expect 22 seeded) =='
select count(*) as seeded from public.members where is_seed;

-- Ajay is claimed: his seeded row goes and a real member appears on his
-- number, which is what the claim trigger does.
delete from public.members where display_name = 'Ajay' and is_seed;
insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values ('bbbbbbbb-1111-1111-1111-111111111111', 'peer', 'active', 'Ajay',
        '15555550000', '1996-01-01', 'C5–C8', 'CA');

-- Bob is simply gone, with nobody on his number.
delete from public.members where display_name = 'Bob' and is_seed;

-- And Dante is still here but has been suspended and hidden mid-rehearsal.
update public.members set status = 'suspended', show_in_browse = false, city = 'Nowhere'
 where display_name = 'Dante' and is_seed;

select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-1111-1111-1111-111111111111","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

-- Everything below reads `admin_members`, not `members`. An administrator's
-- select policy on the table is own-row-only, so querying it here returns one
-- row whatever the restore did — which is how the first draft of this file
-- reported Bob missing, Dante unreset and Ajay absent while the function had
-- in fact done its job. Second time this trap has been hit in this directory.

\echo ''
\echo '== 1. an ordinary member cannot restore anything =='
\echo '   expect: ERROR:  Not an administrator'
savepoint not_admin;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-1111-1111-1111-111111111111","role":"authenticated"}', true) is not null as ok;
select public.admin_restore_directory();
rollback to savepoint not_admin;

\echo ''
\echo '== 2. restoring reports how many rows it touched =='
select public.admin_restore_directory() as rows_touched;

\echo ''
\echo '== 3. Bob is back (expect 1) =='
select count(*) as bob from public.admin_members where display_name = 'Bob' and is_seed;

\echo ''
\echo '== 4. Dante is reset, not merely present =='
\echo '   expect: active | t | Aptos'
select status, show_in_browse, city from public.admin_members where display_name = 'Dante' and is_seed;

\echo ''
\echo '== 5. Ajay is NOT put back, because somebody real is on his number =='
\echo '   expect one row: the real member, is_seed f'
select display_name, is_seed, id from public.admin_members where phone = '15555550000';

\echo ''
\echo '== 6. the real member was not overwritten by the snapshot =='
\echo '   expect: bbbbbbbb-… still, and still not seeded'
select count(*) as real_members_on_that_number
  from public.admin_members where phone = '15555550000' and not is_seed;

\echo ''
\echo '== 7. running it twice changes nothing further =='
\echo '   expect the same seeded count before and after'
select count(*) as seeded_before from public.admin_members where is_seed;
select public.admin_restore_directory() as rows_touched_again;
select count(*) as seeded_after from public.admin_members where is_seed;

\echo ''
\echo '== 8. the administrator''s own row is untouched (expect 1, not seeded) =='
select count(*) as admin_rows from public.admin_members
 where id = 'aaaaaaaa-1111-1111-1111-111111111111' and not is_seed and is_admin;

set local role postgres;
rollback;

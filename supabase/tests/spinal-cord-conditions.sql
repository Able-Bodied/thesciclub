-- ============================================================================
-- A spinal cord injury or a spinal cord condition (20261015000000)
-- ============================================================================
-- As signed-in members with request.jwt.claims set; the superuser only writes
-- the rows and reads the catalog. Read every answer against its expect line:
--
--   1. a member sets their own kind and condition, as Your details does
--   2. the row refuses what does not fit: an unknown kind, a condition's name
--      on any other kind, a blank, padded or over-long name
--   3. another member reads them through browse_members and chat_authors;
--      event_attendees carries them; all three keep their security barrier
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/spinal-cord-conditions.sql
--
-- One transaction, rolled back; each expected refusal in its own savepoint.
-- ============================================================================

\set ON_ERROR_STOP off
\set VERBOSITY terse
\pset pager off
\pset null '<null>'

begin;

insert into public.members (id, type, status, display_name, username, birth_date, level_range, state, show_in_browse) values
  ('aaaaaaaa-1016-0000-0000-000000000001', 'peer', 'active', 'Dana Probe', 'probe.dana1016', '1990-01-01', 'Not sure yet', 'CA', true),
  ('aaaaaaaa-1016-0000-0000-000000000002', 'peer', 'active', 'Sam Probe',  'probe.sam1016',  '1990-01-01', 'T1–T6',        'CA', true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-1016-0000-0000-000000000001","role":"authenticated"}';

-- =================================================== 1. a member sets them ==
\echo '== 1. a member sets their own =='
\echo '   expect: UPDATE 1 three times (a condition with a level, central cord, back to none)'
update public.members set injury_type = 'condition', condition_name = 'Transverse myelitis', exact_level = 'T8', level_range = 'T7–T12'
 where id = 'aaaaaaaa-1016-0000-0000-000000000001';
update public.members set injury_type = 'central_cord', condition_name = null, exact_level = 'C5', level_range = 'C5–C8'
 where id = 'aaaaaaaa-1016-0000-0000-000000000001';
update public.members set injury_type = null, condition_name = null
 where id = 'aaaaaaaa-1016-0000-0000-000000000001';

-- ============================================================ 2. refusals ===
\echo '== 2. what the row refuses =='
\echo '   expect: ERROR ... members_injury_type_check'
savepoint bad_kind;
update public.members set injury_type = 'tetra' where id = 'aaaaaaaa-1016-0000-0000-000000000001';
rollback to savepoint bad_kind;
\echo '   expect: ERROR ... members_condition_name_needs_condition (twice: on a para, and with no kind)'
savepoint name_on_para;
update public.members set injury_type = 'para', condition_name = 'Spina bifida' where id = 'aaaaaaaa-1016-0000-0000-000000000001';
rollback to savepoint name_on_para;
savepoint name_alone;
update public.members set injury_type = null, condition_name = 'Spina bifida' where id = 'aaaaaaaa-1016-0000-0000-000000000001';
rollback to savepoint name_alone;
\echo '   expect: ERROR ... members_condition_name_check (three times: blank, padded, 101 characters)'
savepoint blank;
update public.members set injury_type = 'condition', condition_name = '' where id = 'aaaaaaaa-1016-0000-0000-000000000001';
rollback to savepoint blank;
savepoint padded;
update public.members set injury_type = 'condition', condition_name = ' Spina bifida' where id = 'aaaaaaaa-1016-0000-0000-000000000001';
rollback to savepoint padded;
savepoint too_long;
update public.members set injury_type = 'condition', condition_name = repeat('x', 101) where id = 'aaaaaaaa-1016-0000-0000-000000000001';
rollback to savepoint too_long;
\echo '   expect: UPDATE 1 three times (100 characters; a condition with no name yet; then Spina bifida)'
update public.members set injury_type = 'condition', condition_name = repeat('x', 100) where id = 'aaaaaaaa-1016-0000-0000-000000000001';
update public.members set injury_type = 'condition', condition_name = null where id = 'aaaaaaaa-1016-0000-0000-000000000001';
update public.members set injury_type = 'condition', condition_name = 'Spina bifida' where id = 'aaaaaaaa-1016-0000-0000-000000000001';

-- ======================================================== 3. who sees them ==
\echo '== 3. another member reads them =='
set local request.jwt.claims = '{"sub":"aaaaaaaa-1016-0000-0000-000000000002","role":"authenticated"}';
\echo '   expect: condition | Spina bifida, twice (browse_members, chat_authors)'
select injury_type, condition_name from public.browse_members where id = 'aaaaaaaa-1016-0000-0000-000000000001';
select injury_type, condition_name from public.chat_authors where id = 'aaaaaaaa-1016-0000-0000-000000000001';

reset role;
\echo '   expect: injury_type and condition_name are columns of event_attendees (2)'
select count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'event_attendees' and column_name in ('injury_type', 'condition_name');
\echo '   expect three rows, each {security_barrier=true}'
select relname, reloptions from pg_class
 where relnamespace = 'public'::regnamespace and relname in ('browse_members', 'chat_authors', 'event_attendees')
 order by relname;
\echo '   expect: 0 (anon still reads none of them)'
select count(*) from (values ('browse_members'), ('chat_authors'), ('event_attendees')) v(t)
 where has_table_privilege('anon', 'public.' || v.t, 'select');

rollback;

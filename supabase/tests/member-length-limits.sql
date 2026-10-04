-- ============================================================================
-- Can a member save a profile field of any size with their own session?
-- ============================================================================
-- Before 20261003100000 the only limits on what a member writes about
-- themselves were the forms', and most forms had none: a member with dev
-- tools could save a megabyte as their bio, which every member who opens the
-- deck then downloads.
--
-- Run as a real signed-in member, not as the superuser: "members can update
-- own row" is the door being tested, and postgres is BYPASSRLS. Every expected
-- refusal sits in its own savepoint.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/member-length-limits.sql
--
-- Rolls back. Do not point it at the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
\pset pager off

begin;

insert into public.members (id, type, status, display_name, phone, birth_date, level_range, state)
values ('eeeeeeee-5555-0000-0000-00000000000e', 'peer', 'active', 'Writer', '19990000050', '1985-01-01', 'C5–C8', 'CA');

select set_config('request.jwt.claims',
  '{"sub":"eeeeeeee-5555-0000-0000-00000000000e","role":"authenticated"}', true) is not null as ok;
set local role authenticated;

\echo ''
\echo '== 0. we are the member, signed in (expect authenticated) =='
select current_user;

\echo ''
\echo '== 1. a bio at the limit, 2,000 characters (expect UPDATE 1) =='
update public.members set bio = repeat('a', 2000) where id = 'eeeeeeee-5555-0000-0000-00000000000e';

\echo ''
\echo '== 2. a bio one past it (expect ERROR: ... violates check constraint "members_bio_length") =='
savepoint long_bio;
update public.members set bio = repeat('a', 2001) where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint long_bio;

\echo ''
\echo '== 3. a megabyte as a bio (expect ERROR: ... violates check constraint "members_bio_length") =='
savepoint huge_bio;
update public.members set bio = repeat('a', 1048576) where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint huge_bio;

\echo ''
\echo '== 4. a 61-character name (expect ERROR: ... violates check constraint "members_display_name_length") =='
savepoint long_name;
update public.members set display_name = repeat('n', 61) where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint long_name;

\echo ''
\echo '== 5. a 201-character photo description (expect ERROR: ... violates check constraint "members_photo_alt_length") =='
savepoint long_alt;
update public.members set photo_alt = repeat('p', 201) where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint long_alt;

\echo ''
\echo '== 6. 41 topics (expect ERROR: ... violates check constraint "members_topics_size") =='
savepoint many_topics;
update public.members set topics = array(select 't' || g from generate_series(1, 41) g)
 where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint many_topics;

\echo ''
\echo '== 7. three topics of 2,000 characters each (expect ERROR: ... violates check constraint "members_topics_size") =='
savepoint long_topics;
update public.members set topics = array[repeat('x', 2000), repeat('y', 2000), repeat('z', 2000)]
 where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint long_topics;

\echo ''
\echo '== 8. 6,000 characters of city (expect ERROR: ... violates check constraint "members_city_length") =='
savepoint long_city;
update public.members set city = repeat('c', 6000) where id = 'eeeeeeee-5555-0000-0000-00000000000e';
rollback to savepoint long_city;

\echo ''
\echo '== 9. an ordinary profile still saves, and an empty one (expect UPDATE 1, then UPDATE 1) =='
update public.members
   set display_name = 'Writer Two', city = 'Oakland', photo_alt = 'Me at Ocean Beach',
       topics = array['Bowel program', 'Driving with hand controls'], how_injured = 'Car accident, 2013'
 where id = 'eeeeeeee-5555-0000-0000-00000000000e';
update public.members set city = null, bio = null, photo_alt = null, topics = '{}'
 where id = 'eeeeeeee-5555-0000-0000-00000000000e';

\echo ''
\echo '== 10. what is on the row after all that (expect Writer Two | | 0) =='
select display_name, coalesce(bio, '') as bio, cardinality(topics) as topics
  from public.members where id = 'eeeeeeee-5555-0000-0000-00000000000e';

rollback;

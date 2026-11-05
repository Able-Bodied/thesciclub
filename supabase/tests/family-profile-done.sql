-- ============================================================================
-- Probe: family and professionals finish without the injury questions
-- (20261104130000)
-- ============================================================================
-- Every check prints PASS or raises FAIL.
--
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--     -f - < supabase/tests/family-profile-done.sql
--
-- One transaction, rolled back.
-- ============================================================================

\set ON_ERROR_STOP on
\set VERBOSITY terse
\pset pager off

begin;

-- f family, r professional, q quad, n no kind given; each answers only what
-- family are asked.
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
select ('aaaaaaaa-1108-0000-0000-00000000000' || x)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'done-' || x || '@probe.test', now()
  from unnest(array['a', 'b', 'c', 'd']) x;
insert into public.members (id, type, status, display_name, birth_date, level_range, state, is_admin,
                            injury_type, gender, languages, bio, topics, marital_status,
                            has_children, education, education_when, field_of_work)
select ('aaaaaaaa-1108-0000-0000-00000000000' || x)::uuid, 'peer', 'active', 'Probe ' || x,
       '1980-01-01', 'T1–T6', 'CA', false, kind, 'Female', array['English'], 'A bio',
       array['Travel'], 'Married', false, 'Bachelor''s degree', 'Before', 'Teaching'
  from (values ('a', 'family'), ('b', 'professional'), ('c', 'quad'), ('d', null)) v(x, kind);

create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.done(who text) returns boolean language sql as $$
  select public.member_profile_done(m) from public.members m
   where m.id = ('aaaaaaaa-1108-0000-0000-00000000000' || who)::uuid;
$$;

select pg_temp.check_true(pg_temp.done('a'), 'family finish without the injury questions');
select pg_temp.check_true(pg_temp.done('b'), 'and professionals');
select pg_temp.check_true(pg_temp.done('c') = false, 'a member with an injury does not');
select pg_temp.check_true(pg_temp.done('d') = false, 'nor one who gave no kind');

update public.members set bio = null where id = 'aaaaaaaa-1108-0000-0000-00000000000a';
select pg_temp.check_true(pg_temp.done('a') = false, 'family still answer the rest');

update public.members
   set how_injured = 'A fall', independence = 'Completely independent', employment = 'Full time',
       interests = array['Travel'], sports_equipment = 'A handcycle', grants = 'None',
       self_care = array['None'], wants_to_mentor = true
 where id = 'aaaaaaaa-1108-0000-0000-00000000000c';
select pg_temp.check_true(pg_temp.done('c'), 'and a member with an injury finishes with them');

\echo '== done: every line above PASS =='
rollback;

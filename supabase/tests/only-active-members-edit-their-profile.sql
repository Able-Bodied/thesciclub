-- ============================================================================
-- Only an active member edits their own profile (20261104210000)
-- ============================================================================
-- An active, a suspended and a removed member each try to change their name,
-- bio and photo path, their username, and the photographs in their folder.
-- Only the active one can. Nobody changes their own status, an administrator
-- still changes another member, and a joiner still uploads a photograph before
-- their row exists, joins, and fills in their profile.
--
-- One transaction, rolled back, each expected refusal in its own savepoint.
-- Before 20261104210000, steps 5-13 went through.
--   docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--     psql -h 127.0.0.1 -p <port> -U postgres -d postgres \
--     -f - < supabase/tests/only-active-members-edit-their-profile.sql
-- Never the hosted project.
-- ============================================================================

\set ON_ERROR_STOP off
-- An unexpected error in a step that should affect 0 rows undoes that step
-- only, so the rest still runs and steps 15-16 show what got through.
\set ON_ERROR_ROLLBACK on
\pset pager off
begin;
-- The Storage API deletes this way; without it every delete is refused by
-- storage.protect_delete, whoever asks (as organization-logos.sql).
set local storage.allow_delete_query = 'true';

insert into public.members (id, type, status, display_name, username, phone, birth_date, level_range, state, bio) values
  ('a0000000-1103-0000-0000-000000000001', 'peer', 'active',    'Act', 'probe.act', '19991103001', '1980-01-01', 'T1–T6', 'CA', 'old'),
  ('a0000000-1103-0000-0000-000000000002', 'peer', 'suspended', 'Sus', 'probe.sus', '19991103002', '1980-01-01', 'T1–T6', 'CA', 'old'),
  ('a0000000-1103-0000-0000-000000000003', 'peer', 'removed',   'Rem', 'probe.rem', '19991103003', '1980-01-01', 'T1–T6', 'CA', 'old');
insert into storage.objects (bucket_id, name, owner_id) values
  ('photos', 'a0000000-1103-0000-0000-000000000001/profile.jpg', 'a0000000-1103-0000-0000-000000000001'),
  ('photos', 'a0000000-1103-0000-0000-000000000002/profile.jpg', 'a0000000-1103-0000-0000-000000000002'),
  ('photos', 'a0000000-1103-0000-0000-000000000003/profile.jpg', 'a0000000-1103-0000-0000-000000000003');

-- The removed member's account, which agreeing to the terms names (step 23).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('a0000000-1103-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'removed.1103@probe.test', now());
-- A joiner: a confirmed account with an invite, no members row yet.
insert into public.invites (email, invited_by_organization_id, note)
select 'joiner.1103@probe.test', id, 'probe' from public.organizations where short_code = 'NCS';
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at)
values ('a0000000-1103-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'joiner.1103@probe.test', now());

-- What one probe member's row says, read as the superuser.
create function pg_temp.row_of(who uuid) returns text language sql as $$
  select concat_ws(' | ', display_name, bio, coalesce(photo_path, '-'), username::text, status)
    from public.members where id = who;
$$;
grant execute on function pg_temp.row_of(uuid) to authenticated;

-- ============================================================ the active one
set local request.jwt.claims = '{"sub":"a0000000-1103-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

\echo '== 1. an active member edits their name, bio and photo path =='
\echo '   expect: UPDATE 1'
update public.members
   set display_name = 'Act renamed', bio = 'new', photo_path = 'a0000000-1103-0000-0000-000000000001/profile.jpg'
 where id = 'a0000000-1103-0000-0000-000000000001';

\echo '== 2. ...and their username =='
\echo '   expect: no error'
select public.set_my_username('probe.act2');

\echo '== 3. ...and uploads, replaces and deletes their own photographs =='
\echo '   expect: INSERT 0 1, UPDATE 1, DELETE 1'
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'a0000000-1103-0000-0000-000000000001/profile-thumb.jpg', 'a0000000-1103-0000-0000-000000000001');
update storage.objects set metadata = '{"size":1}' where bucket_id = 'photos' and name = 'a0000000-1103-0000-0000-000000000001/profile.jpg';
delete from storage.objects where bucket_id = 'photos' and name = 'a0000000-1103-0000-0000-000000000001/profile-thumb.jpg';

\echo '== 4. an active member cannot change their own status =='
\echo '   expect: ERROR: Membership status is changed by an administrator'
savepoint own_status;
update public.members set status = 'suspended' where id = 'a0000000-1103-0000-0000-000000000001';
rollback to savepoint own_status;

-- ========================================================= the suspended one
set local role postgres;
set local request.jwt.claims = '{"sub":"a0000000-1103-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

\echo ''
\echo '== 5. a suspended member edits their name, bio and photo path =='
\echo '   expect: UPDATE 0'
update public.members
   set display_name = 'Sus renamed', bio = 'new', photo_path = 'a0000000-1103-0000-0000-000000000002/profile.jpg'
 where id = 'a0000000-1103-0000-0000-000000000002';

\echo '== 6. ...or their username =='
\echo '   expect: ERROR: Your membership is paused, so your profile cannot be changed.'
savepoint sus_username;
select public.set_my_username('probe.sus2');
rollback to savepoint sus_username;

\echo '== 7. ...or uploads a photograph into their folder =='
\echo '   expect: ERROR: new row violates row-level security policy for table "objects"'
savepoint sus_upload;
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'a0000000-1103-0000-0000-000000000002/profile-new.jpg', 'a0000000-1103-0000-0000-000000000002');
rollback to savepoint sus_upload;

\echo '== 8. ...or replaces or deletes the one there =='
\echo '   expect: UPDATE 0, DELETE 0'
update storage.objects set metadata = '{"size":1}' where bucket_id = 'photos' and name = 'a0000000-1103-0000-0000-000000000002/profile.jpg';
delete from storage.objects where bucket_id = 'photos' and name = 'a0000000-1103-0000-0000-000000000002/profile.jpg';

\echo '== 9. ...or makes themselves active =='
\echo '   expect: UPDATE 0'
update public.members set status = 'active' where id = 'a0000000-1103-0000-0000-000000000002';

-- =========================================================== the removed one
set local role postgres;
set local request.jwt.claims = '{"sub":"a0000000-1103-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;

\echo ''
\echo '== 10. a removed member edits their name, bio and photo path =='
\echo '   expect: UPDATE 0'
update public.members
   set display_name = 'Rem renamed', bio = 'new', photo_path = 'a0000000-1103-0000-0000-000000000003/profile.jpg'
 where id = 'a0000000-1103-0000-0000-000000000003';

\echo '== 11. ...or their username =='
\echo '   expect: ERROR: Your membership is paused, so your profile cannot be changed.'
savepoint rem_username;
select public.set_my_username('probe.rem2');
rollback to savepoint rem_username;

\echo '== 12. ...or uploads a photograph into their folder =='
\echo '   expect: ERROR: new row violates row-level security policy for table "objects"'
savepoint rem_upload;
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'a0000000-1103-0000-0000-000000000003/profile-new.jpg', 'a0000000-1103-0000-0000-000000000003');
rollback to savepoint rem_upload;

\echo '== 13. ...or replaces or deletes the one there =='
\echo '   expect: UPDATE 0, DELETE 0'
update storage.objects set metadata = '{"size":1}' where bucket_id = 'photos' and name = 'a0000000-1103-0000-0000-000000000003/profile.jpg';
delete from storage.objects where bucket_id = 'photos' and name = 'a0000000-1103-0000-0000-000000000003/profile.jpg';

\echo '== 14. ...or makes themselves active =='
\echo '   expect: UPDATE 0'
update public.members set status = 'active' where id = 'a0000000-1103-0000-0000-000000000003';

-- ============================================================ what was kept
set local role postgres;

\echo ''
\echo '== 15. the rows afterwards =='
\echo '   expect: Act renamed | new | a0000000-1103-0000-0000-000000000001/profile.jpg | probe.act2 | active'
\echo '           Sus | old | - | probe.sus | suspended'
\echo '           Rem | old | - | probe.rem | removed'
select pg_temp.row_of('a0000000-1103-0000-0000-000000000001') as act
union all select pg_temp.row_of('a0000000-1103-0000-0000-000000000002')
union all select pg_temp.row_of('a0000000-1103-0000-0000-000000000003');

\echo '== 16. the photographs afterwards: each member''s profile.jpg, nothing new or changed =='
\echo '   expect: 3 rows: ...0001/profile.jpg | t, ...0002/profile.jpg | f, ...0003/profile.jpg | f'
select name, metadata is not null as changed from storage.objects
 where bucket_id = 'photos' and name like 'a0000000-1103-%' order by name;

-- =========================================================== the administrator
set local request.jwt.claims = '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

\echo ''
\echo '== 17. an administrator reinstates the suspended member, and makes the active one a mentor =='
\echo '   expect: no error, twice'
select public.admin_set_member_status('a0000000-1103-0000-0000-000000000002', 'active');
select public.admin_set_member_type('a0000000-1103-0000-0000-000000000001', 'mentor');

set local role postgres;
set local request.jwt.claims = '{"sub":"a0000000-1103-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

\echo '== 18. reinstated, they edit their profile again =='
\echo '   expect: UPDATE 1'
update public.members set bio = 'back' where id = 'a0000000-1103-0000-0000-000000000002';

-- ================================================================= the joiner
set local role postgres;
set local request.jwt.claims = '{"sub":"a0000000-1103-0000-0000-000000000004","role":"authenticated"}';
set local role authenticated;

\echo ''
\echo '== 19. a joiner, with no row yet, uploads their photograph (onboarding does this first) =='
\echo '   expect: INSERT 0 1'
insert into storage.objects (bucket_id, name, owner_id)
values ('photos', 'a0000000-1103-0000-0000-000000000004/profile.jpg', 'a0000000-1103-0000-0000-000000000004');

\echo '== 20. ...joins, as an active peer with that photograph =='
\echo '   expect: INSERT 0 1'
insert into public.members (id, display_name, username, birth_date, level_range, state, photo_path)
values ('a0000000-1103-0000-0000-000000000004', 'Joiner', 'probe.joiner', '1985-01-01', 'T1–T6', 'CA',
        'a0000000-1103-0000-0000-000000000004/profile.jpg');

\echo '== 21. ...and fills in their profile =='
\echo '   expect: UPDATE 1, then: Joiner | hello | a0000000-1103-0000-0000-000000000004/profile.jpg | probe.joiner | active'
update public.members set bio = 'hello', city = 'Fresno' where id = 'a0000000-1103-0000-0000-000000000004';
select pg_temp.row_of('a0000000-1103-0000-0000-000000000004') as joiner;

set local role postgres;
\echo ''
\echo '== 22. the administrator''s changes =='
\echo '   expect: Act renamed | new | ...0001/profile.jpg | probe.act2 | active, type mentor'
\echo '           Sus | back | - | probe.sus | active'
select pg_temp.row_of('a0000000-1103-0000-0000-000000000001') || ' | ' || (select type from public.members where id = 'a0000000-1103-0000-0000-000000000001') as act
union all select pg_temp.row_of('a0000000-1103-0000-0000-000000000002');

-- ===================================================== what a removed one keeps
-- Security definer doors, which the members rule does not judge.
set local request.jwt.claims = '{"sub":"a0000000-1103-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;

\echo ''
\echo '== 23. a removed member still agrees to the terms, and deletes their account =='
\echo '   expect: no error, twice; then 0 (their row is gone)'
select public.agree_to_terms(date '2026-11-03');
select public.delete_my_account();
set local role postgres;
select count(*) as removed_row_left from public.members where id = 'a0000000-1103-0000-0000-000000000003';

rollback;

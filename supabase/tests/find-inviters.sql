-- Asking somebody you know for an invite (20261011000000).
-- Run locally only. Signed-in roles, each refusal in a savepoint; all rolled back.
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/find-inviters.sql
\set ON_ERROR_STOP off
\pset pager off
begin;
insert into public.members (id,type,status,display_name,phone,birth_date,level_range,state,is_admin,findable_for_invites) values
('aaaaaaaa-9494-0000-0000-000000000001','mentor','active','Findable mentor','19990009501','1980-01-01','T1–T6','CA',false,true),
('aaaaaaaa-9494-0000-0000-000000000002','mentor','active','Hidden mentor','19990009502','1980-01-01','T1–T6','CA',false,false),
('aaaaaaaa-9494-0000-0000-000000000003','peer','active','A peer','19990009503','1980-01-01','T1–T6','CA',false,true),
('aaaaaaaa-9494-0000-0000-000000000004','mentor','suspended','Paused mentor','19990009504','1980-01-01','T1–T6','CA',false,true),
('aaaaaaaa-9494-0000-0000-000000000005','peer','active','An admin','19990009505','1980-01-01','T1–T6','CA',true,true),
('aaaaaaaa-9494-0000-0000-000000000006','organization','active','An organization','19990009506','1980-01-01','T1–T6','CA',false,true);
insert into public.invites (phone_raw, invited_by_member_id) values ('19990009599', 'aaaaaaaa-9494-0000-0000-000000000005');
set local role authenticated;

\echo '== 1. somebody verified and not on the list: expect authenticated, then t | t =='
set local request.jwt.claims='{"sub":"bbbbbbbb-9494-0000-0000-000000000001","phone":"19990009590","role":"authenticated"}';
select current_user;
select array_agg(phone order by phone) = array['19990009501','19990009505','19990009506'] as finds_who_can_invite
  from public.find_inviters(array[
    '(999) 000-9501', '19990009502', '19990009503', '19990009504', '+1 999 000 9505',
    '19990009506', '19990009590', '19990009555'
  ]);
select count(*) = 0 as own_number_never_matched from public.find_inviters(array['19990009590']);

\echo '== 2. five looks a day, and 100 numbers a look: expect t, then two ERRORs =='
-- Section 1 made one look: asking only about your own number asks nothing,
-- so it is not counted. Four more reach the limit.
select count(*) = 1 from public.find_inviters(array['19990009501']);
select count(*) = 1 from public.find_inviters(array['19990009501']);
select count(*) = 1 from public.find_inviters(array['19990009501']);
select count(*) = 1 as fifth_look_answered from public.find_inviters(array['19990009501']);
savepoint sixth;
select public.find_inviters(array['19990009501']);
rollback to sixth;
set local request.jwt.claims='{"sub":"bbbbbbbb-9494-0000-0000-000000000002","phone":"19990009591","role":"authenticated"}';
savepoint too_many;
select public.find_inviters(array(select '1999001' || lpad(i::text, 4, '0') from generate_series(1, 101) i));
rollback to too_many;

\echo '== 3. nobody with a way in already, and nobody signed out: expect three ERRORs =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9494-0000-0000-000000000003","phone":"19990009503","role":"authenticated"}';
savepoint member_asks;
select public.find_inviters(array['19990009501']);
rollback to member_asks;
set local request.jwt.claims='{"sub":"bbbbbbbb-9494-0000-0000-000000000003","phone":"19990009599","role":"authenticated"}';
savepoint invited_asks;
select public.find_inviters(array['19990009501']);
rollback to invited_asks;
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
savepoint anon_asks;
select public.find_inviters(array['19990009501']);
rollback to anon_asks;

\echo '== 4. the record of looks is nobody''s to read, and keeps no numbers: expect one ERROR, then t =='
set local role authenticated;
set local request.jwt.claims='{"sub":"bbbbbbbb-9494-0000-0000-000000000001","phone":"19990009590","role":"authenticated"}';
savepoint read_lookups;
select * from public.invite_lookups;
rollback to read_lookups;
reset role;
select not exists (
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'invite_lookups' and column_name ilike '%phone%'
) as no_numbers_kept;
rollback;

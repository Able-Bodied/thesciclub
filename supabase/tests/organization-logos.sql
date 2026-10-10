-- Organization logos set by whoever edits the organization (20261009040000).
-- Run locally only. Signed-in roles, each refusal in a savepoint; all rolled back.
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/organization-logos.sql
--
-- Files are rows inserted into storage.objects as the signed-in role, which is
-- what the Storage API does under the caller's policies. Deleting directly is
-- refused by storage.protect_delete() before any policy is asked, so section 5
-- sets storage.allow_delete_query for this transaction: then the delete
-- policies alone decide, and a refusal is zero rows rather than an error.
\set ON_ERROR_STOP off
\pset pager off
begin;
set local storage.allow_delete_query = 'true';
insert into public.members (id,type,status,display_name,phone,birth_date,level_range,state,is_admin) values
('aaaaaaaa-9191-0000-0000-000000000001','mentor','active','Logo admin','19990009201','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-9191-0000-0000-000000000002','organization','active','Logo organization','19990009202','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9191-0000-0000-000000000003','peer','active','Logo representative','19990009203','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9191-0000-0000-000000000004','peer','active','Logo member','19990009204','1980-01-01','T1–T6','CA',false);
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000001","role":"authenticated"}';
select public.save_organization(null,'LGOA','Logo probe','Test region','',array[]::text[],true) as org \gset
select public.save_organization(null,'LGOB','Other logo probe','Test region','',array[]::text[],true) as other \gset
select public.admin_add_representative(:'org','aaaaaaaa-9191-0000-0000-000000000002');
select public.admin_add_representative(:'org','aaaaaaaa-9191-0000-0000-000000000003');

\echo '== 1. an administrator uploads and sets a logo: expect authenticated, then t | t =='
select current_user;
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/' || :'org' || '/first.webp', auth.uid()::text);
select public.set_organization_logo(:'org', 'organizations/' || :'org' || '/first.webp') is null as no_previous;
select logo_path = 'organizations/' || :'org' || '/first.webp' as logo_set from public.organizations where id = :'org';

\echo '== 2. the linked organization account replaces it: expect t | t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000002","role":"authenticated"}';
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/' || :'org' || '/second.webp', auth.uid()::text);
select public.set_organization_logo(:'org', 'organizations/' || :'org' || '/second.webp') = 'organizations/' || :'org' || '/first.webp' as returns_previous;
select logo_path = 'organizations/' || :'org' || '/second.webp' as logo_replaced from public.organizations where id = :'org';

\echo '== 3. uploads outside what the caller edits: expect four ERRORs (row-level security) =='
savepoint other_folder;
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/' || :'other' || '/x.webp', auth.uid()::text);
rollback to other_folder;
savepoint not_a_uuid;
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/not-a-uuid/x.webp', auth.uid()::text);
rollback to not_a_uuid;
savepoint folder_root;
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/x.webp', auth.uid()::text);
rollback to folder_root;
-- A representative who is not an organization account edits nothing.
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000003","role":"authenticated"}';
savepoint representative_upload;
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/' || :'org' || '/rep.webp', auth.uid()::text);
rollback to representative_upload;

\echo '== 4. pointing a logo where it should not: expect five ERRORs =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000004","role":"authenticated"}';
savepoint member_sets;
select public.set_organization_logo(:'org', null);
rollback to member_sets;
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000002","role":"authenticated"}';
savepoint unrelated_org;
select public.set_organization_logo(:'other', null);
rollback to unrelated_org;
savepoint wrong_folder;
select public.set_organization_logo(:'org', 'organizations/' || :'other' || '/x.webp');
rollback to wrong_folder;
savepoint not_uploaded;
select public.set_organization_logo(:'org', 'organizations/' || :'org' || '/missing.webp');
rollback to not_uploaded;
savepoint traversal;
select public.set_organization_logo(:'org', 'organizations/' || :'org' || '/../ncs.webp');
rollback to traversal;

\echo '== 5. deleting: expect t | t | t | t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000004","role":"authenticated"}';
with gone as (delete from storage.objects where bucket_id = 'photos' and name = 'organizations/' || :'org' || '/first.webp' returning 1)
select count(*) = 0 as member_cannot_delete from gone;
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000002","role":"authenticated"}';
with gone as (delete from storage.objects where bucket_id = 'photos' and name = 'organizations/' || :'org' || '/first.webp' returning 1)
select count(*) = 1 as editor_deletes_old from gone;
-- Two statements: one statement reads the row as it was when it began.
select public.set_organization_logo(:'org', null) = 'organizations/' || :'org' || '/second.webp' as clear_returns_previous;
select logo_path is null as logo_cleared from public.organizations where id = :'org';

\echo '== 6. a removed organization takes no logo: expect one ERROR =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000001","role":"authenticated"}';
select public.admin_remove_organization(:'org');
savepoint removed_org;
insert into storage.objects (bucket_id, name, owner_id) values ('photos', 'organizations/' || :'org' || '/late.webp', auth.uid()::text);
rollback to removed_org;
rollback;

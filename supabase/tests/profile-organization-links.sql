-- Profile badges expose only administrator links on visible profiles.
-- Run locally only; transaction rolls back every fixture and administrative action.
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/profile-organization-links.sql
\set ON_ERROR_STOP off
\pset pager off
begin;
insert into public.members (id,type,status,display_name,phone,birth_date,level_range,state,is_admin,show_in_browse) values
('aaaaaaaa-9191-0000-0000-000000000001','mentor','active','Badge administrator','19990009801','1980-01-01','T1–T6','CA',true,true),
('aaaaaaaa-9191-0000-0000-000000000002','peer','active','Badge representative','19990009802','1980-01-01','T1–T6','CA',false,true),
('aaaaaaaa-9191-0000-0000-000000000003','peer','active','Badge reader','19990009803','1980-01-01','T1–T6','CA',false,true);
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000001","role":"authenticated"}';
select public.save_organization(null,'BDGA','Badge A','Test city','',array[]::text[],false) as org_a \gset
select public.save_organization(null,'BDGB','Badge B','Test city','',array[]::text[],false) as org_b \gset
select public.admin_add_representative(:'org_b','aaaaaaaa-9191-0000-0000-000000000002');
select public.admin_add_representative(:'org_a','aaaaaaaa-9191-0000-0000-000000000002');
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000003","role":"authenticated"}';
\echo '== Ordinary member sees both linked identities, sorted, and no invented links: expect three t =='
select jsonb_array_length(represented_organizations)=2 and represented_organizations->0->>'name'='Badge A' and represented_organizations->1->>'id'=:'org_b' as sorted_links from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002';
select represented_organizations='[]'::jsonb as no_invented_links from public.browse_members where id=auth.uid();
select not (represented_organizations->0 ? 'added_by') and not (represented_organizations->0 ? 'phone') as identities_only from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002';
\echo '== Private representative table remains inaccessible: expect one ERROR =='
savepoint private_table;
select * from public.organization_representatives;
rollback to private_table;
\echo '== Unlinking and archiving remove their badges: expect two t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000001","role":"authenticated"}';
select public.admin_remove_representative(:'org_a','aaaaaaaa-9191-0000-0000-000000000002');
select jsonb_array_length(represented_organizations)=1 as unlinked_hidden from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002';
select public.admin_remove_organization(:'org_b');
select represented_organizations='[]'::jsonb as removed_hidden from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002';
\echo '== Archived organization with a historical link stays hidden: expect one t =='
reset role;
insert into public.organization_representatives (organization_id,member_id,added_by) values (:'org_b','aaaaaaaa-9191-0000-0000-000000000002','aaaaaaaa-9191-0000-0000-000000000001');
set local role authenticated;
select represented_organizations='[]'::jsonb as archived_hidden from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002';
\echo '== Hidden and paused profiles keep the browse gate: expect two t =='
reset role;
update public.members set show_in_browse=false where id='aaaaaaaa-9191-0000-0000-000000000002';
set local role authenticated;
select not exists(select 1 from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002') as private_profile_hidden;
reset role;
update public.members set show_in_browse=true,status='suspended' where id='aaaaaaaa-9191-0000-0000-000000000002';
set local role authenticated;
select not exists(select 1 from public.browse_members where id='aaaaaaaa-9191-0000-0000-000000000002') as paused_profile_hidden;
\echo '== Nonmembers see no profile rows: expect one t =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9191-0000-0000-000000000099","role":"authenticated"}';
select not exists(select 1 from public.browse_members) as nonmember_hidden;
\echo '== View is a barrier and authenticated reads only: expect one t =='
select 'security_barrier=true'=any(reloptions) and not has_table_privilege('authenticated','public.browse_members','UPDATE') and not has_table_privilege('anon','public.browse_members','SELECT') as protected_view from pg_class where oid='public.browse_members'::regclass;
\echo '== Anonymous reader is refused: expect one ERROR =='
set local role anon;
savepoint anonymous;
select * from public.browse_members;
rollback to anonymous;
rollback;

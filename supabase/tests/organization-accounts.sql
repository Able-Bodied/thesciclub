-- Organization management, scoped accounts and unlimited invites (2026-10-09).
-- Run locally only. Signed-in roles, each refusal in a savepoint; all rolled back.
-- docker run --rm -i --network host -e PGPASSWORD=postgres postgres:17-alpine \
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres < supabase/tests/organization-accounts.sql
\set ON_ERROR_STOP off
\pset pager off
begin;
insert into public.members (id,type,status,display_name,phone,birth_date,level_range,state,is_admin) values
('aaaaaaaa-9090-0000-0000-000000000001','mentor','active','Test admin','19990009101','1980-01-01','T1–T6','CA',true),
('aaaaaaaa-9090-0000-0000-000000000002','organization','active','Test organization','19990009102','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9090-0000-0000-000000000003','peer','active','Test representative','19990009103','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9090-0000-0000-000000000004','mentor','active','Test mentor','19990009104','1980-01-01','T1–T6','CA',false),
('aaaaaaaa-9090-0000-0000-000000000005','peer','active','Test member','19990009105','1980-01-01','T1–T6','CA',false);
set local role authenticated;
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000001","role":"authenticated"}';
\echo '== 1. administrator adds, edits, links and assigns organization type: expect authenticated and t | t =='
select current_user;
select public.save_organization(null,'TSTO','Organization probe','Test region','Description',array['Support'],true) as org \gset
select public.save_organization(null,'TSTP','Other organization probe','Test region','',array[]::text[],false) as other \gset
select public.save_organization(:'org','TSTO','Organization updated','Test city','Updated description',array['Events'],true) = :'org'::uuid as same_identity;
select public.admin_set_member_type('aaaaaaaa-9090-0000-0000-000000000005','organization');
select type = 'organization' and not is_admin as organization_not_admin from public.admin_members where id='aaaaaaaa-9090-0000-0000-000000000005';
select public.admin_add_representative(:'org','aaaaaaaa-9090-0000-0000-000000000002');
select public.admin_add_representative(:'org','aaaaaaaa-9090-0000-0000-000000000003');
\echo '== 2. eleven invites from admin, organization account and representative: expect t | t | t =='
insert into public.invites (phone_raw,invited_by_member_id) select '199900092'||lpad(i::text,2,'0'),auth.uid() from generate_series(1,11) i;
select public.live_invite_count(auth.uid())=11 as admin_unlimited;
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000002","role":"authenticated"}';
insert into public.invites (phone_raw,invited_by_member_id) select '199900093'||lpad(i::text,2,'0'),auth.uid() from generate_series(1,11) i;
select public.live_invite_count(auth.uid())=11 as organization_unlimited;
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000003","role":"authenticated"}';
insert into public.invites (phone_raw,invited_by_member_id) select '199900094'||lpad(i::text,2,'0'),auth.uid() from generate_series(1,11) i;
select public.live_invite_count(auth.uid())=11 as representative_unlimited;
\echo '== 3. mentors still get ten: expect t then one ERROR =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000004","role":"authenticated"}';
insert into public.invites (phone_raw,invited_by_member_id) select '199900095'||lpad(i::text,2,'0'),auth.uid() from generate_series(1,10) i;
select public.live_invite_count(auth.uid())=10 as mentor_ten;
savepoint mentor_cap;
insert into public.invites (phone_raw,invited_by_member_id) values ('19990009511',auth.uid());
rollback to mentor_cap;
\echo '== 4. scoped organization edit and no privilege escalation: expect t, seven ERRORs =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000002","role":"authenticated"}';
select public.save_organization(:'org','TSTO','Organization scoped edit','Test city','Scoped description',array['Events'],true) = :'org'::uuid as own_edit;
savepoint unrelated;
select public.save_organization(:'other','TSTP','Wrong organization','Test city','',array[]::text[],false);
rollback to unrelated;
savepoint org_create;
select public.save_organization(null,'NEWO','Unapproved organization','Test city','',array[]::text[],true);
rollback to org_create;
savepoint org_remove;
select public.admin_remove_organization(:'org');
rollback to org_remove;
savepoint org_vouches;
select public.save_organization(:'org','TSTO','Organization scoped edit','Test city','',array[]::text[],false);
rollback to org_vouches;
savepoint promote;
select public.admin_set_member_type('aaaaaaaa-9090-0000-0000-000000000004','organization');
rollback to promote;
savepoint link;
select public.admin_add_representative(:'other',auth.uid());
rollback to link;
savepoint direct_write;
update public.organizations set name='Direct bypass' where id=:'org';
-- RLS refuses by changing zero rows (not ERROR); assert nothing changed.
select not exists(select 1 from public.organizations where name='Direct bypass') as direct_write_refused;
rollback to direct_write;
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000004","role":"authenticated"}';
savepoint self_type;
update public.members set type='organization' where id=auth.uid();
rollback to self_type;
\echo '== 5. unlinking removes unlimited access immediately: expect t and one ERROR =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000001","role":"authenticated"}';
select public.admin_remove_representative(:'org','aaaaaaaa-9090-0000-0000-000000000003');
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000003","role":"authenticated"}';
select not can_invite and not unlimited as unlinked_permissions from public.my_invite_permissions();
savepoint unlinked_invite;
insert into public.invites (phone_raw,invited_by_member_id) values ('19990009412',auth.uid());
rollback to unlinked_invite;
\echo '== 6. suspended organization cannot invite: expect t and one ERROR =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000001","role":"authenticated"}';
select public.admin_set_member_status('aaaaaaaa-9090-0000-0000-000000000002','suspended');
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000002","role":"authenticated"}';
select not can_invite and not unlimited as suspended_permissions from public.my_invite_permissions();
savepoint suspended_invite;
insert into public.invites (phone_raw,invited_by_member_id) values ('19990009312',auth.uid());
rollback to suspended_invite;
\echo '== 7. removing organization preserves inviter history and drops links: expect t | t, one ERROR =='
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000001","role":"authenticated"}';
select public.admin_create_invite('19990009601', :'org');
select public.admin_remove_organization(:'org');
select removed_at is not null and not can_invite as removed_from_directory from public.organizations where id=:'org';
select exists(select 1 from public.admin_invites where phone='19990009601' and invited_by_organization='Organization scoped edit')
  and not exists(select 1 from public.admin_organization_representatives() where organization_id=:'org') as history_without_links;
savepoint removed_link;
select public.admin_add_representative(:'org','aaaaaaaa-9090-0000-0000-000000000003');
rollback to removed_link;
\echo '== 8. ordinary peer cannot invite or take organization type: two ERRORs =='
select public.admin_set_member_type('aaaaaaaa-9090-0000-0000-000000000005','peer');
set local request.jwt.claims='{"sub":"aaaaaaaa-9090-0000-0000-000000000005","role":"authenticated"}';
savepoint peer_invite;
insert into public.invites (phone_raw,invited_by_member_id) values ('19990009602',auth.uid());
rollback to peer_invite;
savepoint peer_type;
update public.members set type='organization' where id=auth.uid();
rollback to peer_type;
\echo '== 9. anon has no management or permission RPC: three permission ERRORs =='
set local role anon;
set local request.jwt.claims='{"role":"anon"}';
savepoint anon_save;
select public.save_organization(null,'ANO','Anonymous','Test city','',array[]::text[],true);
rollback to anon_save;
savepoint anon_remove;
select public.admin_remove_organization(:'org');
rollback to anon_remove;
savepoint anon_permissions;
select * from public.my_invite_permissions();
rollback to anon_permissions;
rollback;

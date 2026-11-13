-- ============================================================================
-- Invite requests reach everybody on the desk (20261112130000)
-- ============================================================================
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres -At \
--     < supabase/tests/invite-request-desk.sql
--
-- Rolls back. Do not point it at the hosted project. Run with the migration
-- applied; expect: reps found|t, desk rows|2, bell a,b|1|1,
-- push endpoints|apns:sandbox:a,apns:sandbox:b, filed for|a.
-- ============================================================================

\set ON_ERROR_STOP on
begin;
-- Two non-admin members made the club's org admins for the probe only, as its first two.
create temp table two as
  select m.id from public.members m
   where m.status = 'active' and not m.is_seed
     and not exists (select 1 from public.organization_representatives r where r.member_id = m.id)
   order by m.created_at limit 2;
delete from public.organization_representatives r using public.organizations o
 where r.organization_id = o.id and o.is_the_club;
insert into public.organization_representatives (organization_id, member_id, created_at)
  select o.id, t.id, now() - interval '1 day' + (row_number() over (order by t.id)) * interval '1 minute'
    from public.organizations o, two t where o.is_the_club and o.removed_at is null;
create temp table pick as
  select o.id as club,
         (array_agg(r.member_id order by r.created_at, r.member_id))[1] as a,
         (array_agg(r.member_id order by r.created_at, r.member_id))[2] as b
    from public.organizations o
    join public.organization_representatives r on r.organization_id = o.id
    join public.members m on m.id = r.member_id and m.status = 'active' and not m.is_seed
   where o.is_the_club and o.removed_at is null
   group by o.id limit 1;
select 'reps found', (select a is not null and b is not null from pick);
insert into private.invite_request_desk (member_id) select a from pick;
insert into public.push_subscriptions (member_id, endpoint, p256dh, auth)
  select a, 'apns:sandbox:' || repeat('a', 64), null, null from pick union all
  select b, 'apns:sandbox:' || repeat('b', 64), null, null from pick;
insert into private.invite_request_desk (member_id) select b from pick;
select 'desk rows', count(*) from private.invite_request_desk;
select public.request_club_invite('Probe Two', 'probe-two@example.com', null);
select 'bell a,b', (select count(*) from public.notifications n, pick where n.member_id = pick.a and n.kind = 'invite_request'),
                          (select count(*) from public.notifications n, pick where n.member_id = pick.b and n.kind = 'invite_request');
select 'push endpoints', string_agg(left(o.endpoint, 14), ',' order by o.endpoint)
  from public.push_owed((select decrypted_secret from vault.decrypted_secrets where name = 'push_notify_secret'),
                        'invite_request',
                        jsonb_build_object('id', (select id from public.invite_requests where email = 'probe-two@example.com' and status = 'open'))) o
 where o.endpoint like 'apns:sandbox:%';
select 'filed for', (select case q.admin_id when pick.a then 'a' when pick.b then 'b' else '?' end from public.invite_requests q, pick where q.email = 'probe-two@example.com');
rollback;

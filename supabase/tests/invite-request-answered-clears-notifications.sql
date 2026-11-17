-- ============================================================================
-- An answered invite request clears its notifications (20261117020000)
-- ============================================================================
-- Two open requests to the club, one notification counting both. Answering
-- the newer leaves it counting one and naming the older; answering that one
-- too deletes it. Run against the test project on 2026-11-16 as a probe:
-- "count 1 naming Probe First; after both: 0 rows".
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres -At \
--     < supabase/tests/invite-request-answered-clears-notifications.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare club uuid; rep uuid; a uuid; b uuid;
  c1 int; d1 text; c2 int;
begin
  select m.id into rep from public.members m where m.status = 'active' and not m.is_seed order by m.created_at limit 1;
  select o.id into club from public.organizations o where o.is_the_club and o.removed_at is null limit 1;
  insert into public.invite_requests (organization_id, admin_id, name, email, created_at)
    values (club, rep, 'Probe First', 'probe-first@example.com', now() - interval '2 minutes') returning id into a;
  insert into public.invite_requests (organization_id, admin_id, name, email, created_at)
    values (club, rep, 'Probe Second', 'probe-second@example.com', now() - interval '1 minute') returning id into b;
  insert into public.notifications (member_id, kind, tag, organization_id, detail, count)
    values (rep, 'invite_request', 'invite_request:' || club::text, club, 'Probe Second', 2);
  update public.invite_requests set status = 'invited', answered_at = now() where id = b;
  select n.count, n.detail into c1, d1 from public.notifications n
   where n.member_id = rep and n.tag = 'invite_request:' || club::text;
  update public.invite_requests set status = 'dismissed', answered_at = now() where id = a;
  select count(*) into c2 from public.notifications n
   where n.member_id = rep and n.tag = 'invite_request:' || club::text;
  raise exception 'RESULT after one answered: count % naming %; after both: % rows (expect 1, Probe First, 0)', c1, d1, c2;
end $$;

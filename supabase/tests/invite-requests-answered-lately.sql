-- ============================================================================
-- Requests answered lately are shown only to org admins of that organization
-- (20261117010000)
-- ============================================================================
-- An org admin of the club sees a request another answered, with who answered;
-- a member who is not one sees none. Run against the test project on
-- 2026-11-16 as a probe: "rep sees 1 (by Hannah, mine t), member sees 0".
--
--   docker exec -i supabase_db_thesciclub psql -U postgres -d postgres -At \
--     < supabase/tests/invite-requests-answered-lately.sql
--
-- Ends in an exception, so nothing is kept. Do not point it at the hosted project.
-- ============================================================================

do $$
declare club uuid; rep uuid; other uuid; req uuid; n_rep int; n_other int; who text; mine boolean;
begin
  select o.id into club from public.organizations o where o.is_the_club and o.removed_at is null limit 1;
  select m.id into rep from public.members m
   where m.status = 'active' and not m.is_seed order by m.created_at limit 1;
  insert into public.organization_representatives (organization_id, member_id) values (club, rep)
    on conflict do nothing;
  select m.id into other from public.members m
   where m.status = 'active' and not m.is_seed and not m.is_admin
     and not exists (select 1 from public.organization_representatives r where r.member_id = m.id)
   limit 1;
  insert into public.invite_requests (organization_id, admin_id, name, email, status, answered_at, answered_by)
    values (club, rep, 'Probe Answered', 'probe-answered@example.com', 'invited',
            now() - interval '1 minute', rep)
    returning id into req;

  perform set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_rep from public.my_answered_invite_requests() a where a.id = req;
  select a.answered_by, a.answered_by_me into who, mine
    from public.my_answered_invite_requests() a where a.id = req;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n_other from public.my_answered_invite_requests() a;
  reset role;

  raise exception 'RESULT rep sees % (by %, mine %), member sees % (expect 1, mine t, 0)',
    n_rep, who, mine, n_other;
end $$;

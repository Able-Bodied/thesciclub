-- ============================================================================
-- Able Bodied, once
-- ============================================================================
-- The owner, 2026-11-05: the directory import (20261103010000) added "Able
-- Bodied Inc." beside the club's own "Able Bodied". It skipped only exact
-- names, and AB being taken, it gave the copy ABAB.
--
-- Anything that came to the copy goes to Able Bodied (its events, co-hosting,
-- followers, members and mentors), then the copy leaves the directory as an
-- administrator removes one (as 20261103060000). Its place, the import's
-- address, is not carried over: Able Bodied keeps its own.
-- ============================================================================

do $$
declare
  copy uuid;
  kept uuid;
begin
  select id into copy from public.organizations
   where short_code = 'ABAB' and name = 'Able Bodied Inc.' and removed_at is null;
  select id into kept from public.organizations
   where short_code = 'AB' and name = 'Able Bodied' and removed_at is null;
  if copy is null or kept is null then
    return;
  end if;

  update public.events set organization_id = kept where organization_id = copy;
  insert into public.event_cohosts (event_id, organization_id, added_by)
  select c.event_id, kept, c.added_by
    from public.event_cohosts c
    join public.events e on e.id = c.event_id
   where c.organization_id = copy and e.organization_id is distinct from kept
  on conflict do nothing;
  delete from public.event_cohosts where organization_id = copy;

  insert into public.organization_follows (member_id, organization_id)
  select member_id, kept from public.organization_follows where organization_id = copy
  on conflict do nothing;
  insert into public.organization_members
    (organization_id, member_id, joined_via, event_id, joined_at, left_at,
     reviewed_at, reviewed_by, denied_at, denied_reason)
  select kept, member_id, joined_via, event_id, joined_at, left_at,
         reviewed_at, reviewed_by, denied_at, denied_reason
    from public.organization_members where organization_id = copy
  on conflict do nothing;
  insert into public.organization_mentors (organization_id, member_id)
  select kept, member_id from public.organization_mentors where organization_id = copy
  on conflict do nothing;

  update public.organizations
     set removed_at = clock_timestamp(), can_invite = false
   where id = copy;
  delete from public.organization_representatives where organization_id = copy;
end;
$$;

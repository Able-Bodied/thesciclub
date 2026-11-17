-- ============================================================================
-- Invite requests answered lately, on Invites (the owner, 2026-11-16)
-- ============================================================================
-- Every org admin on the desk is told of a request (20261112130000), but the
-- first to answer takes it, and my_invite_requests lists only open ones. The
-- owner tapped "Randall Collins asked you for an invite" after another org
-- admin had sent it 37 seconds after it came, and Invites showed nothing.
--
-- my_answered_invite_requests() lists, to the same org admins who could have
-- answered (speaks_for), the requests answered in the last 14 days: who asked,
-- for which organization, the answer, and the first name of whoever gave it.
-- No email address: nothing is left to do with it. New function only, so an
-- older iPhone app is unaffected.
-- ============================================================================

create or replace function public.my_answered_invite_requests()
returns table (
  id uuid,
  organization_name text,
  name text,
  status text,
  answered_by text,
  answered_by_me boolean,
  answered_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select q.id, o.name, q.name, q.status,
         split_part(btrim(b.display_name), ' ', 1),
         q.answered_by is not distinct from auth.uid(),
         q.answered_at
    from public.invite_requests q
    join public.organizations o on o.id = q.organization_id and o.removed_at is null
    left join public.members b on b.id = q.answered_by
   where q.status <> 'open'
     and q.answered_at > now() - interval '14 days'
     and public.speaks_for(q.organization_id)
   order by q.answered_at desc
   limit 20;
$$;

revoke all on function public.my_answered_invite_requests() from public, anon;
grant execute on function public.my_answered_invite_requests() to authenticated;

-- ============================================================================
-- my_invited_by — who vouched for the member asking
-- ============================================================================
-- The Me screen's Standing card says "Invited by NorCal SCI". That sentence is
-- doing real work: docs/CONTEXT.md says membership is granted by a person or an
-- organization and can be taken away, and the screen where somebody reads that
-- should also tell them who let them in.
--
-- It is not currently reachable. `invites` has exactly one select policy —
-- "mentors can see invites they sent" — so a member cannot read the row that
-- admitted them, only the row they issued for somebody else. That is the right
-- default and it stays: an invite row carries a phone number.
--
-- So this returns one string and nothing else: the name of the organization or
-- the display name of the mentor who put the caller's number on the list, or
-- null when neither is recorded. No phone, no invite id, no way to ask about
-- anybody but yourself — the caller is `auth.uid()` and there is no argument.
--
-- SECURITY DEFINER because the point is to see past the policy above. The
-- safety is that the function takes no input and the return type cannot carry
-- anything sensitive.
-- ============================================================================

create or replace function public.my_invited_by()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(organization.name, mentor.display_name)
  from public.members me
  join public.invites invite on invite.id = me.invite_id
  left join public.organizations organization
    on organization.id = invite.invited_by_organization_id
  left join public.members mentor
    on mentor.id = invite.invited_by_member_id
  where me.id = auth.uid();
$$;

revoke all on function public.my_invited_by() from public, anon;
grant execute on function public.my_invited_by() to authenticated;

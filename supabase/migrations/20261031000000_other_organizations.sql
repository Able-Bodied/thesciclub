-- ============================================================================
-- Organizations a member belongs to that the club has no row for
--
-- The owner, 2026-10-31: a survey screen before the equipment question, with
-- "Please tell us about any organizations that are not in our list. It helps
-- us populate our database."
--
-- These are notes for the club, not part of a profile: browse_members names
-- its columns and does not name this one, so another member cannot read it.
-- Administrators read them through organization_suggestions, to add the ones
-- worth a row. Not counted towards a finished profile: member_profile_done is
-- not restated, so nobody who has finished is reminded again.
-- ============================================================================

alter table public.members
  add column other_organizations text;

alter table public.members
  add constraint members_other_organizations_length
  check (char_length(other_organizations) <= 1000);

comment on column public.members.other_organizations is
  'Organizations the member belongs to that are not in the directory, in their words. For administrators; not shown on a profile.';

create function public.organization_suggestions()
returns table (member_id uuid, display_name text, suggestion text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can read these.' using errcode = '42501';
  end if;

  return query
  select m.id, m.display_name, m.other_organizations
    from public.members m
   where m.other_organizations is not null
   order by m.display_name, m.id;
end;
$$;

revoke all on function public.organization_suggestions() from public, anon;
grant execute on function public.organization_suggestions() to authenticated;

-- ============================================================================
-- An org admin removes someone from the organization
-- ============================================================================
-- The owner, 2026-11-03, for the People list on Stats & controls. As if they
-- had left (leave_organization): left_at set, so they leave its group chat,
-- and their join request goes; a mentor stops being one. They are not told.
-- Org admins stay: only an administrator changes those.
-- ============================================================================

create function public.remove_organization_person(p_organization uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.may_make_mentors_for(p_organization) then
    raise exception 'Only its org admins can remove people.' using errcode = '42501';
  end if;
  if p_member = auth.uid() then
    raise exception 'You cannot remove yourself.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.organization_representatives r
     where r.organization_id = p_organization and r.member_id = p_member
  ) then
    raise exception 'Org admins stay. An administrator can change that.' using errcode = '42501';
  end if;

  delete from public.organization_join_requests r
   where r.organization_id = p_organization and r.member_id = p_member;

  update public.organization_members
     set left_at = now()
   where organization_id = p_organization
     and member_id = p_member
     and left_at is null;

  delete from public.organization_mentors g
   where g.organization_id = p_organization and g.member_id = p_member;
  perform private.sync_mentor_type(p_member);
end;
$$;

revoke all on function public.remove_organization_person(uuid, uuid) from public, anon;
grant execute on function public.remove_organization_person(uuid, uuid) to authenticated;

-- ============================================================================
-- An organization's mentors are its members
-- ============================================================================
-- The owner, 2026-11-03: "if someone is a mentor of a org automatically make
-- them a member". As org admins are (20261030010000): becoming a mentor makes
-- them a member, so they join its group chat too; someone already a member
-- keeps how they came. Stopping as a mentor ends only a membership that came
-- with the role. Mentors already made are members from now.
-- ============================================================================

alter table public.organization_members
  drop constraint organization_members_joined_via_check;

alter table public.organization_members
  add constraint organization_members_joined_via_check
  check (joined_via in ('join', 'invite', 'code', 'check_in', 'org_admin', 'added', 'mentor'));

create function private.organization_mentor_is_a_member(p_organization uuid, p_member uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.organization_members (organization_id, member_id, joined_via, reviewed_at)
  select o.id, m.id, 'mentor', now()
    from public.organizations o
    join public.members m on m.id = p_member and m.status = 'active'
   where o.id = p_organization
     and o.removed_at is null
  on conflict (organization_id, member_id) do update
    set joined_via = 'mentor', joined_at = now(), left_at = null,
        reviewed_at = now(), reviewed_by = null,
        denied_at = null, denied_reason = null
    where public.organization_members.left_at is not null
       or public.organization_members.denied_at is not null;
$$;

revoke all on function private.organization_mentor_is_a_member(uuid, uuid)
  from public, anon, authenticated;

create function private.organization_mentor_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.organization_mentor_is_a_member(new.organization_id, new.member_id);
    return null;
  end if;

  update public.organization_members om
     set left_at = now()
   where om.organization_id = old.organization_id
     and om.member_id = old.member_id
     and om.joined_via = 'mentor'
     and om.left_at is null;
  return null;
end;
$$;

revoke all on function private.organization_mentor_changed() from public, anon, authenticated;

create trigger organization_mentors_are_members
  after insert or delete on public.organization_mentors
  for each row execute function private.organization_mentor_changed();

select private.organization_mentor_is_a_member(g.organization_id, g.member_id)
  from public.organization_mentors g;

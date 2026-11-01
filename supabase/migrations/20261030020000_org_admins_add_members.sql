-- ============================================================================
-- Org admins and club administrators add members
--
-- The owner, 2026-10-30: "org admins and club admins can add people to the
-- membership of an org by adding members to the org group chat".
--
-- Adding somebody to the group makes them a member at once, already reviewed.
-- It takes back a denial and brings back somebody who left: whoever adds them
-- is deciding that. They are told as anybody added to a group is, and can
-- press Member to leave. Club administrators are not in these chats, so the
-- organization's page offers the same thing, through the same function.
--
-- Everybody else in the chat keeps what they had: they can bring back somebody
-- who is already a member, and nobody new (organization_chat_is_its_own).
-- ============================================================================

alter table public.organization_members
  drop constraint organization_members_joined_via_check;

alter table public.organization_members
  add constraint organization_members_joined_via_check
  check (joined_via in ('join', 'invite', 'code', 'check_in', 'org_admin', 'added'));

create function public.add_organization_member(p_organization uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_organization record;
begin
  if not public.is_active_member()
     or not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can add members.' using errcode = '42501';
  end if;

  select o.is_the_club into found_organization
    from public.organizations o
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
  if found_organization.is_the_club then
    raise exception 'Everybody here already belongs to The SCI Club.' using errcode = '22023';
  end if;

  if p_member is null then
    raise exception 'There is nobody to add.' using errcode = '22023';
  end if;

  -- Before the membership, so a blocked pair is refused and not made a member
  -- who never reaches the chat (chat_refuse_blocked_group_add).
  if not public.chat_is_findable(p_member) or public.members_blocked(me, p_member) then
    raise exception 'That member cannot be added.' using errcode = 'P0002';
  end if;

  insert into public.organization_members
    (organization_id, member_id, joined_via, reviewed_at, reviewed_by)
  values (p_organization, p_member, 'added', now(), me)
  on conflict (organization_id, member_id) do update
    set joined_via = 'added', joined_at = now(), left_at = null,
        reviewed_at = now(), reviewed_by = me,
        denied_at = null, denied_reason = null
    where public.organization_members.left_at is not null
       or public.organization_members.denied_at is not null;

  -- Also for a member who left the chat alone, whom the trigger does not touch.
  insert into public.chat_thread_members (thread_id, member_id)
  values (private.organization_chat(p_organization), p_member)
  on conflict (thread_id, member_id) do nothing;
end;
$$;

revoke all on function public.add_organization_member(uuid, uuid) from public, anon;
grant execute on function public.add_organization_member(uuid, uuid) to authenticated;

-- As 20260918130000, and an organization's chat answers to its org admins and
-- the club's administrators, who need not be in it.
create or replace function public.chat_add_to_group(thread uuid, new_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread_kind text;
  attached_event uuid;
  attached_organization uuid;
  roster_size integer;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can add somebody to a group.' using errcode = '42501';
  end if;

  select t.organization_id into attached_organization
    from public.chat_threads t where t.id = thread;

  if attached_organization is not null
     and (public.speaks_for(attached_organization) or public.is_admin()) then
    perform public.add_organization_member(attached_organization, new_member);
    return;
  end if;

  -- Being in it is the whole permission. There is no owner of a group and no
  -- invite to accept: anybody in the conversation can bring somebody into it,
  -- which is what "a named few" means, and anybody can leave.
  if not public.is_thread_member(thread) then
    raise exception 'There is no such group.' using errcode = 'P0002';
  end if;

  select t.kind, t.event_id into thread_kind, attached_event
    from public.chat_threads t where t.id = thread;

  if thread_kind <> 'group' then
    raise exception 'A conversation between two people does not take a third.'
      using errcode = '22023';
  end if;

  if attached_event is not null then
    raise exception 'Everybody going to the event is already welcome in its group chat, and joins it themselves.'
      using errcode = '22023';
  end if;

  if new_member is null then
    raise exception 'There is nobody to add.' using errcode = '22023';
  end if;

  -- Before the cap, so that adding somebody who is already in a full group is
  -- the no-op it looks like rather than a refusal.
  if exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = thread and m.member_id = new_member
  ) then
    return;
  end if;

  select count(*) into roster_size
    from public.chat_thread_members m where m.thread_id = thread;
  if roster_size >= public.chat_group_cap() then
    raise exception 'This group holds % members and is full.', public.chat_group_cap()
      using errcode = '22023';
  end if;

  if not public.chat_is_findable(new_member) then
    raise exception 'That member cannot be added to a group.' using errcode = 'P0002';
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (thread, new_member)
  on conflict (thread_id, member_id) do nothing;
end;
$$;

revoke all on function public.chat_add_to_group(uuid, uuid) from public, anon;
grant execute on function public.chat_add_to_group(uuid, uuid) to authenticated;

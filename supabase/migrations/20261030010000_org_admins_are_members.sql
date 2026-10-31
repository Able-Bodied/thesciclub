-- ============================================================================
-- Org admins are members
--
-- The owner, 2026-10-30: "Org admins should by default be in the org chat
-- group. They are by default members."
--
-- 20261030000000 put an org admin in the group chat, but only once somebody
-- else had joined and made the chat, and never in the organization's members.
-- Now becoming an org admin makes them a member, as any join does, and the
-- trigger on organization_members does the rest: the chat, made if it is the
-- first, and the follow underneath.
--
-- While they are an org admin they stay one: they cannot leave, and they
-- cannot be declined. They can still leave the chat alone. Stepping down ends
-- a membership that came with the role; one they pressed Join for, or got any
-- other way, stays. The SCI Club itself has no members (join_organization).
-- ============================================================================

alter table public.organization_members
  drop constraint organization_members_joined_via_check;

alter table public.organization_members
  add constraint organization_members_joined_via_check
  check (joined_via in ('join', 'invite', 'code', 'check_in', 'org_admin'));

-- Someone already a member keeps how they came; this does not touch them, so
-- it does not put back anybody who left the chat alone.
create function private.organization_admin_is_a_member(p_organization uuid, p_member uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.organization_members (organization_id, member_id, joined_via, reviewed_at)
  select o.id, m.id, 'org_admin', now()
    from public.organizations o
    join public.members m on m.id = p_member and m.status = 'active'
   where o.id = p_organization
     and o.removed_at is null
     and not o.is_the_club
  on conflict (organization_id, member_id) do update
    set joined_via = 'org_admin', joined_at = now(), left_at = null,
        reviewed_at = now(), reviewed_by = null,
        denied_at = null, denied_reason = null
    where public.organization_members.left_at is not null
       or public.organization_members.denied_at is not null;
$$;

revoke all on function private.organization_admin_is_a_member(uuid, uuid)
  from public, anon, authenticated;

-- As 20261030000000, and an org admin added is now a member, which is what
-- puts them in the chat, and one removed stops being a member by that route.
create or replace function private.organization_admin_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.organization_admin_is_a_member(new.organization_id, new.member_id);
    insert into public.chat_thread_members (thread_id, member_id)
    select t.id, new.member_id
      from public.chat_threads t
     where t.organization_id = new.organization_id
       and (auth.uid() is null or not public.members_blocked(auth.uid(), new.member_id))
    on conflict (thread_id, member_id) do nothing;
    return null;
  end if;

  update public.organization_members om
     set left_at = now()
   where om.organization_id = old.organization_id
     and om.member_id = old.member_id
     and om.joined_via = 'org_admin'
     and om.left_at is null;

  if not exists (
    select 1 from public.organization_members om
     where om.organization_id = old.organization_id
       and om.member_id = old.member_id
       and om.left_at is null
       and om.denied_at is null
  ) then
    delete from public.chat_thread_members tm
     using public.chat_threads t
     where t.id = tm.thread_id
       and t.organization_id = old.organization_id
       and tm.member_id = old.member_id;
  end if;
  return null;
exception when others then
  raise warning 'organization_admin_changed: %', sqlerrm;
  return null;
end;
$$;

-- As 20261030000000, and an org admin stays a member.
create or replace function public.leave_organization(p_organization uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.organization_representatives r
     where r.organization_id = p_organization and r.member_id = auth.uid()
  ) then
    raise exception 'Org admins stay members.' using errcode = '42501';
  end if;

  update public.organization_members
     set left_at = now()
   where organization_id = p_organization
     and member_id = auth.uid()
     and left_at is null;
end;
$$;

revoke all on function public.leave_organization(uuid) from public, anon;
grant execute on function public.leave_organization(uuid) to authenticated;

-- As 20261030000000, and an org admin cannot be declined.
create or replace function public.review_organization_member(
  p_organization uuid,
  p_member uuid,
  p_approve boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  why text := nullif(btrim(coalesce(p_reason, '')), '');
  organization_name text;
  thread uuid;
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can review its members.' using errcode = '42501';
  end if;

  if p_approve then
    update public.organization_members
       set reviewed_at = now(), reviewed_by = me, denied_at = null, denied_reason = null
     where organization_id = p_organization and member_id = p_member;
    if not found then
      raise exception 'They are not a member.' using errcode = 'P0002';
    end if;
    return;
  end if;

  if exists (
    select 1 from public.organization_representatives r
     where r.organization_id = p_organization and r.member_id = p_member
  ) then
    raise exception 'An org admin cannot be declined.' using errcode = '42501';
  end if;

  if why is null then
    raise exception 'Say why, so they know.' using errcode = '22023';
  end if;
  if char_length(why) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = '22023';
  end if;

  update public.organization_members
     set reviewed_at = now(), reviewed_by = me, denied_at = now(), denied_reason = why
   where organization_id = p_organization
     and member_id = p_member
     and left_at is null
     and denied_at is null;
  if not found then
    raise exception 'They are not a member.' using errcode = 'P0002';
  end if;

  select o.name into organization_name from public.organizations o where o.id = p_organization;
  begin
    thread := public.chat_open_direct(p_member);
    insert into public.chat_messages (thread_id, author_id, body)
    values (thread, me, 'Your membership of ' || organization_name || ' was declined: ' || why);
  exception when others then
    raise warning 'review_organization_member: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.review_organization_member(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.review_organization_member(uuid, uuid, boolean, text) to authenticated;

-- ------------------------------------------------------ the org admins today --
select private.organization_admin_is_a_member(r.organization_id, r.member_id)
  from public.organization_representatives r;

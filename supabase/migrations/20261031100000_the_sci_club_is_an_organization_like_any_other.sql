-- ============================================================================
-- The SCI Club is an organization like any other
--
-- The owner, 2026-10-31: "Why does everyone belong to it automatically? It
-- should be a separate org. I am using it for scheduling our group meetings."
-- 20261030000000 treated every member as in it, so it had no members list and
-- nobody could join. Now members join it, leave it, are approved or added, and
-- have its group chat, as with any other. Its org admins are its members, and so
-- are the club's administrators and mentors below. Nobody else is added.
--
-- is_the_club stays: it still decides how an invite is filed and what the
-- invite-request list puts first (create_my_invite, invite_request_choices).
-- An invite made without choosing an organization still does not choose this one.
--
-- As 20261030000000, 20261030010000, 20261030020000, 20261031010000,
-- 20261031040000 and 20261031080000, without the exception for it.
-- ============================================================================

create or replace function private.organization_admin_is_a_member(p_organization uuid, p_member uuid)
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
  on conflict (organization_id, member_id) do update
    set joined_via = 'org_admin', joined_at = now(), left_at = null,
        reviewed_at = now(), reviewed_by = null,
        denied_at = null, denied_reason = null
    where public.organization_members.left_at is not null
       or public.organization_members.denied_at is not null;
$$;

create or replace function private.member_joins_their_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.organization_members (organization_id, member_id, joined_via)
  select o.id, new.id, case when i.qr_code_id is null then 'invite' else 'code' end
    from public.invites i
    left join public.qr_codes q on q.id = i.qr_code_id
    join public.organizations o
      on o.id = coalesce(i.for_organization_id, i.invited_by_organization_id, q.organization_id)
   where i.id = new.invite_id
     and o.removed_at is null
  on conflict do nothing;
  return null;
end;
$$;

create or replace function public.check_in_to_event(p_event uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_event record;
  closes timestamptz;
  joined text;
begin
  if me is null or not public.is_member() then
    raise exception 'Only a member can check in.' using errcode = '42501';
  end if;

  select e.id, e.start_time, e.end_time, e.all_day, e.organization_id
    into found_event
    from public.events e
   where e.id = p_event;
  if not found then
    raise exception 'This event is not on the calendar.' using errcode = 'P0002';
  end if;

  closes := case
    when found_event.all_day then coalesce(found_event.end_time, found_event.start_time) + interval '1 day'
    else coalesce(found_event.end_time, found_event.start_time + interval '4 hours') + interval '1 hour'
  end;
  if now() < found_event.start_time - interval '1 hour' then
    raise exception 'Check-in opens an hour before the event.' using errcode = '22023';
  end if;
  if now() > closes then
    raise exception 'Check-in for this event has closed.' using errcode = '22023';
  end if;

  insert into public.event_check_ins (event_id, member_id)
  values (p_event, me)
  on conflict do nothing;

  insert into public.organization_join_requests (organization_id, member_id)
  select o.id, me
    from public.organizations o
   where o.id = found_event.organization_id
     and o.removed_at is null
     and o.joins_need_approval
     and not exists (
       select 1 from public.organization_members om
        where om.organization_id = o.id and om.member_id = me
     )
  on conflict do nothing;

  with added as (
    insert into public.organization_members (organization_id, member_id, joined_via, event_id)
    select o.id, me, 'check_in', p_event
      from public.organizations o
     where o.id = found_event.organization_id
       and o.removed_at is null
         and not o.joins_need_approval
    on conflict do nothing
    returning organization_id
  )
  select o.name into joined
    from added a
    join public.organizations o on o.id = a.organization_id;

  return joined;
end;
$$;

create or replace function public.join_organization(p_organization uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_organization record;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can join an organization.' using errcode = '42501';
  end if;
  select o.name, o.joins_need_approval into found_organization
    from public.organizations o
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.organization_members om
     where om.organization_id = p_organization and om.member_id = me and om.denied_at is not null
  ) then
    raise exception '% declined your membership.', found_organization.name using errcode = '42501';
  end if;
  if exists (
    select 1 from public.organization_members om
     where om.organization_id = p_organization and om.member_id = me and om.left_at is null
  ) then
    return 'joined';
  end if;

  if found_organization.joins_need_approval then
    insert into public.organization_join_requests (organization_id, member_id)
    values (p_organization, me)
    on conflict do nothing;
    return 'requested';
  end if;

  insert into public.organization_members (organization_id, member_id, joined_via, reviewed_at)
  values (p_organization, me, 'join', now())
  on conflict (organization_id, member_id) do update
    set left_at = null, joined_via = 'join', joined_at = now(),
        reviewed_at = now(), reviewed_by = null
    where public.organization_members.left_at is not null;
  return 'joined';
end;
$$;

create or replace function public.add_organization_member(p_organization uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_active_member()
     or not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can add members.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations o
     where o.id = p_organization and o.removed_at is null
  ) then
    raise exception 'There is no such organization.' using errcode = 'P0002';
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

create or replace function public.invite_to_organization(p_organization uuid, p_member uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  organization_name text;
  thread uuid;
begin
  if not public.speaks_for(p_organization) then
    raise exception 'Only its org admins can invite people to it.' using errcode = '42501';
  end if;
  if p_member = me then
    raise exception 'You are already with this organization.' using errcode = '22023';
  end if;
  select o.name into organization_name
    from public.organizations o
   where o.id = p_organization;
  if organization_name is null then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.organization_members om
     where om.organization_id = p_organization
       and om.member_id = p_member
       and om.left_at is null
  ) then
    raise exception 'They are already a member, or were declined.' using errcode = '22023';
  end if;

  insert into public.organization_member_invites (organization_id, member_id, invited_by)
  values (p_organization, p_member, me)
  on conflict do nothing;
  if not found then
    raise exception 'They have been invited to it already.' using errcode = '22023';
  end if;

  -- A blocked pair is refused here, and the invite with it.
  thread := public.chat_open_direct(p_member);
  insert into public.chat_messages (thread_id, author_id, body)
  values (
    thread, me,
    'You''re invited to join ' || organization_name
      || ': https://thesciclub.com/events/organizations/' || p_organization::text
  );
end;
$$;

create or replace function public.set_organization_joins_need_approval(
  p_organization uuid,
  p_needed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can change how people join.' using errcode = '42501';
  end if;

  update public.organizations o
     set joins_need_approval = coalesce(p_needed, false)
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;

  if not coalesce(p_needed, false) then
    insert into public.organization_members
      (organization_id, member_id, joined_via, reviewed_at, reviewed_by)
    select r.organization_id, r.member_id, 'join', now(), me
      from public.organization_join_requests r
      join public.members m on m.id = r.member_id and m.status = 'active'
     where r.organization_id = p_organization
    on conflict (organization_id, member_id) do update
      set left_at = null, joined_via = 'join', joined_at = now(),
          reviewed_at = now(), reviewed_by = me
      where public.organization_members.left_at is not null;
    delete from public.organization_join_requests r
     where r.organization_id = p_organization;
  end if;
end;
$$;

create or replace function public.review_options(p_event uuid default null, p_organization uuid default null)
returns table (
  can_review boolean,
  title text,
  organization_name text,
  anonymous_allowed boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_active_member()
    and (o.id is null or not public.speaks_for(o.id))
    and case
      when p_event is not null then exists (
        select 1 from public.event_check_ins c
         where c.event_id = p_event and c.member_id = auth.uid()
      )
      else exists (
        select 1 from public.organization_members om
         where om.organization_id = p_organization
           and om.member_id = auth.uid()
           and om.left_at is null
           and om.denied_at is null
      )
    end,
    coalesce(e.title, o.name),
    o.name,
    coalesce(o.anonymous_reviews, true)
  from (select p_event as event_id, p_organization as organization_id) wanted
  left join public.events e on e.id = wanted.event_id
  left join public.organizations o
    on o.id = coalesce(wanted.organization_id, e.organization_id);
$$;

-- ------------------------------------------------------ its members today --
select private.organization_admin_is_a_member(r.organization_id, r.member_id)
  from public.organization_representatives r
  join public.organizations o on o.id = r.organization_id
 where o.is_the_club;

insert into public.organization_members (organization_id, member_id, joined_via, reviewed_at)
select o.id, m.id, 'added', now()
  from public.organizations o
  join public.members m on m.status = 'active' and (m.is_admin or m.type = 'mentor')
 where o.is_the_club
on conflict do nothing;

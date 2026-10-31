-- ============================================================================
-- Joining an organization: open to all, or approved first
--
-- The owner, 2026-10-31: "a toggle to org pages for org admins to either make
-- joins require approvals or open to all. Let's default orgs to open to all."
--
-- Open, which every organization is now: Join makes you a member and nobody
-- has to review it (it was member at once, then reviewed: 20261030000000).
--
-- Approved first: Join asks. Somebody asking is not a member, so they see
-- nothing of its members' events or its group chat until an org admin says
-- yes. Checking in to its event asks too, and does not make them a member.
-- An invite or code made for it, and being added by an org admin, still make
-- them one, because that is the organization choosing them.
--
-- Asking is its own table so that "active" keeps meaning what it means
-- everywhere else: left_at and denied_at both null on organization_members.
-- Any change to their membership row settles the request.
--
-- Going back to open lets everybody waiting in: that is what open says.
-- Being denied, or removed, works as before and in either setting: it is the
-- same review_organization_member, it needs a reason, and it can be taken back.
-- ============================================================================

alter table public.organizations
  add column joins_need_approval boolean not null default false;

comment on column public.organizations.joins_need_approval is
  'Whether Join asks its org admins instead of making a member. See 20261031010000.';

create table public.organization_join_requests (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  requested_at timestamptz not null default now(),
  primary key (organization_id, member_id)
);

create index organization_join_requests_member_idx
  on public.organization_join_requests (member_id);

alter table public.organization_join_requests enable row level security;
revoke all on public.organization_join_requests from public, anon, authenticated;
grant select on public.organization_join_requests to authenticated;

create policy "a member reads their own requests to join"
  on public.organization_join_requests for select
  to authenticated
  using (member_id = (select auth.uid()));

comment on table public.organization_join_requests is
  'Who asked to join an organization that approves first. Not members. See 20261031010000.';

-- However the membership row changes, there is nothing left to ask.
create function private.organization_request_settled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.organization_join_requests r
   where r.organization_id = new.organization_id
     and r.member_id = new.member_id;
  return null;
end;
$$;

revoke all on function private.organization_request_settled() from public, anon, authenticated;

create trigger organization_members_settle_request
  after insert or update of left_at, denied_at on public.organization_members
  for each row execute function private.organization_request_settled();

-- ----------------------------------------------------------- the two settings --
create function public.set_organization_joins_need_approval(
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
   where o.id = p_organization and o.removed_at is null and not o.is_the_club;
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

revoke all on function public.set_organization_joins_need_approval(uuid, boolean) from public, anon;
grant execute on function public.set_organization_joins_need_approval(uuid, boolean) to authenticated;

-- ------------------------------------------------------ joining and leaving --
-- As 20261030000000, and it says what happened: 'joined' or 'requested'.
drop function public.join_organization(uuid);

create function public.join_organization(p_organization uuid)
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
  select o.name, o.is_the_club, o.joins_need_approval into found_organization
    from public.organizations o
   where o.id = p_organization and o.removed_at is null;
  if not found then
    raise exception 'There is no such organization.' using errcode = 'P0002';
  end if;
  if found_organization.is_the_club then
    raise exception 'Everybody here already belongs to The SCI Club.' using errcode = '22023';
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

revoke all on function public.join_organization(uuid) from public, anon;
grant execute on function public.join_organization(uuid) to authenticated;

-- As 20261030010000, and it also takes back a request.
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

  delete from public.organization_join_requests r
   where r.organization_id = p_organization and r.member_id = auth.uid();

  update public.organization_members
     set left_at = now()
   where organization_id = p_organization
     and member_id = auth.uid()
     and left_at is null;
end;
$$;

-- As 20261030000000. An organization that approves first gets a request, unless
-- they already have a row: somebody who left or was declined stays that way.
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
     and not o.is_the_club
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
       and not o.is_the_club
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

-- ------------------------------------------------- org admins reviewing Join --
-- As 20261030000000, and who is waiting now comes from the requests.
create or replace function public.organization_member_reviews(p_organization uuid)
returns table (
  member_id uuid,
  display_name text,
  username text,
  photo_path text,
  photo_alt text,
  joined_at timestamptz,
  denied_at timestamptz,
  denied_reason text
)
language sql
security definer
stable
set search_path = ''
as $$
  select * from (
    select m.id, m.display_name, m.username::text, m.photo_path, m.photo_alt,
           r.requested_at, null::timestamptz as denied_at, null::text as denied_reason
      from public.organization_join_requests r
      join public.members m on m.id = r.member_id and m.status = 'active'
     where r.organization_id = p_organization
    union all
    select m.id, m.display_name, m.username::text, m.photo_path, m.photo_alt,
           om.joined_at, om.denied_at, om.denied_reason
      from public.organization_members om
      join public.members m on m.id = om.member_id and m.status = 'active'
     where om.organization_id = p_organization
       and om.denied_at is not null
  ) reviews
  where public.is_admin() or public.speaks_for(p_organization)
  order by reviews.denied_at nulls first, reviews.requested_at desc, reviews.id;
$$;

-- As 20261030010000, and a request is answered as well as a membership: yes
-- makes them a member, and no leaves the row that keeps them from asking again.
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
  asked boolean;
begin
  if not (public.speaks_for(p_organization) or public.is_admin()) then
    raise exception 'Only its org admins can review its members.' using errcode = '42501';
  end if;

  asked := exists (
    select 1 from public.organization_join_requests r
     where r.organization_id = p_organization and r.member_id = p_member
  );

  if p_approve then
    if asked then
      insert into public.organization_members
        (organization_id, member_id, joined_via, reviewed_at, reviewed_by)
      values (p_organization, p_member, 'join', now(), me)
      on conflict (organization_id, member_id) do update
        set left_at = null, joined_via = 'join', joined_at = now(),
            reviewed_at = now(), reviewed_by = me,
            denied_at = null, denied_reason = null;
      return;
    end if;
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

  if asked then
    insert into public.organization_members
      (organization_id, member_id, joined_via, reviewed_at, reviewed_by, denied_at, denied_reason)
    values (p_organization, p_member, 'join', now(), me, now(), why)
    on conflict (organization_id, member_id) do update
      set left_at = null, reviewed_at = now(), reviewed_by = me,
          denied_at = now(), denied_reason = why;
  else
    update public.organization_members
       set reviewed_at = now(), reviewed_by = me, denied_at = now(), denied_reason = why
     where organization_id = p_organization
       and member_id = p_member
       and left_at is null
       and denied_at is null;
    if not found then
      raise exception 'They are not a member.' using errcode = 'P0002';
    end if;
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

-- ----------------------------------------------------- those waiting today --
-- Everybody is open now, so nobody is left waiting on a review. They stay the
-- members they already are.
update public.organization_members
   set reviewed_at = now()
 where joined_via = 'join'
   and reviewed_at is null
   and left_at is null
   and denied_at is null;

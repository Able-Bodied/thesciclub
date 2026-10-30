-- ============================================================================
-- Organization members, and checking in to an event
-- ============================================================================
-- The owner, 2026-10-29 and 30: "org members ... active participants in an
-- organization", then "let's combine membership with follow": Join replaces
-- Follow. Somebody becomes an organization's member when they:
--
--   join      press Join on it. They are a member at once; its org admins
--             then approve them, or deny them and say why.
--   invite    join the club on an email invite made for it. An org admin of
--             one organization makes them for that one; an org admin of
--             several chooses, in create_my_invite.
--   code      join the club by a QR code or invite link made for it.
--   check_in  check in to one of its events.
--
-- organization_follows stays underneath, kept to the active members by
-- organization_member_changed, so everything that reads it (who sees a
-- 'followers' event, new-event and grant notifications, the filters) now
-- means members. Nobody writes it directly any more. Everybody following
-- today becomes a member below, already approved, and nobody who joined the
-- club before this is otherwise added. The SCI Club itself has no such list
-- (every member is in it).
--
-- Leaving keeps the row with left_at, so a later check-in does not quietly
-- put back somebody who chose to go; Join does. Denying keeps it with
-- denied_at and the reason, so they cannot just press Join again; an org admin
-- can take it back. The reason reaches them as a direct message from the org
-- admin, and on the organization's page.
--
-- Checking in (event_check_ins) needs no code. The button is on the event's
-- page, and the printed QR code is that page's address, so both are the same
-- thing: an hour before the start to an hour after the end, for any member,
-- including one the event's audience leaves out, who is standing at it. An
-- event with no end counts as four hours long; an all-day event runs to the
-- end of the day after its last. A check-in is not an RSVP: Going shares
-- contact details with the host, and this does not.
--
-- Who sees what (the owner: "everyone should see what orgs you are a member
-- of"): any member sees an organization's members and a member's organizations,
-- leaving out a blocked pair and anybody hidden from Peers. How each came to
-- join, the reviews and event_check_in_list are for that organization's org
-- admins, the event's organizers and the club's administrators.
-- ============================================================================

-- ------------------------------------------------------ the two new lists --
create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  joined_via text not null check (joined_via in ('join', 'invite', 'code', 'check_in')),
  event_id uuid references public.events (id) on delete set null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.members (id) on delete set null,
  denied_at timestamptz,
  denied_reason text check (char_length(denied_reason) <= 500),
  primary key (organization_id, member_id)
);

create index organization_members_member_idx on public.organization_members (member_id);
create index organization_members_event_idx on public.organization_members (event_id);

alter table public.organization_members enable row level security;
revoke all on public.organization_members from public, anon, authenticated;
grant select on public.organization_members to authenticated;

create policy "a member reads their own organizations"
  on public.organization_members for select
  to authenticated
  using (member_id = (select auth.uid()));

comment on table public.organization_members is
  'Who belongs to an organization. Active: left_at and denied_at both null. See 20261030000000.';

create table public.event_check_ins (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create index event_check_ins_member_idx on public.event_check_ins (member_id);

alter table public.event_check_ins enable row level security;
revoke all on public.event_check_ins from public, anon, authenticated;
grant select on public.event_check_ins to authenticated;

create policy "a member reads their own check-ins"
  on public.event_check_ins for select
  to authenticated
  using (member_id = (select auth.uid()));

comment on table public.event_check_ins is
  'Who checked in to an event. Not an RSVP. See 20261030000000.';

-- ------------------------------------------------- an invite for an organization --
-- Which organization an invite is for. Apart from invited_by_organization_id,
-- which says who sent it and cannot sit beside invited_by_member_id.
alter table public.invites
  add column for_organization_id uuid references public.organizations (id) on delete set null;

-- As 20261018030000, with the organization. Left out, an org admin of exactly
-- one organization means that one; of several, none (a cached app).
drop function public.create_my_invite(text, text);

create function public.create_my_invite(
  raw_email text,
  note text default null,
  p_organization uuid default null
)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  address text := public.normalize_email(raw_email);
  chosen uuid := p_organization;
  created public.invites;
begin
  if me is null then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  -- One at a time for each inviter, so the count below sees the invite a
  -- parallel call has just made. Held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('create_my_invite'), hashtext(me::text));

  -- The rules the direct-insert policy used to hold: an active member who may
  -- invite, within their allowance. 42501 is how the client already reads "the
  -- allowance is spent".
  if me is null
     or not exists (select 1 from public.my_invite_permissions() p where p.can_invite)
     or not (
       (select p.unlimited from public.my_invite_permissions() p)
       or public.live_invite_count(me) < public.mentor_invite_limit()
     ) then
    raise exception 'You cannot add another invite.' using errcode = '42501';
  end if;
  if not private.valid_email(address) then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;
  if public.is_blocked_email(address) then
    raise exception 'That email address is blocked from the club and cannot be invited';
  end if;
  if exists (
    select 1 from public.invites i
     where lower(i.email::text) = address and i.status in ('pending', 'consumed')
  ) then
    raise exception 'That email address is already on the list' using errcode = '23505';
  end if;

  if chosen is not null then
    if not (public.speaks_for(chosen) or public.is_admin()) then
      raise exception 'You cannot invite for that organization.' using errcode = '42501';
    end if;
  else
    select case when count(*) = 1 then (array_agg(o.id))[1] end
      into chosen
      from public.organizations o
     where o.id in (select public.my_organizations())
       and not o.is_the_club;
  end if;

  insert into public.invites (email, invited_by_member_id, note, for_organization_id)
  values (address::extensions.citext, me, nullif(btrim(coalesce(note, '')), ''), chosen)
  returning * into created;

  return created;
end;
$$;

revoke all on function public.create_my_invite(text, text, uuid) from public, anon;
grant execute on function public.create_my_invite(text, text, uuid) to authenticated;

-- ---------------------------------------------------------- joining on one --
-- After the row exists, from the invite consume_invite_for_new_member tied to it.
create function private.member_joins_their_organization()
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
     and not o.is_the_club
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.member_joins_their_organization() from public, anon, authenticated;

create trigger members_join_their_organization
  after insert on public.members
  for each row execute function private.member_joins_their_organization();

-- ------------------------------------------------------------- checking in --
-- The name of the organization this made them a member of, or null.
create function public.check_in_to_event(p_event uuid)
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

  with added as (
    insert into public.organization_members (organization_id, member_id, joined_via, event_id)
    select o.id, me, 'check_in', p_event
      from public.organizations o
     where o.id = found_event.organization_id
       and o.removed_at is null
       and not o.is_the_club
    on conflict do nothing
    returning organization_id
  )
  select o.name into joined
    from added a
    join public.organizations o on o.id = a.organization_id;

  return joined;
end;
$$;

revoke all on function public.check_in_to_event(uuid) from public, anon;
grant execute on function public.check_in_to_event(uuid) to authenticated;

-- --------------------------------------------------------- reading the lists --
create function public.event_check_in_list(p_event uuid)
returns table (
  member_id uuid,
  display_name text,
  username text,
  photo_path text,
  photo_alt text,
  checked_in_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id, m.display_name, m.username::text, m.photo_path, m.photo_alt, c.checked_in_at
    from public.event_check_ins c
    join public.members m on m.id = c.member_id
    join public.events e on e.id = c.event_id
   where c.event_id = p_event
     and (
       public.is_admin()
       or public.may_change_event(p_event)
       or (e.organization_id is not null and public.speaks_for(e.organization_id))
     )
   order by c.checked_in_at desc, m.id;
$$;

revoke all on function public.event_check_in_list(uuid) from public, anon;
grant execute on function public.event_check_in_list(uuid) to authenticated;

create function public.organization_member_list(p_organization uuid)
returns table (
  member_id uuid,
  display_name text,
  username text,
  photo_path text,
  photo_alt text,
  joined_via text,
  joined_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select m.id, m.display_name, m.username::text, m.photo_path, m.photo_alt,
         case when public.is_admin() or public.speaks_for(p_organization)
              then om.joined_via end,
         om.joined_at
    from public.organization_members om
    join public.members m on m.id = om.member_id and m.status = 'active'
   where om.organization_id = p_organization
     and om.left_at is null
     and om.denied_at is null
     and public.is_member()
     and (
       public.is_admin()
       or public.speaks_for(p_organization)
       or m.id = auth.uid()
       or (m.show_in_browse and not public.members_blocked(auth.uid(), m.id))
     )
   order by m.display_name, m.id;
$$;

revoke all on function public.organization_member_list(uuid) from public, anon;
grant execute on function public.organization_member_list(uuid) to authenticated;

-- A profile's organizations.
create function public.member_organizations(p_member uuid)
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select om.organization_id
    from public.organization_members om
    join public.members m on m.id = om.member_id and m.status = 'active'
   where om.member_id = p_member
     and om.left_at is null
     and om.denied_at is null
     and public.is_member()
     and (
       m.id = auth.uid()
       or (m.show_in_browse and not public.members_blocked(auth.uid(), m.id))
     );
$$;

revoke all on function public.member_organizations(uuid) from public, anon;
grant execute on function public.member_organizations(uuid) to authenticated;

create function public.organization_member_count(p_organization uuid)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)
    from public.organization_members om
    join public.members m on m.id = om.member_id and m.status = 'active'
   where om.organization_id = p_organization
     and om.left_at is null
     and om.denied_at is null
     and public.is_member();
$$;

revoke all on function public.organization_member_count(uuid) from public, anon;
grant execute on function public.organization_member_count(uuid) to authenticated;

-- ------------------------------------------------------ joining and leaving --
create function public.join_organization(p_organization uuid)
returns void
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
  select o.name, o.is_the_club into found_organization
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

  insert into public.organization_members (organization_id, member_id, joined_via)
  values (p_organization, me, 'join')
  on conflict (organization_id, member_id) do update
    set left_at = null, joined_via = 'join', joined_at = now(),
        reviewed_at = null, reviewed_by = null
    where public.organization_members.left_at is not null;
end;
$$;

revoke all on function public.join_organization(uuid) from public, anon;
grant execute on function public.join_organization(uuid) to authenticated;

create function public.leave_organization(p_organization uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.organization_members
     set left_at = now()
   where organization_id = p_organization
     and member_id = auth.uid()
     and left_at is null;
$$;

revoke all on function public.leave_organization(uuid) from public, anon;
grant execute on function public.leave_organization(uuid) to authenticated;

-- ------------------------------------------------- org admins reviewing Join --
create function public.organization_member_reviews(p_organization uuid)
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
  select m.id, m.display_name, m.username::text, m.photo_path, m.photo_alt,
         om.joined_at, om.denied_at, om.denied_reason
    from public.organization_members om
    join public.members m on m.id = om.member_id and m.status = 'active'
   where om.organization_id = p_organization
     and (public.is_admin() or public.speaks_for(p_organization))
     and (
       om.denied_at is not null
       or (om.joined_via = 'join' and om.reviewed_at is null and om.left_at is null)
     )
   order by om.denied_at nulls first, om.joined_at desc, m.id;
$$;

revoke all on function public.organization_member_reviews(uuid) from public, anon;
grant execute on function public.organization_member_reviews(uuid) to authenticated;

-- Approving also takes back a denial. Denying needs a reason, which goes to
-- them as a direct message; a blocked pair has no such thread, and the
-- organization's page still shows it.
create function public.review_organization_member(
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

-- ------------------------------------------------------ the members' group chat --
-- The owner, 2026-10-30: "We should create a group chat for all members."
-- One for each organization, made when it has its first member, with its org
-- admins in it. Joining adds the member and leaving takes them out; somebody
-- can leave the chat alone and stay a member. Nobody else can be added.
alter table public.chat_threads
  add column organization_id uuid unique references public.organizations (id) on delete set null;

grant select (organization_id) on public.chat_threads to authenticated;

-- Everybody who joins goes through here, so a failure of the chat must never
-- fail the join or the check-in: see the handler in the trigger below.
create function private.organization_chat(p_organization uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_thread uuid;
  organization_name text;
begin
  select t.id into found_thread
    from public.chat_threads t where t.organization_id = p_organization;
  if found_thread is not null then
    return found_thread;
  end if;

  select btrim(o.name) into organization_name
    from public.organizations o where o.id = p_organization;

  insert into public.chat_threads (kind, name, organization_id)
  values ('group', left(organization_name, 52) || ' members', p_organization)
  on conflict (organization_id) do nothing
  returning id into found_thread;

  if found_thread is null then
    select t.id into found_thread
      from public.chat_threads t where t.organization_id = p_organization;
    return found_thread;
  end if;

  -- Its org admins, but not one blocked from whoever is joining: a blocked
  -- pair cannot be put in a group by one of them
  -- (chat_refuse_blocked_group_add).
  insert into public.chat_thread_members (thread_id, member_id)
  select found_thread, r.member_id
    from public.organization_representatives r
    join public.members m on m.id = r.member_id and m.status = 'active'
   where r.organization_id = p_organization
     and (auth.uid() is null or not public.members_blocked(auth.uid(), r.member_id))
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;

revoke all on function private.organization_chat(uuid) from public, anon, authenticated;

create function private.organization_member_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active boolean := new.left_at is null and new.denied_at is null;
begin
  -- Following is being a member: see the header.
  if active then
    insert into public.organization_follows (member_id, organization_id)
    values (new.member_id, new.organization_id)
    on conflict do nothing;
  else
    delete from public.organization_follows f
     where f.member_id = new.member_id and f.organization_id = new.organization_id;
  end if;

  begin
    if active then
      insert into public.chat_thread_members (thread_id, member_id)
      values (private.organization_chat(new.organization_id), new.member_id)
      on conflict (thread_id, member_id) do nothing;
    elsif not exists (
      select 1 from public.organization_representatives r
       where r.organization_id = new.organization_id and r.member_id = new.member_id
    ) then
      delete from public.chat_thread_members tm
       using public.chat_threads t
       where t.id = tm.thread_id
         and t.organization_id = new.organization_id
         and tm.member_id = new.member_id;
    end if;
  exception when others then
    raise warning 'organization_member_changed: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.organization_member_changed() from public, anon, authenticated;

create trigger organization_members_chat
  after insert or update of left_at, denied_at on public.organization_members
  for each row execute function private.organization_member_changed();

-- An org admin added or removed later, once the chat exists.
create function private.organization_admin_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.chat_thread_members (thread_id, member_id)
    select t.id, new.member_id
      from public.chat_threads t
     where t.organization_id = new.organization_id
       and (auth.uid() is null or not public.members_blocked(auth.uid(), new.member_id))
    on conflict (thread_id, member_id) do nothing;
  elsif not exists (
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

revoke all on function private.organization_admin_changed() from public, anon, authenticated;

create trigger organization_representatives_chat
  after insert or delete on public.organization_representatives
  for each row execute function private.organization_admin_changed();

-- chat_add_to_group adds to any group that is not an event's. This keeps an
-- organization's to its members and org admins, however the row arrives.
create function private.organization_chat_is_its_own()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  organization uuid;
begin
  select t.organization_id into organization
    from public.chat_threads t where t.id = new.thread_id;
  if organization is not null and not exists (
    select 1 from public.organization_members om
     where om.organization_id = organization
       and om.member_id = new.member_id
       and om.left_at is null
       and om.denied_at is null
    union all
    select 1 from public.organization_representatives r
     where r.organization_id = organization and r.member_id = new.member_id
  ) then
    raise exception 'Only the organization''s members are in its group chat.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.organization_chat_is_its_own() from public, anon, authenticated;

create trigger chat_thread_members_organization
  before insert on public.chat_thread_members
  for each row execute function private.organization_chat_is_its_own();

-- ------------------------------------------------------------ an event's chat --
-- The owner, 2026-10-30: "let anybody join an event chat, even if they are
-- not going. They should also stay open after the event." It was open to
-- anyone who could see the event, at any time (20261022210000). Now any active
-- member, including one a followers or groups event leaves out: its link is
-- public now (20261029110000), so the name is no secret. As that migration,
-- without can_see_event.
create or replace function public.chat_join_event_group(event uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_thread uuid;
  event_title text;
begin
  if not public.is_active_member() then
    raise exception 'Only an active member can join a group chat.' using errcode = '42501';
  end if;

  if event is null then
    raise exception 'There is no such event.' using errcode = '22023';
  end if;

  select t.id into found_thread
    from public.chat_threads t where t.event_id = event;

  if found_thread is not null and exists (
    select 1 from public.chat_thread_members m
    where m.thread_id = found_thread and m.member_id = me
  ) then
    return found_thread;
  end if;

  select e.title into event_title from public.events e where e.id = event;

  if event_title is null then
    raise exception 'There is no such event.' using errcode = 'P0002';
  end if;

  if found_thread is null then
    insert into public.chat_threads (kind, name, event_id, created_by)
    values (
      'group',
      case when char_length(btrim(event_title)) > 60
        then left(btrim(event_title), 59) || '…'
        else btrim(event_title)
      end,
      event,
      me
    )
    on conflict (event_id) do nothing
    returning id into found_thread;

    if found_thread is null then
      select t.id into found_thread from public.chat_threads t where t.event_id = event;
    end if;
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (found_thread, me)
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;

-- ---------------------------------------------------- follows become members --
-- Written only by the trigger from now on. Anybody following today is a member,
-- already approved, and is in that organization's chat.
revoke insert, delete on public.organization_follows from authenticated;

insert into public.organization_members (organization_id, member_id, joined_via, joined_at, reviewed_at)
select f.organization_id, f.member_id, 'join', f.followed_at, now()
  from public.organization_follows f
  join public.organizations o on o.id = f.organization_id
  join public.members m on m.id = f.member_id and m.status = 'active'
 where o.removed_at is null
   and not o.is_the_club
on conflict do nothing;

-- ------------------------------------------------- an org admin inviting a member --
-- The owner, 2026-10-30: seeing what somebody belongs to, "as an admin we can
-- let them invite members to join". From a profile, a direct message from the
-- org admin with the organization's page; they still press Join themselves, so
-- nobody is put in a chat by somebody else. Once for each organization and
-- member, so it cannot become a stream of messages.
create table public.organization_member_invites (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  invited_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, member_id)
);

create index organization_member_invites_member_idx
  on public.organization_member_invites (member_id);
create index organization_member_invites_invited_by_idx
  on public.organization_member_invites (invited_by);

alter table public.organization_member_invites enable row level security;
revoke all on public.organization_member_invites from public, anon, authenticated;

create function public.invite_to_organization(p_organization uuid, p_member uuid)
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
   where o.id = p_organization and not o.is_the_club;
  if organization_name is null then
    raise exception 'Everybody here already belongs to The SCI Club.' using errcode = '22023';
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

revoke all on function public.invite_to_organization(uuid, uuid) from public, anon;
grant execute on function public.invite_to_organization(uuid, uuid) to authenticated;

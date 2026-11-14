-- ============================================================================
-- Organizers tick off who came, and keep the guest list
--
-- The owner, 2026-11-13: "Let's let admins specify who was at an event without
-- a time limit. ... check in boxes next to the guests that said they were
-- going ... some may be non-members. They should be able to manage the guest
-- list as well. You should be able to check people in after an event starts.
-- You should be able to delete or remove guests at any time."
--
-- Whoever sees the guest list (may_change_event: the event's organizers and
-- the club's administrators) can now, from it:
--
-- * tick a guest as there, once the event has started, and for ever after;
--   untick at any time. A member is ticked into event_check_ins, as checking
--   in themselves does, but is not made a member of the hosting organization:
--   that is theirs to choose. Somebody who registered on the public page is
--   ticked on their registration.
-- * add a guest by name, with an email and phone if they have them (somebody
--   at the door). The email is optional now, for exactly that.
-- * remove a guest at any time: a member's RSVP and check-in, or a
--   registration. A member removed can say Going again; nobody is taken out of
--   the event's chat (20261101090000), as changing an RSVP never does.
--
-- event_guest_list gains each guest's member id, whether they are ticked, and,
-- when the app asks (p_with_walk_ins), members who checked in without saying
-- Going. An older copy of the app asks with the event alone and gets the list
-- it knows, with two columns it ignores.
-- ============================================================================

alter table public.event_check_ins
  add column if not exists checked_in_by uuid references public.members (id) on delete set null;
comment on column public.event_check_ins.checked_in_by is
  'An organizer who ticked them as there (20261113110000); null when they checked in themselves.';

alter table public.event_registrations
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references public.members (id) on delete set null,
  add column if not exists added_by uuid references public.members (id) on delete set null;
alter table public.event_registrations alter column email drop not null;
comment on column public.event_registrations.added_by is
  'An organizer who put them on the list (20261113110000); null when they registered themselves.';

-- ------------------------------------------------------------- the list

drop function if exists public.event_guest_list(uuid);

create or replace function public.event_guest_list(event uuid, p_with_walk_ins boolean default false)
returns table(
  name text, email text, phone text, status text, state text,
  responded_at timestamptz, registration_id uuid, invite_status text, invite_id uuid,
  member_id uuid, checked_in boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.may_change_event(event) then
    raise exception 'Only the event''s organizers see its guest list.' using errcode = '42501';
  end if;

  -- Members only when Going: the privacy policy promises that Interested
  -- shares nothing with the host. A registration from the public page is
  -- listed either way, since its form says the organizer sees it.
  return query
    -- Not an address the member has not confirmed (20261104110000).
    select m.display_name, case when private.email_unproven(m.id) then null else u.email::text end,
           m.phone, r.status, 'member'::text, r.created_at,
           null::uuid, null::text, null::uuid,
           m.id,
           exists (select 1 from public.event_check_ins c where c.event_id = event and c.member_id = m.id)
      from public.event_rsvps r
      join public.members m on m.id = r.member_id
      left join auth.users u on u.id = m.id
     where r.event_id = event and r.status = 'going'
    union all
    -- Somebody who came is no secret from the host, Going or not: a member
    -- who checked in without saying Going (20261113110000).
    select m.display_name, case when private.email_unproven(m.id) then null else u.email::text end,
           m.phone, 'walk_in'::text, 'member'::text, c.checked_in_at,
           null::uuid, null::text, null::uuid,
           m.id, true
      from public.event_check_ins c
      join public.members m on m.id = c.member_id
      left join auth.users u on u.id = m.id
     where p_with_walk_ins
       and c.event_id = event
       and not exists (
         select 1 from public.event_rsvps r
          where r.event_id = event and r.member_id = m.id and r.status = 'going'
       )
       and not exists (
         select 1 from public.event_registrations g
          where g.event_id = event and g.member_id is null
            and lower(g.email::text) = lower(u.email)
       )
    union all
    -- A member's address not yet claimed reads as a member; an account with
    -- no member yet, as joining; nothing but the form, as unconfirmed.
    select g.name, g.email::text, g.phone, g.status,
           case
             when exists (
               select 1 from auth.users u join public.members m on m.id = u.id
                where lower(u.email) = lower(g.email::text)
             ) then 'member'
             when exists (
               select 1 from auth.users u where lower(u.email) = lower(g.email::text)
             ) then 'joining'
             else 'unconfirmed'
           end,
           g.created_at,
           g.id,
           inv.status,
           case
             when inv.status = 'pending'
              and (inv.invited_by_member_id = (select auth.uid()) or public.is_admin())
               then inv.id
           end,
           null::uuid,
           g.checked_in_at is not null
      from public.event_registrations g
      left join lateral (
        select i.id, i.status, i.invited_by_member_id
          from public.invites i
         where lower(i.email::text) = lower(g.email::text)
           and i.status in ('pending', 'consumed')
         order by i.status = 'pending' desc, i.created_at desc
         limit 1
      ) inv on true
     where g.event_id = event and g.member_id is null
       -- Not twice: a member who also said yes in the club is listed once.
       and not exists (
         select 1 from public.event_rsvps r
           join auth.users u on u.id = r.member_id
          where r.event_id = event and r.status = 'going'
            and lower(u.email) = lower(g.email::text)
       )
    order by 6;
end;
$$;

revoke all on function public.event_guest_list(uuid, boolean) from public, anon;
grant execute on function public.event_guest_list(uuid, boolean) to authenticated;

-- ------------------------------------------------------------- ticking

create or replace function public.event_guest_check_in(
  p_event uuid,
  p_checked boolean,
  p_member uuid default null,
  p_registration uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  starts timestamptz;
begin
  if me is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can check guests in.' using errcode = '42501';
  end if;
  if (p_member is null) = (p_registration is null) then
    raise exception 'Say which guest.' using errcode = '22023';
  end if;

  select e.start_time into starts from public.events e where e.id = p_event;
  if p_checked and now() < starts then
    raise exception 'Guests can be checked in once the event has started.' using errcode = '22023';
  end if;

  if p_member is not null then
    if not p_checked then
      delete from public.event_check_ins c where c.event_id = p_event and c.member_id = p_member;
      return;
    end if;
    if not exists (
      select 1 from public.event_rsvps r
       where r.event_id = p_event and r.member_id = p_member and r.status = 'going'
    ) then
      raise exception 'They are not on the guest list.' using errcode = 'P0002';
    end if;
    insert into public.event_check_ins (event_id, member_id, checked_in_by)
    values (p_event, p_member, me)
    on conflict do nothing;
    return;
  end if;

  update public.event_registrations g
     set checked_in_at = case when p_checked then coalesce(g.checked_in_at, now()) end,
         checked_in_by = case when p_checked then coalesce(g.checked_in_by, me) end
   where g.id = p_registration and g.event_id = p_event;
  if not found then
    raise exception 'They are not on the guest list.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.event_guest_check_in(uuid, boolean, uuid, uuid) from public, anon;
grant execute on function public.event_guest_check_in(uuid, boolean, uuid, uuid) to authenticated;

-- ------------------------------------------------------------- adding

create or replace function public.event_guest_add(
  p_event uuid,
  p_name text,
  p_email text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean_name text := btrim(coalesce(p_name, ''));
  address text := nullif(public.normalize_email(nullif(btrim(coalesce(p_email, '')), '')), '');
  clean_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  made uuid;
begin
  if me is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can add guests.' using errcode = '42501';
  end if;
  if char_length(clean_name) not between 1 and 100 then
    raise exception 'Give the guest''s name.' using errcode = '22023';
  end if;
  if address is not null and not private.valid_email(address) then
    raise exception 'That does not look like an email address.' using errcode = '22023';
  end if;
  if clean_phone is not null and char_length(clean_phone) > 32 then
    raise exception 'That phone number is too long.' using errcode = '22023';
  end if;

  insert into public.event_registrations (event_id, name, email, phone, status, added_by)
  values (p_event, clean_name, address, clean_phone, 'going', me)
  on conflict (event_id, email) do nothing
  returning id into made;
  if made is null then
    raise exception 'Somebody with that email is on the list already.' using errcode = '23505';
  end if;
  return made;
end;
$$;

revoke all on function public.event_guest_add(uuid, text, text, text) from public, anon;
grant execute on function public.event_guest_add(uuid, text, text, text) to authenticated;

-- ------------------------------------------------------------- removing

create or replace function public.event_guest_remove(
  p_event uuid,
  p_member uuid default null,
  p_registration uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can remove guests.' using errcode = '42501';
  end if;
  if (p_member is null) = (p_registration is null) then
    raise exception 'Say which guest.' using errcode = '22023';
  end if;

  if p_member is not null then
    delete from public.event_rsvps r where r.event_id = p_event and r.member_id = p_member;
    delete from public.event_check_ins c where c.event_id = p_event and c.member_id = p_member;
    return;
  end if;

  delete from public.event_registrations g where g.id = p_registration and g.event_id = p_event;
end;
$$;

revoke all on function public.event_guest_remove(uuid, uuid, uuid) from public, anon;
grant execute on function public.event_guest_remove(uuid, uuid, uuid) to authenticated;

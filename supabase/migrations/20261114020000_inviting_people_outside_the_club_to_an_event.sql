-- ============================================================================
-- Inviting people who are not in the club to an event, invite-only ones too
-- ============================================================================
-- The owner, 2026-11-14: an organizer invites a list of people (a Google
-- Sheet, rows pasted, addresses from Gmail) who are not in the club to an
-- event. Their email opens the event's own page with their name and address
-- filled in and "Accept invite and join the club", which takes them through
-- onboarding with what they entered kept. Once in, they are invited to the
-- event and Going.
--
-- How it fits what is there:
--   - Each person gets a club invite (public.invites, so every rule about
--     invites holds) that also names the event (invites.event_id). The token
--     in their email is the one secret; it opens that one event's page for
--     them even when the event is private (event_invite_page). The share
--     link and short link stay as 20261106030000 left them.
--   - Accepting (accept_event_invite) writes the registration a guest would
--     have made on the public page, Going, and ties the invite to it, so
--     invite_details_for_token fills onboarding in (20261104000000) and the
--     registration becomes their Going when the member row is made
--     (claim_event_registrations_for).
--   - When that registration is claimed, an invite-only event adds them to
--     its invitees, so they see it as any invited member does.
--   - Somebody on the list who is already a member is simply added to an
--     invite-only event's invitees and told, as "Who is invited" does.
-- Nothing is renamed or dropped (the store app).
-- ============================================================================

alter table public.invites
  add column if not exists event_id uuid references public.events (id) on delete set null;
comment on column public.invites.event_id is
  'The event this club invite was sent for: its email opens the event''s page. See 20261114020000.';

-- --------------------------------------------- onboarding fills the name --
-- As 20261104000000, with the name a spreadsheet or event list gave
-- (20261114010000) when there is no registration to take it from.
create or replace function public.invite_details_for_token(token text)
returns table (
  email text,
  name text,
  phone text,
  event_id uuid,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(i.email::text), coalesce(r.name, i.invitee_name), r.phone, r.event_id, r.status
    from public.invites i
    left join public.event_registrations r
      on r.id = i.event_registration_id
     and lower(r.email::text) = lower(i.email::text)
   where i.token_hash = encode(extensions.digest(btrim(token), 'sha256'), 'hex')
     and i.status = 'pending'
     and i.claimed_by is null
     and i.email is not null
     and not public.is_blocked_email(i.email::text)
   limit 1;
$$;

-- --------------------------------------------------------- the live link --
-- The invite a token belongs to, when it is a live invite for an event.
create function private.event_invite_for_token(p_token text)
returns public.invites
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
    from public.invites i
   where i.token_hash = encode(extensions.digest(btrim(coalesce(p_token, '')), 'sha256'), 'hex')
     and i.status = 'pending'
     and i.claimed_by is null
     and i.event_id is not null
     and i.email is not null
     and not public.is_blocked_email(i.email::text)
   limit 1;
$$;
revoke all on function private.event_invite_for_token(text) from public, anon, authenticated;

-- ---------------------------------------------------------- the list in --
-- p_people: [{"email": "...", "name": "..."}], at most 200. One
-- {email, name, outcome, invite_id} each, in order. outcome: added,
-- member_invited (a member, now invited to this invite-only event), member
-- (already in the club and able to see it, or already invited), repeat,
-- not_an_email, blocked, on_list (a club invite is already waiting or used),
-- limit (the organizer's invites are spent).
create function public.event_invite_list(
  p_event uuid,
  p_people jsonb,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  ev public.events;
  vouch uuid;
  admin boolean := public.is_admin();
  words text := nullif(btrim(coalesce(p_message, '')), '');
  person jsonb;
  address text;
  who text;
  member uuid;
  seen text[] := '{}';
  fresh uuid[] := '{}';
  outcome text;
  made uuid;
  results jsonb := '[]'::jsonb;
  batch timestamptz := now();
begin
  if me is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can invite people to it.' using errcode = '42501';
  end if;
  select * into ev from public.events e where e.id = p_event;
  if jsonb_typeof(p_people) is distinct from 'array' then
    raise exception 'The list did not come through.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_people) > 200 then
    raise exception 'Up to 200 people at a time.' using errcode = '22023';
  end if;
  if words is not null and char_length(words) > 1000 then
    raise exception 'The message can be up to 1,000 characters.' using errcode = '22023';
  end if;
  -- They join the host organization when they sign up, if the organizer may
  -- speak for it or is an administrator (as invite_event_guest).
  if ev.organization_id is not null and (admin or public.speaks_for(ev.organization_id)) then
    select o.id into vouch from public.organizations o
     where o.id = ev.organization_id and o.removed_at is null and not o.is_the_club;
  end if;

  for person in select value from jsonb_array_elements(p_people) loop
    address := public.normalize_email(coalesce(person ->> 'email', ''));
    who := nullif(left(btrim(coalesce(person ->> 'name', '')), 80), '');
    made := null;
    member := null;

    if not private.valid_email(address) then
      outcome := 'not_an_email';
    elsif address = any (seen) then
      outcome := 'repeat';
    elsif public.is_blocked_email(address) then
      outcome := 'blocked';
    elsif exists (select 1 from auth.users u where lower(u.email) = address) then
      select m.id into member
        from auth.users u join public.members m on m.id = u.id
       where lower(u.email) = address and m.status = 'active'
       limit 1;
      outcome := 'member';
      if member is not null and member <> me and ev.audience = 'people'
         and not exists (
           select 1 from public.member_blocks b
            where (b.blocker_id = me and b.blocked_id = member)
               or (b.blocker_id = member and b.blocked_id = me)
         ) then
        insert into public.event_invitees (event_id, member_id, invited_by)
        values (p_event, member, me)
        on conflict (event_id, member_id) do nothing;
        if found then
          outcome := 'member_invited';
          fresh := fresh || member;
        end if;
      end if;
    elsif exists (
      select 1 from public.invites i
       where lower(i.email::text) = address and i.status in ('pending', 'consumed')
    ) then
      outcome := 'on_list';
    elsif not admin and not (
      exists (select 1 from public.my_invite_permissions() p where p.can_invite)
      and (
        (select p.unlimited from public.my_invite_permissions() p)
        or public.live_invite_count(me) < public.mentor_invite_limit()
      )
    ) then
      outcome := 'limit';
    else
      begin
        insert into public.invites
          (email, invited_by_member_id, for_organization_id, note, invitee_name, message, event_id)
        values
          (address::extensions.citext, me, vouch,
           left('Invited to ' || coalesce(ev.title, 'an event'), 500), who, words, p_event)
        returning id into made;
        outcome := 'added';
      exception when unique_violation then
        outcome := 'on_list';
      end;
    end if;

    if private.valid_email(address) then
      seen := seen || address;
    end if;
    results := results || jsonb_build_object(
      'email', coalesce(nullif(address, ''), person ->> 'email'),
      'name', who,
      'outcome', outcome,
      'invite_id', made
    );
  end loop;

  -- Members newly invited are told, as set_event_visibility tells them.
  if cardinality(fresh) > 0 and coalesce(ev.end_time, ev.start_time) > now() then
    if ev.organization_id is not null then
      insert into public.event_member_notices as x
        (event_id, member_id, organization_id, first_sent_at, last_sent_at)
      select ev.id, f, ev.organization_id, batch, batch from unnest(fresh) f
      on conflict (event_id, member_id)
      do update set last_sent_at = excluded.last_sent_at, sends = x.sends + 1;
    end if;
    insert into public.notifications as n
      (member_id, kind, tag, actor_id, event_id, organization_id, detail, created_at)
    select f, 'event_notice', 'notice:' || ev.id::text, me, ev.id, ev.organization_id, null, batch
      from unnest(fresh) f
    on conflict (member_id, tag) where read_at is null
    do update set created_at = excluded.created_at, actor_id = excluded.actor_id,
                  detail = null, seen_at = null;
    perform public.push_notify_send(
      'event_notice', jsonb_build_object('event_id', ev.id, 'batch', batch));
  end if;

  return results;
end;
$$;
revoke all on function public.event_invite_list(uuid, jsonb, text) from public, anon;
grant execute on function public.event_invite_list(uuid, jsonb, text) to authenticated;

-- ------------------------------------------------------- the page opens --
-- The event as public_event gives it, for the holder of a live invite link,
-- private or not, with who they are and who asked. Nothing for any other
-- token.
create function public.event_invite_page(p_token text)
returns table (
  id uuid,
  title text,
  description text,
  description_html text,
  start_time timestamptz,
  end_time timestamptz,
  all_day boolean,
  timezone text,
  location text,
  city text,
  state text,
  event_format text,
  url text,
  registration_url text,
  photo_path text,
  photo_alt text,
  more_photos jsonb,
  organization_id uuid,
  organization_name text,
  organization_short_code text,
  organization_logo_path text,
  takes_rsvps boolean,
  guest_email text,
  guest_name text,
  guest_phone text,
  inviter_name text,
  accepted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.description, e.description_html, e.start_time, e.end_time,
         e.all_day, e.timezone, e.location, e.city, e.state, e.event_format, e.url,
         e.registration_url, e.photo_path, e.photo_alt, e.more_photos,
         o.id, o.name, o.short_code, o.logo_path,
         true,
         lower(i.email::text), coalesce(r.name, i.invitee_name), r.phone,
         im.display_name,
         r.id is not null
    from private.event_invite_for_token(p_token) i
    join public.events e on e.id = i.event_id
    left join public.organizations o on o.id = e.organization_id and o.removed_at is null
    left join public.members im on im.id = i.invited_by_member_id
    left join public.event_registrations r
      on r.id = i.event_registration_id and lower(r.email::text) = lower(i.email::text)
   where i.id is not null;
$$;
revoke all on function public.event_invite_page(text) from public;
grant execute on function public.event_invite_page(text) to anon, authenticated;

-- --------------------------------------------------------- accepting it --
-- "Accept invite and join the club": the registration they would have made
-- on the page, Going, at the address the invite went to, tied to the invite
-- so onboarding starts from it. Returns the event. Again is fine: it updates.
create function public.accept_event_invite(p_token text, p_name text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invites := private.event_invite_for_token(p_token);
  cleaned_name text := btrim(coalesce(p_name, ''));
  cleaned_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  reg uuid;
begin
  if inv.id is null then
    raise exception 'This invite link has been used or is no longer good.' using errcode = '22023';
  end if;
  if cleaned_name = '' or char_length(cleaned_name) > 100 then
    raise exception 'Add your name.' using errcode = '22023';
  end if;
  if cleaned_phone is not null and char_length(cleaned_phone) > 32 then
    raise exception 'That phone number is too long.' using errcode = '22023';
  end if;

  insert into public.event_registrations as r (event_id, name, email, phone, status, added_by)
  values (inv.event_id, cleaned_name, inv.email, cleaned_phone, 'going', inv.invited_by_member_id)
  on conflict (event_id, email) do update
    set name = excluded.name, phone = excluded.phone, status = 'going', updated_at = now()
  returning r.id into reg;

  update public.invites set event_registration_id = reg where id = inv.id;
  return inv.event_id;
end;
$$;
revoke all on function public.accept_event_invite(text, text, text) from public;
grant execute on function public.accept_event_invite(text, text, text) to anon, authenticated;

-- ------------------------------------------------- invited once they join --
-- When a registration that came from an event invite is claimed by the new
-- member, an invite-only event counts them among its invitees.
create function private.invited_guest_becomes_invitee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_invitees (event_id, member_id, invited_by)
  select new.event_id, new.member_id, i.invited_by_member_id
    from public.invites i
    join public.events e on e.id = new.event_id and e.audience = 'people'
   where i.event_registration_id = new.id
     and i.event_id = new.event_id
   limit 1
  on conflict (event_id, member_id) do nothing;
  return null;
end;
$$;
revoke all on function private.invited_guest_becomes_invitee() from public, anon, authenticated;

create trigger event_registrations_invited_guest_becomes_invitee
  after update of member_id on public.event_registrations
  for each row
  when (old.member_id is null and new.member_id is not null)
  execute function private.invited_guest_becomes_invitee();

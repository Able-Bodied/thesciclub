-- ============================================================================
-- An invitation joins the event already there
-- ============================================================================
-- The owner, 2026-11-05: "The SCI Club Weekly" was on the calendar twice on
-- Nov 6, once added in the club and once from a Google Calendar invitation.
-- Combine them, with the invitation's look (its meeting link) and the club
-- event's organization.
--
-- A new invitation that is not repeating, with the same title and start time
-- as one event added in the club that its sender may change, joins that event
-- instead of making another. The event keeps its organization, registration
-- link, RSVPs and group chat. With a meeting link, the invitation's title,
-- description, time, place and link replace the event's; without one, only its
-- title and time. A later change does the same, in place. Cancelling leaves
-- the event, which was made in the club; a change to one that did not join
-- still replaces its event (20261022220000).
--
-- "The SCI Club" as an invitation's host is the club's own organization
-- (20261028950000), so its events show the club's logo.
--
-- calendar_join_duplicates combines pairs already made: the invitation's
-- event goes, its RSVPs and its chat move to the club's event when that has
-- none, and the club's event takes the invitation's details as above. A pair
-- whose two chats both have messages is left alone. Safe to run twice.
--
-- Probe: calendar-invite-joins.sql. Undo: supabase/undo/20261105120000.sql.
-- ============================================================================

alter table public.calendar_invites add column joined boolean not null default false;

comment on column public.calendar_invites.joined is
  'True when the invitation joined an event added in the club rather than making its own: cancelling it leaves the event. See 20261105120000.';

-- The club's own organization, or null without one.
create or replace function private.the_club()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id from public.organizations o
   where o.is_the_club and o.removed_at is null
   order by o.created_at
   limit 1;
$$;

revoke all on function private.the_club() from public, anon, authenticated;

create or replace function private.calendar_make_event(payload jsonb, organization uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  w jsonb := private.calendar_where(payload);
  made uuid;
  repeat jsonb := payload -> 'repeat';
begin
  -- "The SCI Club" is the club's own organization, with its logo, where
  -- there is one (20261028950000); the name alone only without it.
  organization := coalesce(organization, private.the_club());
  if repeat is not null and jsonb_typeof(repeat) = 'object' then
    made := public.save_event_series(
      organization,
      case when organization is null then 'The SCI Club' end,
      payload ->> 'title',
      payload ->> 'description',
      (payload ->> 'starts')::timestamptz,
      (payload ->> 'ends')::timestamptz,
      w ->> 'format', w ->> 'place', w ->> 'city', w ->> 'link', null,
      repeat ->> 'unit',
      (repeat ->> 'every')::integer,
      (repeat ->> 'endsOn')::date,
      (repeat ->> 'endsAfter')::integer
    );
  else
    made := public.save_event(
      null, organization,
      case when organization is null then 'The SCI Club' end,
      payload ->> 'title',
      payload ->> 'description',
      (payload ->> 'starts')::timestamptz,
      (payload ->> 'ends')::timestamptz,
      w ->> 'format', w ->> 'place', w ->> 'city', w ->> 'link', null
    );
  end if;

  update public.events e
     set all_day = coalesce((payload ->> 'allDay')::boolean, false),
         timezone = nullif(payload ->> 'timezone', ''),
         state = w ->> 'state'
   where e.id = made or (e.series_id is not null and e.series_id = (
     select series_id from public.events where id = made));
  return made;
end;
$$;

revoke all on function private.calendar_make_event(jsonb, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ the same one --
-- The one event added in the club that this invitation is: not repeating, the
-- same title and start, one auth.uid() may change, and no other invitation's.
-- Null for none, or for more than one.
create or replace function private.calendar_same_event(payload jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_ids uuid[];
begin
  if jsonb_typeof(payload -> 'repeat') = 'object' or (payload ->> 'starts') is null then
    return null;
  end if;
  select coalesce(array_agg(e.id), '{}') into found_ids
    from public.events e
   where e.feed_id is null
     and lower(btrim(e.title)) = lower(btrim(coalesce(payload ->> 'title', '')))
     and e.start_time = (payload ->> 'starts')::timestamptz
     and not exists (
       select 1 from public.calendar_invites i where i.event_id = e.id and i.state = 'added'
     )
     and public.may_post_events_for(e.organization_id);
  return case when cardinality(found_ids) = 1 then found_ids[1] end;
end;
$$;

revoke all on function private.calendar_same_event(jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------- join --
-- The invitation's details on an event added in the club, as auth.uid(),
-- under save_event's rules. Keeps the event's host and registration link.
create or replace function private.calendar_join_event(event uuid, payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
  w jsonb := private.calendar_where(payload);
begin
  select * into e from public.events x where x.id = event;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if nullif(w ->> 'link', '') is not null then
    perform public.save_event(
      e.id, e.organization_id, e.host_name, payload ->> 'title',
      coalesce(nullif(btrim(coalesce(payload ->> 'description', '')), ''), e.description),
      (payload ->> 'starts')::timestamptz, (payload ->> 'ends')::timestamptz,
      w ->> 'format', w ->> 'place', w ->> 'city', w ->> 'link', e.registration_url, w ->> 'state'
    );
  else
    perform public.save_event(
      e.id, e.organization_id, e.host_name, payload ->> 'title', e.description,
      (payload ->> 'starts')::timestamptz, (payload ->> 'ends')::timestamptz,
      e.event_format, e.location, e.city, e.url, e.registration_url, e.state
    );
  end if;
  update public.events x
     set all_day = coalesce((payload ->> 'allDay')::boolean, false),
         timezone = coalesce(nullif(payload ->> 'timezone', ''), x.timezone)
   where x.id = e.id;
  return e.id;
end;
$$;

revoke all on function private.calendar_join_event(uuid, jsonb) from public, anon, authenticated;

create or replace function public.calendar_invite_receive(
  sender text, verified boolean, tag text, invite jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  address text := public.normalize_email(sender);
  member uuid;
  is_admin boolean;
  spoken uuid[];
  org uuid;
  org_name text;
  need_choice boolean := false;
  uid_ text := btrim(coalesce(invite ->> 'uid', ''));
  seq integer := coalesce((invite ->> 'sequence')::integer, 0);
  cancelled boolean := coalesce((invite ->> 'cancelled')::boolean, false);
  recurrence timestamptz := (invite ->> 'recurrenceId')::timestamptz;
  existing public.calendar_invites%rowtype;
  had boolean;
  new_id uuid;
  made uuid;
  same uuid;
  joined_ boolean := false;
  outcome text;
  reason_ text;
  notify text[];
begin
  if uid_ = '' or address is null then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'No event in it.');
  end if;

  select m.id, m.is_admin into member, is_admin
    from public.members m join auth.users u on u.id = m.id
   where lower(u.email) = address and m.status = 'active';
  if member is null then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'Not from a member.');
  end if;

  select coalesce(array_agg(r.organization_id), '{}') into spoken
    from public.organization_representatives r
    join public.organizations o on o.id = r.organization_id and o.removed_at is null
   where r.member_id = member;

  if not is_admin and cardinality(spoken) = 0 then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'Not from an organization''s representative.');
  end if;

  -- Which organization hosts it.
  if nullif(btrim(coalesce(tag, '')), '') is not null then
    select o.id into org from public.organizations o
     where lower(o.short_code) = lower(btrim(tag)) and o.removed_at is null
       and (is_admin or o.id = any (spoken));
    if org is null then
      need_choice := true;
      reason_ := format('No organization you speak for has the short code %s.', btrim(tag));
    end if;
  elsif cardinality(spoken) = 1 then
    org := spoken[1];
  elsif cardinality(spoken) > 1 then
    need_choice := true;
    reason_ := 'You speak for more than one organization: choose which hosts it.';
  end if;
  select o.name into org_name from public.organizations o where o.id = org;

  select * into existing from public.calendar_invites i where i.uid = uid_;
  had := found;
  if had and seq < existing.sequence then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'An older copy of an invitation already received.');
  end if;

  -- Who hears about a held one: the organization's representatives, or for an
  -- organization not yet chosen, those of every one the sender speaks for.
  select coalesce(array_agg(distinct lower(u.email)), '{}') into notify
    from public.organization_representatives r
    join public.members m on m.id = r.member_id and m.status = 'active'
    join auth.users u on u.id = m.id
   where r.organization_id = any (case when org is not null then array[org] else spoken end);
  if cardinality(notify) = 0 then
    select coalesce(array_agg(distinct lower(u.email)), '{}') into notify
      from public.members m join auth.users u on u.id = m.id
     where m.is_admin and m.status = 'active';
  end if;

  -- ------------------------------------------------------------ cancelled --
  if cancelled then
    if not had then
      return jsonb_build_object('outcome', 'ignored', 'reason', 'Cancelled before it was added.');
    end if;
    if not verified then
      return jsonb_build_object('outcome', 'ignored', 'reason',
        'A cancellation that could not be verified is not acted on.');
    end if;
    perform private.act_as(member);
    if recurrence is not null then
      -- One date of a repeating event.
      perform public.delete_event(e.id) from public.events e
        join public.events opener on opener.id = existing.event_id
       where e.series_id = opener.series_id and e.start_time = recurrence;
      return jsonb_build_object('outcome', 'cancelled', 'invite', existing.id, 'reason', 'One date.');
    end if;
    -- An event made in the club stays: the invitation only joined it.
    if not existing.joined then
      perform private.calendar_remove_event(existing.event_id);
    end if;
    update public.calendar_invites i
       set state = 'cancelled', sequence = seq, payload = invite, decided_at = now()
     where i.id = existing.id;
    return jsonb_build_object('outcome', 'cancelled', 'invite', existing.id,
      'event', case when existing.joined then existing.event_id end,
      'kept', existing.joined);
  end if;

  if recurrence is not null then
    -- A change to one date of a repeating event: not something the club's
    -- repeating events can hold apart from the rest.
    return jsonb_build_object('outcome', 'ignored', 'reason',
      'A change to one date of a repeating event is not copied; change it in the club.');
  end if;

  -- --------------------------------------------------------------- held --
  if not verified or need_choice then
    reason_ := coalesce(reason_, 'The invitation could not be verified as coming from you.');
    if had then
      update public.calendar_invites i
         set state = 'held',
             sequence = seq, payload = invite, verified = calendar_invite_receive.verified,
             organization_id = coalesce(org, i.organization_id), reason = reason_,
             received_at = now(), decided_by = null, decided_at = null
       where i.id = existing.id;
      return jsonb_build_object('outcome', 'held', 'invite', existing.id, 'reason', reason_,
        'organization', org_name, 'notify', to_jsonb(notify));
    end if;
    insert into public.calendar_invites
      (uid, sequence, sender_email, sender_member_id, organization_id, verified, state, reason, payload)
    values (uid_, seq, address, member, org, verified, 'held', reason_, invite)
    returning id into new_id;
    return jsonb_build_object('outcome', 'held', 'invite', new_id, 'reason', reason_,
      'organization', org_name, 'notify', to_jsonb(notify));
  end if;

  -- ----------------------------------------------------------- add or change --
  perform private.act_as(member);
  begin
    if had and existing.state = 'added' and existing.event_id is not null and existing.joined then
      made := private.calendar_join_event(existing.event_id, invite);
      joined_ := true;
      outcome := 'updated';
    elsif had and existing.state = 'added' and existing.event_id is not null then
      perform private.calendar_remove_event(existing.event_id);
      made := private.calendar_make_event(invite, org);
      outcome := 'updated';
    else
      same := private.calendar_same_event(invite);
      if same is not null then
        made := private.calendar_join_event(same, invite);
        joined_ := true;
      else
        made := private.calendar_make_event(invite, org);
      end if;
      outcome := 'added';
    end if;
  exception when others then
    reason_ := sqlerrm;
    if had then
      update public.calendar_invites i
         set state = 'refused', reason = reason_, sequence = seq, payload = invite
       where i.id = existing.id;
    else
      insert into public.calendar_invites
        (uid, sequence, sender_email, sender_member_id, organization_id, verified, state, reason, payload)
      values (uid_, seq, address, member, org, true, 'refused', reason_, invite);
    end if;
    return jsonb_build_object('outcome', 'refused', 'reason', reason_);
  end;

  if had then
    new_id := existing.id;
    update public.calendar_invites i
       set state = 'added', event_id = made, joined = joined_, sequence = seq, payload = invite,
           verified = true, organization_id = org, reason = null, received_at = now(),
           decided_by = member, decided_at = now()
     where i.id = existing.id;
  else
    insert into public.calendar_invites
      (uid, sequence, sender_email, sender_member_id, organization_id, verified, state, event_id,
       joined, payload, decided_by, decided_at)
    values (uid_, seq, address, member, org, true, 'added', made, joined_, invite, member, now())
    returning id into new_id;
  end if;

  -- The host is the event's: a joined event keeps its own.
  return jsonb_build_object('outcome', outcome, 'invite', new_id, 'event', made,
    'organization', coalesce((select o.name from public.events e
                                join public.organizations o on o.id = e.organization_id
                               where e.id = made), org_name, 'The SCI Club'),
    'joined', joined_);
end;
$$;

revoke all on function public.calendar_invite_receive(text, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.calendar_invite_receive(text, boolean, text, jsonb) to service_role;

create or replace function public.decide_calendar_invite(invite uuid, approve boolean, organization uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  held public.calendar_invites%rowtype;
  org uuid;
  made uuid;
  same uuid;
  joined_ boolean := false;
begin
  select * into held from public.calendar_invites i where i.id = invite for update;
  if not found or held.state <> 'held' then
    raise exception 'That invitation is not waiting any more.' using errcode = 'P0002';
  end if;
  if not private.may_decide_calendar_invite(held) then
    raise exception 'You cannot decide this invitation.' using errcode = '42501';
  end if;

  if not coalesce(approve, false) then
    update public.calendar_invites i
       set state = 'discarded', decided_by = auth.uid(), decided_at = now()
     where i.id = held.id;
    return null;
  end if;

  org := coalesce(organization, held.organization_id);
  if org is null and not public.is_admin() then
    raise exception 'Choose the organization that hosts it.' using errcode = '22023';
  end if;
  if held.event_id is not null and held.joined then
    made := private.calendar_join_event(held.event_id, held.payload);
    joined_ := true;
  elsif held.event_id is not null then
    perform private.calendar_remove_event(held.event_id);
    made := private.calendar_make_event(held.payload, org);
  else
    same := private.calendar_same_event(held.payload);
    if same is not null then
      made := private.calendar_join_event(same, held.payload);
      joined_ := true;
    else
      made := private.calendar_make_event(held.payload, org);
    end if;
  end if;
  update public.calendar_invites i
     set state = 'added', event_id = made, joined = joined_, organization_id = org, reason = null,
         decided_by = auth.uid(), decided_at = now()
   where i.id = held.id;
  return made;
end;
$$;

revoke all on function public.decide_calendar_invite(uuid, boolean, uuid) from public, anon;
grant execute on function public.decide_calendar_invite(uuid, boolean, uuid) to authenticated;

-- ------------------------------------------------------------------ repair --
-- Pairs already made: each added invitation's own event, not repeating, with
-- one event added in the club that is the same (as its sender). Returns how
-- many were combined; a second run combines none.
create or replace function private.calendar_join_duplicates()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  target uuid;
  theirs uuid;
  ours uuid;
  total integer := 0;
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  for r in
    select i.id, i.payload, i.event_id, i.sender_member_id
      from public.calendar_invites i
      join public.members m on m.id = i.sender_member_id and m.status = 'active'
      join public.events e on e.id = i.event_id and e.series_id is null
     where i.state = 'added' and not i.joined
       and jsonb_typeof(i.payload -> 'repeat') is distinct from 'object'
  loop
    perform private.act_as(r.sender_member_id);
    select e.id into target
      from public.events e
     where e.id <> r.event_id
       and e.feed_id is null
       and lower(btrim(e.title)) = lower(btrim(coalesce(r.payload ->> 'title', '')))
       and e.start_time = (r.payload ->> 'starts')::timestamptz
       and not exists (
         select 1 from public.calendar_invites i where i.event_id = e.id and i.state = 'added'
       )
       and public.may_post_events_for(e.organization_id)
       and (select count(*) from public.events x
             where x.id <> r.event_id and x.feed_id is null
               and lower(btrim(x.title)) = lower(btrim(e.title))
               and x.start_time = e.start_time) = 1;
    if target is null then
      continue;
    end if;

    select t.id into theirs from public.chat_threads t where t.event_id = r.event_id;
    select t.id into ours from public.chat_threads t where t.event_id = target;
    if theirs is not null and ours is not null and exists (
      select 1 from public.chat_messages m where m.thread_id = theirs and m.notice is null
    ) then
      continue;
    end if;

    perform private.calendar_join_event(target, r.payload);
    -- Nobody added anybody: quietly, as 20261101090000 gathers an event chat.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    if theirs is not null and ours is null then
      update public.chat_threads t set event_id = target where t.id = theirs;
      insert into public.chat_thread_members (thread_id, member_id)
      select theirs, v.member_id
        from public.event_rsvps v
        join public.members m on m.id = v.member_id and m.status = 'active'
       where v.event_id = target
         and exists (
           select 1 from public.chat_messages x where x.thread_id = theirs and x.notice is null
         )
      on conflict (thread_id, member_id) do nothing;
    elsif theirs is not null then
      delete from public.chat_threads t where t.id = theirs;
    end if;
    insert into public.event_rsvps (event_id, member_id, status)
    select target, x.member_id, x.status from public.event_rsvps x where x.event_id = r.event_id
    on conflict (event_id, member_id) do nothing;
    update public.calendar_invites i set event_id = target, joined = true where i.id = r.id;
    delete from public.events e where e.id = r.event_id;
    total := total + 1;
  end loop;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
  return total;
end;
$$;

revoke all on function private.calendar_join_duplicates() from public, anon, authenticated;

select private.calendar_join_duplicates();

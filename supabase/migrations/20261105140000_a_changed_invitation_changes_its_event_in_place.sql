-- ============================================================================
-- A changed invitation changes its event in place, and a repeating one joins
-- ============================================================================
-- The owner, 2026-11-05, after "The SCI Club Weekly": a weekly Google
-- invitation and the same Friday added in the club stayed two, and every
-- change to the invitation replaced its events, losing their RSVPs.
--
-- A change now changes the event in place, while one date stays one date and
-- a series stays a series: the same events, with their RSVPs, chat, check-ins
-- and addresses. A series' dates are matched by their place in the rule, or by
-- their day when the rule itself changed: future ones take the new details and
-- times, dates the rule no longer makes go, new ones are added, and past ones
-- are left as they happened. A change of shape still replaces (20261022220000).
--
-- A new repeating invitation whose first date is one event added in the club
-- (same title and start, one its sender may change) takes it in: the series is
-- made with that event's organization, its RSVPs and chat move to the first
-- date, and it goes. One-off invitations join as 20261105120000 has them.
--
-- And a change to an invitation already added keeps the organization it was
-- given instead of waiting for someone to choose again.
--
-- Probe: calendar-invite-joins.sql (steps 9 to 13). Undo:
-- supabase/undo/20261105140000.sql.
-- ============================================================================


-- ----------------------------------------------------------------- absorb --
-- An event added in the club, taken in by a series an invitation made: its
-- chat and RSVPs to the series' first date, quietly, then it goes.
create or replace function private.calendar_absorb(hand uuid, made uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  theirs uuid;
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if hand is null or made is null or hand = made then
    return;
  end if;
  -- Nobody added anybody: as 20261101090000 gathers an event chat.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select t.id into theirs from public.chat_threads t where t.event_id = hand;
  if theirs is not null and not exists (select 1 from public.chat_threads t where t.event_id = made) then
    update public.chat_threads t set event_id = made where t.id = theirs;
  end if;
  insert into public.event_rsvps (event_id, member_id, status)
  select made, x.member_id, x.status from public.event_rsvps x where x.event_id = hand
  on conflict (event_id, member_id) do nothing;
  delete from public.events e where e.id = hand;
  perform set_config('request.jwt.claims', coalesce(claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
end;
$$;

revoke all on function private.calendar_absorb(uuid, uuid) from public, anon, authenticated;

-- ------------------------------------------------------------ the series --
-- A repeating invitation's change on the series it made, as auth.uid().
-- Returns its first date.
create or replace function private.calendar_change_series(opener uuid, payload jsonb, organization uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  zone constant text := 'America/Los_Angeles';
  horizon timestamptz := now() + interval '92 days';
  e public.events%rowtype;
  s public.event_series%rowtype;
  w jsonb := private.calendar_where(payload);
  rep jsonb := payload -> 'repeat';
  unit_ text := rep ->> 'unit';
  every_ integer := (rep ->> 'every')::integer;
  ends_on_ date := (rep ->> 'endsOn')::date;
  ends_after_ integer := (rep ->> 'endsAfter')::integer;
  first_ timestamptz := (payload ->> 'starts')::timestamptz;
  duration_ interval := (payload ->> 'ends')::timestamptz - (payload ->> 'starts')::timestamptz;
  title_ text := btrim(coalesce(payload ->> 'title', ''));
  description_ text := btrim(coalesce(payload ->> 'description', ''));
  place_ text := btrim(coalesce(w ->> 'place', ''));
  link_ text := nullif(btrim(coalesce(w ->> 'link', '')), '');
  format_ text := w ->> 'format';
  host_ text := case when organization is null then 'The SCI Club' end;
  all_day_ boolean := coalesce((payload ->> 'allDay')::boolean, false);
  timezone_ text := nullif(payload ->> 'timezone', '');
  same_rule boolean;
  old_by_k jsonb := '{}';
  matched uuid[] := '{}';
  used uuid[] := '{}';
  k integer;
  st timestamptz;
  old_id uuid;
  old_start timestamptz;
  produced integer := 0;
  finished boolean := false;
  guard integer := 0;
  first_left uuid;
begin
  select * into e from public.events x where x.id = opener;
  select * into s from public.event_series x where x.id = e.series_id for update;
  if not found or s.feed_id is not null then
    raise exception 'That series is not one the club keeps.' using errcode = 'P0002';
  end if;
  if not public.may_post_events_for(e.organization_id) or not public.may_post_events_for(organization) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  -- save_event's and save_event_series' checks, for every date at once.
  if title_ = '' or length(title_) > 140 then
    raise exception 'Give the event a name of 140 characters at most.' using errcode = '22023';
  end if;
  if length(description_) > 4000 then
    raise exception 'The description can be 4,000 characters at most.' using errcode = '22023';
  end if;
  if first_ is null then
    raise exception 'Say when it starts.' using errcode = '22023';
  end if;
  if duration_ is not null and duration_ <= interval '0' then
    raise exception 'It has to end after it starts.' using errcode = '22023';
  end if;
  if format_ is null or format_ not in ('in_person', 'online', 'hybrid') then
    raise exception 'Say whether it is in person, online or hybrid.' using errcode = '22023';
  end if;
  if format_ <> 'online' and place_ = '' then
    raise exception 'Say where it is.' using errcode = '22023';
  end if;
  if link_ is not null and (link_ !~* '^https?://[^\s]+$' or length(link_) > 2000) then
    raise exception 'A link has to be a web address starting https://.' using errcode = '22023';
  end if;
  if unit_ is null or unit_ not in ('day', 'week', 'month')
     or every_ is null or every_ < 1 or every_ > 30 then
    raise exception 'Say how often it repeats.' using errcode = '22023';
  end if;
  if ends_on_ is not null and ends_after_ is not null then
    raise exception 'Say when it ends one way, not both.' using errcode = '22023';
  end if;
  if ends_after_ is not null and (ends_after_ < 2 or ends_after_ > 100) then
    raise exception 'It can repeat 2 to 100 times.' using errcode = '22023';
  end if;

  same_rule := unit_ = s.repeat_unit and every_ = s.repeat_every;

  -- Each date already made, by its place in the old rule.
  for i in 0 .. s.next_index - 1 loop
    st := public.event_series_step(s.repeat_unit, s.repeat_every, s.first_start, i);
    continue when st is null;
    select x.id into old_id from public.events x
     where x.series_id = s.id and x.start_time = st
     limit 1;
    if old_id is not null then
      old_by_k := old_by_k || jsonb_build_object(i::text, old_id);
      matched := matched || old_id;
    end if;
  end loop;

  -- The new rule's dates: by place when the rule is the same, else by day.
  k := 0;
  loop
    guard := guard + 1;
    exit when guard > 500;
    if ends_after_ is not null and produced >= ends_after_ then
      finished := true;
      exit;
    end if;
    st := public.event_series_step(unit_, every_, first_, k);
    if st is null then
      k := k + 1;
      continue;
    end if;
    if ends_on_ is not null and (st at time zone zone)::date > ends_on_ then
      finished := true;
      exit;
    end if;
    exit when st > horizon;

    if same_rule then
      old_id := (old_by_k ->> k::text)::uuid;
    else
      select x.id into old_id from public.events x
       where x.id = any (matched) and not (x.id = any (used))
         and (x.start_time at time zone zone)::date = (st at time zone zone)::date
       order by x.start_time
       limit 1;
    end if;

    if old_id is not null then
      used := used || old_id;
      select x.start_time into old_start from public.events x where x.id = old_id;
      -- Past dates are left as they happened.
      if old_start > now() then
        update public.events x
           set title = title_, description = description_, start_time = st,
               end_time = case when duration_ is null then null else st + duration_ end,
               location = place_, city = w ->> 'city', state = coalesce(w ->> 'state', x.state),
               url = link_, event_format = format_, organization_id = organization,
               host_name = host_, all_day = all_day_, timezone = coalesce(timezone_, x.timezone),
               updated_at = now()
         where x.id = old_id;
      end if;
    elsif st > now() then
      insert into public.events (
        title, description, description_html, start_time, end_time, location, city, state,
        url, registration_url, organization_id, host_name, event_format, added_by, series_id,
        photo_path, photo_alt, more_photos, all_day, timezone
      )
      values (
        title_, description_, '', st,
        case when duration_ is null then null else st + duration_ end,
        place_, w ->> 'city', w ->> 'state', link_, s.template ->> 'registration_url',
        organization, host_, format_, s.added_by, s.id,
        s.template ->> 'photo_path', s.template ->> 'photo_alt',
        coalesce(s.template -> 'more_photos', '[]'::jsonb), all_day_, timezone_
      );
    end if;
    produced := produced + 1;
    k := k + 1;
  end loop;

  -- Future dates the new rule no longer makes.
  delete from public.events x
   where x.id = any (matched) and not (x.id = any (used)) and x.start_time > now();

  update public.event_series x
     set title = title_, repeat_unit = unit_, repeat_every = every_,
         ends_on = ends_on_, ends_after = ends_after_, first_start = first_,
         duration = duration_, next_index = k, made = produced, stopped = finished,
         template = x.template || jsonb_build_object(
           'title', title_, 'description', description_, 'location', place_,
           'city', w ->> 'city', 'url', link_, 'organization_id', organization,
           'host_name', host_, 'event_format', format_),
         updated_at = now()
   where x.id = s.id;

  if exists (select 1 from public.events x where x.id = opener) then
    return opener;
  end if;
  select x.id into first_left from public.events x where x.series_id = s.id order by x.start_time limit 1;
  return first_left;
end;
$$;

revoke all on function private.calendar_change_series(uuid, jsonb, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------- change --
-- A change to an invitation's own event, as auth.uid(): in place while its
-- shape stays, else replaced.
create or replace function private.calendar_change_event(event uuid, payload jsonb, organization uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
  repeats boolean := jsonb_typeof(payload -> 'repeat') = 'object';
  w jsonb := private.calendar_where(payload);
begin
  select * into e from public.events x where x.id = event;
  if not found then
    return private.calendar_make_event(payload, organization);
  end if;
  organization := coalesce(organization, private.the_club());
  if repeats and e.series_id is not null then
    return private.calendar_change_series(e.id, payload, organization);
  end if;
  if not repeats and e.series_id is null then
    perform public.save_event(
      e.id, organization, case when organization is null then 'The SCI Club' end,
      payload ->> 'title', payload ->> 'description',
      (payload ->> 'starts')::timestamptz, (payload ->> 'ends')::timestamptz,
      w ->> 'format', w ->> 'place', w ->> 'city', w ->> 'link', e.registration_url, w ->> 'state'
    );
    update public.events x
       set all_day = coalesce((payload ->> 'allDay')::boolean, false),
           timezone = coalesce(nullif(payload ->> 'timezone', ''), x.timezone)
     where x.id = e.id;
    return e.id;
  end if;
  perform private.calendar_remove_event(e.id);
  return private.calendar_make_event(payload, organization);
end;
$$;

revoke all on function private.calendar_change_event(uuid, jsonb, uuid) from public, anon, authenticated;

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
  if (payload ->> 'starts') is null then
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
     and public.may_post_events_for(e.organization_id)
     -- A repeating invitation takes in one date, never a series.
     and (jsonb_typeof(payload -> 'repeat') is distinct from 'object' or e.series_id is null);
  return case when cardinality(found_ids) = 1 then found_ids[1] end;
end;
$$;

revoke all on function private.calendar_same_event(jsonb) from public, anon, authenticated;

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
  select * into existing from public.calendar_invites i where i.uid = uid_;
  had := found;
  -- A change to one already added keeps the organization it was given,
  -- rather than asking again (20261105140000).
  if had and existing.state = 'added' and existing.organization_id is not null
     and (need_choice or org is null) and nullif(btrim(coalesce(tag, '')), '') is null
     and (is_admin or existing.organization_id = any (spoken)) then
    org := existing.organization_id;
    need_choice := false;
    reason_ := null;
  end if;
  select o.name into org_name from public.organizations o where o.id = org;
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
    if had and existing.joined and existing.state in ('added', 'held')
       and exists (select 1 from public.events e where e.id = existing.event_id) then
      made := private.calendar_join_event(existing.event_id, invite);
      joined_ := true;
      outcome := 'updated';
    elsif had and existing.state in ('added', 'held', 'refused')
       and exists (select 1 from public.events e where e.id = existing.event_id) then
      -- In place, so its RSVPs, chat and address stay (20261105140000).
      made := private.calendar_change_event(existing.event_id, invite, org);
      outcome := 'updated';
    else
      same := private.calendar_same_event(invite);
      if same is not null and jsonb_typeof(invite -> 'repeat') = 'object' then
        -- A repeating one takes the club's event in: its organization,
        -- RSVPs and chat go to the first date.
        org := coalesce((select e.organization_id from public.events e where e.id = same), org);
        made := private.calendar_make_event(invite, org);
        perform private.calendar_absorb(same, made);
      elsif same is not null then
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
  elsif held.event_id is not null
        and exists (select 1 from public.events e where e.id = held.event_id) then
    made := private.calendar_change_event(held.event_id, held.payload, org);
  else
    same := private.calendar_same_event(held.payload);
    if same is not null and jsonb_typeof(held.payload -> 'repeat') = 'object' then
      org := coalesce((select e.organization_id from public.events e where e.id = same), org);
      made := private.calendar_make_event(held.payload, org);
      perform private.calendar_absorb(same, made);
    elsif same is not null then
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

-- ============================================================================
-- A change to an invitation already on the calendar is just applied
-- ============================================================================
-- The owner, 2026-11-17, after "The SCI Club Weekly": its description was
-- changed in Google Calendar for "this and following events", and nothing
-- reached the club. Google had sent two invitations: the old one, now ending
-- the day before, and a new one from that Friday on, its UID the old one's
-- with _R<date> before the @. Both waited for an organization to be chosen,
-- because their sender speaks for two; approved as they were, the first
-- deleted every later date, with its RSVPs, and the second would have made a
-- new series, public where the old one was for its groups.
--
-- "It should not be gated on my approval. If it is an update, just update."
--
--   * A change to an event already on the calendar keeps that event's host,
--     the club's own too, so it is never held for an organization again. One
--     that cannot be verified as its sender's still waits.
--   * "This and following events" carries the same series on: the dates from
--     that day keep their ids, RSVPs, chat, co-hosts and who can see them, and
--     take the new details; the series then repeats as the new invitation says.
--     The old invitation keeps only the dates before, so ending it there
--     deletes nothing that the new one holds. Whichever arrives first.
--
-- calendar_invites.continues is new and nothing reads it but these functions;
-- no function a store build calls changes its arguments or what it returns.
--
-- Probe: calendar-invite-following.sql. Undo: supabase/undo/20261117120000.sql.
-- ============================================================================

alter table public.calendar_invites
  add column if not exists continues uuid references public.calendar_invites (id) on delete set null;

comment on column public.calendar_invites.continues is
  'The invitation whose series this one carries on from its first date: Google''s "this and following events".';

create index if not exists calendar_invites_continues_idx
  on public.calendar_invites (continues) where continues is not null;

-- ------------------------------------------------------------- the parts --
-- Google names the later part of a split event <uid>_R<date>T<time>@google.com.
create or replace function private.calendar_base_uid(uid text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(uid, ''), '(_R[0-9]{8}(T[0-9]{6}Z?)?)+(@|$)', '\3');
$$;

revoke all on function private.calendar_base_uid(text) from public, anon, authenticated;

-- The invitation a later part carries on: the same event's, already added as
-- a series of its own, with the latest first date not after this one's.
create or replace function private.calendar_earlier_part(uid_ text, starts_ timestamptz)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
    from public.calendar_invites i
    join public.events e on e.id = i.event_id and e.series_id is not null and e.feed_id is null
   where private.calendar_base_uid(uid_) <> uid_
     and i.uid <> uid_
     and private.calendar_base_uid(i.uid) = private.calendar_base_uid(uid_)
     and i.state = 'added'
     and not i.joined
     and (i.payload ->> 'starts')::timestamptz <= starts_
   order by (i.payload ->> 'starts')::timestamptz desc
   limit 1;
$$;

revoke all on function private.calendar_earlier_part(text, timestamptz) from public, anon, authenticated;

-- --------------------------------------------------------- carrying on --
-- A later part's details and rule on the series its earlier part made, from
-- its first day on, as auth.uid(). Dates are matched by their day: coming
-- ones take the new details and times, ones the new rule does not make go,
-- new ones are added, and past ones are left as they happened. The dates
-- before that day are not touched. Returns the first date from that day.
create or replace function private.calendar_continue_series(earlier uuid, payload jsonb, organization uuid)
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
  host_ text;
  all_day_ boolean := coalesce((payload ->> 'allDay')::boolean, false);
  timezone_ text := nullif(payload ->> 'timezone', '');
  from_day date;
  theirs uuid[] := '{}';
  used uuid[] := '{}';
  k integer := 0;
  st timestamptz;
  old_id uuid;
  old_start timestamptz;
  produced integer := 0;
  finished boolean := false;
  guard integer := 0;
  first_left uuid;
begin
  select * into e from public.events x where x.id = earlier;
  select * into s from public.event_series x where x.id = e.series_id for update;
  if not found or s.feed_id is not null then
    raise exception 'That series is not one the club keeps.' using errcode = 'P0002';
  end if;
  organization := coalesce(organization, private.the_club());
  host_ := case when organization is null then 'The SCI Club' end;
  if not public.may_post_events_for(e.organization_id) or not public.may_post_events_for(organization) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  -- calendar_change_series' checks (20261105140000).
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
  from_day := (first_ at time zone zone)::date;
  -- A later part that does not repeat is the series' last date.
  if jsonb_typeof(rep) is distinct from 'object' then
    unit_ := s.repeat_unit;
    every_ := s.repeat_every;
    ends_on_ := from_day;
    ends_after_ := null;
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

  select coalesce(array_agg(x.id), '{}') into theirs
    from public.events x
   where x.series_id = s.id and (x.start_time at time zone zone)::date >= from_day;

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

    select x.id, x.start_time into old_id, old_start from public.events x
     where x.id = any (theirs) and not (x.id = any (used))
       and (x.start_time at time zone zone)::date = (st at time zone zone)::date
     order by x.start_time
     limit 1;

    if old_id is not null then
      used := used || old_id;
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
      -- Who can see it and its co-hosts come from the date before, as for
      -- any new date of a series (20261106030000, 20261105170000).
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

  -- Coming dates from that day that the new rule does not make.
  delete from public.events x
   where x.id = any (theirs) and not (x.id = any (used)) and x.start_time > now();

  update public.event_series x
     set title = title_, repeat_unit = unit_, repeat_every = every_,
         ends_on = ends_on_, ends_after = ends_after_, first_start = first_,
         duration = duration_, next_index = greatest(k, 1), made = produced, stopped = finished,
         template = x.template || jsonb_build_object(
           'title', title_, 'description', description_, 'location', place_,
           'city', w ->> 'city', 'url', link_, 'organization_id', organization,
           'host_name', host_, 'event_format', format_),
         updated_at = now()
   where x.id = s.id;

  select x.id into first_left from public.events x
   where x.series_id = s.id and (x.start_time at time zone zone)::date >= from_day
   order by x.start_time
   limit 1;
  return coalesce(first_left, earlier);
end;
$$;

revoke all on function private.calendar_continue_series(uuid, jsonb, uuid) from public, anon, authenticated;

-- A change to an invitation whose later dates another one now holds, as
-- auth.uid(): its own coming dates, the ones before `bound`, take the new
-- details. Their times, and the series' rule, are the later part's to say.
create or replace function private.calendar_change_earlier_dates(opener uuid, bound timestamptz, payload jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e public.events%rowtype;
  w jsonb := private.calendar_where(payload);
  title_ text := btrim(coalesce(payload ->> 'title', ''));
  description_ text := btrim(coalesce(payload ->> 'description', ''));
  place_ text := btrim(coalesce(w ->> 'place', ''));
  link_ text := nullif(btrim(coalesce(w ->> 'link', '')), '');
  format_ text := w ->> 'format';
begin
  select * into e from public.events x where x.id = opener;
  if not found then
    raise exception 'That event is not on the calendar any more.' using errcode = 'P0002';
  end if;
  if not public.may_post_events_for(e.organization_id) then
    raise exception 'You cannot change this event.' using errcode = '42501';
  end if;
  if title_ = '' or length(title_) > 140 then
    raise exception 'Give the event a name of 140 characters at most.' using errcode = '22023';
  end if;
  if length(description_) > 4000 then
    raise exception 'The description can be 4,000 characters at most.' using errcode = '22023';
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
  update public.events x
     set title = title_, description = description_, location = place_, city = w ->> 'city',
         state = coalesce(w ->> 'state', x.state), url = link_, event_format = format_,
         updated_at = now()
   where (x.id = e.id or (e.series_id is not null and x.series_id = e.series_id))
     and x.start_time >= e.start_time and x.start_time < bound and x.start_time > now();
  return e.id;
end;
$$;

revoke all on function private.calendar_change_earlier_dates(uuid, timestamptz, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- receive --
-- As 20261105140000, and: the parts of one event one at a time; a change to
-- an event already on the calendar keeps its host; a later part carries its
-- series on; and an earlier part keeps only the dates before the later one.
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
  starts_ timestamptz := (invite ->> 'starts')::timestamptz;
  earlier_invite uuid;
  earlier_event uuid;
  mapped uuid;
  mapped_org uuid;
  later_from timestamptz;
begin
  if uid_ = '' or address is null then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'No event in it.');
  end if;
  -- The parts of one event arrive together: one at a time.
  perform pg_advisory_xact_lock(hashtextextended(private.calendar_base_uid(uid_), 0));

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
  -- The event it is already on the calendar as: its own, or the one a later
  -- part of ("this and following events") carries on.
  if had and existing.event_id is not null and existing.state in ('added', 'held')
     and exists (select 1 from public.events e where e.id = existing.event_id) then
    mapped := existing.event_id;
  elsif not had or existing.event_id is null then
    earlier_invite := private.calendar_earlier_part(uid_, starts_);
    select i.event_id into earlier_event from public.calendar_invites i where i.id = earlier_invite;
    mapped := earlier_event;
  end if;
  -- A change to an event already on the calendar keeps its host, the club's
  -- own too, rather than asking again (20261105140000, 20261117120000).
  if mapped is not null and (need_choice or org is null)
     and nullif(btrim(coalesce(tag, '')), '') is null then
    select e.organization_id into mapped_org from public.events e where e.id = mapped;
    if is_admin or mapped_org = any (spoken) then
      org := mapped_org;
      need_choice := false;
      reason_ := null;
    end if;
  end if;
  -- Where a later part took its series over: this one keeps the dates before.
  if had then
    select min((c.payload ->> 'starts')::timestamptz) into later_from
      from public.calendar_invites c
     where c.continues = existing.id and c.state in ('added', 'cancelled');
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
    if not existing.joined and later_from is not null then
      -- Only its own dates: the later ones are another invitation's now.
      perform public.delete_event(e.id) from public.events e
        join public.events opener on opener.id = existing.event_id
       where e.series_id = opener.series_id and e.start_time >= opener.start_time
         and e.start_time < later_from;
    elsif not existing.joined then
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
      if later_from is not null then
        made := private.calendar_change_earlier_dates(existing.event_id, later_from, invite);
      else
        made := private.calendar_change_event(existing.event_id, invite, org);
      end if;
      outcome := 'updated';
    elsif earlier_event is not null then
      -- "This and following events": the same series, from that date on.
      made := private.calendar_continue_series(earlier_event, invite, org);
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
           decided_by = member, decided_at = now(),
           continues = coalesce(earlier_invite, i.continues)
     where i.id = existing.id;
  else
    insert into public.calendar_invites
      (uid, sequence, sender_email, sender_member_id, organization_id, verified, state, event_id,
       joined, payload, decided_by, decided_at, continues)
    values (uid_, seq, address, member, org, true, 'added', made, joined_, invite, member, now(),
            earlier_invite)
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

-- ----------------------------------------------------------------- approve --
-- As 20261105140000, and a later part carries its series on, with its host.
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
  earlier_invite uuid;
  earlier_event uuid;
  later_from timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended(private.calendar_base_uid(
    (select i.uid from public.calendar_invites i where i.id = invite)), 0));
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

  -- A later part of an event already on the calendar ("this and following
  -- events") carries its series on, with its host (20261117120000).
  if held.event_id is null then
    earlier_invite := private.calendar_earlier_part(held.uid, (held.payload ->> 'starts')::timestamptz);
    select i.event_id into earlier_event from public.calendar_invites i where i.id = earlier_invite;
  end if;
  select min((c.payload ->> 'starts')::timestamptz) into later_from
    from public.calendar_invites c
   where c.continues = held.id and c.state in ('added', 'cancelled');

  org := coalesce(organization, held.organization_id);
  if earlier_event is not null then
    select e.organization_id into org from public.events e where e.id = earlier_event;
  elsif org is null and not public.is_admin() then
    raise exception 'Choose the organization that hosts it.' using errcode = '22023';
  end if;
  if held.event_id is not null and held.joined then
    made := private.calendar_join_event(held.event_id, held.payload);
    joined_ := true;
  elsif held.event_id is not null
        and exists (select 1 from public.events e where e.id = held.event_id) then
    if later_from is not null then
      made := private.calendar_change_earlier_dates(held.event_id, later_from, held.payload);
    else
      made := private.calendar_change_event(held.event_id, held.payload, org);
    end if;
  elsif earlier_event is not null then
    made := private.calendar_continue_series(earlier_event, held.payload, org);
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
         decided_by = auth.uid(), decided_at = now(),
         continues = coalesce(earlier_invite, i.continues)
   where i.id = held.id;
  return made;
end;
$$;

revoke all on function public.decide_calendar_invite(uuid, boolean, uuid) from public, anon;
grant execute on function public.decide_calendar_invite(uuid, boolean, uuid) to authenticated;

-- ------------------------------------------------------------- waiting --
-- As 20261022220000, and: a later part says which event it changes, and a
-- change shows that event's host, which it keeps.
create or replace function public.my_held_calendar_invites()
returns table (
  id uuid,
  title text,
  starts timestamptz,
  location text,
  repeats boolean,
  sender_name text,
  sender_email text,
  organization_id uuid,
  organization_name text,
  reason text,
  received_at timestamptz,
  changes_event uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.payload ->> 'title', (i.payload ->> 'starts')::timestamptz,
         i.payload ->> 'location', jsonb_typeof(i.payload -> 'repeat') = 'object',
         m.display_name, i.sender_email::text,
         coalesce(e.organization_id, i.organization_id), coalesce(eo.name, o.name), i.reason,
         i.received_at, e.id
    from public.calendar_invites i
    left join public.members m on m.id = i.sender_member_id
    left join public.organizations o on o.id = i.organization_id
    left join public.calendar_invites earlier
      on i.event_id is null
     and earlier.id = private.calendar_earlier_part(i.uid, (i.payload ->> 'starts')::timestamptz)
    left join public.events e on e.id = coalesce(i.event_id, earlier.event_id)
    left join public.organizations eo on eo.id = e.organization_id
   where i.state = 'held' and private.may_decide_calendar_invite(i)
   order by i.received_at desc;
$$;

revoke all on function public.my_held_calendar_invites() from public, anon;
grant execute on function public.my_held_calendar_invites() to authenticated;

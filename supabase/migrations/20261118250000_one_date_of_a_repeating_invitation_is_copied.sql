-- ============================================================================
-- A change to one date of a repeating invitation is copied (the owner,
-- 2026-11-18)
-- ============================================================================
-- "The SCI Club Weekly" had one date moved in Google Calendar, and the sender
-- was told: "A change to one date ... was not copied, because the club cannot
-- hold one date of a repeating event apart from the rest." The owner: "We
-- should try to support this. Maybe we can delete the one repeating event
-- that was changed and create a one off event at the new time? Or anyway you
-- see fit."
--
-- That date is changed in place rather than deleted, so its RSVPs, chat and
-- address stay, and it leaves the series: a one-off event at its new time.
-- The series remembers the day it came from, so a later change to the whole
-- series neither changes it back nor makes that day again. A cancelled date
-- is remembered the same way; before, a change to the series brought it back.
--
-- Expand only: a new table, a new helper, a trigger, and receive recreated
-- from 20261117130000 with the one-date branch.
-- ============================================================================

-- Dates of a club series that one date of its invitation changed or
-- cancelled, by the start the series gave them. event_id is the event the
-- date became; null for a cancelled one, or one deleted since.
create table private.calendar_held_dates (
  series_id uuid not null references public.event_series (id) on delete cascade,
  original_start timestamptz not null,
  event_id uuid references public.events (id) on delete set null,
  sequence integer not null default 0,
  held_at timestamptz not null default now(),
  primary key (series_id, original_start)
);
revoke all on private.calendar_held_dates from public, anon, authenticated;

-- A series never makes a date again on a day held apart: whichever of the
-- series' writers it is (calendar_change_series, calendar_continue_series,
-- extend_event_series), none of them asks for the new row back.
create or replace function private.events_skip_held_dates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.calendar_held_dates h
     where h.series_id = new.series_id
       and (h.original_start at time zone 'America/Los_Angeles')::date
         = (new.start_time at time zone 'America/Los_Angeles')::date
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.events_skip_held_dates() from public, anon, authenticated;

create trigger events_skip_held_dates
  before insert on public.events
  for each row when (new.series_id is not null)
  execute function private.events_skip_held_dates();

-- One date of the series `opener` is in: changed to `payload`, or cancelled.
-- Answers { status: changed | cancelled | older | none | single, event }:
-- none for a date passed, single where the club's event does not repeat. Run as the
-- sender (act_as), so save_event and delete_event check what they may do.
create or replace function private.calendar_one_date(
  opener uuid, recurrence timestamptz, seq integer, payload jsonb, cancelled boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  zone constant text := 'America/Los_Angeles';
  series uuid;
  org uuid;
  h private.calendar_held_dates%rowtype;
  held boolean;
  occ uuid;
  next_opener uuid;
begin
  select e.series_id, e.organization_id into series, org from public.events e where e.id = opener;
  if series is null then
    return jsonb_build_object('status', 'single');
  end if;

  select * into h from private.calendar_held_dates x
   where x.series_id = series and x.original_start = recurrence;
  held := found;
  if held and seq < h.sequence then
    return jsonb_build_object('status', 'older');
  end if;

  -- The date's own event: the one it already became, else the series' date
  -- at that start, or on that day.
  if held then
    occ := h.event_id;
  else
    select x.id into occ from public.events x
     where x.series_id = series
       and (x.start_time at time zone zone)::date = (recurrence at time zone zone)::date
     order by (x.start_time = recurrence) desc, x.start_time
     limit 1;
  end if;

  if occ is not null then
    -- The invitation keeps a date that is still the series' as its event,
    -- so a change to the whole series finds the series (calendar_change_series).
    select x.id into next_opener from public.events x
     where x.series_id = series and x.id <> occ
     order by x.start_time limit 1;
    if next_opener is not null then
      update public.calendar_invites i set event_id = next_opener where i.event_id = occ;
    end if;
  end if;

  if cancelled then
    if occ is not null then
      perform public.delete_event(occ);
    end if;
    insert into private.calendar_held_dates as x (series_id, original_start, event_id, sequence)
    values (series, recurrence, null, seq)
    on conflict (series_id, original_start)
      do update set event_id = null, sequence = excluded.sequence, held_at = now();
    return jsonb_build_object('status', 'cancelled');
  end if;

  if occ is null then
    -- Not made yet (past the 92 days the series is made for), or cancelled
    -- before: a one-off event at the new time.
    if (payload ->> 'starts')::timestamptz <= now() then
      return jsonb_build_object('status', 'none');
    end if;
    occ := private.calendar_make_event(payload || '{"repeat": null}', org);
  else
    update public.events x set series_id = null, updated_at = now() where x.id = occ;
    occ := private.calendar_change_event(occ, payload || '{"repeat": null}', org);
  end if;

  insert into private.calendar_held_dates as x (series_id, original_start, event_id, sequence)
  values (series, recurrence, occ, seq)
  on conflict (series_id, original_start)
    do update set event_id = excluded.event_id, sequence = excluded.sequence, held_at = now();
  return jsonb_build_object('status', 'changed', 'event', occ);
end;
$$;
revoke all on function private.calendar_one_date(uuid, timestamptz, integer, jsonb, boolean)
  from public, anon, authenticated;

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
  one jsonb;
begin
  if uid_ = '' or address is null then
    return jsonb_build_object('outcome', 'ignored', 'reason', 'No event in it.');
  end if;
  -- Guests are kept only as the members they are, with their answer: no
  -- address of anybody else is stored (20261117130000).
  if invite ? 'guests' then
    invite := (invite - 'guests')
      || jsonb_build_object('guestMembers', private.calendar_guest_members(invite -> 'guests'));
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
  -- One date of a repeating event counts its own changes (20261118250000).
  if had and seq < existing.sequence and recurrence is null then
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
      -- One date of a repeating event, kept off however the rest changes
      -- (20261118250000).
      if existing.event_id is not null then
        one := private.calendar_one_date(existing.event_id, recurrence, seq, invite, true);
      end if;
      if coalesce(one ->> 'status', 'none') <> 'cancelled' then
        return jsonb_build_object('outcome', 'ignored', 'reason', 'Not a date the club has.');
      end if;
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
      -- Its dates changed one at a time go with it (20261118250000).
      perform public.delete_event(x.id)
         from private.calendar_held_dates h
         join public.events x on x.id = h.event_id
         join public.events opener on opener.id = existing.event_id
        where h.series_id = opener.series_id and x.start_time > now();
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
    -- A change to one date of a repeating event (the owner, 2026-11-18: "We
    -- should try to support this"): that date is changed in place, keeping
    -- its RSVPs and chat, and held apart from the rest (20261118250000).
    if not had or existing.state <> 'added' or existing.event_id is null
       or not exists (select 1 from public.events e where e.id = existing.event_id) then
      return jsonb_build_object('outcome', 'ignored', 'reason',
        'A change to one date of a repeating event was not copied, because the event is not on the club''s calendar.');
    end if;
    if not verified then
      return jsonb_build_object('outcome', 'ignored', 'reason',
        'A change to one date of a repeating event was not copied, because it could not be verified as coming from you. Change that date in the club.');
    end if;
    perform private.act_as(member);
    begin
      one := private.calendar_one_date(existing.event_id, recurrence, seq, invite, false);
    exception when others then
      -- The invitation itself stays as it was: this was one date of it.
      return jsonb_build_object('outcome', 'refused', 'reason', sqlerrm);
    end;
    if one ->> 'status' = 'older' then
      return jsonb_build_object('outcome', 'ignored', 'reason', 'An older copy of an invitation already received.');
    end if;
    if one ->> 'status' = 'single' then
      return jsonb_build_object('outcome', 'ignored', 'reason',
        'A change to one date of a repeating event was not copied, because the event does not repeat in the club. Change it in the club.');
    end if;
    if one ->> 'status' = 'none' then
      return jsonb_build_object('outcome', 'ignored', 'reason',
        'A change to one date of a repeating event was not copied, because that date has passed.');
    end if;
    made := (one ->> 'event')::uuid;
    return jsonb_build_object('outcome', 'updated', 'invite', existing.id, 'event', made,
      'organization', coalesce((select o.name from public.events e
                                  join public.organizations o on o.id = e.organization_id
                                 where e.id = made), 'The SCI Club'),
      'joined', false);
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

  -- Its guests who are members, and its attached files (20261117130000).
  perform private.calendar_after_applied(made, invite, later_from);

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

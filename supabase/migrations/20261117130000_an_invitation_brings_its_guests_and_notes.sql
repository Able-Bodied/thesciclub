-- ============================================================================
-- An invitation brings its guests who are members, and its attached notes
-- ============================================================================
-- The owner, 2026-11-17, of "The SCI Club Weekly": "look at the people that
-- are on the invite and add them in the club as RSVPd if they are in there",
-- and "see if meetings have attached meeting notes and add a link on the
-- event page to the notes".
--
-- Guests. The function sends each guest's address and answer. Only the ones
-- who are active members are kept, as member ids in the invitation's payload
-- (guestMembers); every other address is dropped before anything is stored,
-- as 20261022220000 promised. Yes is Going and maybe is Interested, on the
-- invitation's event and, for a repeating one, each coming date. No answer
-- and no are not an RSVP. An answer a member already gave in the club is
-- never changed, and one taken from an invitation is not taken back when the
-- guest later declines: the club cannot tell it from the member's own.
--
-- Notes. Files attached to the invitation (Google Calendar attaches a
-- meeting's notes document) are kept as links, https only, ten at most, in
-- events.attachments, which a signed-in member reads on the event's page.
-- A date a series makes later takes the date before it's.
--
-- events.attachments and private functions are new; calendar_invite_receive
-- and decide_calendar_invite keep their arguments and what they return, so
-- the store builds are not affected.
--
-- Probe: calendar-invite-guests.sql. Undo: supabase/undo/20261117130000.sql.
-- ============================================================================

alter table public.events
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.events drop constraint if exists events_attachments_shape;
alter table public.events
  add constraint events_attachments_shape check (jsonb_typeof(attachments) = 'array');

comment on column public.events.attachments is
  'Files attached to the calendar invitation it came from, as [{title, url}], https only. Written by calendar_after_applied. See 20261117130000.';

-- Members only: the public page does not show them.
grant select (attachments) on public.events to authenticated;

-- A date a series makes later has the files of the date before it.
create or replace function private.event_takes_its_series_attachments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.series_id is not null and new.attachments = '[]'::jsonb then
    new.attachments := coalesce((
      select e.attachments from public.events e
       where e.series_id = new.series_id and e.id <> new.id
       order by e.start_time desc
       limit 1), '[]'::jsonb);
  end if;
  return new;
end;
$$;

revoke all on function private.event_takes_its_series_attachments() from public, anon, authenticated;

drop trigger if exists events_take_series_attachments on public.events;
create trigger events_take_series_attachments
  before insert on public.events
  for each row execute function private.event_takes_its_series_attachments();

-- ----------------------------------------------------------------- guests --
-- The guests who are active members, each once, with yes before maybe.
create or replace function private.calendar_guest_members(guests jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('member', q.id, 'answer', q.answer)), '[]'::jsonb)
    from (
      select distinct on (m.id) m.id, g.x ->> 'answer' as answer
        from jsonb_array_elements(
               case when jsonb_typeof(guests) = 'array' then guests else '[]'::jsonb end) g(x)
        join auth.users u on lower(u.email) = public.normalize_email(g.x ->> 'email')
        join public.members m on m.id = u.id and m.status = 'active'
       where g.x ->> 'answer' in ('yes', 'maybe')
       order by m.id, (g.x ->> 'answer' = 'yes') desc
    ) q;
$$;

revoke all on function private.calendar_guest_members(jsonb) from public, anon, authenticated;

-- The attached files worth keeping: https links, ten at most, each with a name.
create or replace function private.calendar_clean_attachments(raw jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'title', left(coalesce(nullif(btrim(q.a ->> 'title'), ''), 'Attachment'), 140),
           'url', q.a ->> 'url') order by q.o), '[]'::jsonb)
    from (
      select x.a, x.o
        from jsonb_array_elements(
               case when jsonb_typeof(raw) = 'array' then raw else '[]'::jsonb end)
             with ordinality x(a, o)
       where x.a ->> 'url' ~ '^https://[^\s]+$' and char_length(x.a ->> 'url') <= 2000
       order by x.o
       limit 10
    ) q;
$$;

revoke all on function private.calendar_clean_attachments(jsonb) from public, anon, authenticated;

-- After an invitation is added or changed: its files and its guests on its
-- event and, for a repeating one, each coming date (before `before_`, where a
-- later part holds the rest). Never fails the invitation.
create or replace function private.calendar_after_applied(made uuid, payload jsonb, before_ timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o public.events%rowtype;
  files jsonb := private.calendar_clean_attachments(payload -> 'attachments');
  claims text := current_setting('request.jwt.claims', true);
  claim_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select * into o from public.events e where e.id = made;
  if not found then
    return;
  end if;
  -- Only when the invitation says: one read before this has no such key.
  if payload ? 'attachments' then
    update public.events e
       set attachments = files
     where (e.id = o.id
            or (o.series_id is not null and e.series_id = o.series_id
                and e.start_time >= o.start_time and e.start_time > now()))
       and (before_ is null or e.start_time < before_)
       and e.attachments is distinct from files;
  end if;
  if jsonb_typeof(payload -> 'guestMembers') = 'array' then
    -- Nobody added anybody: quietly, as 20261101090000 gathers an event chat.
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into public.event_rsvps (event_id, member_id, status)
    select e.id, m.id, case g.x ->> 'answer' when 'yes' then 'going' else 'interested' end
      from jsonb_array_elements(payload -> 'guestMembers') g(x)
      join public.members m on m.id = (g.x ->> 'member')::uuid and m.status = 'active'
      join public.events e
        on e.id = o.id
        or (o.series_id is not null and e.series_id = o.series_id and e.start_time >= o.start_time)
     where e.start_time > now()
       and (before_ is null or e.start_time < before_)
    on conflict (event_id, member_id) do nothing;
    perform set_config('request.jwt.claims', coalesce(claims, ''), true);
    perform set_config('request.jwt.claim.sub', coalesce(claim_sub, ''), true);
  end if;
exception when others then
  raise warning 'calendar_after_applied: %', sqlerrm;
end;
$$;

revoke all on function private.calendar_after_applied(uuid, jsonb, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------- receive --
-- As 20261117120000, and its guests and files.
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

-- ----------------------------------------------------------------- approve --
-- As 20261117120000, and its guests and files.
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
  perform private.calendar_after_applied(made, held.payload, later_from);
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

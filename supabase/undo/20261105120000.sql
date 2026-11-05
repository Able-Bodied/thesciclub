-- Undo for 20261105120000_an_invitation_joins_the_event_already_there.sql:
-- the functions as 20261022220000 and 20261023000000 left them. Combined
-- events stay combined; their invitations' later changes replace them again.

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
    perform private.calendar_remove_event(existing.event_id);
    update public.calendar_invites i
       set state = 'cancelled', sequence = seq, payload = invite, decided_at = now()
     where i.id = existing.id;
    return jsonb_build_object('outcome', 'cancelled', 'invite', existing.id);
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
    if had and existing.state = 'added' and existing.event_id is not null then
      perform private.calendar_remove_event(existing.event_id);
      outcome := 'updated';
    else
      outcome := 'added';
    end if;
    made := private.calendar_make_event(invite, org);
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
       set state = 'added', event_id = made, sequence = seq, payload = invite, verified = true,
           organization_id = org, reason = null, received_at = now(),
           decided_by = member, decided_at = now()
     where i.id = existing.id;
  else
    insert into public.calendar_invites
      (uid, sequence, sender_email, sender_member_id, organization_id, verified, state, event_id,
       payload, decided_by, decided_at)
    values (uid_, seq, address, member, org, true, 'added', made, invite, member, now())
    returning id into new_id;
  end if;

  return jsonb_build_object('outcome', outcome, 'invite', new_id, 'event', made,
    'organization', coalesce(org_name, 'The SCI Club'));
end;
$$;

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
  if held.event_id is not null then
    perform private.calendar_remove_event(held.event_id);
  end if;
  made := private.calendar_make_event(held.payload, org);
  update public.calendar_invites i
     set state = 'added', event_id = made, organization_id = org, reason = null,
         decided_by = auth.uid(), decided_at = now()
   where i.id = held.id;
  return made;
end;
$$;

drop function if exists private.calendar_join_duplicates();
drop function if exists private.calendar_join_event(uuid, jsonb);
drop function if exists private.calendar_same_event(jsonb);
drop function if exists private.the_club();
alter table public.calendar_invites drop column if exists joined;

-- ============================================================================
-- Check-ins after the review of 20261113100000 to 20261113120000
-- ============================================================================
-- The owner, 2026-11-13: "fix the check-in bugs". A Fable review found:
--
-- 1. A guest an organizer added by hand and ticked lost the tick once their
--    email was matched to a member: the registration is hidden from then on,
--    and the member row read only event_check_ins. claim_event_registrations_for
--    now carries the tick into event_check_ins. Somebody who registered
--    themselves joins the host as a check-in would make them; somebody an
--    organizer typed in does not (3).
-- 2. Late check-ins never had the follow-up: it went once, in the hour after
--    10am the day after, to whoever was in by then, but check-in now stays
--    open a day (20261113100000) and organizers tick at any time. Somebody
--    checked in after that hour has it at the next run, for a week after.
-- 3. A representative could put a member in their organization without the
--    member choosing: add the member's email by hand, which becomes a Going
--    when the member next opens the app, then tick them. A member whose Going
--    came from an organizer's hand-added registration is ticked in, and told,
--    but not joined to the host. And ticking, unticking and ticking again
--    pushed each time: the push now goes once per event and member
--    (private.checked_in_pushed); the bell entry still comes back.
--
-- (The fourth finding, a walk-in unticked and lost, is the guest list's: a
-- walk-in's box stays ticked.)
--
-- event_guest_check_in as 20261113120000 left it, push_event_reminders as
-- 20261105102000 left it, claim_event_registrations_for as 20261104110000
-- left it, each with only the changes above.
--
-- Probe: supabase/tests/organizers-keep-the-guest-list.sql (cases 8 to 10).
-- ============================================================================

create table if not exists private.checked_in_pushed (
  event_id uuid not null references public.events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (event_id, member_id)
);

comment on table private.checked_in_pushed is
  'Who was pushed "You''re checked in" for which event, once. See 20261113130000.';

revoke all on private.checked_in_pushed from public, anon, authenticated;

-- ------------------------------------------------- ticking a member in (3)


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
  found_event record;
  ticked boolean;
  joined text;
  first_push boolean;
begin
  if me is null or not public.may_change_event(p_event) then
    raise exception 'Only the event''s organizers can check guests in.' using errcode = '42501';
  end if;
  if (p_member is null) = (p_registration is null) then
    raise exception 'Say which guest.' using errcode = '22023';
  end if;

  select e.id, e.start_time, e.organization_id into found_event
    from public.events e where e.id = p_event;
  if p_checked and now() < found_event.start_time then
    raise exception 'Guests can be checked in once the event has started.' using errcode = '22023';
  end if;

  if p_member is not null then
    if not p_checked then
      delete from public.event_check_ins c where c.event_id = p_event and c.member_id = p_member;
      delete from public.notifications n
       where n.member_id = p_member and n.tag = 'checked_in:' || p_event::text and n.read_at is null;
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
    on conflict do nothing
    returning true into ticked;
    -- Already in, by themselves or another organizer: nothing more to do.
    if ticked is null then
      return;
    end if;

    -- As check_in_to_event: the hosting organization, joined or asked. Not
    -- for a member whose Going came from an organizer typing in their email
    -- (20261113130000): they never chose this event, let alone its host.
    if not exists (
      select 1 from public.event_registrations g
       where g.event_id = p_event and g.member_id = p_member and g.added_by is not null
    ) then
      insert into public.organization_join_requests (organization_id, member_id)
      select o.id, p_member
        from public.organizations o
       where o.id = found_event.organization_id
         and o.removed_at is null
         and o.joins_need_approval
         and not exists (
           select 1 from public.organization_members om
            where om.organization_id = o.id and om.member_id = p_member
         )
      on conflict do nothing;

      with added as (
        insert into public.organization_members (organization_id, member_id, joined_via, event_id)
        select o.id, p_member, 'check_in', p_event
          from public.organizations o
         where o.id = found_event.organization_id
           and o.removed_at is null
           and not o.joins_need_approval
        on conflict do nothing
        returning organization_id
      )
      select o.name into joined
        from added a
        join public.organizations o on o.id = a.organization_id;
    end if;

    -- Told, unless they ticked themselves (an organizer on their own list).
    if p_member <> me then
      insert into public.notifications as n
        (member_id, kind, tag, actor_id, event_id, organization_id, detail)
      values (p_member, 'checked_in', 'checked_in:' || p_event::text, me, p_event,
              case when joined is not null then found_event.organization_id end, joined)
      on conflict (member_id, tag) where read_at is null
      do update set created_at = clock_timestamp(), actor_id = excluded.actor_id,
                    organization_id = excluded.organization_id, detail = excluded.detail,
                    seen_at = null;
      -- Pushed once per event (20261113130000): ticking and unticking again
      -- brings the bell entry back, silently.
      insert into private.checked_in_pushed (event_id, member_id)
      values (p_event, p_member)
      on conflict do nothing
      returning true into first_push;
      if first_push then
        perform public.push_notify_send(
          'checked_in', jsonb_build_object('event_id', p_event, 'member_id', p_member));
      end if;
    end if;
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

-- ------------------------------------- a hand-added guest claimed (1, 3)

create or replace function private.claim_event_registrations_for(member uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  address text := private.confirmed_email(member);
begin
  -- Registrations made with an address are theirs once it is (20261104110000).
  if address is null or private.email_unproven(member) or not exists (
    select 1 from public.members m where m.id = member and m.status = 'active'
  ) then
    return;
  end if;

  insert into public.event_rsvps (event_id, member_id, status)
  select r.event_id, member, r.status
    from public.event_registrations r
   where lower(r.email::text) = address and r.member_id is null
  on conflict (event_id, member_id) do nothing;

  -- An organizer ticked them as there before the address was theirs
  -- (20261113130000): the tick moves to their check-in, which is what the
  -- guest list reads once the registration is claimed.
  insert into public.event_check_ins (event_id, member_id, checked_in_at, checked_in_by)
  select r.event_id, member, r.checked_in_at, r.checked_in_by
    from public.event_registrations r
   where lower(r.email::text) = address and r.member_id is null
     and r.checked_in_at is not null
  on conflict (event_id, member_id) do nothing;

  -- And, as a check-in does, the host joined or asked; but only for a
  -- registration they made themselves, not one an organizer typed in.
  insert into public.organization_join_requests (organization_id, member_id)
  select distinct o.id, member
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    join public.organizations o on o.id = e.organization_id
   where lower(r.email::text) = address and r.member_id is null
     and r.checked_in_at is not null and r.added_by is null
     and o.removed_at is null
     and o.joins_need_approval
     and not exists (
       select 1 from public.organization_members om
        where om.organization_id = o.id and om.member_id = member
     )
  on conflict do nothing;

  insert into public.organization_members (organization_id, member_id, joined_via, event_id)
  select distinct on (o.id) o.id, member, 'check_in', e.id
    from public.event_registrations r
    join public.events e on e.id = r.event_id
    join public.organizations o on o.id = e.organization_id
   where lower(r.email::text) = address and r.member_id is null
     and r.checked_in_at is not null and r.added_by is null
     and o.removed_at is null
     and not o.joins_need_approval
   order by o.id, r.checked_in_at
  on conflict do nothing;

  return query
    update public.event_registrations r set member_id = member, updated_at = now()
     where lower(r.email::text) = address and r.member_id is null
    returning r.event_id;
end;
$$;

-- --------------------------------------------- the follow-up, late (2)


create or replace function public.push_event_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_at timestamptz := clock_timestamp();
  recorded integer;
begin
  -- A day ahead of a timed event, from its own zone.
  insert into public.event_day_before_sent (event_id, member_id, batch)
  select e.id, rv.member_id, run_at
    from public.events e
    left join public.data_feeds f on f.id = e.feed_id
    join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
    join public.members r on r.id = rv.member_id and r.status = 'active'
   where not e.all_day
     and e.start_time > now() + interval '12 hours'
     and e.start_time <= now() + interval '36 hours'
     and private.day_ahead_at(e.start_time, coalesce(e.timezone, f.timezone, 'America/Los_Angeles')) <= now()
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id, detail)
  select sent.member_id, 'event_reminder', 'event:' || sent.event_id::text, sent.event_id,
         lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam'))
    from public.event_day_before_sent sent
    join public.events e on e.id = sent.event_id
    left join public.data_feeds f on f.id = e.feed_id
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), detail = excluded.detail, seen_at = null;
    perform public.push_notify_send('day_before', jsonb_build_object('batch', run_at));
  end if;

  -- Ten minutes before a timed event.
  insert into public.event_starting_sent (event_id, member_id, batch)
  select e.id, rv.member_id, run_at
    from public.events e
    join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
    join public.members r on r.id = rv.member_id and r.status = 'active'
   where not e.all_day
     and e.start_time > now() + interval '5 minutes'
     and e.start_time <= now() + interval '15 minutes 30 seconds'
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id, detail)
  select sent.member_id, 'event_starting', 'starting:' || sent.event_id::text, sent.event_id,
         lower(to_char(e.start_time at time zone coalesce(e.timezone, f.timezone, 'America/Los_Angeles'), 'FMHH12:MIam'))
    from public.event_starting_sent sent
    join public.events e on e.id = sent.event_id
    left join public.data_feeds f on f.id = e.feed_id
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), detail = excluded.detail, seen_at = null;
    perform public.push_notify_send('starting', jsonb_build_object('batch', run_at));
  end if;

  -- Thirty minutes after a timed event ends, to whoever has not checked in.
  insert into public.event_check_in_reminders_sent (event_id, member_id, batch)
  select e.id, rv.member_id, run_at
    from public.events e
    join public.event_rsvps rv on rv.event_id = e.id and rv.status = 'going'
    join public.members r on r.id = rv.member_id and r.status = 'active'
   where not e.all_day
     and e.start_time <= now()
     and coalesce(e.end_time, e.start_time) > now() - interval '4 hours 45 minutes'
     and coalesce(e.end_time, e.start_time) <= now() - interval '30 minutes'
     and coalesce(e.end_time, e.start_time + interval '4 hours') + interval '30 minutes' <= now()
     and coalesce(e.end_time, e.start_time + interval '4 hours') + interval '45 minutes' > now()
     and not exists (
       select 1 from public.event_check_ins c
        where c.event_id = e.id and c.member_id = rv.member_id
     )
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id)
  select sent.member_id, 'check_in_reminder', 'check_in:' || sent.event_id::text, sent.event_id
    from public.event_check_in_reminders_sent sent
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), seen_at = null;
    perform public.push_notify_send('check_in_reminder', jsonb_build_object('batch', run_at));
  end if;

  -- At 10am the day after an event, to whoever checked in.
  insert into public.event_followups_sent (event_id, member_id, batch)
  select e.id, c.member_id, run_at
    from public.events e
    join public.event_check_ins c on c.event_id = e.id
    left join public.data_feeds f on f.id = e.feed_id
    join public.members r on r.id = c.member_id and r.status = 'active'
    cross join lateral (
      select (
        (((coalesce(e.end_time, e.start_time) at time zone z.zone)::date + 1) + interval '10 hours')
          at time zone z.zone
      ) as due
      from (select coalesce(e.timezone, f.timezone, 'America/Los_Angeles') as zone) z
    ) d
   where coalesce(e.end_time, e.start_time) > now() - interval '8 days'
     and coalesce(e.end_time, e.start_time) <= now() - interval '6 hours'
     and d.due <= now()
     -- In the hour after it was due; or, for whoever checked in after that
     -- (20261113130000), in the hour after they did. Each member once.
     and (d.due > now() - interval '1 hour' or c.checked_in_at > now() - interval '1 hour')
  on conflict do nothing;
  get diagnostics recorded = row_count;
  if recorded > 0 then
  insert into public.notifications as n (member_id, kind, tag, event_id)
  select sent.member_id, 'event_followup', 'followup:' || sent.event_id::text, sent.event_id
    from public.event_followups_sent sent
   where sent.batch = run_at
  on conflict (member_id, tag) where read_at is null
  do update set created_at = clock_timestamp(), seen_at = null;
    perform public.push_notify_send('event_followup', jsonb_build_object('batch', run_at));
  end if;
end;
$$;

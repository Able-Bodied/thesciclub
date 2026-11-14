-- ============================================================================
-- Check-in stays open for a day after the event, and then says who to ask
--
-- The owner, 2026-11-13: "keep the checkin window for up to 24 hours after an
-- event closes. If it is closed add an option to message an admin about it."
--
-- 1. check_in_to_event: as 20261031100000, but the window now closes 24 hours
--    after the event ends, not one. An event with no end still counts as four
--    hours long, and an all-day event still ends with its last day.
--
-- 2. check_in_missed(p_event): for a member who missed it, during the week
--    after check-in closed. Opens (or finds) a conversation with somebody who
--    can help, and returns its id; the app puts a first line in the box for
--    them to send or change. Nothing is sent by this function.
--
--    Who: the member who added the event; else somebody who speaks for its
--    organization; else a club administrator, longest-serving first. Never the
--    member asking, and never somebody either of them has blocked. Unlike
--    chat_open_direct, the person need not be in the directory: they are
--    reached because they run the event or the club, not found in a search.
-- ============================================================================

-- When check-in closes: a day after the event ends. Kept in one place, as
-- src/lib/check-ins.ts checkInWindow mirrors it.
create or replace function private.check_in_closes(
  p_start timestamptz, p_end timestamptz, p_all_day boolean
)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select case
    when p_all_day then coalesce(p_end, p_start) + interval '1 day'
    else coalesce(p_end, p_start + interval '4 hours')
  end + interval '24 hours';
$$;

revoke all on function private.check_in_closes(timestamptz, timestamptz, boolean) from public, anon, authenticated;

create or replace function public.check_in_to_event(p_event uuid)
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

  closes := private.check_in_closes(found_event.start_time, found_event.end_time, found_event.all_day);
  if now() < found_event.start_time - interval '1 hour' then
    raise exception 'Check-in opens an hour before the event.' using errcode = '22023';
  end if;
  if now() > closes then
    raise exception 'Check-in for this event has closed.' using errcode = '22023';
  end if;

  insert into public.event_check_ins (event_id, member_id)
  values (p_event, me)
  on conflict do nothing;

  insert into public.organization_join_requests (organization_id, member_id)
  select o.id, me
    from public.organizations o
   where o.id = found_event.organization_id
     and o.removed_at is null
     and o.joins_need_approval
     and not exists (
       select 1 from public.organization_members om
        where om.organization_id = o.id and om.member_id = me
     )
  on conflict do nothing;

  with added as (
    insert into public.organization_members (organization_id, member_id, joined_via, event_id)
    select o.id, me, 'check_in', p_event
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

  return joined;
end;
$$;

create or replace function public.check_in_missed(p_event uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_event record;
  closes timestamptz;
  helper uuid;
  key text;
  found_thread uuid;
begin
  if me is null or not public.is_active_member() then
    raise exception 'Only an active member can send a message.' using errcode = '42501';
  end if;

  select e.id, e.start_time, e.end_time, e.all_day, e.organization_id, e.added_by
    into found_event
    from public.events e
   where e.id = p_event;
  if not found then
    raise exception 'This event is not on the calendar.' using errcode = 'P0002';
  end if;

  closes := private.check_in_closes(found_event.start_time, found_event.end_time, found_event.all_day);
  if now() <= closes then
    raise exception 'Check-in for this event is still open.' using errcode = '22023';
  end if;
  if now() > closes + interval '7 days' then
    raise exception 'Check-in for this event closed more than a week ago.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.event_check_ins c where c.event_id = p_event and c.member_id = me
  ) then
    raise exception 'You checked in to this event.' using errcode = '22023';
  end if;

  select m.id into helper
    from public.members m
   where m.id = found_event.added_by
     and m.status = 'active'
     and m.id <> me
     and not public.members_blocked(me, m.id);

  if helper is null then
    select m.id into helper
      from public.organization_representatives r
      join public.members m on m.id = r.member_id
     where r.organization_id = found_event.organization_id
       and m.status = 'active'
       and m.id <> me
       and not public.members_blocked(me, m.id)
     order by r.created_at, m.id
     limit 1;
  end if;

  if helper is null then
    select m.id into helper
      from public.members m
     where m.is_admin
       and m.status = 'active'
       and m.id <> me
       and not public.members_blocked(me, m.id)
     order by m.created_at, m.id
     limit 1;
  end if;

  if helper is null then
    raise exception 'There is nobody to message about this event.' using errcode = 'P0002';
  end if;

  key := least(me, helper)::text || ':' || greatest(me, helper)::text;

  select t.id into found_thread from public.chat_threads t where t.direct_key = key;
  if found_thread is null then
    insert into public.chat_threads (kind, direct_key, created_by)
    values ('direct', key, me)
    on conflict (direct_key) do nothing
    returning id into found_thread;

    if found_thread is null then
      select t.id into found_thread from public.chat_threads t where t.direct_key = key;
    end if;
  end if;

  insert into public.chat_thread_members (thread_id, member_id)
  values (found_thread, me), (found_thread, helper)
  on conflict (thread_id, member_id) do nothing;

  return found_thread;
end;
$$;

revoke all on function public.check_in_missed(uuid) from public, anon;
grant execute on function public.check_in_missed(uuid) to authenticated;

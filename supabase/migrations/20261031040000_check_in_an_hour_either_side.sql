-- ============================================================================
-- Checking in lights up an hour either side of the event
--
-- The owner, 2026-10-31, after 20261031020000: "make the check-in button light
-- up maybe an hour before and after the event". An hour before the start to an
-- hour after the end. An event with no end still counts as four hours long,
-- and an all-day event still runs to the end of the day after its last.
--
-- As 20261031010000, which had this window.
-- ============================================================================

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

  closes := case
    when found_event.all_day then coalesce(found_event.end_time, found_event.start_time) + interval '1 day'
    else coalesce(found_event.end_time, found_event.start_time + interval '4 hours') + interval '1 hour'
  end;
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
     and not o.is_the_club
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
       and not o.is_the_club
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

-- An organization's events one by one on Stats & controls (the owner,
-- 2026-10-31): the totals never said which events they came from. Only what
-- its org admins can already see on each event's page.
--
-- Turnout was every check-in over everybody going, so a walk-in who never said
-- Going could lift it past 100%. said_going_and_came counts only those who
-- said Going, which is what the screen says it means.
--
-- Changing a function's columns needs a drop, so stats is made again.

drop function public.my_organization_stats(uuid, integer);

create function public.my_organization_stats(p_organization uuid, p_days integer default 30)
returns table (
  members integer,
  joined integer,
  left_it integer,
  waiting integer,
  by_code integer,
  by_check_in integer,
  events_held integer,
  events_ahead integer,
  going integer,
  checked_in integer,
  said_going_and_came integer,
  reviews integer,
  rating numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with since as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3660)) as at
  ),
  held as (
    select e.id from public.events e, since
     where e.organization_id = p_organization and e.start_time > since.at and e.start_time <= now()
  ),
  belonging as (
    select om.joined_at, om.joined_via, om.left_at, om.denied_at
      from public.organization_members om
      join public.members m on m.id = om.member_id and not m.is_seed
     where om.organization_id = p_organization
       and (om.left_at is not null or m.status = 'active')
  ),
  theirs as (
    select r.rating, r.created_at
      from public.reviews r
      left join public.events e on e.id = r.event_id
     where r.removed_at is null
       and coalesce(r.organization_id, e.organization_id) = p_organization
  )
  select
    (select count(*)::int from belonging b where b.left_at is null and b.denied_at is null),
    (select count(*)::int from belonging b, since
      where b.denied_at is null and b.joined_at > since.at),
    (select count(*)::int from belonging b, since where b.left_at > since.at),
    (select count(*)::int from public.organization_join_requests q
      where q.organization_id = p_organization),
    (select count(*)::int from belonging b, since
      where b.denied_at is null and b.joined_at > since.at and b.joined_via = 'code'),
    (select count(*)::int from belonging b, since
      where b.denied_at is null and b.joined_at > since.at and b.joined_via = 'check_in'),
    (select count(*)::int from held),
    (select count(*)::int from public.events e
      where e.organization_id = p_organization and e.start_time > now()),
    (select count(*)::int from public.event_rsvps r
      where r.status = 'going' and r.event_id in (select id from held)),
    (select count(*)::int from public.event_check_ins c
      where c.event_id in (select id from held)),
    (select count(*)::int from public.event_check_ins c
      join public.event_rsvps r
        on r.event_id = c.event_id and r.member_id = c.member_id and r.status = 'going'
      where c.event_id in (select id from held)),
    (select count(*)::int from theirs t, since where t.created_at > since.at),
    (select round(avg(t.rating), 1) from theirs t, since where t.created_at > since.at)
   where public.is_admin() or public.speaks_for(p_organization);
$$;
revoke all on function public.my_organization_stats(uuid, integer) from public, anon;
grant execute on function public.my_organization_stats(uuid, integer) to authenticated, service_role;

create function public.my_organization_events(p_organization uuid, p_days integer default 30)
returns table (
  id uuid,
  title text,
  start_time timestamptz,
  timezone text,
  going integer,
  checked_in integer,
  said_going_and_came integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.title, e.start_time, e.timezone,
         (select count(*)::int from public.event_rsvps r
           where r.event_id = e.id and r.status = 'going'),
         (select count(*)::int from public.event_check_ins c where c.event_id = e.id),
         (select count(*)::int from public.event_check_ins c
           join public.event_rsvps r
             on r.event_id = c.event_id and r.member_id = c.member_id and r.status = 'going'
           where c.event_id = e.id)
    from public.events e
   where e.organization_id = p_organization
     and e.start_time > now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3660))
     and e.start_time <= now()
     and (public.is_admin() or public.speaks_for(p_organization))
   order by e.start_time desc, e.id
   limit 500;
$$;
revoke all on function public.my_organization_events(uuid, integer) from public, anon;
grant execute on function public.my_organization_events(uuid, integer) to authenticated, service_role;

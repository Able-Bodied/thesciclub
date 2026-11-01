-- More numbers on Stats & controls (the owner, 2026-10-31), all from what the
-- reader can already see person by person.
--
-- my_partner_stats: could_have_mentor, the people a mentor could be for, for
-- a percentage; and days_to_mentor, the median days from joining to a first
-- connection with a mentor. with_mentor stops counting mentors, whom My people
-- leaves out of the same question.
--
-- my_organization_stats: of those who came to an event held in the period,
-- first_timers have checked in to this organization once and came_back more
-- than once.
--
-- my_organization_weeks: its last weeks, Monday to Monday in California as
-- Admin's are, newest first.
--
-- Changing a function's columns needs a drop.

drop function public.my_partner_stats(integer);
drop function public.my_organization_stats(uuid, integer);

CREATE OR REPLACE FUNCTION public.my_partner_stats(p_days integer DEFAULT 30)
 RETURNS TABLE(invited integer, joined integer, active integer, introductions integer, opened integer, with_mentor integer, could_have_mentor integer, days_to_mentor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (
    select auth.uid() as id where private.can_connect(auth.uid())
  ),
  since as (
    select now() - make_interval(days => least(greatest(coalesce(p_days, 30), 1), 3660)) as at
  ),
  people as (
    select p.member_id from public.my_people() p where p.member_id is not null
  )
  select
    (select count(*)::int from public.invites i, me, since
      where i.invited_by_member_id = me.id and i.created_at > since.at and i.revoked_at is null),
    (select count(*)::int from public.invites i
       join public.members m on m.id = i.claimed_by and m.status = 'active', me, since
      where i.invited_by_member_id = me.id and i.status = 'consumed' and i.consumed_at > since.at),
    (select count(*)::int from people x, since
      where exists (select 1 from public.chat_posts c
                     where c.author_id = x.member_id and c.created_at > since.at and c.removed_at is null)
         or exists (select 1 from public.event_rsvps r
                     where r.member_id = x.member_id and r.status = 'going' and r.updated_at > since.at)),
    (select count(*)::int from public.introductions n, me, since
      where n.introduced_by = me.id and n.created_at > since.at),
    (select count(*)::int from public.introductions n, me, since
      where n.introduced_by = me.id and n.opened_at > since.at),
    (select count(*)::int from public.my_people() p
      where p.introduced_to_mentor and p.member_type <> 'mentor'),
    (select count(*)::int from public.my_people() p
      where p.member_id is not null and p.member_type <> 'mentor'),
    (select round(percentile_cont(0.5) within group (order by first_mentor.days)::numeric, 1)
       from (
         select greatest(extract(epoch from min(n.opened_at) - m.created_at), 0)::double precision
                / 86400 as days
           from public.my_people() p
           join public.members m on m.id = p.member_id and m.type <> 'mentor'
           join public.introductions n
             on m.id in (n.first_id, n.second_id) and n.opened_at is not null
           join public.members t
             on t.id = case when n.first_id = m.id then n.second_id else n.first_id end
            and t.type = 'mentor'
          group by m.id, m.created_at
       ) first_mentor)
    from me;
$function$;

CREATE OR REPLACE FUNCTION public.my_organization_stats(p_organization uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(members integer, joined integer, left_it integer, waiting integer, by_code integer, by_check_in integer, events_held integer, events_ahead integer, going integer, checked_in integer, said_going_and_came integer, first_timers integer, came_back integer, reviews integer, rating numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  attending as (
    select c.member_id,
           count(*) as times,
           bool_or(c.event_id in (select id from held)) as in_period
      from public.event_check_ins c
      join public.events e on e.id = c.event_id
     where e.organization_id = p_organization and e.start_time <= now()
     group by c.member_id
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
    (select count(*)::int from attending a where a.in_period and a.times = 1),
    (select count(*)::int from attending a where a.in_period and a.times > 1),
    (select count(*)::int from theirs t, since where t.created_at > since.at),
    (select round(avg(t.rating), 1) from theirs t, since where t.created_at > since.at)
   where public.is_admin() or public.speaks_for(p_organization);
$function$;

create function public.my_organization_weeks(p_organization uuid, p_weeks integer default 8)
returns table (
  week date,
  members integer,
  joined integer,
  events integer,
  checked_in integer,
  going integer,
  said_going_and_came integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with weeks as (
    select monday::date as week,
           monday at time zone 'America/Los_Angeles' as starts,
           (monday + interval '7 days') at time zone 'America/Los_Angeles' as ends
      from generate_series(
             date_trunc('week', now() at time zone 'America/Los_Angeles')
               - make_interval(weeks => least(greatest(coalesce(p_weeks, 8), 1), 52) - 1),
             date_trunc('week', now() at time zone 'America/Los_Angeles'),
             interval '1 week'
           ) as monday
  ),
  belonging as (
    select om.joined_at, om.left_at
      from public.organization_members om
      join public.members m on m.id = om.member_id and not m.is_seed
     where om.organization_id = p_organization
       and om.denied_at is null
       and (om.left_at is not null or m.status = 'active')
  ),
  held as (
    select e.id, e.start_time from public.events e
     where e.organization_id = p_organization and e.start_time <= now()
  )
  select w.week,
         (select count(*)::int from belonging b
           where b.joined_at < w.ends and (b.left_at is null or b.left_at >= w.ends)),
         (select count(*)::int from belonging b
           where b.joined_at >= w.starts and b.joined_at < w.ends),
         (select count(*)::int from held h where h.start_time >= w.starts and h.start_time < w.ends),
         (select count(*)::int from public.event_check_ins c
           join held h on h.id = c.event_id
           where h.start_time >= w.starts and h.start_time < w.ends),
         (select count(*)::int from public.event_rsvps r
           join held h on h.id = r.event_id
           where r.status = 'going' and h.start_time >= w.starts and h.start_time < w.ends),
         (select count(*)::int from public.event_check_ins c
           join held h on h.id = c.event_id
           join public.event_rsvps r
             on r.event_id = c.event_id and r.member_id = c.member_id and r.status = 'going'
           where h.start_time >= w.starts and h.start_time < w.ends)
    from weeks w
   where public.is_admin() or public.speaks_for(p_organization)
   order by w.week desc;
$$;

revoke all on function public.my_partner_stats(integer) from public, anon;
grant execute on function public.my_partner_stats(integer) to authenticated, service_role;
revoke all on function public.my_organization_stats(uuid, integer) from public, anon;
grant execute on function public.my_organization_stats(uuid, integer) to authenticated, service_role;
revoke all on function public.my_organization_weeks(uuid, integer) from public, anon;
grant execute on function public.my_organization_weeks(uuid, integer) to authenticated, service_role;

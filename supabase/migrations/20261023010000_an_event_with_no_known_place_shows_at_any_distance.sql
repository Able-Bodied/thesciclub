-- ============================================================================
-- An event with no known place is never hidden by distance
-- ============================================================================
-- The owner, 2026-10-23. A calendar invitation's event was on its
-- organization's page but not on Events: Events asks events_within_miles
-- (20261022000000) for what is within 20 miles of home, and that answered
-- only events with coordinates. Nothing places a hand-made or calendar-made
-- event, so every in-person one dropped out whenever a distance was set.
--
-- The owner's rule, for every event, scraped or made in the club:
--   1. Its own coordinates, or the middle of its own city and state
--      (city_places), when the map has them.
--   2. With no city of its own, its organization's city, for the distance
--      only: nothing is written into the event. An organization keeps a city
--      but no state, so only a city the map knows one place by is used.
--   3. Otherwise its place is unknown, and it shows at any distance, as an
--      online event does (the list shows those anywhere; here they are
--      never placed by their organization).
-- ============================================================================

create or replace function public.events_within_miles(miles integer)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  with home as (
    select p.latitude, p.longitude
    from public.members m
    join public.city_places p
      on p.city_key = lower(btrim(m.city)) and p.state = m.state
    where m.id = (select auth.uid())
      and (select public.is_member())
      and p.latitude is not null and p.longitude is not null
  ),
  organization_places as (
    select o.id, min(p.latitude) as latitude, min(p.longitude) as longitude
    from public.organizations o
    join public.city_places p
      on p.city_key = lower(btrim(o.city))
     and p.latitude is not null and p.longitude is not null
    group by o.id
    having count(*) = 1
  ),
  placed as (
    select e.id,
      case
        when e.latitude is not null and e.longitude is not null then point(e.longitude, e.latitude)
        when nullif(btrim(e.city), '') is not null then point(c.longitude, c.latitude)
        -- An online event is not where its organization is.
        when e.event_format is distinct from 'online' then point(o.longitude, o.latitude)
      end as at
    from public.events e
    left join public.city_places c
      on c.city_key = lower(btrim(e.city)) and c.state = e.state
    left join organization_places o on o.id = e.organization_id
    where e.start_time >= now() - interval '1 year'
  )
  select case when exists (select 1 from home) then coalesce((
    select array_agg(e.id)
    from home h
    cross join placed e
    where e.at is null
      -- Clamped, so a miles of 0 or a million asks nothing new.
      or 3958.8 * acos(greatest(-1, least(1,
            cos(radians(h.latitude)) * cos(radians(e.at[1]))
              * cos(radians(e.at[0]) - radians(h.longitude))
            + sin(radians(h.latitude)) * sin(radians(e.at[1]))
          ))) <= least(greatest(miles, 1), 500)
  ), '{}'::uuid[]) end;
$$;

revoke all on function public.events_within_miles(integer) from public, anon, authenticated;
grant execute on function public.events_within_miles(integer) to authenticated;

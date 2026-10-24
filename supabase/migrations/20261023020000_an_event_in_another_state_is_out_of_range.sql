-- ============================================================================
-- An event in another state is out of range when it cannot be placed
-- ============================================================================
-- The owner, 2026-10-23. BlazeSports' Wheelchair Basketball, in Atlanta,
-- showed in a California member's list at 20 miles: it had a state (GA) but no
-- city, and its organization's "Atlanta" has no state, so 20261023010000
-- could not place it and showed it at any distance.
--
-- The rule now, for an event that is not online:
--   1. Its own coordinates, or its own city and state (city_places).
--   2. With no city but a state, its organization's city in that state; with
--      no state, as before, only a city the map knows one place by.
--   3. Not placed, and its state is known and not the member's: out of range.
--      An event just over a border may be missed; the owner's choice.
--   4. Nothing known about its place: any distance, as before.
-- Online events are unchanged. The nightly import places (organization city,
-- event state) in city_places.
-- ============================================================================

create or replace function public.events_within_miles(miles integer)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  with home as (
    select p.latitude, p.longitude, m.state
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
        when e.event_format is not distinct from 'online' then null
        when e.state is not null then point(s.longitude, s.latitude)
        else point(o.longitude, o.latitude)
      end as at,
      case when e.event_format is distinct from 'online' then e.state end as state
    from public.events e
    left join public.city_places c
      on c.city_key = lower(btrim(e.city)) and c.state = e.state
    left join public.organizations eo on eo.id = e.organization_id
    left join public.city_places s
      on s.city_key = lower(btrim(eo.city)) and s.state = e.state
    left join organization_places o on o.id = e.organization_id
    where e.start_time >= now() - interval '1 year'
  )
  select case when exists (select 1 from home) then coalesce((
    select array_agg(e.id)
    from home h
    cross join placed e
    where case when e.at is null then e.state is null or e.state = h.state
      -- Clamped, so a miles of 0 or a million asks nothing new. Only for a
      -- place: greatest and least skip a null, which measures as 0 miles.
      else 3958.8 * acos(greatest(-1, least(1,
            cos(radians(h.latitude)) * cos(radians(e.at[1]))
              * cos(radians(e.at[0]) - radians(h.longitude))
            + sin(radians(h.latitude)) * sin(radians(e.at[1]))
          ))) <= least(greatest(miles, 1), 500) end
  ), '{}'::uuid[]) end;
$$;

revoke all on function public.events_within_miles(integer) from public, anon, authenticated;
grant execute on function public.events_within_miles(integer) to authenticated;

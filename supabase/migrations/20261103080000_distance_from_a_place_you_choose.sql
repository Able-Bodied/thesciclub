-- ============================================================================
-- Distance from a place you choose
-- ============================================================================
-- The owner, 2026-11-03: "when in list mode, I want the user to be able to
-- specify a new city to filter the list on ... a 'change' linked text next to
-- San Jose ... enter a new city, state, or zip code".
--
-- events_within_miles measures from the middle of the member's own city
-- (20261027000000). events_within_miles_of measures the same way from a point
-- the member's device found for what they typed. The point is used for this
-- answer and kept nowhere. p_state is the place's state, if any: an online
-- event with no place of its own counts as in range only in its host's state,
-- as from home.
-- ============================================================================

create or replace function public.events_within_miles_of(
  miles integer,
  p_latitude double precision,
  p_longitude double precision,
  p_state text default null
)
returns uuid[]
language sql
security definer
stable
set search_path = ''
as $$
  with home as (
    select p_latitude as latitude, p_longitude as longitude, p_state as state
    where (select public.is_member())
      and p_latitude between -90 and 90
      and p_longitude between -180 and 180
  ),
  online as (
    select e.id, s.latitude, s.longitude, null::text as state
    from public.events e
    left join public.organization_places eo
      on eo.organization_id = e.organization_id and eo.position = 0
    left join private.city_middles s
      on s.city_key = lower(btrim(eo.city)) and s.state = eo.state
    where (select public.is_member())
      and (e.audience in ('public', 'club') or public.can_see_event(e.id))
      and e.event_format = 'online'
      and e.start_time >= now() - interval '1 year'
  ),
  placed as (
    select v.id, v.latitude, v.longitude, v.state from private.visible_event_places(true) v
    union all
    select o.id, o.latitude, o.longitude, o.state from online o
  )
  select case when exists (select 1 from home) then coalesce((
    select array_agg(e.id)
    from home h
    cross join placed e
    where case when e.latitude is null then e.state is null or e.state = h.state
      else 3958.8 * acos(greatest(-1, least(1,
            cos(radians(h.latitude)) * cos(radians(e.latitude))
              * cos(radians(e.longitude) - radians(h.longitude))
            + sin(radians(h.latitude)) * sin(radians(e.latitude))
          ))) <= least(greatest(miles, 1), 500) end
  ), '{}'::uuid[]) end;
$$;

revoke all on function public.events_within_miles_of(integer, double precision, double precision, text)
  from public, anon, authenticated;
grant execute on function public.events_within_miles_of(integer, double precision, double precision, text)
  to authenticated;

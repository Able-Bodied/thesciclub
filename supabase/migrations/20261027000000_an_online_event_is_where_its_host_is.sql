-- ============================================================================
-- An online event is as near as its host
-- ============================================================================
-- The owner, 2026-10-27: the distance filter now applies to online events,
-- measured from their organization's main place (organization_places,
-- position 0), at the middle of its city. Most online events are a local
-- group's, meant for the people near it.
--
-- An online event with no organization, or one whose main place is not on
-- the map, still shows at any distance. Hybrid events were measured from
-- their own place already (visible_event_places); the list stops showing
-- them everywhere at the same time.
--
-- Only for the distance: the map still has no online events, and nothing is
-- written into the event.
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
    join private.city_middles p
      on p.city_key = lower(btrim(m.city)) and p.state = m.state
    where m.id = (select auth.uid())
      and (select public.is_member())
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
    -- An online event with no place has no state, so it is in range anywhere.
    where case when e.latitude is null then e.state is null or e.state = h.state
      -- Clamped, so a miles of 0 or a million asks nothing new.
      else 3958.8 * acos(greatest(-1, least(1,
            cos(radians(h.latitude)) * cos(radians(e.latitude))
              * cos(radians(e.longitude) - radians(h.longitude))
            + sin(radians(h.latitude)) * sin(radians(e.latitude))
          ))) <= least(greatest(miles, 1), 500) end
  ), '{}'::uuid[]) end;
$$;

revoke all on function public.events_within_miles(integer) from public, anon, authenticated;
grant execute on function public.events_within_miles(integer) to authenticated;

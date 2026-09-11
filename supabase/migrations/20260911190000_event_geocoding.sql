-- ============================================================================
-- nearby_events — distance filtering without handing out the coordinates
-- ============================================================================
-- The geocoded columns live on `events` (20260911180000_events.sql); this is
-- the only way to ask a question about the two of them that are unreadable.
--
-- It takes an origin and a radius and returns event ids and a distance. It
-- never returns latitude or longitude, so "which events are within 25 miles of
-- me" is answerable without "where exactly is this support group".
--
-- ---------------------------------------------------------------------------
-- Why SECURITY DEFINER, where ab-peers' version was INVOKER
-- ---------------------------------------------------------------------------
-- ab-peers left this as a plain `language sql` function, i.e. security
-- invoker, and argued that this was safe because the caller could read the
-- table anyway. That is no longer true: `anon` and `authenticated` have had
-- the column privilege on latitude/longitude revoked, so an invoker function
-- reading e.latitude would fail for exactly the callers that need it.
--
-- Running as owner is therefore load-bearing rather than incidental, and the
-- safety has to come from the function body instead of from the caller's
-- privileges. It does: the return type is (uuid, double precision), the
-- distance is computed and compared inside the function, and there is no
-- argument that widens either. The worst a caller can do is binary-search a
-- venue's position by varying the radius — which costs a request per metre and
-- is bounded below by how coarse the geocode was in the first place.
--
-- The RLS policy on events is "public", so running as owner grants no rows a
-- caller could not already list.
--
-- Haversine rather than PostGIS: the whole corpus is a few hundred events in
-- one state, the accuracy difference is metres, and the extension is a
-- dependency that would have to exist in every environment that runs a reset.
-- ============================================================================

create or replace function public.nearby_events(
  origin_lat double precision,
  origin_lon double precision,
  radius_km double precision
)
returns table (id uuid, distance_km double precision)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select d.id, d.distance_km
  from (
    select
      e.id,
      -- greatest/least clamps the cosine into [-1, 1]. Floating point can push
      -- it a hair outside for two points that are the same place, and acos()
      -- of 1.0000000000000002 is NaN, not zero.
      6371 * acos(
        greatest(-1, least(1,
          cos(radians(origin_lat)) * cos(radians(e.latitude))
            * cos(radians(e.longitude) - radians(origin_lon))
          + sin(radians(origin_lat)) * sin(radians(e.latitude))
        ))
      ) as distance_km
    from public.events e
    where e.latitude is not null and e.longitude is not null
  ) d
  where d.distance_km <= radius_km
  order by d.distance_km;
$$;

revoke all on function public.nearby_events(double precision, double precision, double precision)
  from public;
grant execute on function public.nearby_events(double precision, double precision, double precision)
  to anon, authenticated;

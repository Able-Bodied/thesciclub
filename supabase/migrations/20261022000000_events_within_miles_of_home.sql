-- ============================================================================
-- Events within so many miles of home
-- ============================================================================
-- The owner, 2026-10-20: the event list shows what is within 20 miles of the
-- member, with a slider in Filters to widen or narrow it.
--
-- A member gives a city and state, never a location (CONTEXT.md), so the
-- distance is from the middle of their city. city_places holds those middles,
-- one per city and state, placed by the nightly import; no member is in it.
--
-- events_within_miles answers for the caller's own home only, and only which
-- events are in range: never a distance or a coordinate (20261003060000).
-- Null means the home is not placed yet (no city, or not looked up), and the
-- list then shows every distance.
-- ============================================================================

create table if not exists public.city_places (
  city_key text not null check (city_key = lower(btrim(city_key)) and city_key <> ''),
  state text not null check (state ~ '^[A-Z]{2}$'),
  latitude double precision,
  longitude double precision,
  placed_at timestamptz not null default now(),
  primary key (city_key, state)
);

comment on table public.city_places is
  'The middle of each city members live in, placed by the nightly import; null when not found.';

alter table public.city_places enable row level security;
revoke all on public.city_places from public, anon, authenticated;
grant select, insert, update, delete on public.city_places to service_role;

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
  )
  select case when exists (select 1 from home) then coalesce((
    select array_agg(e.id)
    from home h
    cross join public.events e
    where e.latitude is not null and e.longitude is not null
      and e.start_time >= now() - interval '1 year'
      -- Clamped, so a miles of 0 or a million asks nothing new.
      and 3958.8 * acos(greatest(-1, least(1,
            cos(radians(h.latitude)) * cos(radians(e.latitude))
              * cos(radians(e.longitude) - radians(h.longitude))
            + sin(radians(h.latitude)) * sin(radians(e.latitude))
          ))) <= least(greatest(miles, 1), 500)
  ), '{}'::uuid[]) end;
$$;

revoke all on function public.events_within_miles(integer) from public, anon, authenticated;
grant execute on function public.events_within_miles(integer) to authenticated;

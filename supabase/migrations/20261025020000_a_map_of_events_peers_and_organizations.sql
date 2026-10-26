-- ============================================================================
-- A map of events, peers and organizations
-- ============================================================================
-- The owner, 2026-10-25. Nothing about a member is finer than their city's
-- middle, and a member count only at a settlement Nominatim confirmed:
--
--   map_events         an exact pin only for an 'exact' event with a state
--                      whose coordinates were found for its current place
--                      (geocoded_location, kept by 20261025030000); the rest
--                      at their city's middle, or with no city, their
--                      organization's main place's (never its display text). Online and
--                      finished events, and ones the caller may not see, are off.
--   events_within_miles  measured from where map_events shows each event,
--                      and for the past year's finished ones the same way.
--   map_peer_cities    who browse_members shows the caller, and the caller,
--                      with show_on_map on, counted by city.
--   map_organizations  each place of an organization (20261025015000): exact
--                      at a public address once found, else its city's middle.
--   map_home           the middle of the caller's own city.
--
-- Coordinates come back rounded to 5 decimals.
-- ============================================================================

alter table public.members
  add column if not exists show_on_map boolean not null default true;

comment on column public.members.show_on_map is
  'Counted on the map at the middle of their city. Set from Me. See 20261025020000.';

-- ------------------------------------------------------------ the geocode --
-- What latitude and longitude were found for: the place, with its city and
-- state when it does not name them. Mirrored by geocodeKey (geocode.js).
create or replace function public.geocode_key(location text, city text, state text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p.place = '' then null else
      p.place
      || case when p.town <> '' and strpos(lower(p.place), lower(p.town)) = 0 then ', ' || p.town else '' end
      || case when p.st <> '' and strpos(p.place, p.st) = 0 then ', ' || p.st else '' end
    end
  from (select btrim(coalesce(location, ''), E' \t\r\n') as place,
               btrim(coalesce(city, ''), E' \t\r\n') as town,
               btrim(coalesce(state, ''), E' \t\r\n') as st) p;
$$;

revoke all on function public.geocode_key(text, text, text) from public, anon, authenticated;
grant execute on function public.geocode_key(text, text, text) to service_role;

alter table public.events add column if not exists geocoded_location text;

comment on column public.events.geocoded_location is
  'The geocode_key latitude and longitude were found for. Not granted to members. See 20261025020000.';

-- The import geocoded the place it wrote, unless an administrator moved it.
update public.events e
   set geocoded_location = public.geocode_key(e.location, e.city, e.state)
 where e.latitude is not null and e.longitude is not null
   and not coalesce(e.admin_override ?| array['location', 'city'], false);

-- ------------------------------------------------------- the city middles --
-- Whether Nominatim's settlement search confirmed the place a city, town,
-- village or a named part of a city: null until checked, and kept null when
-- a check refuses a row that already had a place, which keeps it. Distances
-- and pins use anything not refused, as before; a member count needs a
-- confirmed one.
alter table public.city_places add column if not exists settlement boolean;
alter table public.city_places add column if not exists settlement_checked_at timestamptz;

comment on column public.city_places.settlement is
  'True: a settlement-level match; false: refused, with no place; null: not confirmed. See 20261025020000.';

create or replace view private.city_middles as
select p.city_key, p.state, p.latitude, p.longitude
  from public.city_places p
 where p.settlement is distinct from false and p.latitude is not null and p.longitude is not null;

create or replace view private.settlement_middles as
select p.city_key, p.state, p.latitude, p.longitude
  from public.city_places p
 where p.settlement and p.latitude is not null and p.longitude is not null;

revoke all on private.city_middles, private.settlement_middles from public, anon, authenticated;

-- ------------------------------------------------------------------ events --
-- Where each event the caller may see is shown: null when not placed. With
-- p_past, also the past year's finished events, placed the same way. For the
-- definer functions below only.
create or replace function private.visible_event_places(p_past boolean)
returns table (id uuid, latitude double precision, longitude double precision, exact boolean, state text)
language sql
stable
set search_path = ''
as $$
  with placed as (
    select e.id, e.state,
      e.location_precision = 'exact' and e.state is not null
        and e.latitude is not null and e.longitude is not null
        and e.geocoded_location = public.geocode_key(e.location, e.city, e.state) as exact,
      e.latitude, e.longitude,
      case when nullif(btrim(e.city), '') is not null then point(c.longitude, c.latitude)
           else point(s.longitude, s.latitude) end as middle
    from public.events e
    left join private.city_middles c
      on c.city_key = lower(btrim(e.city)) and c.state = e.state
    -- Its organization's main place, confirmed from its site; never the
    -- directory's free-text city.
    left join public.organization_places eo
      on eo.organization_id = e.organization_id and eo.position = 0
    left join private.city_middles s
      on s.city_key = lower(btrim(eo.city)) and s.state = eo.state
     and (e.state is null or e.state = eo.state)
    where (select public.is_member())
      and (e.audience in ('public', 'club') or public.can_see_event(e.id))
      and e.event_format is distinct from 'online'
      and case when p_past then e.start_time >= now() - interval '1 year'
               else coalesce(e.end_time, e.start_time + case when e.all_day then interval '1 day' else interval '0' end)
                    >= now() - interval '1 hour' end
  )
  select p.id,
    round((case when p.exact then p.latitude else p.middle[1] end)::numeric, 5)::double precision,
    round((case when p.exact then p.longitude else p.middle[0] end)::numeric, 5)::double precision,
    coalesce(p.exact, false),
    p.state
  from placed p;
$$;

revoke all on function private.visible_event_places(boolean) from public, anon, authenticated;

create or replace function public.map_events()
returns table (id uuid, latitude double precision, longitude double precision, exact boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select v.id, v.latitude, v.longitude, v.exact
    from private.visible_event_places(false) v
   where v.latitude is not null and v.longitude is not null;
$$;

revoke all on function public.map_events() from public, anon, authenticated;
grant execute on function public.map_events() to authenticated;

-- As 20261023020000, but only events the caller may see, measured from where
-- the map shows them, so a distance says no more than the map does; finished
-- ones from the past year too, for Past. Online events are any distance on
-- the list, so not asked about here.
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
  )
  select case when exists (select 1 from home) then coalesce((
    select array_agg(e.id)
    from home h
    cross join private.visible_event_places(true) e
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

-- ------------------------------------------------------------------- peers --
create or replace function public.map_peer_cities()
returns table (city text, state text, latitude double precision, longitude double precision, member_ids uuid[])
language sql
security definer
stable
set search_path = ''
as $$
  -- The spelling most members use; a tie goes to the capitalized one.
  select mode() within group (order by btrim(m.city) collate "C"),
    p.state,
    round(p.latitude::numeric, 5)::double precision,
    round(p.longitude::numeric, 5)::double precision,
    array_agg(m.id order by m.id)
  from public.members m
  join private.settlement_middles p
    on p.city_key = lower(btrim(m.city)) and p.state = m.state
  where m.show_on_map
    and (
      m.id in (select b.id from public.browse_members b)
      or (m.id = (select auth.uid()) and m.status = 'active')
    )
  group by p.city_key, p.state, p.latitude, p.longitude;
$$;

revoke all on function public.map_peer_cities() from public, anon, authenticated;
grant execute on function public.map_peer_cities() to authenticated;

-- ----------------------------------------------------------- organizations --
create or replace function public.map_organizations()
returns table (place_id uuid, id uuid, label text, city text, state text,
               latitude double precision, longitude double precision, exact boolean)
language sql
security definer
stable
set search_path = ''
as $$
  select op.id, o.id, op.label, op.city, op.state,
    round((case when x.exact then op.latitude else c.latitude end)::numeric, 5)::double precision,
    round((case when x.exact then op.longitude else c.longitude end)::numeric, 5)::double precision,
    x.exact
  from public.organization_places op
  join public.organizations o on o.id = op.organization_id and o.removed_at is null
  left join private.city_middles c
    on c.city_key = lower(btrim(op.city)) and c.state = op.state
  cross join lateral (
    select op.address is not null and op.location_precision = 'exact'
       and op.latitude is not null and op.longitude is not null
       and op.geocoded_location is not distinct from public.geocode_key(op.address, op.city, op.state) as exact
  ) x
  where (select public.is_member())
    and (x.exact or c.latitude is not null)
  order by o.id, op.position;
$$;

revoke all on function public.map_organizations() from public, anon, authenticated;
grant execute on function public.map_organizations() to authenticated;

-- -------------------------------------------------------------------- home --
create or replace function public.map_home()
returns table (latitude double precision, longitude double precision)
language sql
security definer
stable
set search_path = ''
as $$
  select round(p.latitude::numeric, 5)::double precision,
    round(p.longitude::numeric, 5)::double precision
  from public.members m
  join private.city_middles p
    on p.city_key = lower(btrim(m.city)) and p.state = m.state
  where m.id = (select auth.uid())
    and (select public.is_member());
$$;

revoke all on function public.map_home() from public, anon, authenticated;
grant execute on function public.map_home() to authenticated;

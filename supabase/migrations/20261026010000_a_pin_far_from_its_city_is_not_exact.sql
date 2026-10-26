-- ============================================================================
-- A pin far from its own city is not exact
-- ============================================================================
-- 2026-10-26: some "exact" pins were somewhere else entirely (The Perfect
-- Step's Pomona address pinned in Chico, 450 miles off): the lookup's
-- rewrites matched another building. Now an exact pin more than 25 miles,
-- straight line, from its own city's known middle, measured from the
-- coordinates the map shows, is not exact; with no known middle the stored
-- pin is trusted (rewrite hits are no longer stored exact). The map and the
-- distance filter apply it on reading, so pins stored wrong stop being exact
-- at once; geocode_done stores such a hit as approximate.
-- ============================================================================

-- Straight-line miles from the rounded point to the middle of its city;
-- null when the middle is not known.
create or replace function private.miles_from_middle(
  p_latitude double precision, p_longitude double precision, p_city text, p_state text
)
returns double precision
language sql
stable
set search_path = ''
as $$
  select 3958.8 * acos(greatest(-1, least(1,
           cos(radians(m.latitude)) * cos(radians(round(p_latitude::numeric, 5)::double precision))
             * cos(radians(round(p_longitude::numeric, 5)::double precision) - radians(m.longitude))
           + sin(radians(m.latitude)) * sin(radians(round(p_latitude::numeric, 5)::double precision))
         )))
    from private.city_middles m
   where m.city_key = lower(btrim(p_city)) and m.state = p_state
     and p_latitude is not null and p_longitude is not null;
$$;

revoke all on function private.miles_from_middle(double precision, double precision, text, text)
  from public, anon, authenticated;

-- An exact hit more than 25 miles from a known city middle is approximate.
create or replace function private.checked_precision(
  p_precision text, p_latitude double precision, p_longitude double precision, p_city text, p_state text
)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_precision = 'exact'
               and private.miles_from_middle(p_latitude, p_longitude, p_city, p_state) > 25
              then 'approximate' else p_precision end;
$$;

revoke all on function private.checked_precision(text, double precision, double precision, text, text)
  from public, anon, authenticated;

-- ------------------------------------------- as 20261025020000, guarded --
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
        and e.geocoded_location = public.geocode_key(e.location, e.city, e.state)
        and coalesce(private.miles_from_middle(e.latitude, e.longitude, e.city, e.state) <= 25, true) as exact,
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
       and op.geocoded_location is not distinct from public.geocode_key(op.address, op.city, op.state)
       and coalesce(private.miles_from_middle(op.latitude, op.longitude, op.city, op.state) <= 25, true) as exact
  ) x
  where (select public.is_member())
    and (x.exact or c.latitude is not null)
  order by o.id, op.position;
$$;

revoke all on function public.map_organizations() from public, anon, authenticated;
grant execute on function public.map_organizations() to authenticated;

-- ------------------------------------------- as 20261025030000, guarded --
create or replace function public.geocode_done(
  p_kind text,
  p_target uuid,
  p_query text,
  p_latitude double precision,
  p_longitude double precision,
  p_precision text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  placed boolean := false;
  owner uuid;
  stale boolean;
begin
  if p_kind is null or p_kind not in ('event', 'place') then
    raise exception 'An event or a place.' using errcode = '22023';
  end if;
  select g.owner_id, g.geocoded_location is distinct from p_query into owner, stale
    from private.geocode_targets() g
   where g.kind = p_kind and g.target_id = p_target;
  if coalesce(stale, true) then
    insert into private.geocode_lookups (kind, target_id, query, owner_id)
    values (p_kind, p_target, p_query, owner);
  end if;
  if p_error is null then
    if (p_latitude is null) <> (p_longitude is null)
       or (p_latitude is null) <> (p_precision is null)
       or p_precision not in ('exact', 'approximate') then
      raise exception 'A place is two coordinates and a precision, or none.' using errcode = '22023';
    end if;
    if p_kind = 'event' then
      update public.events e
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = private.checked_precision(p_precision, p_latitude, p_longitude, e.city, e.state),
             geocoded_location = p_query
       where e.id = p_target and e.state is not null
         and public.geocode_key(e.location, e.city, e.state) = p_query;
    else
      update public.organization_places op
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = private.checked_precision(p_precision, p_latitude, p_longitude, op.city, op.state),
             geocoded_location = p_query
       where op.id = p_target
         and public.geocode_key(op.address, op.city, op.state) = p_query;
    end if;
    placed := found;
    if placed then
      update public.events e
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = private.checked_precision(p_precision, p_latitude, p_longitude, e.city, e.state),
             geocoded_location = p_query
       where e.state is not null and e.event_format is distinct from 'online'
         and public.geocode_key(e.location, e.city, e.state) = p_query
         and e.geocoded_location is distinct from p_query;
      update public.organization_places op
         set latitude = p_latitude, longitude = p_longitude,
             location_precision = private.checked_precision(p_precision, p_latitude, p_longitude, op.city, op.state),
             geocoded_location = p_query
       where op.address is not null
         and public.geocode_key(op.address, op.city, op.state) = p_query
         and op.geocoded_location is distinct from p_query;
    end if;
  end if;
  if placed then
    delete from private.geocode_queue q
     using private.geocode_targets() g
     where g.kind = q.kind and g.target_id = q.target_id
       and g.query = p_query and g.geocoded_location = p_query;
  else
    update private.geocode_queue q
       set claimed_until = null, claimed_query = null, claimed_owner = null,
           last_error = left(p_error, 500)
     where q.kind = p_kind and q.target_id = p_target;
  end if;
  return placed;
end;
$$;

revoke all on function public.geocode_done(text, uuid, text, double precision, double precision, text, text)
  from public, anon, authenticated;
grant execute on function public.geocode_done(text, uuid, text, double precision, double precision, text, text)
  to service_role;

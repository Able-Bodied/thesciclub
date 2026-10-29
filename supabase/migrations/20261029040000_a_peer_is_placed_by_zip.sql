-- ============================================================================
-- A peer is placed at the middle of their zip code
-- ============================================================================
-- The owner, 2026-10-28: "if a peer has a zip code we should use that". Until
-- now the zip typed while joining filled in the city and state and was
-- thrown away, and the map counted everybody at their city's middle.
--
-- Now the zip is kept on the member's own row (members can read only their
-- own, so nobody else ever sees it), and the nightly import places the middle
-- of each zip code in zip_places, as it does cities in city_places. The map
-- counts a member at their zip's middle when it is placed and in their own
-- state, otherwise at their city's middle as before. Only the middle of the
-- zip area is ever sent, never the zip, and only with a city, so declining
-- the city still keeps somebody off the map.
--
-- map_peer_cities and map_home are as 20261025020000 otherwise.
-- ============================================================================

alter table public.members
  add column if not exists zip text check (zip is null or zip ~ '^[0-9]{5}$');

comment on column public.members.zip is
  'Five digits, from joining or Your details. Only its middle is shown, on the map. See 20261029040000.';

create table if not exists public.zip_places (
  zip text primary key check (zip ~ '^[0-9]{5}$'),
  state text check (state is null or state ~ '^[A-Z]{2}$'),
  latitude double precision,
  longitude double precision,
  placed_at timestamptz not null default now()
);

comment on table public.zip_places is
  'The middle of each zip code members live in, placed by the nightly import; null when not found. See 20261029040000.';

alter table public.zip_places enable row level security;
revoke all on public.zip_places from public, anon, authenticated;
grant select, insert, update, delete on public.zip_places to service_role;

create or replace view private.zip_middles as
select z.zip, z.state, z.latitude, z.longitude
  from public.zip_places z
 where z.latitude is not null and z.longitude is not null and z.state is not null;

revoke all on private.zip_middles from public, anon, authenticated;

-- Where each member is counted: the zip's middle in their state, or their
-- city's. For the definer functions below only.
create or replace function private.member_middle(p_member uuid)
returns table (latitude double precision, longitude double precision)
language sql
stable
set search_path = ''
as $$
  select coalesce(z.latitude, p.latitude), coalesce(z.longitude, p.longitude)
    from public.members m
    left join private.zip_middles z on z.zip = m.zip and z.state = m.state
    left join private.settlement_middles p
      on p.city_key = lower(btrim(m.city)) and p.state = m.state
   where m.id = p_member
     and nullif(btrim(m.city), '') is not null
     and (z.zip is not null or p.city_key is not null);
$$;

revoke all on function private.member_middle(uuid) from public, anon, authenticated;

create or replace function public.map_peer_cities()
returns table (city text, state text, latitude double precision, longitude double precision, member_ids uuid[])
language sql
security definer
stable
set search_path = ''
as $$
  with placed as (
    select m.id, btrim(m.city) as city, m.state,
      round(at.latitude::numeric, 5)::double precision as latitude,
      round(at.longitude::numeric, 5)::double precision as longitude
    from public.members m
    cross join lateral private.member_middle(m.id) at
    where m.show_on_map
      and (
        m.id in (select b.id from public.browse_members b)
        or (m.id = (select auth.uid()) and m.status = 'active')
      )
  )
  -- The spelling most members there use; a tie goes to the capitalized one.
  select mode() within group (order by p.city collate "C"),
    p.state, p.latitude, p.longitude,
    array_agg(p.id order by p.id)
  from placed p
  group by p.state, p.latitude, p.longitude;
$$;
revoke all on function public.map_peer_cities() from public, anon, authenticated;
grant execute on function public.map_peer_cities() to authenticated;

create or replace function public.map_home()
returns table (latitude double precision, longitude double precision)
language sql
security definer
stable
set search_path = ''
as $$
  select round(coalesce(z.latitude, p.latitude)::numeric, 5)::double precision,
    round(coalesce(z.longitude, p.longitude)::numeric, 5)::double precision
  from public.members m
  left join private.zip_middles z on z.zip = m.zip and z.state = m.state
  left join private.city_middles p
    on p.city_key = lower(btrim(m.city)) and p.state = m.state
  where m.id = (select auth.uid())
    and (select public.is_member())
    and (z.zip is not null or p.city_key is not null);
$$;
revoke all on function public.map_home() from public, anon, authenticated;
grant execute on function public.map_home() to authenticated;

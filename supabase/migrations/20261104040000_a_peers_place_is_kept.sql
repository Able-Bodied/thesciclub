-- ============================================================================
-- A peer's place on the map is kept, not worked out on every read
-- ============================================================================
-- The owner's speed report, 2026-11-03: map_peer_cities placed every member
-- one at a time on every read (private.member_middle, which cannot be
-- inlined). Each member's place is now kept in private.member_places, worked
-- out the same way whenever anything it depends on changes:
--   - the member's city, state or zip;
--   - a zip_places row (the zip's middle);
--   - a city_places row (the city's middle, or whether it is a settlement).
-- map_peer_cities reads the kept place; who it shows, and to whom, is as
-- 20261029040000. If member_middle or its views change, backfill again.
-- ============================================================================

create table if not exists private.member_places (
  member_id uuid primary key references public.members(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null
);

comment on table private.member_places is
  'Where the map counts each member, rounded as map_peer_cities sends it. Kept by triggers. See 20261104040000.';

revoke all on private.member_places from public, anon, authenticated;

-- Works the given members' places out again.
create or replace function private.place_members(p_members uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.member_places where member_id = any(p_members);
  insert into private.member_places (member_id, latitude, longitude)
  select m.id,
         round(at.latitude::numeric, 5)::double precision,
         round(at.longitude::numeric, 5)::double precision
    from public.members m
    cross join lateral private.member_middle(m.id) at
   where m.id = any(p_members);
end;
$$;

revoke all on function private.place_members(uuid[]) from public, anon, authenticated;

create or replace function private.place_member_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.place_members(array[new.id]);
  return null;
end;
$$;

-- The members living in a city or zip that changed.
create or replace function private.place_members_at_city()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.place_members(array(
    select m.id from public.members m
     where (tg_op <> 'INSERT' and lower(btrim(m.city)) = old.city_key and m.state = old.state)
        or (tg_op <> 'DELETE' and lower(btrim(m.city)) = new.city_key and m.state = new.state)));
  return null;
end;
$$;

create or replace function private.place_members_at_zip()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.place_members(array(
    select m.id from public.members m
     where (tg_op <> 'INSERT' and m.zip = old.zip)
        or (tg_op <> 'DELETE' and m.zip = new.zip)));
  return null;
end;
$$;

-- Emptied all at once: everybody again.
create or replace function private.place_everybody()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.place_members(array(select m.id from public.members m));
  return null;
end;
$$;

revoke all on function private.place_member_on_change(), private.place_members_at_city(),
  private.place_members_at_zip(), private.place_everybody() from public, anon, authenticated;

drop trigger if exists member_placed on public.members;
create trigger member_placed
  after insert on public.members
  for each row execute function private.place_member_on_change();

drop trigger if exists member_moved on public.members;
create trigger member_moved
  after update of city, state, zip on public.members
  for each row
  when (old.city is distinct from new.city
     or old.state is distinct from new.state
     or old.zip is distinct from new.zip)
  execute function private.place_member_on_change();

drop trigger if exists city_placed on public.city_places;
create trigger city_placed
  after insert or delete on public.city_places
  for each row execute function private.place_members_at_city();

drop trigger if exists city_moved on public.city_places;
create trigger city_moved
  after update on public.city_places
  for each row
  when (old.city_key is distinct from new.city_key
     or old.state is distinct from new.state
     or old.latitude is distinct from new.latitude
     or old.longitude is distinct from new.longitude
     or old.settlement is distinct from new.settlement)
  execute function private.place_members_at_city();

drop trigger if exists cities_emptied on public.city_places;
create trigger cities_emptied
  after truncate on public.city_places
  for each statement execute function private.place_everybody();

drop trigger if exists zip_placed on public.zip_places;
create trigger zip_placed
  after insert or delete on public.zip_places
  for each row execute function private.place_members_at_zip();

drop trigger if exists zip_moved on public.zip_places;
create trigger zip_moved
  after update on public.zip_places
  for each row
  when (old.zip is distinct from new.zip
     or old.state is distinct from new.state
     or old.latitude is distinct from new.latitude
     or old.longitude is distinct from new.longitude)
  execute function private.place_members_at_zip();

drop trigger if exists zips_emptied on public.zip_places;
create trigger zips_emptied
  after truncate on public.zip_places
  for each statement execute function private.place_everybody();

-- Everybody there today.
select private.place_members(array(select m.id from public.members m));

-- As 20261029040000, reading the kept place.
create or replace function public.map_peer_cities()
returns table (city text, state text, latitude double precision, longitude double precision, member_ids uuid[])
language sql
security definer
stable
set search_path = ''
as $$
  with placed as (
    select m.id, btrim(m.city) as city, m.state, at.latitude, at.longitude
    from public.members m
    join private.member_places at on at.member_id = m.id
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

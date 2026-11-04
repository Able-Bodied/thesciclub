-- Undo for 20261104040000_a_peers_place_is_kept.sql: map_peer_cities works
-- each member's place out on every read again, as 20261029040000.

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

drop trigger if exists member_placed on public.members;
drop trigger if exists member_moved on public.members;
drop trigger if exists city_placed on public.city_places;
drop trigger if exists city_moved on public.city_places;
drop trigger if exists cities_emptied on public.city_places;
drop trigger if exists zip_placed on public.zip_places;
drop trigger if exists zip_moved on public.zip_places;
drop trigger if exists zips_emptied on public.zip_places;

drop function if exists private.place_member_on_change();
drop function if exists private.place_members_at_city();
drop function if exists private.place_members_at_zip();
drop function if exists private.place_everybody();
drop function if exists private.place_members(uuid[]);
drop table if exists private.member_places;

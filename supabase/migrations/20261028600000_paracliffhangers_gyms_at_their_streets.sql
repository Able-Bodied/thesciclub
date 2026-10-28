-- ============================================================================
-- ParaCliffHangers' gyms, at their streets
-- ============================================================================
-- 2026-10-28, the owner: each gym's street from ParaCliffHangers' own map
-- links or the gym's own site, checked in the owner's browser, so every pin
-- is on its building. The label becomes the gym's own name ("Dyno Gym" is
-- Dyno-Rock, "Ascend" is ASCEND Point Breeze); NJ Rock Gym's road is
-- spelled as OpenStreetMap finds it ("373 US 46" for 373D Route 46W).
-- Each street was looked up as the map will ask, and each found its building.
--
-- A place is its position. A row missing, or not holding the name expected,
-- stops the migration and changes nothing. The new addresses no longer match
-- geocoded_location, so the trigger queues each (20261026000000).
-- ============================================================================

do $$
declare
  fix record;
  target uuid;
begin
  for fix in
    select * from (values
    (0, 'Berkeley Ironworks', 'Berkeley Ironworks', '800 Potter St'),
    (1, 'Diablo Rock Gym', 'Diablo Rock Gym', '1220 Diamond Way'),
    (2, 'Pacific Pipe', 'Pacific Pipe', '2140 Mandela Pkwy'),
    (3, 'Movement San Francisco', 'Movement San Francisco', '924 Mason St'),
    (4, 'Movement Sunnyvale', 'Movement Sunnyvale', '815 Stewart Dr'),
    (5, 'The Post', 'The Post', '1100 N Fair Oaks Ave'),
    (6, 'Mesa Rim Mission Valley', 'Mesa Rim Mission Valley', '405 Camino del Rio S'),
    (7, 'Mesa Rim North City', 'Mesa Rim North City', '285 Industrial St'),
    (8, 'Central Rock Gym Tampa', 'Central Rock Gym Tampa', '4479 W Gandy Blvd'),
    (9, 'Vertical Ventures', 'Vertical Ventures', '116 18th St S'),
    (10, 'DynoClimb', 'DynoClimb', '528 S Woodland Blvd'),
    (11, 'NJ Rock Gym', 'NJ Rock Gym', '373 US 46'),
    (12, 'Movement Gowanus', 'Movement Gowanus', '242 Butler St'),
    (13, 'Movement LIC', 'Movement LIC', '11-11 44th Dr'),
    (14, 'Central Rock Gym Manhattan', 'Central Rock Gym Manhattan', '21 West End Ave'),
    (15, 'Central Rock Gym - Buffalo', 'Central Rock Gym Buffalo', '55 Chicago St'),
    (16, 'Triangle Rock Club Durham', 'Triangle Rock Club Durham', '1010 Martin Luther King Jr Pkwy'),
    (17, 'Ascend', 'ASCEND Point Breeze', '7443 Thomas Blvd'),
    (18, 'Dyno Gym', 'Dyno-Rock', '608 E Front St')
    ) as v(position, was, name, street)
  loop
    update public.organization_places op
       set label = fix.name, address = fix.street
      from public.organizations o
     where o.id = op.organization_id
       and o.short_code = 'PCH'
       and op.position = fix.position
       and op.address = fix.was
    returning op.id into target;
    if target is null then
      raise exception 'ParaCliffHangers place % is not "%" as expected', fix.position, fix.was;
    end if;
    target := null;
  end loop;
end $$;

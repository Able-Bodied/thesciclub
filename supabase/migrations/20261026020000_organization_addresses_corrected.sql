-- ============================================================================
-- Organization addresses, corrected
-- ============================================================================
-- 2026-10-26, the owner: an address as each organization's own site shows
-- it, in the form the map lookup finds. Thirteen lose a suite, unit, building
-- or room the lookup cannot use; five become the place's name the site
-- shows (a hospital, a campus, a resort, 11 Times Square), as Nominatim
-- knows it by that name: the owner saw each name on the page, in a browser,
-- and that OpenStreetMap knows it; one takes OpenStreetMap's name for the
-- same road. Cities and states stay. Each row names the page.
--
-- A place is its organization's short code and position. A row missing, or
-- not holding the address expected, stops the migration and changes nothing.
-- The new addresses no longer match geocoded_location, so the trigger
-- queues each and asks for a Geocode run (20261026000000).
-- ============================================================================

do $$
declare
  fix record;
  target uuid;
begin
  for fix in
    select * from (values
    -- https://www.borp.org/about/contact-us/
    ('BORP', 0, '3075 Adeline Street, Suite 200', '3075 Adeline Street'),
    -- https://thecil.org/
    ('CIL', 0, '3075 Adeline Street, Suite 100', '3075 Adeline Street'),
    -- https://triumph-foundation.org/contact-us/
    ('TF', 0, '27811 Avenue Hopkins Unit 5', '27811 Avenue Hopkins'),
    -- https://www.nextstepfitness.org/contact
    ('NXS', 1, '6600 College Blvd. STE 315', '6600 College Blvd.'),
    -- https://www.nextstepfitness.org/contact
    ('NXS', 4, '6601 Hillsborough Street, Suite 113', '6601 Hillsborough Street'),
    -- https://bawpva.org/contact/
    ('BWPV', 0, '3801 Miranda Ave. Bldg. 7 Rm. E-118', '3801 Miranda Ave.'),
    -- https://challengecenter.org/new-kearny-mesa-location-opening/
    ('CHC', 0, '9596 Chesapeake Dr. Unit A', '9596 Chesapeake Dr.'),
    -- https://etctrips.org/
    ('ETC', 0, '2 Marina Boulevard, Fort Mason Center, Suite C385', '2 Marina Boulevard'),
    -- https://teampossabilities.org/contact-us/
    ('POSS', 0, '25455 Barton Rd., Suite 109A', '25455 Barton Rd.'),
    -- https://pvacc.org/contact-us/
    ('PVAC', 0, '5901 E. 7th Street Bldg. 150 Rm. R-204', '5901 E. 7th Street'),
    -- https://svilc.org/contact-us/
    ('SVIL', 1, '7881 Church St., Ste.C', '7881 Church St.'),
    -- https://theperfectstep.com/contact-us
    ('TPS', 0, '764 Indigo Court, Unit A', '764 Indigo Court'),
    -- https://www.wheelchairlacrosse.com/
    ('WLAX', 0, '3333 Camino Del Rio South, Suite 330', '3333 Camino Del Rio South'),
    -- https://dhs.lacounty.gov/rancho/our-services/specialty-care/specialty-care-locations/
    -- "Rancho Los Amigos National Rehabilitation Center", seen by the owner 2026-10-26
    ('RLA', 0, '7601 E. Imperial Hwy', 'Rancho Los Amigos National Rehabilitation Center'),
    -- https://shepherd.org/about/locations/
    -- "Shepherd Center" (its footer), seen by the owner 2026-10-26
    ('SHC', 0, '2020 Peachtree Road NW', 'Shepherd Center'),
    -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
    -- "USTA NATIONAL CAMPUS", seen by the owner 2026-10-26
    ('USTA', 1, '10000 USTA Boulevard', 'USTA National Campus'),
    -- https://www.centralcaladaptive.org/contact
    -- "Adaptive Sports Center at China Peak Mountain Resort", seen by the owner 2026-10-26
    ('CCAS', 1, '59265 CA-168', 'China Peak Mountain Resort'),
    -- https://www.usta.com/en/home/about-usta/who-we-are/national/usta-contact-us.html
    -- "11 Times Square", seen by the owner 2026-10-26
    ('USTA', 4, '640 8th Avenue', '11 Times Square'),
    -- https://www.sralab.org/locations
    -- site: sralab.org/locations shows '7600 County Line Road'; 'South' is
    -- OpenStreetMap's name for the same road (owner, 2026-10-26)
    ('SRA', 3, '7600 County Line Road', '7600 South County Line Road')
    ) as v(short_code, position, was, address)
  loop
    select op.id into target
      from public.organization_places op
      join public.organizations o on o.id = op.organization_id
     where o.short_code = fix.short_code and op.position = fix.position and op.address = fix.was;
    if target is null then
      raise exception 'No % place % with the address "%"; nothing changed.', fix.short_code, fix.position, fix.was;
    end if;
    update public.organization_places set address = fix.address where id = target;
  end loop;
end;
$$;

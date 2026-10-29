-- ============================================================================
-- SCI-FIT and its six centers
-- ============================================================================
-- The owner, 2026-10-28: add SCI-FIT (https://www.sci-fit.org/) with all its
-- locations. The description is from its own pages' visible text (home,
-- who-we-help); the six centers and their addresses are as the owner gave
-- them and as https://www.sci-fit.org/locations/ lists them, Dublin first.
-- "Modesto" is the site's name for the Salida center. The site names no
-- headquarters, so the directory's city is Dublin, the first listed.
--
-- Each street is spelled as OpenStreetMap finds it, so a suite rides in the
-- center's name instead ("6735 Sierra Ct, Suite E" is not found; "6735 Sierra
-- Ct" is, exactly). Looked up 2026-10-28 as the map will ask: Dublin,
-- Sacramento, Petaluma and Chandler exact; OpenStreetMap has no house number
-- on Salida's street, so its pin is approximate.
--
-- Nor on Fresno's, so its pin is placed here instead: the owner's map of the
-- address puts it on E Shields Ave a little past halfway from Clovis to
-- Fowler, at the business park's drive, which is where OpenStreetMap's own
-- roads put this point. With geocoded_location already its key, it is never
-- queued, so no lookup moves it back to the street's middle.
--
-- No logo yet: an administrator adds its round site icon from Admin. Phones
-- and emails have nowhere to go. Each street is queued for its pin by the
-- trigger of 20261025030000.
-- ============================================================================

insert into public.organizations
  (short_code, name, city, state, description, tags, can_invite, logo_path, aliases)
values
  ('SCIF', 'SCI-FIT', 'Dublin', 'CA',
   'Activity-based therapy for spinal cord injury, stroke and other neurological conditions: exercise, load bearing, gait training and functional electrical stimulation, with training for family and caregivers to keep it up at home. Five centers in California and one in Arizona.',
   array['Recovery']::text[], false, null, '{}'::text[])
on conflict (short_code) do nothing;

insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code,
   latitude, longitude, location_precision, geocoded_location)
select o.id, v.position, v.label, v.address, v.city, v.state, v.postal_code,
       v.latitude, v.longitude, v.precision,
       case when v.latitude is not null
            then public.geocode_key(v.address, v.city, v.state) end
  from (values
  (0, 'Dublin, Suite E', '6735 Sierra Ct', 'Dublin', 'CA', '94568', null::float8, null::float8, null),
  (1, 'Sacramento', '2404 Del Paso Road', 'Sacramento', 'CA', '95835', null, null, null),
  (2, 'Fresno, Suite 115', '5816 E Shields Ave', 'Fresno', 'CA', '93727', 36.77900, -119.69030, 'exact'),
  (3, 'Petaluma', '5330 Old Redwood Hwy', 'Petaluma', 'CA', '94954', null, null, null),
  (4, 'Modesto', '5666 Pirrone Rd', 'Salida', 'CA', '95368', null, null, null),
  (5, 'Arizona, Suite 124', '2160 N Alma School Rd', 'Chandler', 'AZ', '85224', null, null, null)
  ) as v(position, label, address, city, state, postal_code, latitude, longitude, precision)
  join public.organizations o on o.short_code = 'SCIF'
 where not exists (
   select 1 from public.organization_places op where op.organization_id = o.id
 );

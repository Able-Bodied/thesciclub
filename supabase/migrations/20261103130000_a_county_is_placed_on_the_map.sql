-- ============================================================================
-- A member whose "city" is a county is placed at the county's middle
-- ============================================================================
-- The owner, 2026-11-03: a member in Douglas County, CO, with no zip, was not
-- on the map. Use my location gives the county outside a town, and the map
-- took only towns. The nightly lookup now keeps a county named as one
-- (jobs/event-ingest/scrapers/geocode.js); these are asked again tonight.
-- ============================================================================

-- Found but not taken as a town: checked again.
update public.city_places
   set settlement_checked_at = null
 where settlement is not true
   and latitude is not null
   and city_key ~ '\m(county|parish)$';

-- Never found: forgotten, so looked up as new.
delete from public.city_places
 where latitude is null
   and city_key ~ '\m(county|parish)$';

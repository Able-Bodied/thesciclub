-- ============================================================================
-- Team River Runner's American River and Southeast PA chapters
-- ============================================================================
-- The owner, 2026-11-03: their pages name no city, so American River's pin is
-- on the American River in Sacramento, at the Guy West Bridge (38.5622,
-- -121.4205), and Southeast PA's at the middle of Norristown, a town in
-- Southeast Pennsylvania. Each note opens by saying to contact the chapter
-- coordinator for the exact location (the owner's words), then the page's own.
-- ============================================================================

insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url,
   latitude, longitude, location_precision, geocoded_location)
select o.id, 22, 'American River chapter', 'American River at the Guy West Bridge', 'Sacramento', 'CA', null,
       'To get the exact location and to attend, contact Connie Farris, connie.farris@teamriverrunner.org.
Looking for participant veteran paddlers, and volunteers too!
Take the plunge and join a group of veterans who are wanting to experience flat and moving waters from the perspective of a kayak. It’s exciting, unending fun, builds many skill sets, and is very social.
Our initial work will be simply learning to get into kayaks in a swimming pool environment with trained volunteers. After a period of progression in the controlled and supported pool environment, we expect to be venturing out onto the waters of the American River, Spring and Summer.
If you are interested to learn more, you may contact our Chapter Coordinator:
Connie Farris
connie.farris@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/california-american-river/',
       38.5622, -121.4205, 'exact',
       public.geocode_key('American River at the Guy West Bridge', 'Sacramento', 'CA')
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/california-american-river/');

insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code, note, url)
select o.id, 23, 'Southeast PA chapter', null, 'Norristown', 'PA', null,
       'To get the exact location and to attend, contact Jim Riley, jim.riley@teamriverrunner.org.
If you or you know of a veteran that might be interested in volunteering and/or participating with TRR Southeast, PA, please contact the chapter coordinator below and get involved!
Chapter Coordinator:
Jim Riley
jim.riley@teamriverrunner.org',
       'https://www.teamriverrunner.org/get-involved/chapters/pennsylvania-southeast-pa/'
  from public.organizations o
 where o.short_code = 'TRR'
   and not exists (select 1 from public.organization_places x where x.organization_id = o.id and x.url = 'https://www.teamriverrunner.org/get-involved/chapters/pennsylvania-southeast-pa/');

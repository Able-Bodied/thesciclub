-- ============================================================================
-- NeuAbility
-- ============================================================================
-- The owner, 2026-11-05: add NeuAbility (https://www.neuability.org/) with a
-- logo, a description like the others' and its exact place on the map.
--
-- Description and card line from its own pages' visible text, read
-- 2026-11-05 (home, /history, /services), summarized and never added to.
--
-- Place, from the home page's visible "Visit: 866 E 78th Ave. Denver, CO
-- 80229". Pinned here, on the house: OpenStreetMap's free-text lookup of
-- "866 E 78th Ave, Denver, CO" finds only the street out by the airport
-- (80019, ~15 miles east). Asked by street and ZIP it finds the house itself
-- ("866, East 78th Avenue, Western Hills, Adams County, Colorado, 80229",
-- 39.8380535, -104.9752680), and the US Census geocoder agrees to within a
-- few metres (39.838079, -104.975210). With geocoded_location already its
-- key, the lookup never moves it.
--
-- Logo: the square mark the site shares as its preview image, chosen over the
-- white header logo, which draws as an empty square on the badge. Put in the
-- bucket with `pnpm logos --upload NEU=neu.webp`; until then the badge shows
-- "NEU".
-- ============================================================================

insert into public.organizations
  (short_code, name, city, state, description, summary, tags, can_invite, logo_path, aliases, category)
select 'NEU', 'NeuAbility', 'Denver', 'CO',
  'NeuAbility is a Colorado nonprofit adaptive exercise and wellness center in Denver that has served the paralysis community since 2007. It supports people living with spinal cord injuries and other neurological conditions, bridging the gap between rehabilitation and lifelong wellness.

- One-on-one adaptive exercise sessions, Rise & Walk supported standing and stepping, and stretch sessions
- An adaptive open gym, FES bikes and trainer-led adaptive circuit classes
- **Integrative health:** massage, acupuncture and chiropractic
- Community events and monthly programs

[neuability.org](https://www.neuability.org/)',
  'Adaptive exercise, FES bikes and integrative health in Denver',
  array['Recovery']::text[], false, 'organizations/neu.webp', '{}'::text[], 'gym'
 where not exists (select 1 from public.organizations o where lower(o.name) = 'neuability')
on conflict (short_code) do nothing;

insert into public.organization_places
  (organization_id, position, label, address, city, state, postal_code,
   latitude, longitude, location_precision, geocoded_location)
select o.id, 0, null, '866 E 78th Ave', 'Denver', 'CO', '80229',
       39.8380535, -104.9752680, 'exact',
       public.geocode_key('866 E 78th Ave', 'Denver', 'CO')
  from public.organizations o
 where o.short_code = 'NEU'
   and not exists (
     select 1 from public.organization_places op where op.organization_id = o.id
   );

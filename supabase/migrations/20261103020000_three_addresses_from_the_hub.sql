-- ============================================================================
-- Three addresses from Adaptive Rec Hub
-- ============================================================================
-- The owner, 2026-11-03, from the hub review: use the hub's address for these.
-- Their websites stay as they are. The Geocode workflow looks the streets up.
-- ============================================================================

update public.organization_places p
   set address = '6060 Center Drive'
  from public.organizations o
 where p.organization_id = o.id and o.name = 'Angel City Sports'
   and p.position = 0 and p.address is null and p.city = 'Los Angeles';

update public.organization_places p
   set address = '7601 Imperial Hwy', postal_code = '90242'
  from public.organizations o
 where p.organization_id = o.id and o.name = 'Rancho Los Amigos Wheelchair Sports'
   and p.position = 0 and p.city = 'Downey';

update public.organization_places p
   set label = null, address = '3000 Business Park Drive, Suite A', city = 'Norcross',
       state = 'GA', postal_code = '30071'
  from public.organizations o
 where p.organization_id = o.id and o.name = 'BlazeSports America'
   and p.position = 0 and p.city = 'Atlanta';

update public.organizations
   set city = 'Norcross'
 where name = 'BlazeSports America' and city = 'Atlanta';

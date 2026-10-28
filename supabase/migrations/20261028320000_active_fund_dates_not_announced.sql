-- ============================================================================
-- Kelly Brush's Active Fund: the next dates are not announced
-- ============================================================================
-- The owner, 2026-10-27. https://kbf.org/theactivefund/ now says only "Dates
-- TBD" and "Sign up be notified when the next Active Fund cycle opens", so
-- the summary stops promising February and July. No window: none is
-- published.
-- ============================================================================

update public.organization_grants g
   set summary = 'For US residents paralyzed by a spinal cord injury: adaptive sports and recreation equipment such as handcycles, monoskis and sport chairs, about $3,500 on average. The next dates are not announced yet; their page lets you sign up to be told when the next round opens.',
       updated_at = now()
  from public.organizations o
 where o.id = g.organization_id
   and o.short_code = 'KBF'
   and g.name = 'Active Fund';

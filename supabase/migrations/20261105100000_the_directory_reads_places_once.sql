-- ============================================================================
-- The organization directory reads its places once, not once per organization
-- ============================================================================
-- The nightly test, 2026-11-04: the directory read went from 214 to 1,087
-- buffers a call once the Adaptive Rec Hub import (20261103010000) took it
-- from 86 to 288 organizations. Its embedded organization_places looked each
-- organization's places up one at a time. This view reads them in one pass.
-- Same rows and columns as the embedded read. security_invoker, so the
-- tables' policies and grants apply to whoever reads it, as before.
-- ============================================================================

create view public.organization_directory
with (security_invoker = true, security_barrier = true) as
select o.id, o.short_code, o.name, o.city, o.description, o.tags, o.can_invite,
       o.logo_path, o.state, o.category, o.summary, o.joins_need_approval,
       o.collects_rsvps, o.anonymous_reviews, o.removed_at,
       coalesce(p.places, '[]'::json) as organization_places
  from public.organizations o
  left join (
    select pl.organization_id,
           json_agg(
             (select x from (select pl.id, pl.position, pl.label, pl.address, pl.city,
                                    pl.state, pl.postal_code, pl.note, pl.url) x)
             order by pl.position
           ) as places
      from public.organization_places pl
     group by pl.organization_id
  ) p on p.organization_id = o.id;

comment on view public.organization_directory is
  'The directory with each organization''s places, read in one pass. See 20261105100000.';

revoke all on public.organization_directory from public, anon, authenticated;
grant select on public.organization_directory to anon, authenticated;

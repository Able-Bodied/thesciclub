-- ============================================================================
-- Team River Runner leaves the directory: it is for veterans only
-- ============================================================================
-- The owner, 2026-11-03, having read its pages. Removed as an administrator
-- removes one (admin_remove_organization): out of the directory and off the
-- map, with no org admins. Its rows stay, as a removed organization's do.
-- ============================================================================

update public.organizations
   set removed_at = clock_timestamp(), can_invite = false
 where short_code = 'TRR' and name = 'Team River Runner' and removed_at is null;

delete from public.organization_representatives r
 using public.organizations o
 where r.organization_id = o.id and o.short_code = 'TRR' and o.removed_at is not null;

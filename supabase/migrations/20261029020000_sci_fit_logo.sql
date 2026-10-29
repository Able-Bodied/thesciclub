-- ============================================================================
-- SCI-FIT's logo
-- ============================================================================
-- The owner, 2026-10-28: its round site icon
-- (https://www.sci-fit.org/app/uploads/2023/08/cropped-Favicon-192x192.png),
-- chosen over the wide header logo, which letterboxes in the badge. The file
-- is put in the bucket with `pnpm logos --upload SCIF=scif.png`; until it is
-- there the badge shows "SCIF", as for any logo that fails to load.
-- ============================================================================

update public.organizations
   set logo_path = 'organizations/scif.png'
 where short_code = 'SCIF' and logo_path is null;

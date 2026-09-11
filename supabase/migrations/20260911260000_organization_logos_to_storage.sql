-- ============================================================================
-- Organization logos: off the org's CDN, into our own bucket
-- ============================================================================
-- 20260911230000 added `logo_url` and hotlinked NorCal SCI's mark from
-- squarespace-cdn.com. The argument was that it is their asset and not ours to
-- mirror. That argument loses to the one 20260910140000 already made for member
-- photos, which came off the same CDN and were moved here for the same two
-- reasons: it serves our app from their bandwidth, and it breaks the day they
-- reorganize their media library.
--
-- A logo is worse than a photo on the second count, because a rebrand is
-- exactly the sort of thing that moves a file — and the badge it fills is how a
-- member recognises who is running an event.
--
-- ---------------------------------------------------------------------------
-- A path, not a URL — same as members.photo_path
-- ---------------------------------------------------------------------------
-- A full public URL embeds the project ref, so seeded data carrying one would
-- point a staging database at production's storage. The path is identical in
-- every project and the client composes the origin it is already configured
-- with. `photoUrlFor()` in src/lib/photos.ts does this for both columns.
--
-- Renaming rather than adding: `logo_url` has existed for one migration and
-- holds one row, so there is nothing to preserve, and a column called `_url`
-- holding a path is a name that lies.
--
-- ---------------------------------------------------------------------------
-- What is actually in the bucket
-- ---------------------------------------------------------------------------
-- One file: organizations/ncs.webp, fetched from NorCal SCI's own site at 300px
-- wide — the badge draws at 38px and 66px, so that covers a 4x display without
-- storing more than is useful. The other five organizations have no logo
-- anywhere we can reach, so they stay null and fall back to the short-code
-- tile, which is a deliberate design rather than a gap. See
-- src/routes/events/organization-badge.tsx.
--
-- The source URL is not kept in a column. It is recorded here, in the migration
-- that used it, which is where somebody refreshing the file will look:
-- https://images.squarespace-cdn.com/content/v1/639f51bcb6f2d126acbc35ab/7eb6efd8-35fc-4e3a-a1e4-d84ab6449079/Screen%2BShot%2B2017-04-19%2Bat%2B1.41.55%2BPM+-+Edited.png?format=300w
-- ============================================================================

alter table public.organizations rename column logo_url to logo_path;

comment on column public.organizations.logo_path is
  'Path within the public `photos` bucket, e.g. organizations/ncs.webp. Not a URL — the client composes one. Null means fall back to the short-code badge.';

update public.organizations
set logo_path = 'organizations/ncs.webp'
where short_code = 'NCS';

-- Any other organization that was hotlinking now has nothing to hotlink, and a
-- half-migrated URL would render as a broken image rather than as the tile.
update public.organizations
set logo_path = null
where logo_path is not null
  and logo_path like 'http%';

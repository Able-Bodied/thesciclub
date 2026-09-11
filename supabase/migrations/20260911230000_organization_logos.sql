-- ============================================================================
-- organizations.logo_url — the mark an organization is recognised by
-- ============================================================================
-- Event cards currently identify the host with a short code in a gold tile
-- (NCS, WWM). That works, but a member scanning thirty events recognises
-- NorCal SCI's logo faster than they read three letters, and the organizations
-- are the club's most trusted signal — they are who vouches for members.
--
-- ---------------------------------------------------------------------------
-- Hotlinked, not mirrored
-- ---------------------------------------------------------------------------
-- The URL points at the organization's own site. Same posture as
-- `registration_url` elsewhere in this schema: it is their asset, it is already
-- served publicly by them, and mirroring it into our storage bucket would mean
-- holding a stale copy of somebody else's brand and deciding when to refresh
-- it.
--
-- Two consequences are handled in the UI rather than here. A hotlink can break,
-- so every render falls back to the short-code tile rather than showing a
-- broken image — the badge must never be a gap. And the request tells the
-- organization's CDN that somebody is looking, so the img carries
-- `referrerpolicy="no-referrer"`: the page path is nobody else's business, even
-- on a public surface.
--
-- ---------------------------------------------------------------------------
-- Why only one is seeded
-- ---------------------------------------------------------------------------
-- NorCal SCI's is a real URL off norcalsci.org, verified to resolve, and it
-- covers most of what a member actually sees since the majority of ingested
-- events are theirs. The other five are left null deliberately: inventing a
-- plausible-looking CDN path for somebody else's logo produces a broken image
-- that looks like a bug in this app rather than a missing value, and a wrong
-- logo on an organization that can vouch for members is worse than no logo.
-- They fall back to the short code until somebody supplies a real URL.
-- ============================================================================

alter table public.organizations
  add column if not exists logo_url text;

comment on column public.organizations.logo_url is
  'Absolute URL to the organization''s own logo, hotlinked from their site. Null means fall back to the short-code badge. Never a path into our storage bucket — see the migration header.';

update public.organizations
set logo_url = 'https://images.squarespace-cdn.com/content/v1/639f51bcb6f2d126acbc35ab/7eb6efd8-35fc-4e3a-a1e4-d84ab6449079/Screen%2BShot%2B2017-04-19%2Bat%2B1.41.55%2BPM+-+Edited.png?format=300w'
where short_code = 'NCS'
  and logo_url is null;

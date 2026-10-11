-- ============================================================================
-- Anyone sees the organizations' logos, signed in or not
-- ============================================================================
-- 20261001000000 made the photos bucket private and let any *signed-in*
-- account read `organizations/…`, so the closed door could draw the logos of
-- the organizations that can invite. Since 20261012040000 the closed door
-- also opens for somebody who is not signed in at all: an uninvited email
-- sign-up is refused before any account exists. Signing a logo's URL as
-- `anon` reached no select policy, so the screen fell back to bare tiles
-- (the owner saw it on production, 2026-10-11).
--
-- A logo is already public on the organization's own site; 20261001000000
-- recorded that as the owner's reason for letting every account read them.
-- This adds the same, and only the same, for `anon`: the `organizations`
-- folder of the photos bucket. Members' photographs, chat files and event
-- pictures stay behind sign-in, and anon still writes nothing.
-- ============================================================================

drop policy if exists "anyone reads the organizations' logos" on storage.objects;
create policy "anyone reads the organizations' logos"
  on storage.objects for select
  to anon
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'organizations'
  );

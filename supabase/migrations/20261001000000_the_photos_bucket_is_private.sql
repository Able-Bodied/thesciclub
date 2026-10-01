-- The photos bucket is private: a photograph is read through a signed URL,
-- asked for by somebody signed in, and only what they may see is signed.
--
-- The owner, 2026-09-30, for HOME-PLAN.md step 6, part 2: "make it private".
-- The client that signs went out first (fd5d69e) and the owner saw every face
-- and logo drawing through it on production before this was written. That
-- order matters: a signed URL to a public file is still a URL, but the old
-- public-URL client against a private bucket would have been every
-- photograph broken at once.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 20260910120100 made `photos` public with a select policy of
-- `bucket_id = 'photos'` for every role. Anybody holding a photograph's URL
-- could open it without signing in, for ever. The paths are a member's id and
-- a file name, so nothing could be browsed, but a link copied out of the app
-- worked for anyone. CONTEXT.md's public/private table puts photos behind
-- sign-in; the bucket now agrees with it.
--
-- ---------------------------------------------------------------------------
-- Who reads what
-- ---------------------------------------------------------------------------
-- One select policy, `to authenticated`, so `anon` reaches no policy at all
-- and is told nothing — the shape 20260930030000 gave the chat bucket. A
-- signed-in account reads:
--
--   * everything, if it is a member, suspended or not (`is_member()`, the
--     read gate everywhere else). A removed member is not one.
--   * `organizations/…`, the logos, whoever it is. The owner's call,
--     2026-10-01: a logo is on the organization's own site, and the screen a
--     verified number is turned away on draws the organizations that can add
--     one.
--   * the photograph of the seeded profile it may claim — exactly the one
--     `my_claimable_profile()` returns, so "claimable" has one definition.
--     The owner's call, 2026-10-01: "Is this you?" shows the face.
--   * its own folder. Onboarding uploads before the member row exists, with
--     upsert, and storage's upsert is refused without a select policy on the
--     row — even the first time, with nothing there to replace. Tried on the
--     local stack without this line: a plain upload was stored, an upsert was
--     "new row violates row-level security policy", so every new member's
--     photograph would have been refused at signup.
--
-- Nothing else changes: the insert, update and delete policies stay as
-- they are (photo-cleanup.sql steps 1–3), and so do the 2MB and three types
-- from 20260930040000.

create or replace function public.photo_is_my_claimable(object_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.my_claimable_profile() p where p.photo_path = object_name
  );
$$;

comment on function public.photo_is_my_claimable(text) is
  'The photograph of the seeded profile the caller may claim. Read by the photos bucket''s select policy, for the claim card.';

revoke all on function public.photo_is_my_claimable(text) from public, anon;
grant execute on function public.photo_is_my_claimable(text) to authenticated;

update storage.buckets set public = false where id = 'photos';

drop policy if exists "anyone can view photos" on storage.objects;
drop policy if exists "a signed-in account reads the photographs it may see" on storage.objects;
create policy "a signed-in account reads the photographs it may see"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      public.is_member()
      or (storage.foldername(name))[1] = 'organizations'
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.photo_is_my_claimable(name)
    )
  );

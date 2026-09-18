-- A removed member's photograph goes with them.
--
-- /admin's Remove panel says their record goes: the profile, the RSVPs, the
-- strikes, all `on delete cascade`. Their photograph did not. `photos` is a
-- public bucket, so a removed member's picture stayed retrievable at a URL
-- derived from their id, indefinitely, by anybody who had ever loaded it.
--
-- Found on the live bucket on 2026-09-18: 2.8MB belonging to an account that
-- had been removed weeks earlier, still answering 200 over the public URL. The
-- file is gone; this is so the next removal does not recreate it.
--
-- ---------------------------------------------------------------------------
-- Why a policy and not a trigger
-- ---------------------------------------------------------------------------
-- The obvious move is a trigger on `members` that deletes from
-- `storage.objects`. It is the wrong one: deleting that row unlinks the object
-- from its backing store without reclaiming it, so the bytes stay and only the
-- record of them goes — which is worse than leaving it alone, because nothing
-- afterwards can find what to clean up.
--
-- `admin_delete_member` is a SQL function and cannot reach the storage API at
-- all. So the delete happens in the client, immediately after the RPC returns,
-- and this policy is what makes it permitted. An administrator who can end a
-- membership can already do far more than remove a picture.
--
-- ---------------------------------------------------------------------------
-- Delete only
-- ---------------------------------------------------------------------------
-- No insert and no update for administrators. Nothing in the club needs one
-- member's photograph replaced by another, and a policy granting it would be a
-- way to put a picture on somebody's profile that they did not choose.
--
-- The three member policies from 20260910120100 are untouched: a member still
-- writes and deletes inside their own folder and nowhere else.

-- ---------------------------------------------------------------------------
-- `to authenticated` is not decoration
-- ---------------------------------------------------------------------------
-- Without it the policy applies to every role, including `anon` — and
-- `is_admin()` is executable by `authenticated` only, so an unauthenticated
-- delete attempt stopped being a clean refusal and became
-- "permission denied for function is_admin". Denied either way, but the error
-- names an internal function and tells whoever provoked it that the policy is
-- gated on administrator status. Naming the role means the policy is never
-- reached for anon and the function is never called.
drop policy if exists "an administrator can delete any photo" on storage.objects;
create policy "an administrator can delete any photo"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'photos' and public.is_admin());

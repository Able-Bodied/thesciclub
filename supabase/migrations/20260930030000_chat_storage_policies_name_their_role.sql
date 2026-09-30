-- The chat bucket's three storage policies apply to signed-in members only.
--
-- The owner, 2026-09-30, for HOME-PLAN.md step 3b, part 2. A change to what
-- the policies apply to, not to what they allow: the three are made again
-- exactly as they stand, each with `to authenticated`, and nothing else.
--
-- ---------------------------------------------------------------------------
-- Why
-- ---------------------------------------------------------------------------
-- 20260918200000 wrote the read and upload policies, and 20260918210000 wrote
-- the delete policy again, without naming a role, so they apply to every role,
-- `anon` included. Each one calls a function only `authenticated` may execute
-- — chat_file_is_readable, chat_file_is_reported, chat_file_is_writable,
-- is_admin, chat_file_is_on_a_report — so a signed-out visitor who asked for
-- a chat photograph was refused with "permission denied for function
-- chat_file_is_readable". Refused either way, but the error names an internal
-- function and says what the policy tests. 20260918000000's header says the
-- same of the photos bucket's administrator policy, which was narrowed for
-- this reason; these three were written after it and did not follow it.
--
-- With the role named, a policy is never reached for `anon` and its functions
-- are never called: no policy applies, so a read returns nothing and a write
-- is refused as a row-level security violation, which says nothing about why.
--
-- ---------------------------------------------------------------------------
-- What does not change
-- ---------------------------------------------------------------------------
-- Every expression below is copied from pg_policies as it stood before this
-- ran. A member reads, uploads and deletes exactly what they could before —
-- `pnpm check-chat-photo-policy` does those through the storage API — and
-- nothing in the client depends on this. The photos bucket's member policies
-- (20260910120100) are left for every role: they call auth.uid() and
-- storage.foldername(), which `anon` may execute, so they have no function to
-- name.
--
-- Drop and create, as 20260918210000 did, inside the migration's one
-- transaction.

drop policy if exists "a member reads chat photographs they could read the words of" on storage.objects;
create policy "a member reads chat photographs they could read the words of"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat'
    and (public.chat_file_is_readable(name) or public.chat_file_is_reported(name))
  );

drop policy if exists "a member uploads a chat photograph where they may post" on storage.objects;
create policy "a member uploads a chat photograph where they may post"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat'
    and owner_id = auth.uid()::text
    and public.chat_file_is_writable(name)
  );

drop policy if exists "the uploader or an administrator deletes a chat photograph" on storage.objects;
create policy "the uploader or an administrator deletes a chat photograph"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat'
    and (owner_id = auth.uid()::text or public.is_admin())
    and not public.chat_file_is_on_a_report(name)
  );

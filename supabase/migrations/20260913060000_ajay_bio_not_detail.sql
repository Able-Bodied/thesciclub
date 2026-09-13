-- ============================================================================
-- Ajay's description belongs in `bio`, where the rest of the directory keeps
-- theirs
-- ============================================================================
-- Third correction to the same hand-written restore, and the reason there is
-- now a `directory_seed` table and a button: 20260913020000 rebuilt Ajay's
-- row by reading the original seed migration and retyping its values, and
-- retyping thirty columns by eye gets one wrong each time. First the photo
-- path, which had been renamed and moved into the bucket; now the prose,
-- which the seed puts in `bio` and the restore put in `detail`.
--
-- `bio` and `detail` are different things on a profile — the bio is the
-- paragraph under the name, `detail` is the free-text field the details
-- editor writes — so this was not cosmetic: his description was rendering in
-- the wrong place, and `bio` was empty.
--
-- It has to be fixed in two places, because 20260913040000 snapshotted
-- `directory_seed` from `members` as it stood, and on the hosted project that
-- meant snapshotting the wrong row. Restoring the directory would otherwise
-- put the mistake back every time.
--
-- Narrow on purpose: one id, and only when it is actually wrong, so this is
-- inert on any database where the original seed row is intact — every local
-- stack, for instance, where `supabase db reset` builds Ajay from
-- 20260910120400 and the guarded restore never fires.
-- ============================================================================

update public.members
   set bio = detail, detail = null
 where id = 'c85c10bf-0226-394f-8c91-2a2ffc40a147'
   and is_seed
   and bio is null
   and detail is not null;

update public.directory_seed
   set bio = detail, detail = null
 where id = 'c85c10bf-0226-394f-8c91-2a2ffc40a147'
   and bio is null
   and detail is not null;

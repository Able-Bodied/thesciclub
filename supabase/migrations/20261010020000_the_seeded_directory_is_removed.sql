-- ============================================================================
-- The seeded directory is removed
-- ============================================================================
-- The owner, 2026-10-10: remove every seeded directory profile completely,
-- keeping only the members who joined. The directory (20260910120400) was
-- copied from NorCal SCI's public list so the deck was not empty before
-- anybody had joined; with real members it is a list of people who never
-- chose to be here.
--
-- What goes, and why each is safe:
--   * The seeded `members` rows. Every reference to a member cascades or is
--     set null (checked on the live database the same day: no invite claims,
--     RSVPs, follows, representatives, posts, messages, likes or strikes
--     pointed at one).
--   * Conversations somebody opened with a seeded profile and never wrote in.
--     With the seeded half gone they would be a conversation with nobody.
--     A conversation with any message in it is left alone: its member side
--     goes, and the app already shows such a conversation as one whose other
--     half has left.
--   * `directory_seed` and `admin_restore_directory()` (20260913040000): the
--     snapshot existed to put the directory back, and a copy of these people
--     kept in the database is not removing them. Admin's "Restore directory"
--     goes with it.
--
-- What does not go here: their photographs, under photos/seed/. Files are
-- deleted through the Storage API, never by deleting storage rows (HANDOFF
-- "Photos"); scripts/remove-seed-photos.mjs does that once this is live.
--
-- The claim mechanism (an invite pointing at a seeded profile) stays in the
-- schema, unused: with no seeded rows there is nothing to claim, and Admin's
-- invite form no longer asks.
--
-- The owner keeps an offline copy of the rows and photos outside the repo.
-- ============================================================================

delete from public.chat_threads t
 where exists (
         select 1 from public.chat_thread_members tm
           join public.members m on m.id = tm.member_id
          where tm.thread_id = t.id and m.is_seed
       )
   and not exists (select 1 from public.chat_messages msg where msg.thread_id = t.id);

delete from public.members where is_seed;

drop function if exists public.admin_restore_directory();
drop table if exists public.directory_seed;

-- ============================================================================
-- Chat, migration 12: putting chat on the wire
-- ============================================================================
-- Four tables into `supabase_realtime`, and nothing else. From here a client
-- that is looking at a conversation, a topic or a room is told when a row lands
-- rather than being made to ask.
--
-- ---------------------------------------------------------------------------
-- Realtime reads tables, and applies the table's select policy
-- ---------------------------------------------------------------------------
-- Not views. This is the reason, written down in 20260918060000's header and
-- restated here because it is the migration that makes it matter: a removed
-- post's body could not be hidden behind a `chat_posts_visible` view, because
-- every member who can read the post can subscribe to `chat_posts` and be
-- handed the row itself. A view would have been a curtain rather than a door.
-- The body is blanked in the column instead, so there is one path to a post's
-- text and the removed ones are not on it.
--
-- The same is true of `chat_messages`, more strongly, and there is no
-- `chat_messages_visible` view either.
--
-- What is *not* published is as deliberate:
--
--  - `chat_removed_bodies`, which has RLS on, no policy and no grant. Adding it
--    here would be the one way its contents could leave the database.
--  - `chat_thread_members` and `chat_room_members`. Being added to a group is a
--    Phase 5 concern, and a roster on the wire is the membership list that
--    20260918030000 spent a paragraph keeping private.
--  - `chat_topic_reads`. The view count moves on every open by anybody; a
--    subscription to it would be a live feed of who is reading what.
--  - `chat_rooms`. Twelve rows that change when an administrator opens one,
--    which is a page refresh, not a live event.
--
-- ---------------------------------------------------------------------------
-- Replica identity is left at its default
-- ---------------------------------------------------------------------------
-- The default is the primary key, which is enough for INSERT and UPDATE: the
-- new row is sent whole, and Realtime checks it against the table's select
-- policy before it sends it to anybody. `replica identity full` would be needed
-- to carry the *old* row on an UPDATE or a DELETE — and nothing in Chat deletes
-- (removal is a soft update) and nothing needs the previous value of a row it
-- is about to be handed.
--
-- Leaving it alone is also the safer default: `full` puts every column of the
-- old row into the WAL, which for a table whose interesting column is somebody's
-- words means the pre-blanking body of a post travels with the update that
-- blanked it.
-- ============================================================================

-- `add table` is not idempotent and errors if the table is already a member, so
-- each is guarded. A migration that cannot be re-run is a migration that breaks
-- the next `db reset` somebody does after editing the one above it.
do $$
declare
  t text;
begin
  foreach t in array array['chat_messages', 'chat_posts', 'chat_topics', 'chat_threads']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

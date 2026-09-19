-- ============================================================================
-- Chat, migration 11: a post cannot choose its own date, or its own removal
-- ============================================================================
-- A correction to 20260918040000, found while building threads and then found
-- again by running the probe rather than by reading it.
--
-- `grant select, insert on public.chat_topics to authenticated` grants insert
-- on every column, and a policy cannot take any of them back — RLS is a
-- predicate over the finished row, and a row with a made-up `created_at`
-- satisfies `author_id = auth.uid() and chat_can_post_in(room_id)` exactly as
-- well as an honest one. So today a member can post with:
--
--   last_post_at = 'infinity'   — the topic sits at the top of its room's
--                                 activity sort for good, above everything
--                                 anybody says afterwards.
--   reply_count  = 400          — the row says four hundred replies and opens
--                                 on one, until the next post recomputes it.
--   created_at   = last year    — a post that lands before the reader's
--                                 chat_topic_reads row and is therefore never
--                                 unread and never scrolled to.
--   removed_at   = now()        — with a blank body, which the check constraint
--                                 allows precisely because removal blanks it;
--                                 a post that arrives already "removed by an
--                                 administrator" without an administrator.
--
-- None of these is a way into somebody else's data and none is urgent. All four
-- are the same mistake: a column the database owns being writable because the
-- grant was written at table granularity when the rule is at column
-- granularity. The privilege is the only place the rule fits.
--
-- Naming an ungranted column fails with `permission denied for column`, which
-- is a refusal and not a zero-row no-op — the distinction 20260918020000's
-- header is about, and the reason every chat migration revokes from
-- `authenticated` by name.
--
-- chat_messages (20260918070000) was born with the column grant. This brings
-- the two rooms tables into line with it.
--
-- ---------------------------------------------------------------------------
-- What this does not change
-- ---------------------------------------------------------------------------
-- Nothing about the client: `chat_create_topic` names exactly (room_id, title,
-- author_id) and (topic_id, author_id, body), and `sendPost` in
-- src/lib/chat/topics.ts names exactly (topic_id, author_id, body). The
-- returning clause reads other columns and select is still granted on the whole
-- table.
--
-- The older tables outside chat are left alone. They have the same shape and
-- fixing them is a separate change with its own blast radius.
-- ============================================================================

revoke insert on public.chat_topics from authenticated;
revoke insert on public.chat_posts from authenticated;

-- created_at, last_post_at and reply_count are the database's: the first is a
-- clock, the other two are what the chat_posts trigger computes.
grant insert (room_id, title, author_id) on public.chat_topics to authenticated;

-- removed_at and removed_by_admin are chat_remove_post()'s, which is where the
-- sentence the reader gets — "by its author" or "by an administrator" — is
-- derived rather than trusted.
grant insert (topic_id, author_id, body) on public.chat_posts to authenticated;

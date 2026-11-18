-- ============================================================================
-- A boost lifts a post but is not in its score
-- ============================================================================
-- The owner, 2026-11-18: "can we make the boost invisible to users? Might seem
-- broken if a post has 3 views and +10 score".
--
-- private.chat_post_score is votes alone again: upvotes less downvotes. So
-- every score a member sees (chat_post_scores, chat_topics_ranked's score
-- column) leaves the boost out, and the -3 alert counts votes alone.
-- The boost still counts where it was meant to: private.chat_topic_rank adds
-- private.chat_post_boost on its own (20261118190000), so a boosted topic is
-- still lifted in Top and on Home. Home's top reply is now picked by votes
-- alone. chat_post_scores still tells an administrator the boost.
--
-- Probe: supabase/tests/a-ranking-for-home-and-rooms.sql (boost line).
-- Undo: supabase/undo/20261118195000.sql.
-- ============================================================================

create or replace function private.chat_post_score(post uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when post is null then 0 else (
      (select count(*) from public.chat_post_likes l where l.post_id = post)
    - (select count(*) from public.chat_post_downvotes d where d.post_id = post)
  )::integer end;
$$;

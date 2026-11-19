-- ============================================================================
-- A shared link says whether its post is a question
-- ============================================================================
-- The owner, 2026-11-19: a shared link should say "see post", not "answer
-- question", when the post is not marked as a question.
--
-- shared_topic_preview (20261119140000) gives the title and an empty name.
-- It now also says whether the topic is a question (chat_topics.is_question),
-- so the join screen and the link preview can ask to answer only a question.
--
-- Expand only: one column added at the end, the same two before it. The link
-- preview and the app as released read title and inviter_name only, and
-- ignore the new column. A function's result type cannot change in place, so
-- it is dropped and made again with the same grants.
-- ============================================================================

drop function if exists public.shared_topic_preview(text, uuid);

create function public.shared_topic_preview(p_code text, p_topic uuid)
returns table (title text, inviter_name text, is_question boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.title, ''::text, t.is_question
    from public.qr_codes q
    join public.chat_topics t on t.id = q.topic_id
   where q.id = private.live_qr_code(p_code)
     and q.made_to_share
     and q.topic_id = p_topic;
$$;

comment on function public.shared_topic_preview(text, uuid) is
  'For a link preview: the title of a topic shared to let people in, and whether it is a question, while its code is live. Never who shared it (inviter_name is always empty). See 20261116200000, 20261119140000 and 20261119150000.';

revoke all on function public.shared_topic_preview(text, uuid) from public;
grant execute on function public.shared_topic_preview(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';

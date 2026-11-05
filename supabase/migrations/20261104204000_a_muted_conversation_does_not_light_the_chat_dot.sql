-- ============================================================================
-- A muted conversation does not light the Chat dot
-- ============================================================================
-- The owner, 2026-11-03: a conversation the member muted (chat_thread_mutes)
-- no longer counts towards the Chat tab's dot. Until now it counted on
-- purpose, to match the list.
--
-- The list keeps its unread marker, as in most apps: a muted conversation
-- still shows unread where the member looks for it, and only stops calling
-- them from the tab bar. chat_my_threads() is unchanged, so the dot can now
-- be off while a muted row is bold, never the other way round.
--
-- As 20261029140000 otherwise, still SECURITY INVOKER: the member reads their
-- own mutes. Probe: unread-count-matches-list.sql.
-- Undo: supabase/undo/20261104204000.sql.
-- ============================================================================

create or replace function public.chat_unread_count()
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::int
    from public.chat_thread_members mine
    join public.chat_threads t on t.id = mine.thread_id
   where mine.member_id = (select auth.uid())
     and exists (
       select 1 from public.chat_messages n
        where n.thread_id = mine.thread_id
          and n.created_at > mine.last_read_at
          and n.author_id is distinct from (select auth.uid())
     )
     and not (t.kind = 'direct' and exists (
       select 1 from public.chat_thread_members o
        where o.thread_id = t.id
          and o.member_id = any ((select public.my_blocked_member_ids())::uuid[])
     ))
     and not exists (
       select 1 from public.chat_thread_mutes q
        where q.thread_id = mine.thread_id and q.member_id = (select auth.uid())
     );
$$;

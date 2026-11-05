-- Undo for 20261104204000_a_muted_conversation_does_not_light_the_chat_dot.sql:
-- a muted conversation counts towards the Chat dot again, as live before it.

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
     ));
$$;

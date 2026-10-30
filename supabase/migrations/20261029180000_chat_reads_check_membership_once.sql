-- ============================================================================
-- Chat reads check membership once (SPEED-PLAN.md, Step 6)
-- ============================================================================
-- The chat read rules called is_thread_member() or chat_room_is_readable()
-- on every row, so reading a conversation's roster checked membership once
-- per row of every roster before narrowing to the reader's own. Now two
-- helpers list what the reader may read, once per query, and the rules ask
-- "= any ((select helper())::uuid[])", which Postgres runs once.
--
-- my_thread_ids(): the conversations the reader is in; each is exactly what
-- is_thread_member() said yes to. my_readable_room_ids(): every room for an
-- administrator, the open ones otherwise; each is what chat_room_is_readable()
-- said yes to. Both are empty unless is_member(), and run as their owner,
-- since the roster's own rule calls one and would otherwise call itself.
-- Granted to authenticated only: a signed-out visitor stays refused.
--
-- The nine rules keep their names and every other condition (blocked
-- authors, removed posts and messages, notices); only those calls change,
-- and chat_rooms reads is_member() and is_admin() once. Write rules, the old
-- helpers (storage, write rules and functions still use them) and chat photo
-- files are unchanged. Suspended members still read: is_member() includes
-- them on purpose.
--
-- Probes: chat-reads-unchanged.sql (before and after, every person),
-- chat-reads-run-once.sql. Undo: supabase/undo/20261029180000.sql.
-- ============================================================================

create function public.my_thread_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.thread_id), '{}'::uuid[])
    from public.chat_thread_members m
   where m.member_id = auth.uid()
     and public.is_member();
$$;

create function public.my_readable_room_ids()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(r.id), '{}'::text[])
    from public.chat_rooms r
   where public.is_member()
     and (r.opened_at is not null or public.is_admin());
$$;

revoke all on function public.my_thread_ids() from public, anon;
revoke all on function public.my_readable_room_ids() from public, anon;
grant execute on function public.my_thread_ids() to authenticated;
grant execute on function public.my_readable_room_ids() to authenticated;

alter policy "read reactions in your conversation" on public.chat_message_reactions
  using (((EXISTS ( SELECT 1
   FROM public.chat_messages m
  WHERE ((m.id = chat_message_reactions.target_id) AND (m.removed_at IS NULL) AND (m.notice IS NULL) AND (m.thread_id = any ((select public.my_thread_ids())::uuid[]))))) AND (NOT (member_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])))));
alter policy "a member reads the messages in a thread they are in" on public.chat_messages
  using (((thread_id = any ((select public.my_thread_ids())::uuid[])) AND (NOT COALESCE((author_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])), false))));
alter policy "a member reads the likes in a readable room" on public.chat_post_likes
  using (((EXISTS ( SELECT 1
   FROM (public.chat_posts p
     JOIN public.chat_topics t ON ((t.id = p.topic_id)))
  WHERE ((p.id = chat_post_likes.post_id) AND (t.room_id = any ((select public.my_readable_room_ids())::text[]))))) AND (NOT (member_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])))));
alter policy "read reactions on readable standing posts" on public.chat_post_reactions
  using (((EXISTS ( SELECT 1
   FROM (public.chat_posts p
     JOIN public.chat_topics t ON ((t.id = p.topic_id)))
  WHERE ((p.id = chat_post_reactions.target_id) AND (p.removed_at IS NULL) AND (t.room_id = any ((select public.my_readable_room_ids())::text[]))))) AND (NOT (member_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])))));
alter policy "a member reads a readable topic's posts" on public.chat_posts
  using (((EXISTS ( SELECT 1
   FROM public.chat_topics t
  WHERE ((t.id = chat_posts.topic_id) AND (t.room_id = any ((select public.my_readable_room_ids())::text[]))))) AND (NOT COALESCE((author_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])), false))));
alter policy "members see open rooms, admins see all" on public.chat_rooms
  using (((select public.is_member()) AND ((opened_at IS NOT NULL) OR (select public.is_admin()))));
alter policy "a member reads the roster of a thread they are in" on public.chat_thread_members
  using ((thread_id = any ((select public.my_thread_ids())::uuid[])));
alter policy "a member reads the threads they are in" on public.chat_threads
  using ((id = any ((select public.my_thread_ids())::uuid[])));
alter policy "a member reads a readable room's topics" on public.chat_topics
  using (((room_id = any ((select public.my_readable_room_ids())::text[])) AND (NOT COALESCE((author_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])), false))));

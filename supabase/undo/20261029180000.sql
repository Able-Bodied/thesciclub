-- Undo for 20261029180000_chat_reads_check_membership_once.sql: the nine
-- rules as they were (fresh stack, 2026-10-29), then the helpers go.
-- Compare with the live rules first.

alter policy "read reactions in your conversation" on public.chat_message_reactions
  using (((EXISTS ( SELECT 1
   FROM public.chat_messages m
  WHERE ((m.id = chat_message_reactions.target_id) AND (m.removed_at IS NULL) AND (m.notice IS NULL) AND public.is_thread_member(m.thread_id)))) AND (NOT (member_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])))));
alter policy "a member reads the messages in a thread they are in" on public.chat_messages
  using ((public.is_thread_member(thread_id) AND (NOT COALESCE((author_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])), false))));
alter policy "a member reads the likes in a readable room" on public.chat_post_likes
  using (((EXISTS ( SELECT 1
   FROM (public.chat_posts p
     JOIN public.chat_topics t ON ((t.id = p.topic_id)))
  WHERE ((p.id = chat_post_likes.post_id) AND public.chat_room_is_readable(t.room_id)))) AND (NOT (member_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])))));
alter policy "read reactions on readable standing posts" on public.chat_post_reactions
  using (((EXISTS ( SELECT 1
   FROM (public.chat_posts p
     JOIN public.chat_topics t ON ((t.id = p.topic_id)))
  WHERE ((p.id = chat_post_reactions.target_id) AND (p.removed_at IS NULL) AND public.chat_room_is_readable(t.room_id)))) AND (NOT (member_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])))));
alter policy "a member reads a readable topic's posts" on public.chat_posts
  using (((EXISTS ( SELECT 1
   FROM public.chat_topics t
  WHERE ((t.id = chat_posts.topic_id) AND public.chat_room_is_readable(t.room_id)))) AND (NOT COALESCE((author_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])), false))));
alter policy "members see open rooms, admins see all" on public.chat_rooms
  using ((public.is_member() AND ((opened_at IS NOT NULL) OR public.is_admin())));
alter policy "a member reads the roster of a thread they are in" on public.chat_thread_members
  using (public.is_thread_member(thread_id));
alter policy "a member reads the threads they are in" on public.chat_threads
  using (public.is_thread_member(id));
alter policy "a member reads a readable room's topics" on public.chat_topics
  using ((public.chat_room_is_readable(room_id) AND (NOT COALESCE((author_id = ANY (( SELECT public.my_blocked_member_ids() AS my_blocked_member_ids)::uuid[])), false))));

drop function public.my_thread_ids();
drop function public.my_readable_room_ids();

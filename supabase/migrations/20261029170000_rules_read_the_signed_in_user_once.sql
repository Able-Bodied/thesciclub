-- ============================================================================
-- Rules read the signed-in user once (SPEED-PLAN.md, Step 5)
-- ============================================================================
-- auth.uid() in a rule ran once per row; (select auth.uid()) runs once per
-- query. Same meaning. These are the 38 rules Supabase's advisor names
-- (auth_rls_initplan), and the 6 storage rules it does not check; the photo
-- read rule's is_member() is read once too.
--
-- ALTER POLICY changes only the expressions: each rule keeps its name,
-- command, roles and permissiveness. Generated from the rules as they stood,
-- with only those two calls wrapped. Probe: rules-read-the-user-once.sql (no
-- rule calls auth.uid() bare, as the advisor checks).
--
-- Undo: supabase/undo/20261029170000.sql.
-- ============================================================================

alter policy "a member uploads a chat photograph where they may post" on storage.objects
  with check (((bucket_id = 'chat'::text) AND (owner_id = ((select auth.uid()))::text) AND public.chat_file_is_writable(name)));
alter policy "a signed-in account reads the photographs it may see" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((select public.is_member()) OR ((storage.foldername(name))[1] = 'organizations'::text) OR ((storage.foldername(name))[1] = ((select auth.uid()))::text) OR public.photo_is_my_claimable(name))));
alter policy "members can delete their own photo" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.photo_is_on_a_report(name))));
alter policy "members can replace their own photo" on storage.objects
  using (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text) AND (NOT public.photo_is_on_a_report(name))));
alter policy "members can upload their own photo" on storage.objects
  with check (((bucket_id = 'photos'::text) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));
alter policy "the uploader or an administrator deletes a chat photograph" on storage.objects
  using (((bucket_id = 'chat'::text) AND ((owner_id = ((select auth.uid()))::text) OR public.is_admin()) AND (NOT public.chat_file_is_on_a_report(name))));
alter policy "an active member writes in a thread they are in" on public.chat_messages
  with check (((author_id = (select auth.uid())) AND public.is_active_member() AND public.is_thread_member(thread_id)));
alter policy "an active member posts where they may post" on public.chat_posts
  with check (((author_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.chat_topics t
  WHERE ((t.id = chat_posts.topic_id) AND public.chat_can_post_in(t.room_id))))));
alter policy "a member sees their own reports" on public.chat_reports
  using ((reporter_id = (select auth.uid())));
alter policy "a member leaves a room" on public.chat_room_members
  using ((member_id = (select auth.uid())));
alter policy "a member sees their own memberships" on public.chat_room_members
  using ((member_id = (select auth.uid())));
alter policy "an active member joins an open room" on public.chat_room_members
  with check (((member_id = (select auth.uid())) AND public.is_active_member() AND (EXISTS ( SELECT 1
   FROM public.chat_rooms r
  WHERE ((r.id = chat_room_members.room_id) AND (r.opened_at IS NOT NULL))))));
alter policy "members mute rooms they can read" on public.chat_room_mutes
  with check (((member_id = (select auth.uid())) AND public.chat_room_is_readable(room_id)));
alter policy "members read their own room mutes" on public.chat_room_mutes
  using ((member_id = (select auth.uid())));
alter policy "members unmute their own rooms" on public.chat_room_mutes
  using ((member_id = (select auth.uid())));
alter policy "a member leaves a group" on public.chat_thread_members
  using (((member_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.chat_threads t
  WHERE ((t.id = chat_thread_members.thread_id) AND (t.kind = 'group'::text))))));
alter policy "members mute their own threads" on public.chat_thread_mutes
  with check (((member_id = (select auth.uid())) AND public.is_thread_member(thread_id)));
alter policy "members read their own thread mutes" on public.chat_thread_mutes
  using ((member_id = (select auth.uid())));
alter policy "members unmute their own threads" on public.chat_thread_mutes
  using ((member_id = (select auth.uid())));
alter policy "members mute topics they can read" on public.chat_topic_mutes
  with check (((member_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.chat_topics t
  WHERE ((t.id = chat_topic_mutes.topic_id) AND public.chat_room_is_readable(t.room_id))))));
alter policy "members read their own topic mutes" on public.chat_topic_mutes
  using ((member_id = (select auth.uid())));
alter policy "members unmute their own topics" on public.chat_topic_mutes
  using ((member_id = (select auth.uid())));
alter policy "a member sees their own reads" on public.chat_topic_reads
  using ((member_id = (select auth.uid())));
alter policy "an active member starts a topic where they may post" on public.chat_topics
  with check (((author_id = (select auth.uid())) AND public.chat_can_post_in(room_id)));
alter policy "members change own rsvps" on public.event_rsvps
  with check (((member_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.members m
  WHERE ((m.id = (select auth.uid())) AND (m.status = 'active'::text)))) AND public.can_see_event(event_id)));
alter policy "members change own rsvps" on public.event_rsvps
  using ((member_id = (select auth.uid())));
alter policy "members create own rsvps" on public.event_rsvps
  with check (((member_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.members m
  WHERE ((m.id = (select auth.uid())) AND (m.status = 'active'::text)))) AND public.can_see_event(event_id)));
alter policy "members read own rsvps" on public.event_rsvps
  using ((member_id = (select auth.uid())));
alter policy "members remove own rsvps" on public.event_rsvps
  using ((member_id = (select auth.uid())));
alter policy "an inviter withdraws their own unused invite" on public.invites
  with check (((invited_by_member_id = (select auth.uid())) AND (status = 'revoked'::text) AND (seed_member_id IS NULL)));
alter policy "an inviter withdraws their own unused invite" on public.invites
  using (((invited_by_member_id = (select auth.uid())) AND (status = 'pending'::text)));
alter policy "mentors can see invites they sent" on public.invites
  using ((invited_by_member_id = (select auth.uid())));
alter policy "a member reads their own strikes" on public.member_strikes
  using ((member_id = (select auth.uid())));
alter policy "members can select own row" on public.members
  using (((select auth.uid()) = id));
alter policy "members can update own row" on public.members
  with check (((select auth.uid()) = id));
alter policy "members can update own row" on public.members
  using (((select auth.uid()) = id));
alter policy "members insert own row, and only with an invite" on public.members
  with check ((((select auth.uid()) = id) AND public.i_am_invited()));
alter policy "a member reads their own notifications" on public.notifications
  using ((member_id = (select auth.uid())));
alter policy "members follow as themselves" on public.organization_follows
  with check (((member_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.members m
  WHERE ((m.id = (select auth.uid())) AND (m.status = 'active'::text))))));
alter policy "members read their own follows" on public.organization_follows
  using ((member_id = (select auth.uid())));
alter policy "members unfollow as themselves" on public.organization_follows
  using ((member_id = (select auth.uid())));
alter policy "members mute kinds for themselves" on public.push_muted_kinds
  with check ((member_id = (select auth.uid())));
alter policy "members read their own muted kinds" on public.push_muted_kinds
  using ((member_id = (select auth.uid())));
alter policy "members unmute kinds for themselves" on public.push_muted_kinds
  using ((member_id = (select auth.uid())));
alter policy "members read their own subscriptions" on public.push_subscriptions
  using ((member_id = (select auth.uid())));
alter policy "members remove their own subscriptions" on public.push_subscriptions
  using ((member_id = (select auth.uid())));
alter policy "makers read their own codes" on public.qr_codes
  using ((admin_id = (select auth.uid())));

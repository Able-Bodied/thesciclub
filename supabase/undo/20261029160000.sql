-- Undo for 20261029160000_missing_indexes.sql: drops what it made and puts
-- back the index it dropped (definition from a fresh stack, 2026-10-29).

drop index if exists public.notifications_post_id_idx, public.notifications_topic_id_idx,
  public.notifications_message_id_idx, public.notifications_thread_id_idx,
  public.notifications_event_id_idx, public.notifications_actor_id_idx,
  public.notifications_joined_id_idx, public.notifications_grant_id_idx,
  public.notifications_organization_id_idx, public.notifications_report_id_idx,
  public.notifications_introduction_id_idx, public.notifications_created_at_idx,
  public.invites_invited_by_member_id_idx, public.invites_claimed_by_idx,
  public.members_invite_id_idx, public.members_phone_idx,
  public.chat_topics_activity_idx, public.chat_topic_reads_member_id_idx,
  public.chat_topic_reads_topic_read_idx, public.chat_thread_mutes_member_id_idx,
  public.chat_posts_author_id_idx, public.chat_messages_author_id_idx,
  public.chat_topics_author_id_idx;

CREATE INDEX event_rsvps_event_id_idx ON public.event_rsvps USING btree (event_id);

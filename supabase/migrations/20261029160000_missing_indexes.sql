-- ============================================================================
-- Missing indexes (SPEED-PLAN.md, Step 4)
-- ============================================================================
-- Every index costs a write on each insert, and disk writes were the load
-- test's limit, so each one here serves a measured read or a delete that
-- scanned a whole table.
--
-- notifications: one per reference, only where it is set. Deleting a post,
-- message, topic, conversation, event, member, organization, grant, report
-- or introduction scanned every notification once per deleted row. Plus
-- created_at, for the nightly 30-day cleanup.
--
-- invites(invited_by_member_id): a mentor's "invites I sent".
-- invites(claimed_by): sign-up and account deletion.
-- members(invite_id), members(phone): a deleted invite; a phone lookup.
--
-- chat_topics(last_post_at desc, id): Home's newest 40 (1.8 s in the test).
-- chat_topic_reads(member_id), (topic_id, last_read_at): a member's reads;
-- a topic's receipts.
-- chat_thread_mutes(member_id): a member's mutes.
-- author_id on chat posts, messages and topics: account deletion.
--
-- Left out: the other who-did-it columns (added_by, decided_by, granted_by
-- and the like), on small tables, rarely deleted from.
--
-- Dropped: event_rsvps_event_id_idx, which the unique (event_id, member_id)
-- index already covers.
--
-- Undo: supabase/undo/20261029160000.sql.
-- ============================================================================

create index notifications_post_id_idx on public.notifications (post_id) where post_id is not null;
create index notifications_topic_id_idx on public.notifications (topic_id) where topic_id is not null;
create index notifications_message_id_idx on public.notifications (message_id) where message_id is not null;
create index notifications_thread_id_idx on public.notifications (thread_id) where thread_id is not null;
create index notifications_event_id_idx on public.notifications (event_id) where event_id is not null;
create index notifications_actor_id_idx on public.notifications (actor_id) where actor_id is not null;
create index notifications_joined_id_idx on public.notifications (joined_id) where joined_id is not null;
create index notifications_grant_id_idx on public.notifications (grant_id) where grant_id is not null;
create index notifications_organization_id_idx on public.notifications (organization_id) where organization_id is not null;
create index notifications_report_id_idx on public.notifications (report_id) where report_id is not null;
create index notifications_introduction_id_idx on public.notifications (introduction_id) where introduction_id is not null;
create index notifications_created_at_idx on public.notifications (created_at);

create index invites_invited_by_member_id_idx on public.invites (invited_by_member_id) where invited_by_member_id is not null;
create index invites_claimed_by_idx on public.invites (claimed_by) where claimed_by is not null;
create index members_invite_id_idx on public.members (invite_id) where invite_id is not null;
create index members_phone_idx on public.members (phone) where phone is not null;

create index chat_topics_activity_idx on public.chat_topics (last_post_at desc, id);
create index chat_topic_reads_member_id_idx on public.chat_topic_reads (member_id);
create index chat_topic_reads_topic_read_idx on public.chat_topic_reads (topic_id, last_read_at);
create index chat_thread_mutes_member_id_idx on public.chat_thread_mutes (member_id);
create index chat_posts_author_id_idx on public.chat_posts (author_id) where author_id is not null;
create index chat_messages_author_id_idx on public.chat_messages (author_id) where author_id is not null;
create index chat_topics_author_id_idx on public.chat_topics (author_id) where author_id is not null;

drop index public.event_rsvps_event_id_idx;

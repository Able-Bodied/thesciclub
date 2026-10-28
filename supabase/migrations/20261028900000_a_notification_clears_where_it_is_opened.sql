-- ============================================================================
-- A notification clears where it is opened
-- ============================================================================
-- The owner, 2026-10-28, correcting 20261028010000: the icon's number (and
-- the bell's) drops when a notification is opened, not only when the bell
-- is, and only for what was opened: "clear only 1 of 2". So a row is seen
-- once any of these happens:
--
--   1. The bell's list is opened: all of them (notifications_mark_seen).
--   2. Its row in the list is pressed (notifications_mark_read, as before).
--   3. The conversation or topic it is about is read: that one only, as
--      20261010000000 did, with a message's reactions read with its
--      conversation. A topic's likes and reactions carry the topic, so they
--      go with it.
--   4. The notification on the phone is pressed: push-notify puts its tag in
--      the address it opens (?n=), and the app hands it back here.
--
-- A tag names one thing (a conversation, a topic, a liked post, an event...),
-- so pressing one clears that thing alone. A message's push and a group's
-- "added you" share the conversation, so either clears both.
-- ============================================================================

-- ------------------------------------------------------- reading in Chat --
-- As 20261028010000, seen again as well as read.
create or replace function public.notifications_read_with_chat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'chat_thread_members' then
    if new.last_read_at is distinct from old.last_read_at then
      update public.notifications
         set read_at = clock_timestamp(), seen_at = coalesce(seen_at, clock_timestamp())
       where member_id = new.member_id and thread_id = new.thread_id and read_at is null
         and kind in ('direct', 'group', 'group_add', 'reaction');
    end if;
  else
    update public.notifications
       set read_at = clock_timestamp(), seen_at = coalesce(seen_at, clock_timestamp())
     where member_id = new.member_id and topic_id = new.topic_id and read_at is null;
  end if;
  return null;
exception when others then
  raise warning 'notifications_read_with_chat: %', sqlerrm;
  return null;
end;
$$;

revoke all on function public.notifications_read_with_chat() from public, anon, authenticated;

-- 20261028010000 left rows read in Chat but not seen; they count no more.
update public.notifications set seen_at = read_at where read_at is not null and seen_at is null;

-- ------------------------------------------------ a pressed notification --
-- The caller's own rows with that tag only.
create or replace function public.notifications_mark_read_by_tag(notification_tag text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set read_at = coalesce(read_at, clock_timestamp()),
         seen_at = coalesce(seen_at, clock_timestamp())
   where member_id = auth.uid()
     and (read_at is null or seen_at is null)
     and (
       tag = notification_tag
       or (notification_tag like 'thread:%' and tag = 'group_add:' || substr(notification_tag, 8))
     );
$$;

comment on function public.notifications_mark_read_by_tag(text) is
  'Marks the caller''s notifications about one thing read and seen, when its push is pressed.';

revoke all on function public.notifications_mark_read_by_tag(text) from public, anon;
grant execute on function public.notifications_mark_read_by_tag(text) to authenticated;
